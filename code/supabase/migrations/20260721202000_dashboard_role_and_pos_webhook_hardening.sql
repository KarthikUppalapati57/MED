-- Production role/config hardening for report delivery and POS webhooks.

ALTER TABLE public.pos_configurations
  DROP CONSTRAINT IF EXISTS pos_configurations_active_requires_webhook_secret;

ALTER TABLE public.pos_configurations
  ADD CONSTRAINT pos_configurations_active_requires_webhook_secret
  CHECK (
    is_active IS NOT TRUE
    OR nullif(btrim(coalesce(webhook_secret, '')), '') IS NOT NULL
  );

ALTER TABLE public.dashboard_report_preferences
  ALTER COLUMN recipient_roles SET DEFAULT ARRAY['org_manager', 'tenant_super_admin', 'branch_manager', 'location_manager']::text[];

UPDATE public.dashboard_report_preferences
SET recipient_roles = ARRAY(
  SELECT DISTINCT mapped.role_name
  FROM unnest(recipient_roles) AS raw(role_name)
  CROSS JOIN LATERAL (
    SELECT CASE raw.role_name
      WHEN 'org_owner' THEN 'org_manager'
      WHEN 'brand_manager' THEN 'branch_manager'
      ELSE raw.role_name
    END AS role_name
  ) mapped
  WHERE mapped.role_name = ANY(ARRAY['org_manager', 'tenant_super_admin', 'branch_manager', 'location_manager', 'ground_staff'])
)
WHERE recipient_roles && ARRAY['org_owner', 'brand_manager']::text[];

CREATE OR REPLACE FUNCTION public.can_access_dashboard_scope(
  p_org_id UUID,
  p_brand_id UUID,
  p_location_id UUID,
  p_scope TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND (
        p.role = 'platform_admin'
        OR (
          p.organization_id = p_org_id
          AND (
            p.role IN ('org_manager', 'tenant_super_admin')
            OR (p_scope = 'brand' AND p.role = 'branch_manager' AND (p.brand_id IS NULL OR p.brand_id = p_brand_id))
            OR (p_scope IN ('location', 'staff') AND p.role IN ('location_manager', 'ground_staff') AND (p.location_id IS NULL OR p.location_id = p_location_id))
            OR (p_scope IN ('location', 'staff') AND p.role = 'branch_manager' AND (p.brand_id IS NULL OR p.brand_id = p_brand_id))
          )
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.can_access_dashboard_scope(uuid, uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_access_dashboard_scope(uuid, uuid, uuid, text) TO authenticated, service_role;