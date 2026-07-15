-- 20260719000005: find_duplicate_invoice_documents
--
-- Closes tracker item 5.2: file_hash on invoice_documents (080_invoice_document_intake.sql) has
-- existed since that migration but nothing ever computed or checked it -- duplicate detection
-- only happened at approval time (ValidationDialog.jsx's server-side query), never at upload
-- time. Since 20260719000004_register_invoice_document.sql now has every upload path computing
-- a real SHA-256 file_hash, this migration adds the lookup the frontend needs to warn the user
-- BEFORE the upload is saved, not after it's already gone through extraction and review.

BEGIN;

CREATE OR REPLACE FUNCTION public.find_duplicate_invoice_documents(
  p_organization_id uuid,
  p_file_hash text
)
RETURNS TABLE (
  document_id uuid,
  invoice_id uuid,
  vendor_name text,
  invoice_number text,
  invoice_date date,
  status text,
  uploaded_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_org_id uuid;
BEGIN
  v_org_id := COALESCE(p_organization_id, public.get_my_org());

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'organization_id is required';
  END IF;

  PERFORM public.assert_org_actor(v_org_id);

  IF p_file_hash IS NULL OR p_file_hash = '' THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    d.id,
    d.invoice_id,
    i.vendor_name,
    i.invoice_number,
    i.invoice_date,
    i.status,
    d.created_at
  FROM public.invoice_documents d
  LEFT JOIN public.invoices i ON i.id = d.invoice_id
  WHERE d.organization_id = v_org_id
    AND d.file_hash = p_file_hash
    AND (i.id IS NULL OR i.deleted_at IS NULL)
  ORDER BY d.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.find_duplicate_invoice_documents(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.find_duplicate_invoice_documents(uuid, text) TO authenticated, service_role;

COMMIT;
