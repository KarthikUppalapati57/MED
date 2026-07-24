BEGIN;

-- Staff-facing counterpart to the vendor's magic-link submit-tax-info: some vendors read tax
-- details over the phone or by email rather than filling out the portal themselves. Reuses the
-- same vault primitive (store_vendor_tax_secret) and produces the same downstream row shape, so
-- the rest of the onboarding panel (review/approve gates) can't tell the two paths apart.
CREATE OR REPLACE FUNCTION public.admin_submit_vendor_tax_info(
  p_vendor_id uuid,
  p_tax_id text,
  p_legal_name text DEFAULT NULL,
  p_tax_classification text DEFAULT NULL,
  p_tax_id_type text DEFAULT NULL,
  p_w9_document_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_vendor public.vendors%ROWTYPE;
  v_tax public.vendor_tax_information%ROWTYPE;
  v_store_result jsonb;
  v_inferred_type text;
BEGIN
  SELECT * INTO v_vendor
  FROM public.vendors
  WHERE id = p_vendor_id;

  IF v_vendor.id IS NULL THEN
    RAISE EXCEPTION 'Vendor not found';
  END IF;

  IF NOT public.reference_scope_writable(v_vendor.organization_id, v_vendor.brand_id, v_vendor.location_id, NULL::timestamptz, 'location_manager') THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  IF p_w9_document_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.vendor_documents
    WHERE id = p_w9_document_id
      AND vendor_id = p_vendor_id
      AND document_type = 'w9'
      AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'W-9 document not found for this vendor -- upload it first, then link it here';
  END IF;

  v_inferred_type := COALESCE(
    NULLIF(p_tax_id_type, ''),
    CASE
      WHEN regexp_replace(COALESCE(p_tax_id, ''), '\D', '', 'g') ~ '^\d{9}$' AND position('-' in p_tax_id) = 2 THEN 'ein'
      ELSE 'ssn'
    END
  );

  INSERT INTO public.vendor_tax_information (
    vendor_id, legal_name, tax_classification, tax_id_type,
    verification_status, w9_status, w9_document_id, created_by, updated_by
  ) VALUES (
    p_vendor_id,
    NULLIF(p_legal_name, ''),
    NULLIF(p_tax_classification, ''),
    v_inferred_type,
    'pending',
    CASE WHEN p_w9_document_id IS NOT NULL THEN 'received' ELSE 'requested' END,
    p_w9_document_id,
    auth.uid(),
    auth.uid()
  )
  RETURNING * INTO v_tax;

  v_store_result := public.store_vendor_tax_secret(v_tax.id, p_tax_id);

  UPDATE public.vendors
     SET onboarding_status = 'tax_submitted',
         updated_at = now()
   WHERE id = p_vendor_id
     AND COALESCE(onboarding_status, 'invited') NOT IN ('active', 'completed', 'rejected');

  INSERT INTO public.vendor_onboarding_events (
    vendor_id, event_type, to_status, actor_id, actor_type, metadata
  ) VALUES (
    p_vendor_id,
    'tax_submitted',
    'tax_submitted',
    auth.uid(),
    'admin',
    jsonb_build_object('tax_row_id', v_tax.id, 'w9_document_id', p_w9_document_id, 'entry_method', 'manual')
  );

  RETURN jsonb_build_object(
    'success', true,
    'tax_row_id', v_tax.id,
    'tax_id_last4', v_store_result->>'tax_id_last4'
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_submit_vendor_tax_info(uuid, text, text, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_submit_vendor_tax_info(uuid, text, text, text, text, uuid) TO authenticated;

COMMIT;
