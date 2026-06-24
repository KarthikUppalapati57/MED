-- Migration for Batch 4: Admin, Team & Accounting

BEGIN;

-- 1. Index for audit logs to optimize module and organization queries
CREATE INDEX IF NOT EXISTS idx_audit_logs_org_module ON public.audit_logs(organization_id, module);

-- 2. Prevent updating organization_id to null or empty in tenant_update_row
CREATE OR REPLACE FUNCTION public.tenant_update_row(
  p_table_name TEXT,
  p_id TEXT,
  p_payload JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
VOLATILE
SET search_path = ''
AS $$
DECLARE
  target_org UUID;
  brand_filter UUID;
  location_filter UUID;
  route JSONB;
  target_schema TEXT;
  sanitized_payload JSONB;
  payload_key TEXT;
  column_exists BOOLEAN;
  has_org_column BOOLEAN;
  set_clauses TEXT[] := ARRAY[]::TEXT[];
  result JSONB;
  sql TEXT;
BEGIN
  IF p_table_name IS NULL OR p_table_name !~ '^[a-zA-Z_][a-zA-Z0-9_]*$' THEN
    RAISE EXCEPTION 'Unsafe table name: %', p_table_name;
  END IF;

  IF p_id IS NULL OR p_id = '' THEN
    RAISE EXCEPTION 'id is required';
  END IF;

  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'Payload must be a JSON object';
  END IF;

  IF p_payload ? 'organization_id' AND (p_payload->>'organization_id' IS NULL OR p_payload->>'organization_id' = '') THEN
    RAISE EXCEPTION 'Cannot set organization_id to null or empty';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.tenant_template_tables WHERE table_name = p_table_name) THEN
    RAISE EXCEPTION 'Table is not tenant-routable: %', p_table_name;
  END IF;

  target_org := COALESCE(NULLIF(p_payload->>'organization_id', '')::UUID, public.get_my_org());
  brand_filter := NULLIF(p_payload->>'brand_id', '')::UUID;
  location_filter := NULLIF(p_payload->>'location_id', '')::UUID;

  PERFORM public.assert_tenant_scope(target_org, brand_filter, location_filter);

  route := public.get_tenant_data_route(target_org, brand_filter, location_filter);
  target_schema := COALESCE(route->>'write_target', 'public');

  IF target_schema <> 'public' AND target_schema !~ '^tenant_[a-z0-9_]+$' THEN
    RAISE EXCEPTION 'Unsafe tenant target schema: %', target_schema;
  END IF;

  IF to_regclass(format('%I.%I', target_schema, p_table_name)) IS NULL THEN
    RAISE EXCEPTION 'Routed table does not exist: %.%', target_schema, p_table_name;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = target_schema AND table_name = p_table_name AND column_name = 'organization_id'
  ) INTO has_org_column;

  IF NOT has_org_column THEN
    RAISE EXCEPTION 'Tenant-routed table must include organization_id: %', p_table_name;
  END IF;

  sanitized_payload := p_payload - 'id' - 'created_at';

  FOR payload_key IN SELECT key FROM jsonb_each(sanitized_payload)
  LOOP
    IF payload_key !~ '^[a-zA-Z_][a-zA-Z0-9_]*$' THEN
      RAISE EXCEPTION 'Unsafe payload column: %', payload_key;
    END IF;

    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = target_schema AND table_name = p_table_name AND column_name = payload_key
    ) INTO column_exists;

    IF NOT column_exists THEN
      RAISE EXCEPTION 'Payload column does not exist on %.%: %', target_schema, p_table_name, payload_key;
    END IF;

    set_clauses := set_clauses || format('%I = source.%I', payload_key, payload_key);
  END LOOP;

  IF array_length(set_clauses, 1) IS NULL THEN
    RAISE EXCEPTION 'No update columns provided';
  END IF;

  sql := format(
    'WITH source AS (
       SELECT * FROM jsonb_populate_record(NULL::%I.%I, $1)
     ),
     updated AS (
       UPDATE %I.%I AS target
       SET %s
       FROM source
       WHERE target.id::TEXT = $2
         AND target.organization_id = $3
       RETURNING target.*
     )
     SELECT COALESCE((SELECT to_jsonb(updated) FROM updated), ''null''::jsonb)',
    target_schema,
    p_table_name,
    target_schema,
    p_table_name,
    array_to_string(set_clauses, ', ')
  );

  EXECUTE sql USING sanitized_payload, p_id, target_org INTO result;
  RETURN result;
