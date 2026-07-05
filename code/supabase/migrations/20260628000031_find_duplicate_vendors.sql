BEGIN;

CREATE OR REPLACE FUNCTION public.find_duplicate_vendors(
  p_organization_id uuid,
  p_name text,
  p_email text DEFAULT NULL,
  p_tax_id_last4 text DEFAULT NULL
)
RETURNS TABLE (
  vendor_id uuid,
  name text,
  approval_status text,
  status text,
  confidence text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- ponytail: exact-match-after-normalize only. Ceiling: spelling variants
  -- like "Sysco" vs "Sysco Foods" are missed; upgrade path is pg_trgm
  -- similarity if duplicate review proves it is worth the index and tuning.
  WITH input AS (
    SELECT
      lower(btrim(COALESCE(p_name, ''))) AS normalized_name,
      lower(btrim(NULLIF(p_email, ''))) AS normalized_email,
      btrim(NULLIF(p_tax_id_last4, '')) AS normalized_tax_last4
  )
  SELECT
    v.id AS vendor_id,
    v.name,
    v.approval_status,
    v.status,
    CASE
      WHEN (
        i.normalized_email IS NOT NULL
        AND lower(btrim(COALESCE(v.email, ''))) = i.normalized_email
      ) OR (
        i.normalized_tax_last4 IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.vendor_tax_information vti
          WHERE vti.vendor_id = v.id
            AND vti.deleted_at IS NULL
            AND btrim(COALESCE(vti.tax_id_last4, '')) = i.normalized_tax_last4
        )
      ) THEN 'likely'
      ELSE 'possible'
    END AS confidence
  FROM public.vendors v
  CROSS JOIN input i
  WHERE p_organization_id IS NOT NULL
    AND i.normalized_name <> ''
    AND v.organization_id = p_organization_id
    AND lower(btrim(v.name)) = i.normalized_name
    AND public.reference_scope_visible(v.organization_id, v.brand_id, v.location_id, NULL)
  ORDER BY
    CASE
      WHEN (
        i.normalized_email IS NOT NULL
        AND lower(btrim(COALESCE(v.email, ''))) = i.normalized_email
      ) OR (
        i.normalized_tax_last4 IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.vendor_tax_information vti
          WHERE vti.vendor_id = v.id
            AND vti.deleted_at IS NULL
            AND btrim(COALESCE(vti.tax_id_last4, '')) = i.normalized_tax_last4
        )
      ) THEN 0
      ELSE 1
    END,
    v.name,
    v.id;
$$;

REVOKE EXECUTE ON FUNCTION public.find_duplicate_vendors(uuid, text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.find_duplicate_vendors(uuid, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.find_duplicate_vendors(uuid, text, text, text) TO authenticated, service_role;

COMMIT;
