-- 20260723000007: Restore UI-driven invoice/payment workflow compatibility.
--
-- Keep the hardening guardrails, but make the intended UI sequencing explicit:
-- product sync can write mapping metadata, workflow/payment fields remain mutable
-- after approval, financial invoice/line data stays locked, and payment readiness
-- is derived from one shared database helper.

BEGIN;

CREATE OR REPLACE FUNCTION public.is_invoice_payment_ready(
  p_status text,
  p_ap_status text,
  p_payment_status text,
  p_paid_amount numeric DEFAULT 0,
  p_total_amount numeric DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    COALESCE(p_status, '') <> 'rejected'
    AND COALESCE(p_ap_status, '') <> 'rejected'
    AND COALESCE(p_payment_status, 'unpaid') NOT IN ('paid', 'auto_pay')
    AND (
      p_total_amount IS NULL
      OR COALESCE(p_paid_amount, 0) < COALESCE(p_total_amount, 0)
    )
    AND (
      COALESCE(p_status, '') IN ('approved', 'scheduled', 'partially_paid')
      OR COALESCE(p_ap_status, '') IN ('approved', 'scheduled')
      OR COALESCE(p_payment_status, '') = 'partial'
    );
$$;

REVOKE ALL ON FUNCTION public.is_invoice_payment_ready(text, text, text, numeric, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_invoice_payment_ready(text, text, text, numeric, numeric) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.guard_locked_invoice_financial_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_protected jsonb;
  v_new_protected jsonb;
BEGIN
  IF OLD.status IN ('approved', 'scheduled', 'partially_paid', 'paid')
    OR OLD.ap_status IN ('approved', 'scheduled', 'paid', 'closed')
    OR COALESCE(OLD.payment_status, 'unpaid') IN ('partial', 'paid', 'auto_pay')
    OR COALESCE(OLD.paid_amount, 0) > 0 THEN

    v_old_protected := to_jsonb(OLD)
      - 'status'
      - 'ap_status'
      - 'payment_status'
      - 'paid_amount'
      - 'payment_reference'
      - 'approved_by'
      - 'approved_date'
      - 'ap_routing_destination'
      - 'ap_routing_resolved_at'
      - 'file_destination'
      - 'payment_account_id'
      - 'scheduled_payment_date'
      - 'validation_results'
      - 'validation_notes'
      - 'ap_metadata'
      - 'action_required_reason'
      - 'action_required_details'
      - 'assigned_reviewer_id'
      - 'closed_at'
      - 'closed_by'
      - 'updated_at'
      - 'version_number';

    v_new_protected := to_jsonb(NEW)
      - 'status'
      - 'ap_status'
      - 'payment_status'
      - 'paid_amount'
      - 'payment_reference'
      - 'approved_by'
      - 'approved_date'
      - 'ap_routing_destination'
      - 'ap_routing_resolved_at'
      - 'file_destination'
      - 'payment_account_id'
      - 'scheduled_payment_date'
      - 'validation_results'
      - 'validation_notes'
      - 'ap_metadata'
      - 'action_required_reason'
      - 'action_required_details'
      - 'assigned_reviewer_id'
      - 'closed_at'
      - 'closed_by'
      - 'updated_at'
      - 'version_number';

    IF v_new_protected IS DISTINCT FROM v_old_protected THEN
      RAISE EXCEPTION 'Approved, scheduled, partially paid, or paid invoice financial fields are immutable';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_locked_invoice_financial_fields ON public.invoices;
CREATE TRIGGER guard_locked_invoice_financial_fields
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_locked_invoice_financial_fields();

CREATE OR REPLACE FUNCTION public.guard_locked_invoice_line_items()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice record;
  v_invoice_id uuid;
  v_old_protected jsonb;
  v_new_protected jsonb;
BEGIN
  IF current_setting('app.invoice_product_sync', true) = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  v_invoice_id := COALESCE(NEW.invoice_id, OLD.invoice_id);

  SELECT status, ap_status, payment_status, paid_amount
    INTO v_invoice
  FROM public.invoices
  WHERE id = v_invoice_id;

  IF v_invoice.status IN ('approved', 'scheduled', 'partially_paid', 'paid')
    OR v_invoice.ap_status IN ('approved', 'scheduled', 'paid', 'closed')
    OR COALESCE(v_invoice.payment_status, 'unpaid') IN ('partial', 'paid', 'auto_pay')
    OR COALESCE(v_invoice.paid_amount, 0) > 0 THEN

    IF TG_OP = 'UPDATE' THEN
      v_old_protected := to_jsonb(OLD)
        - 'vendor_id'
        - 'vendor_item_id'
        - 'internal_product_id'
        - 'price_variance_flag'
        - 'price_variance_percent'
        - 'updated_at';

      v_new_protected := to_jsonb(NEW)
        - 'vendor_id'
        - 'vendor_item_id'
        - 'internal_product_id'
        - 'price_variance_flag'
        - 'price_variance_percent'
        - 'updated_at';

      IF v_new_protected = v_old_protected THEN
        RETURN NEW;
      END IF;
    END IF;

    RAISE EXCEPTION 'Invoice line items are immutable after approval or payment activity';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS guard_locked_invoice_line_items ON public.invoice_line_items;
CREATE TRIGGER guard_locked_invoice_line_items
  BEFORE INSERT OR UPDATE OR DELETE ON public.invoice_line_items
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_locked_invoice_line_items();

CREATE OR REPLACE FUNCTION public.trigger_sync_invoice_products()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (TG_OP = 'UPDATE' AND NEW.status = 'approved' AND OLD.status IS DISTINCT FROM 'approved') THEN
    PERFORM set_config('app.invoice_product_sync', 'on', true);
    PERFORM public.sync_invoice_products(NEW.id);
    PERFORM public.ensure_inventory_for_invoiced_products(NEW.id);
    PERFORM set_config('app.invoice_product_sync', '', true);
  END IF;

  IF (TG_OP = 'INSERT' AND NEW.status = 'approved') THEN
    PERFORM set_config('app.invoice_product_sync', 'on', true);
    PERFORM public.sync_invoice_products(NEW.id);
    PERFORM public.ensure_inventory_for_invoiced_products(NEW.id);
    PERFORM set_config('app.invoice_product_sync', '', true);
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.invoice_product_sync', '', true);
  RAISE;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_invoice_workflow(
  p_invoice_id UUID DEFAULT NULL,
  p_invoice JSONB DEFAULT '{}'::jsonb,
  p_line_items JSONB DEFAULT '[]'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_existing public.invoices%ROWTYPE;
  v_invoice public.invoices%ROWTYPE;
  v_payload JSONB;
  v_org_id UUID;
  v_brand_id UUID;
  v_location_id UUID;
  v_actor_role TEXT;
  v_locked BOOLEAN := false;
BEGIN
  v_payload := COALESCE(p_invoice, '{}'::jsonb)
    - 'id'
    - 'created_at'
    - 'updated_at'
    - 'deleted_at'
    - 'deleted_by'
    - 'vendor_address';

  IF p_invoice_id IS NULL THEN
    v_org_id := NULLIF(v_payload->>'organization_id', '')::UUID;

    IF v_org_id IS NULL THEN
      v_org_id := public.get_my_org();
      v_payload := jsonb_set(v_payload, '{organization_id}', to_jsonb(v_org_id), true);
    END IF;

    PERFORM public.assert_org_actor(v_org_id);

    v_actor_role := public.get_auth_role();
    v_brand_id := NULLIF(v_payload->>'brand_id', '')::UUID;
    v_location_id := NULLIF(v_payload->>'location_id', '')::UUID;

    IF (v_brand_id IS NULL OR v_location_id IS NULL)
      AND v_actor_role IN ('location_manager', 'ground_staff') THEN
      SELECT COALESCE(v_brand_id, p.brand_id), COALESCE(v_location_id, p.location_id)
        INTO v_brand_id, v_location_id
      FROM public.profiles p
      WHERE p.id = auth.uid();

      IF v_brand_id IS NULL AND v_location_id IS NOT NULL THEN
        SELECT l.brand_id
          INTO v_brand_id
        FROM public.locations l
        WHERE l.id = v_location_id;
      END IF;

      IF v_brand_id IS NOT NULL THEN
        v_payload := jsonb_set(v_payload, '{brand_id}', to_jsonb(v_brand_id), true);
      END IF;
      IF v_location_id IS NOT NULL THEN
        v_payload := jsonb_set(v_payload, '{location_id}', to_jsonb(v_location_id), true);
      END IF;
    END IF;

    IF v_brand_id IS NULL OR v_location_id IS NULL THEN
      RAISE EXCEPTION 'Invoice requires brand and location context';
    END IF;

    v_invoice := jsonb_populate_record(NULL::public.invoices, v_payload);

    INSERT INTO public.invoices (
      vendor_name, invoice_number, total_amount, status, account_number, subtotal,
      organization_id, location_id, payment_status, vendor_id, due_date,
      delivery_fee, fuel_surcharge, other_charges, tax_amount, currency, source,
      file_url, line_items, validation_results, validation_notes, approved_by,
      approved_date, location, created_by, extraction_method, raw_text,
      purchase_order_number, invoice_date, payment_terms, file_destination,
      purchase_order_id, matched_order_id, match_status, brand_id, ap_status,
      action_required_reason, action_required_details, assigned_reviewer_id,
      payment_account_id, scheduled_payment_date, closed_at, closed_by,
      ap_metadata, paid_amount, payment_reference, credit_applied, credit_reason,
      version_number, ap_routing_destination, ap_routing_resolved_at
    ) VALUES (
      v_invoice.vendor_name, v_invoice.invoice_number, v_invoice.total_amount,
      COALESCE(v_invoice.status, 'pending_review'), v_invoice.account_number,
      v_invoice.subtotal, v_org_id, v_invoice.location_id,
      COALESCE(v_invoice.payment_status, 'unpaid'), v_invoice.vendor_id,
      v_invoice.due_date, v_invoice.delivery_fee, v_invoice.fuel_surcharge,
      v_invoice.other_charges, v_invoice.tax_amount, COALESCE(v_invoice.currency, 'USD'),
      v_invoice.source, v_invoice.file_url, COALESCE(v_invoice.line_items, '[]'::jsonb),
      COALESCE(v_invoice.validation_results, '{}'::jsonb), v_invoice.validation_notes,
      v_invoice.approved_by, v_invoice.approved_date, v_invoice.location,
      COALESCE(v_invoice.created_by, auth.uid()), v_invoice.extraction_method,
      v_invoice.raw_text, v_invoice.purchase_order_number, v_invoice.invoice_date,
      v_invoice.payment_terms, v_invoice.file_destination, v_invoice.purchase_order_id,
      v_invoice.matched_order_id, v_invoice.match_status, v_invoice.brand_id,
      COALESCE(v_invoice.ap_status, 'processing'), v_invoice.action_required_reason,
      v_invoice.action_required_details, v_invoice.assigned_reviewer_id,
      v_invoice.payment_account_id, v_invoice.scheduled_payment_date,
      v_invoice.closed_at, v_invoice.closed_by, COALESCE(v_invoice.ap_metadata, '{}'::jsonb),
      COALESCE(v_invoice.paid_amount, 0), v_invoice.payment_reference,
      COALESCE(v_invoice.credit_applied, 0), v_invoice.credit_reason,
      COALESCE(v_invoice.version_number, 1), v_invoice.ap_routing_destination,
      v_invoice.ap_routing_resolved_at
    )
    RETURNING * INTO v_invoice;
  ELSE
    SELECT *
      INTO v_existing
    FROM public.invoices
    WHERE id = p_invoice_id
      AND deleted_at IS NULL
    FOR UPDATE;

    IF v_existing.id IS NULL THEN
      RAISE EXCEPTION 'Invoice not found';
    END IF;

    PERFORM public.assert_org_actor(v_existing.organization_id);

    v_locked := v_existing.status IN ('approved', 'scheduled', 'partially_paid', 'paid')
      OR v_existing.ap_status IN ('approved', 'scheduled', 'paid', 'closed')
      OR COALESCE(v_existing.payment_status, 'unpaid') IN ('partial', 'paid', 'auto_pay')
      OR COALESCE(v_existing.paid_amount, 0) > 0;

    IF v_locked THEN
      v_payload := v_payload - 'line_items';
    END IF;

    IF v_payload ? 'organization_id'
      AND NULLIF(v_payload->>'organization_id', '')::UUID IS DISTINCT FROM v_existing.organization_id THEN
      RAISE EXCEPTION 'Invoice organization cannot be changed';
    END IF;

    v_invoice := jsonb_populate_record(v_existing, v_payload);

    IF v_invoice.brand_id IS NULL OR v_invoice.location_id IS NULL THEN
      RAISE EXCEPTION 'Invoice requires brand and location context';
    END IF;

    UPDATE public.invoices
       SET vendor_name = v_invoice.vendor_name,
           invoice_number = v_invoice.invoice_number,
           total_amount = v_invoice.total_amount,
           status = v_invoice.status,
           account_number = v_invoice.account_number,
           subtotal = v_invoice.subtotal,
           location_id = v_invoice.location_id,
           payment_status = v_invoice.payment_status,
           vendor_id = v_invoice.vendor_id,
           due_date = v_invoice.due_date,
           delivery_fee = v_invoice.delivery_fee,
           fuel_surcharge = v_invoice.fuel_surcharge,
           other_charges = v_invoice.other_charges,
           tax_amount = v_invoice.tax_amount,
           currency = v_invoice.currency,
           source = v_invoice.source,
           file_url = v_invoice.file_url,
           line_items = v_invoice.line_items,
           validation_results = v_invoice.validation_results,
           validation_notes = v_invoice.validation_notes,
           approved_by = v_invoice.approved_by,
           approved_date = v_invoice.approved_date,
           location = v_invoice.location,
           extraction_method = v_invoice.extraction_method,
           raw_text = v_invoice.raw_text,
           purchase_order_number = v_invoice.purchase_order_number,
           invoice_date = v_invoice.invoice_date,
           payment_terms = v_invoice.payment_terms,
           file_destination = v_invoice.file_destination,
           purchase_order_id = v_invoice.purchase_order_id,
           matched_order_id = v_invoice.matched_order_id,
           match_status = v_invoice.match_status,
           brand_id = v_invoice.brand_id,
           ap_status = v_invoice.ap_status,
           action_required_reason = v_invoice.action_required_reason,
           action_required_details = v_invoice.action_required_details,
           assigned_reviewer_id = v_invoice.assigned_reviewer_id,
           payment_account_id = v_invoice.payment_account_id,
           scheduled_payment_date = v_invoice.scheduled_payment_date,
           closed_at = v_invoice.closed_at,
           closed_by = v_invoice.closed_by,
           ap_metadata = v_invoice.ap_metadata,
           paid_amount = v_invoice.paid_amount,
           payment_reference = v_invoice.payment_reference,
           credit_applied = v_invoice.credit_applied,
           credit_reason = v_invoice.credit_reason,
           version_number = COALESCE(v_existing.version_number, 1) + 1,
           ap_routing_destination = v_invoice.ap_routing_destination,
           ap_routing_resolved_at = v_invoice.ap_routing_resolved_at,
           updated_at = now()
     WHERE id = p_invoice_id
     RETURNING * INTO v_invoice;
  END IF;

  IF NOT v_locked
    AND jsonb_typeof(COALESCE(p_line_items, '[]'::jsonb)) = 'array'
    AND jsonb_array_length(COALESCE(p_line_items, '[]'::jsonb)) > 0 THEN
    PERFORM public.upsert_invoice_line_items(v_invoice.id, p_line_items);
  END IF;

  RETURN to_jsonb(v_invoice);
END;
$$;

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
  v_existing_payment_id UUID;
  v_remaining NUMERIC;
  v_new_paid_amount NUMERIC;
  v_new_status TEXT;
  v_payment_id UUID;
BEGIN
  IF COALESCE(p_amount, 0) <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be greater than zero';
  END IF;

  IF NULLIF(trim(COALESCE(p_reference, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Payment reference is required';
  END IF;

  SELECT * INTO v_invoice
    FROM public.invoices
   WHERE id = p_invoice_id
   FOR UPDATE;

  IF v_invoice.id IS NULL THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;

  PERFORM public.assert_financial_actor(v_invoice.organization_id);

  IF COALESCE(v_invoice.ap_routing_destination, 'payments') <> 'payments' THEN
    RAISE EXCEPTION 'Invoice is routed to %, not Payments', v_invoice.ap_routing_destination;
  END IF;

  IF v_invoice.status = 'rejected' OR v_invoice.ap_status = 'rejected' THEN
    RAISE EXCEPTION 'Rejected invoices cannot receive payments';
  END IF;

  SELECT id
    INTO v_existing_payment_id
  FROM public.payments
  WHERE invoice_id = p_invoice_id
    AND transaction_id = p_reference
    AND COALESCE(status, 'pending') NOT IN ('failed', 'cancelled', 'refunded')
  LIMIT 1;

  IF v_existing_payment_id IS NOT NULL THEN
    RAISE EXCEPTION 'Payment reference % has already been recorded for this invoice', p_reference;
  END IF;

  IF NOT public.is_invoice_payment_ready(
    v_invoice.status,
    v_invoice.ap_status,
    v_invoice.payment_status,
    v_invoice.paid_amount,
    v_invoice.total_amount
  ) THEN
    RAISE EXCEPTION 'Invoice must be approved and unpaid before recording payment';
  END IF;

  v_remaining := GREATEST(0, COALESCE(v_invoice.total_amount, 0) - COALESCE(v_invoice.paid_amount, 0));
  IF p_amount > v_remaining THEN
    RAISE EXCEPTION 'Payment amount % exceeds remaining balance %', p_amount, v_remaining;
  END IF;

  v_new_paid_amount := COALESCE(v_invoice.paid_amount, 0) + p_amount;
  v_new_status := CASE
    WHEN v_new_paid_amount >= COALESCE(v_invoice.total_amount, 0) THEN 'paid'
    ELSE 'partially_paid'
  END;

  UPDATE public.invoices
     SET paid_amount = v_new_paid_amount,
         payment_status = CASE WHEN v_new_status = 'paid' THEN 'paid' ELSE 'partial' END,
         status = v_new_status,
         ap_status = CASE WHEN v_new_status = 'paid' THEN 'paid' ELSE ap_status END,
         payment_reference = p_reference,
         updated_at = now()
   WHERE id = p_invoice_id;

  INSERT INTO public.payments (
    invoice_id, vendor_id, vendor_name, invoice_number, amount, payment_method,
    status, transaction_id, payment_date, payment_account_id, organization_id,
    brand_id, location_id, created_by
  ) VALUES (
    v_invoice.id, v_invoice.vendor_id, v_invoice.vendor_name,
    v_invoice.invoice_number, p_amount, p_payment_method, 'completed',
    p_reference, CURRENT_DATE, v_invoice.payment_account_id,
    v_invoice.organization_id, v_invoice.brand_id, v_invoice.location_id,
    auth.uid()
  )
  RETURNING id INTO v_payment_id;

  PERFORM public.log_invoice_audit_event(
    v_invoice.id,
    'payment_recorded',
    'Payment recorded through tenant-safe financial RPC',
    to_jsonb(v_invoice),
    jsonb_build_object(
      'payment_id', v_payment_id,
      'amount', p_amount,
      'payment_method', p_payment_method,
      'reference', p_reference,
      'status', v_new_status
    )
  );

  RETURN jsonb_build_object(
    'status', v_new_status,
    'paid_amount', v_new_paid_amount,
    'payment_id', v_payment_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_invoice_payment(uuid, numeric, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_invoice_payment(uuid, numeric, text, text) TO authenticated, service_role;

UPDATE public.invoices
   SET status = 'approved',
       approved_date = COALESCE(approved_date, now()),
       updated_at = now()
 WHERE ap_status = 'approved'
   AND status IN ('processing', 'pending_review', 'validated', 'pending_approval', 'flagged')
   AND deleted_at IS NULL;

COMMIT;
