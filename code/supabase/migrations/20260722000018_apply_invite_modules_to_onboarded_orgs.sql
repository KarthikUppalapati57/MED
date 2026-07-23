BEGIN;

CREATE OR REPLACE FUNCTION public.get_invited_enabled_modules(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_modules jsonb;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  WITH latest_invite AS (
    SELECT i.metadata->'modules' AS modules
    FROM public.invitations i
    WHERE i.accepted_by = p_user_id
      AND i.accepted_at IS NOT NULL
      AND jsonb_typeof(i.metadata->'modules') = 'array'
    ORDER BY i.accepted_at DESC, i.created_at DESC
    LIMIT 1
  ), allowed_modules(module_key) AS (
    VALUES
      ('dashboard'),
      ('performance'),
      ('executive_bi'),
      ('custom_reports'),
      ('invoices'),
      ('payments'),
      ('billing'),
      ('products'),
      ('inventory'),
      ('orders'),
      ('smartprep'),
      ('commissary'),
      ('recipes'),
      ('vendors'),
      ('labor'),
      ('accounting'),
      ('admin'),
      ('setup'),
      ('food_safety'),
      ('kitchen_displays'),
      ('integrations'),
      ('crm_marketing'),
      ('ai_insights')
  ), normalized AS (
    SELECT DISTINCT lower(btrim(invited_module.module_key)) AS module_key
    FROM latest_invite,
      jsonb_array_elements_text(latest_invite.modules) AS invited_module(module_key)
    WHERE NULLIF(btrim(invited_module.module_key), '') IS NOT NULL
  )
  SELECT COALESCE(jsonb_agg(normalized.module_key ORDER BY normalized.module_key), '[]'::jsonb)
  INTO v_modules
  FROM normalized
  JOIN allowed_modules USING (module_key);

  IF v_modules IS NULL OR jsonb_array_length(v_modules) = 0 THEN
    RETURN NULL;
  END IF;

  RETURN v_modules;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_tenant_enabled_modules(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_modules jsonb;
BEGIN
  IF p_tenant_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT metadata->'enabled_modules'
  INTO v_modules
  FROM public.tenants
  WHERE id = p_tenant_id
    AND jsonb_typeof(metadata->'enabled_modules') = 'array';

  IF v_modules IS NULL OR jsonb_array_length(v_modules) = 0 THEN
    RETURN NULL;
  END IF;

  RETURN v_modules;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_invited_modules_to_tenant(p_user_id uuid, p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_modules jsonb;
BEGIN
  IF p_user_id IS NULL OR p_tenant_id IS NULL THEN
    RETURN NULL;
  END IF;

  v_modules := public.get_tenant_enabled_modules(p_tenant_id);
  IF v_modules IS NOT NULL THEN
    RETURN v_modules;
  END IF;

  v_modules := public.get_invited_enabled_modules(p_user_id);
  IF v_modules IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE public.tenants
  SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
        'enabled_modules', v_modules,
        'invite_modules', v_modules,
        'module_source', 'platform_invitation'
      ),
      updated_at = now()
  WHERE id = p_tenant_id
    AND COALESCE(jsonb_array_length(
          CASE
            WHEN jsonb_typeof(metadata->'enabled_modules') = 'array' THEN metadata->'enabled_modules'
            ELSE '[]'::jsonb
          END
        ), 0) = 0;

  RETURN v_modules;
END;
$$;

REVOKE ALL ON FUNCTION public.get_invited_enabled_modules(uuid) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_tenant_enabled_modules(uuid) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_invited_modules_to_tenant(uuid, uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_invited_enabled_modules(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_tenant_enabled_modules(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.sync_invited_modules_to_tenant(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.apply_invited_modules_to_organization()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_modules jsonb;
BEGIN
  IF NEW.owner_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.tenant_id IS NOT NULL THEN
    v_modules := public.sync_invited_modules_to_tenant(NEW.owner_id, NEW.tenant_id);
  ELSE
    v_modules := public.get_invited_enabled_modules(NEW.owner_id);
  END IF;

  IF v_modules IS NOT NULL
     AND COALESCE(jsonb_array_length(
       CASE
         WHEN jsonb_typeof(NEW.enabled_modules) = 'array' THEN NEW.enabled_modules
         ELSE '[]'::jsonb
       END
     ), 0) = 0 THEN
    NEW.enabled_modules := v_modules;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS apply_invited_modules_to_organization_trigger ON public.organizations;
CREATE TRIGGER apply_invited_modules_to_organization_trigger
  BEFORE INSERT ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.apply_invited_modules_to_organization();

UPDATE public.tenants t
SET metadata = COALESCE(t.metadata, '{}'::jsonb) || jsonb_build_object(
      'enabled_modules', invited.modules,
      'invite_modules', invited.modules,
      'module_source', 'platform_invitation'
    ),
    updated_at = now()
FROM (
  SELECT id, public.get_invited_enabled_modules(owner_id) AS modules
  FROM public.tenants
) invited
WHERE t.id = invited.id
  AND invited.modules IS NOT NULL
  AND COALESCE(jsonb_array_length(
        CASE
          WHEN jsonb_typeof(t.metadata->'enabled_modules') = 'array' THEN t.metadata->'enabled_modules'
          ELSE '[]'::jsonb
        END
      ), 0) = 0;

UPDATE public.organizations o
SET enabled_modules = tenant_modules.modules
FROM (
  SELECT id, COALESCE(
    public.get_tenant_enabled_modules(tenant_id),
    public.sync_invited_modules_to_tenant(owner_id, tenant_id),
    public.get_invited_enabled_modules(owner_id)
  ) AS modules
  FROM public.organizations
) tenant_modules
WHERE o.id = tenant_modules.id
  AND tenant_modules.modules IS NOT NULL
  AND COALESCE(jsonb_array_length(
        CASE
          WHEN jsonb_typeof(o.enabled_modules) = 'array' THEN o.enabled_modules
          ELSE '[]'::jsonb
        END
      ), 0) = 0;

NOTIFY pgrst, 'reload schema';

COMMIT;