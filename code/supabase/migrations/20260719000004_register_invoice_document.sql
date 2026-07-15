-- 20260719000004: register_invoice_document / attach_invoice_document
--
-- Closes tracker items 2.1 (invoice_documents is defined but nothing ever writes to it) and
-- 2.4 (file-upload-to-storage logic is duplicated across 3 upload paths) with a single shared
-- entry point instead of fixing them separately and then consolidating.
--
-- The three upload paths differ in whether an invoice row exists yet at upload time:
--   - InvoiceUploader.jsx: usually has a draft invoice id already (onCreateUploadDraft runs
--     before the storage upload).
--   - MobileReceiptCapture.jsx: no invoice id yet at upload time (invoice is created after,
--     from the extracted data).
--   - process-email-invoices/index.ts: no invoice id yet either -- it exists once
--     ingest_email_invoice runs, immediately after upload, inside the same edge function call.
--
-- invoice_documents.invoice_id is nullable and its RLS insert policy (invoice_child_writable)
-- already falls back to an org-level check when invoice_id is NULL, so register_invoice_document
-- can record the file the moment it lands in storage, and attach_invoice_document links it to
-- the invoice once one exists -- no path has to wait on the other.

BEGIN;

CREATE OR REPLACE FUNCTION public.register_invoice_document(
  p_storage_path text,
  p_file_name text,
  p_file_type text DEFAULT NULL,
  p_file_size bigint DEFAULT NULL,
  p_file_hash text DEFAULT NULL,
  p_source text DEFAULT 'upload',
  p_invoice_id uuid DEFAULT NULL,
  p_organization_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_org_id uuid;
  v_document_id uuid;
BEGIN
  v_org_id := COALESCE(p_organization_id, public.get_my_org());

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'organization_id is required';
  END IF;

  PERFORM public.assert_org_actor(v_org_id);

  IF p_storage_path IS NULL OR p_file_name IS NULL THEN
    RAISE EXCEPTION 'storage_path and file_name are required';
  END IF;

  INSERT INTO public.invoice_documents (
    organization_id, invoice_id, storage_path, file_name, file_type, file_size, file_hash, source, created_by
  ) VALUES (
    v_org_id, p_invoice_id, p_storage_path, p_file_name, p_file_type, p_file_size, p_file_hash, p_source, auth.uid()
  )
  RETURNING id INTO v_document_id;

  RETURN v_document_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.attach_invoice_document(
  p_document_id uuid,
  p_invoice_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_doc public.invoice_documents%ROWTYPE;
BEGIN
  SELECT * INTO v_doc FROM public.invoice_documents WHERE id = p_document_id;

  IF v_doc.id IS NULL THEN
    RAISE EXCEPTION 'Document not found';
  END IF;

  PERFORM public.assert_org_actor(v_doc.organization_id);

  UPDATE public.invoice_documents
  SET invoice_id = p_invoice_id, updated_at = now()
  WHERE id = p_document_id;
END;
$$;

REVOKE ALL ON FUNCTION public.register_invoice_document(text, text, text, bigint, text, text, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_invoice_document(text, text, text, bigint, text, text, uuid, uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.attach_invoice_document(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.attach_invoice_document(uuid, uuid) TO authenticated, service_role;

COMMIT;
