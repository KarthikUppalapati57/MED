BEGIN;

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS raw_text text,
  ADD COLUMN IF NOT EXISTS extraction_method text,
  ADD COLUMN IF NOT EXISTS purchase_order_number text;

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

    v_invoice := jsonb_populate_record(NULL::public.invoices, v_payload);

    INSERT INTO public.invoices (
      vendor_name,
      invoice_number,
      total_amount,
      status,
      account_number,
      subtotal,
      organization_id,
      location_id,
      payment_status,
      vendor_id,
      due_date,
      delivery_fee,
      fuel_surcharge,
      other_charges,
      tax_amount,
      currency,
      source,
      file_url,
      line_items,
      validation_results,
      validation_notes,
      approved_by,
      approved_date,
      location,
      created_by,
      extraction_method,
      raw_text,
      purchase_order_number,
      invoice_date,
      payment_terms,
      file_destination,
      purchase_order_id,
      matched_order_id,
      match_status,
      brand_id,
      ap_status,
      action_required_reason,
      action_required_details,
      assigned_reviewer_id,
      payment_account_id,
      scheduled_payment_date,
      closed_at,
      closed_by,
      ap_metadata,
      paid_amount,
      payment_reference,
      credit_applied,
      credit_reason,
      version_number,
      ap_routing_destination,
      ap_routing_resolved_at
    ) VALUES (
      v_invoice.vendor_name,
      v_invoice.invoice_number,
      v_invoice.total_amount,
      COALESCE(v_invoice.status, 'pending_review'),
      v_invoice.account_number,
      v_invoice.subtotal,
      v_org_id,
      v_invoice.location_id,
      COALESCE(v_invoice.payment_status, 'unpaid'),
      v_invoice.vendor_id,
      v_invoice.due_date,
      v_invoice.delivery_fee,
      v_invoice.fuel_surcharge,
      v_invoice.other_charges,
      v_invoice.tax_amount,
      COALESCE(v_invoice.currency, 'USD'),
      v_invoice.source,
      v_invoice.file_url,
      COALESCE(v_invoice.line_items, '[]'::jsonb),
      COALESCE(v_invoice.validation_results, '{}'::jsonb),
      v_invoice.validation_notes,
      v_invoice.approved_by,
      v_invoice.approved_date,
      v_invoice.location,
      COALESCE(v_invoice.created_by, auth.uid()),
      v_invoice.extraction_method,
      v_invoice.raw_text,
      v_invoice.purchase_order_number,
      v_invoice.invoice_date,
      v_invoice.payment_terms,
      v_invoice.file_destination,
      v_invoice.purchase_order_id,
      v_invoice.matched_order_id,
      v_invoice.match_status,
      v_invoice.brand_id,
      v_invoice.ap_status,
      v_invoice.action_required_reason,
      v_invoice.action_required_details,
      v_invoice.assigned_reviewer_id,
      v_invoice.payment_account_id,
      v_invoice.scheduled_payment_date,
      v_invoice.closed_at,
      v_invoice.closed_by,
      COALESCE(v_invoice.ap_metadata, '{}'::jsonb),
      COALESCE(v_invoice.paid_amount, 0),
      v_invoice.payment_reference,
      COALESCE(v_invoice.credit_applied, 0),
      v_invoice.credit_reason,
      COALESCE(v_invoice.version_number, 1),
      v_invoice.ap_routing_destination,
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

    IF v_payload ? 'organization_id'
      AND NULLIF(v_payload->>'organization_id', '')::UUID IS DISTINCT FROM v_existing.organization_id THEN
      RAISE EXCEPTION 'Invoice organization cannot be changed';
    END IF;

    v_invoice := jsonb_populate_record(v_existing, v_payload);

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

  IF jsonb_typeof(COALESCE(p_line_items, '[]'::jsonb)) = 'array' AND jsonb_array_length(COALESCE(p_line_items, '[]'::jsonb)) > 0 THEN
    PERFORM public.upsert_invoice_line_items(v_invoice.id, p_line_items);
  END IF;

  RETURN to_jsonb(v_invoice);
END;
$$;

COMMIT;
