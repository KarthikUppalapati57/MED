-- 13.5: org profile details (name/address/tax ID/contact) for a dedicated tab on
-- OrgManagement.jsx. Flat columns on organizations, matching the existing vendors table's
-- address/contact convention rather than the separate organization_addresses table (that
-- table is a per-user onboarding/USPS-validation artifact with its own stale-role-vocabulary
-- RLS bug -- out of scope here; these are plain informational profile fields, not verified
-- addresses). tax_id is informational only, distinct from business_verifications' EIN/SSN
-- identity-verification record.
--
-- Also fixes a live bug this surfaced: OrgManagement.jsx's org list query already selects
-- `admin_email:primary_contact_email`, a column that has never existed -- every load of that
-- query has been failing with PostgREST's "column does not exist", silently emptying the
-- Hierarchy tab for every user. primary_contact_email now exists.
--
-- No RLS changes needed: organizations_write_scope already correctly gates UPDATE to
-- org_manager (own org) / tenant_super_admin (own tenant) / platform_admin.
--
-- Also surfaced: `authenticated` has NO table-level grant on organizations at all locally
-- (not even SELECT) -- confirmed via information_schema.role_table_grants and a direct
-- `SET ROLE authenticated; SELECT ...` probe, both "permission denied for table
-- organizations". This makes organizations_select_scope/organizations_write_scope
-- (20260718000002_organizations_rls_hierarchy_rebuild.sql) entirely dead on local Docker --
-- no authenticated user can read or write this table regardless of RLS, which also means
-- OrgManagement.jsx's existing "my-organizations" query has never worked locally. This is
-- the "prod != local on grants" gap CLAUDE.md already flags (prod likely has the grant from
-- outside the migration history); adding it here is required for both this feature and the
-- pre-existing Hierarchy tab to function against local Docker at all. INSERT/DELETE
-- deliberately excluded, matching that migration's own documented reasoning (SECURITY
-- DEFINER onboarding functions own INSERT; no DELETE policy exists on this table).
-- Also strips the fossil TRUNCATE/REFERENCES/TRIGGER grants (the same pattern already
-- cleaned up on brands/locations/profiles in the Context plumbing step) rather than layering
-- SELECT/UPDATE on top of them.
REVOKE ALL ON public.organizations FROM anon, authenticated;
GRANT SELECT, UPDATE ON public.organizations TO authenticated;

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS state text,
  ADD COLUMN IF NOT EXISTS zip_code text,
  ADD COLUMN IF NOT EXISTS country text DEFAULT 'USA',
  ADD COLUMN IF NOT EXISTS tax_id text,
  ADD COLUMN IF NOT EXISTS primary_contact_name text,
  ADD COLUMN IF NOT EXISTS primary_contact_email text,
  ADD COLUMN IF NOT EXISTS primary_contact_phone text;
