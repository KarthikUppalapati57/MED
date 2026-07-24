BEGIN;

CREATE OR REPLACE FUNCTION public.normalize_invited_module_keys(p_modules jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $$
  WITH allowed_modules(module_key) AS (
    VALUES
      ('dashboard'),
      ('dashboard_reports'),
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
    SELECT DISTINCT lower(btrim(module_key.value)) AS module_key
    FROM jsonb_array_elements_text(
      CASE WHEN jsonb_typeof(p_modules) = 'array' THEN p_modules ELSE '[]'::jsonb END
    ) AS module_key(value)
    WHERE NULLIF(btrim(module_key.value), '') IS NOT NULL
  )
  SELECT NULLIF(COALESCE(jsonb_agg(normalized.module_key ORDER BY normalized.module_key), '[]'::jsonb), '[]'::jsonb)
  FROM normalized
  JOIN allowed_modules USING (module_key);
$$;

CREATE OR REPLACE FUNCTION public.get_invited_enabled_modules(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_modules jsonb;
  v_user_email text;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT lower(email) INTO v_user_email
  FROM auth.users
  WHERE id = p_user_id;

  WITH latest_invite AS (
    SELECT public.normalize_invited_module_keys(i.metadata->'modules') AS modules
    FROM public.invitations i
    WHERE (
        i.accepted_by = p_user_id
        OR lower(i.email) = v_user_email
        OR i.id::text = (
          SELECT t.metadata->>'invitation_id'
          FROM public.tenants t
          WHERE t.owner_id = p_user_id
          ORDER BY t.created_at DESC
          LIMIT 1
        )
      )
      AND jsonb_typeof(i.metadata->'modules') = 'array'
    ORDER BY COALESCE(i.accepted_at, i.created_at) DESC, i.created_at DESC
    LIMIT 1
  )
  SELECT modules INTO v_modules
  FROM latest_invite
  WHERE modules IS NOT NULL;

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

  SELECT COALESCE(
    public.normalize_invited_module_keys(metadata->'enabled_modules'),
    public.normalize_invited_module_keys(metadata->'invite_modules')
  )
  INTO v_modules
  FROM public.tenants
  WHERE id = p_tenant_id;

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

  v_modules := COALESCE(
    public.get_tenant_enabled_modules(p_tenant_id),
    public.get_invited_enabled_modules(p_user_id)
  );

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
  WHERE id = p_tenant_id;

  RETURN v_modules;
END;
$$;

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
  SELECT t_inner.id, public.get_invited_enabled_modules(t_inner.owner_id) AS modules
  FROM public.tenants t_inner
) invited
WHERE t.id = invited.id
  AND invited.modules IS NOT NULL
  AND public.get_tenant_enabled_modules(t.id) IS NULL;

UPDATE public.organizations o
SET enabled_modules = tenant_modules.modules
FROM (
  SELECT o_inner.id, COALESCE(
    public.get_tenant_enabled_modules(o_inner.tenant_id),
    public.sync_invited_modules_to_tenant(o_inner.owner_id, o_inner.tenant_id),
    public.get_invited_enabled_modules(o_inner.owner_id)
  ) AS modules
  FROM public.organizations o_inner
) tenant_modules
WHERE o.id = tenant_modules.id
  AND tenant_modules.modules IS NOT NULL
  AND COALESCE(jsonb_array_length(
        CASE
          WHEN jsonb_typeof(o.enabled_modules) = 'array' THEN o.enabled_modules
          ELSE '[]'::jsonb
        END
      ), 0) = 0;

REVOKE ALL ON FUNCTION public.normalize_invited_module_keys(jsonb) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_invited_enabled_modules(uuid) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_tenant_enabled_modules(uuid) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_invited_modules_to_tenant(uuid, uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_invited_enabled_modules(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_tenant_enabled_modules(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.sync_invited_modules_to_tenant(uuid, uuid) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
