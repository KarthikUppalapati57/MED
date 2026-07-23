BEGIN;

-- vendor_documents_manager_read/write (both is_manager_or_above() only, no tenant scoping at
-- all) let any manager-tier user in ANY organization read/write ANY object in the bucket,
-- including other tenants' W-9s. _write was FOR ALL, which also covers SELECT -- so dropping
-- only _read and leaving _write in place would NOT have closed the read hole (Postgres ORs
-- permissive policies together, see CLAUDE.md workflow rules). Both must go.
DROP POLICY IF EXISTS vendor_documents_manager_read ON storage.objects;
DROP POLICY IF EXISTS vendor_documents_manager_write ON storage.objects;

-- SELECT/UPDATE/DELETE act on an object that (by the time it's read/modified) always has a
-- matching vendor_documents row -- submit-tax-info and the admin-upload flow both insert that
-- row using the exact same storage_path as storage.objects.name. Scope through that row with
-- the same reference_scope_visible/writable() functions the vendor_documents table itself
-- already uses, so storage access can never be broader than table access.
CREATE POLICY vendor_documents_manager_read
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'vendor_documents'
  AND public.is_manager_or_above()
  AND EXISTS (
    SELECT 1 FROM public.vendor_documents vd
    WHERE vd.storage_path = storage.objects.name
      AND vd.deleted_at IS NULL
      AND public.reference_scope_visible(vd.organization_id, vd.brand_id, vd.location_id, vd.deleted_at)
  )
);

CREATE POLICY vendor_documents_manager_update
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'vendor_documents'
  AND EXISTS (
    SELECT 1 FROM public.vendor_documents vd
    WHERE vd.storage_path = storage.objects.name
      AND vd.deleted_at IS NULL
      AND public.reference_scope_writable(vd.organization_id, vd.brand_id, vd.location_id, vd.deleted_at, 'location_manager')
  )
)
WITH CHECK (
  bucket_id = 'vendor_documents'
  AND EXISTS (
    SELECT 1 FROM public.vendor_documents vd
    WHERE vd.storage_path = storage.objects.name
      AND vd.deleted_at IS NULL
      AND public.reference_scope_writable(vd.organization_id, vd.brand_id, vd.location_id, vd.deleted_at, 'location_manager')
  )
);

CREATE POLICY vendor_documents_manager_delete
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'vendor_documents'
  AND EXISTS (
    SELECT 1 FROM public.vendor_documents vd
    WHERE vd.storage_path = storage.objects.name
      AND vd.deleted_at IS NULL
      AND public.reference_scope_writable(vd.organization_id, vd.brand_id, vd.location_id, vd.deleted_at, 'location_manager')
  )
);

-- INSERT is different: DocumentVault.jsx uploads to storage BEFORE the vendor_documents row
-- exists (admin_uploads/{vendor_id}/{timestamp}_{name}), so there's nothing to join yet. Scope
-- off the vendor_id embedded in the path instead, mirroring how the anon magic-link INSERT
-- policy already scopes off a value derived from the path (the token) rather than a row.
CREATE POLICY vendor_documents_manager_insert
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'vendor_documents'
  AND name ~ '^admin_uploads/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/'
  AND EXISTS (
    SELECT 1 FROM public.vendors v
    WHERE v.id = (split_part(storage.objects.name, '/', 2))::uuid
      AND public.reference_scope_writable(v.organization_id, v.brand_id, v.location_id, NULL, 'location_manager')
  )
);

COMMIT;
