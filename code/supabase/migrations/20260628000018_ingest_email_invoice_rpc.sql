BEGIN;

CREATE OR REPLACE FUNCTION public.ingest_email_invoice(
  p_recipient_email text,
  p_fallback_organization_id uuid DEFAULT NULL,
  p_invoice jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recipient_email text;
  v_location_email public.location_email_addresses%ROWTYPE;
  v_vendor_name text;
  v_invoice_number text;
  v_total_amount numeric := 0;
  v_invoice_id uuid;
  v_system_user_id uuid := '99999999-9999-9999-9999-999999999999';
  v_metadata jsonb;
BEGIN
  v_recipient_email := lower(btrim(COALESCE(p_recipient_email, '')));

  IF v_recipient_email = '' THEN
    v_recipient_email := NULL;
  END IF;

  v_vendor_name := COALESCE(NULLIF(btrim(p_invoice->>'vendor_name'), ''), 'Unknown Vendor (Auto-Ingested)');
  v_invoice_number := COALESCE(
    NULLIF(btrim(p_invoice->>'invoice_number'), ''),
    'EMAIL-' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS') || '-' || substr(gen_random_uuid()::text, 1, 8)
  );

  BEGIN
    v_total_amount := COALESCE(NULLIF(btrim(p_invoice->>'total_amount'), '')::numeric, 0);
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    v_total_amount := 0;
  END;

  SELECT lea.*
    INTO v_location_email
  FROM public.location_email_addresses lea
  WHERE lower(lea.email) = v_recipient_email
    AND lea.is_active = true
    AND lea.deleted_at IS NULL
  LIMIT 1;

  IF FOUND THEN
    v_metadata := COALESCE(p_invoice->'ap_metadata', '{}'::jsonb)
      || jsonb_build_object(
        'ingest_recipient', v_recipient_email,
        'received_at', now(),
        'matched_location_email_id', v_location_email.id,
        'source', 'email_import'
      );

    INSERT INTO public.invoices (
      vendor_name,
      invoice_number,
      total_amount,
      status,
      ap_status,
      source,
      file_url,
      organization_id,
      brand_id,
      location_id,
      created_by,
      ap_metadata
    ) VALUES (
      v_vendor_name,
      v_invoice_number,
      v_total_amount,
      'extracting',
      'processing',
      'email_import',
      NULLIF(p_invoice->>'file_url', ''),
      v_location_email.organization_id,
      v_location_email.brand_id,
      v_location_email.location_id,
      v_system_user_id,
      v_metadata
    )
    RETURNING id INTO v_invoice_id;

    RETURN jsonb_build_object(
      'invoice_id', v_invoice_id,
      'matched', true,
      'organization_id', v_location_email.organization_id,
      'brand_id', v_location_email.brand_id,
      'location_id', v_location_email.location_id,
      'recipient_email', v_recipient_email
    );
  END IF;

  v_metadata := COALESCE(p_invoice->'ap_metadata', '{}'::jsonb)
    || jsonb_build_object(
      'ingest_recipient', v_recipient_email,
      'received_at', now(),
      'reason', 'no_location_email_match',
      'source', 'email_import'
    );

  INSERT INTO public.invoices (
    vendor_name,
    invoice_number,
    total_amount,
    status,
    ap_status,
    action_required_reason,
    action_required_details,
    source,
    file_url,
    organization_id,
    brand_id,
    location_id,
    created_by,
    ap_metadata
  ) VALUES (
    v_vendor_name,
    v_invoice_number,
    v_total_amount,
    'pending_review',
    'action_required',
    'needs_scope_assignment',
    'No active location email address matched the ingest recipient.',
    'email_import',
    NULLIF(p_invoice->>'file_url', ''),
    p_fallback_organization_id,
    NULL,
    NULL,
    v_system_user_id,
    v_metadata
  )
  RETURNING id INTO v_invoice_id;

  RETURN jsonb_build_object(
    'invoice_id', v_invoice_id,
    'matched', false,
    'organization_id', p_fallback_organization_id,
    'brand_id', NULL,
    'location_id', NULL,
    'recipient_email', v_recipient_email,
    'warning', CASE WHEN p_fallback_organization_id IS NULL THEN 'fallback_organization_id_missing' ELSE NULL END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ingest_email_invoice(text, uuid, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.ingest_email_invoice(text, uuid, jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ingest_email_invoice(text, uuid, jsonb) TO service_role;

COMMIT;
