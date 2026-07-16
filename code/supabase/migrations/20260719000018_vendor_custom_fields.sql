-- 17.2: custom vendor metrics, scoped down to a simple key/value custom-fields column
-- (per plan decision) rather than a broader metrics/reporting feature. Plain jsonb column
-- on vendors -- no RLS changes needed, the existing reference_scope_writable/visible
-- policies (operational_vendors_update/select/insert) already govern all vendor columns
-- uniformly, including this one.

ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS custom_fields jsonb NOT NULL DEFAULT '{}'::jsonb;