END;
$$;

-- 3. Atomically record ledger GL entry when payment is completed
CREATE OR REPLACE FUNCTION public.record_invoice_payment(
  p_invoice_id UUID,
  p_amount NUMERIC,
  p_reference TEXT,
  p_payment_method TEXT DEFAULT 'manual'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_invoice RECORD;
  v_new_paid_amount NUMERIC;
  v_new_status TEXT;
  v_payment_id UUID;
  v_bill_id UUID;
  v_org_id UUID;
BEGIN
  SELECT * INTO v_invoice FROM public.invoices WHERE id = p_invoice_id FOR UPDATE;

  IF v_invoice.id IS NULL THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;

  v_org_id := v_invoice.organization_id;
  v_new_paid_amount := COALESCE(v_invoice.paid_amount, 0) + COALESCE(p_amount, 0);
  v_new_status := CASE WHEN v_new_paid_amount >= COALESCE(v_invoice.total_amount, 0) THEN 'paid' ELSE 'partially_paid' END;

  UPDATE public.invoices
  SET paid_amount = v_new_paid_amount,
      payment_status = CASE WHEN v_new_status = 'paid' THEN 'paid' ELSE 'partial' END,
      status = v_new_status,
      ap_status = CASE WHEN v_new_status = 'paid' THEN 'paid' ELSE ap_status END,
      payment_reference = p_reference,
      updated_at = now()
  WHERE id = p_invoice_id;

  INSERT INTO public.payments (
    organization_id,
    invoice_id,
    vendor_id,
    amount,
    payment_method,
    reference_number,
    status,
    payment_date,
    created_by
  ) VALUES (
    v_org_id,
    p_invoice_id,
    v_invoice.vendor_id,
    p_amount,
    p_payment_method,
    p_reference,
    'completed',
    now(),
    auth.uid()
  ) RETURNING id INTO v_payment_id;

  -- Ensure Ledger Bill exists or create it
  SELECT id INTO v_bill_id FROM public.ledger_bills WHERE invoice_id = p_invoice_id LIMIT 1;
  
  IF v_bill_id IS NULL THEN
    INSERT INTO public.ledger_bills (
      organization_id,
      vendor_id,
      invoice_id,
      subtotal,
      tax,
      total,
      due_date,
      status
    ) VALUES (
      v_org_id,
      v_invoice.vendor_id,
      p_invoice_id,
      COALESCE(v_invoice.subtotal, 0),
      COALESCE(v_invoice.tax_amount, 0),
      COALESCE(v_invoice.total_amount, 0),
      v_invoice.due_date,
      'paid'
    ) RETURNING id INTO v_bill_id;
  ELSE
    UPDATE public.ledger_bills 
    SET status = 'paid' 
    WHERE id = v_bill_id;
  END IF;

  -- Insert into financial metrics for the GL entry
  INSERT INTO public.financial_metrics (
    organization_id,
    metric_type,
    metric_name,
    metric_value,
    period_start,
    period_end,
    metadata,
    created_by
  ) VALUES (
    v_org_id,
    'payment_ledger',
    'ledger_entry',
    p_amount,
    now(),
    now(),
    jsonb_build_object(
      'bill_id', v_bill_id,
      'payment_id', v_payment_id,
      'payment_method', p_payment_method
    ),
    auth.uid()
  );

  RETURN jsonb_build_object(
    'status', v_new_status,
    'payment_id', v_payment_id,
    'bill_id', v_bill_id
  );
END;
$$;

-- 4. Retry stuck integrations
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- In a real environment, we'd ensure permissions, but we can try to schedule:
    BEGIN
      PERFORM cron.schedule(
        'retry_stuck_integrations',
        '*/30 * * * *',
        'UPDATE public.integrations SET status = ''failed'', metadata = jsonb_set(COALESCE(metadata, ''{}''::jsonb), ''{last_error}'', ''"Timeout during sync"'') WHERE status = ''syncing'' AND updated_at < now() - interval ''1 hour'''
      );
    EXCEPTION WHEN OTHERS THEN
      -- Ignore if insufficient privileges for cron
    END;
  END IF;
END $$;

COMMIT;
