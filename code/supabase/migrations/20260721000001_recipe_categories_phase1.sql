-- Phase 1: organization-scoped recipe_categories + list/create/count RPCs.
-- Also widens recipes.category CHECK so custom slugs can be stored later without breaking existing values.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Drop restrictive recipes.category CHECK (keep column TEXT; preserve values)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_conname text;
BEGIN
  SELECT c.conname
  INTO v_conname
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = 'public'
    AND t.relname = 'recipes'
    AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) ILIKE '%category%'
    AND pg_get_constraintdef(c.oid) ILIKE '%appetizer%'
  LIMIT 1;

  IF v_conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.recipes DROP CONSTRAINT %I', v_conname);
  END IF;
END;
$$;

-- Soft validation only: disallow blank category when provided.
ALTER TABLE public.recipes
  DROP CONSTRAINT IF EXISTS recipes_category_nonempty_check;

ALTER TABLE public.recipes
  ADD CONSTRAINT recipes_category_nonempty_check
  CHECK (category IS NULL OR length(trim(category)) > 0);

-- ---------------------------------------------------------------------------
-- 2) recipe_categories table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.recipe_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_system BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_recipe_categories_org_slug_active
  ON public.recipe_categories (organization_id, lower(slug))
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_recipe_categories_organization
  ON public.recipe_categories (organization_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_recipe_categories_org_order
  ON public.recipe_categories (organization_id, display_order, name)
  WHERE deleted_at IS NULL;

ALTER TABLE public.recipe_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipe_categories FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS recipe_categories_select ON public.recipe_categories;
CREATE POLICY recipe_categories_select ON public.recipe_categories
  FOR SELECT
  USING (organization_id = public.get_my_org() AND deleted_at IS NULL);

DROP POLICY IF EXISTS recipe_categories_manage ON public.recipe_categories;
CREATE POLICY recipe_categories_manage ON public.recipe_categories
  FOR ALL
  USING (organization_id = public.get_my_org() AND public.is_manager_or_above())
  WITH CHECK (organization_id = public.get_my_org() AND public.is_manager_or_above());

GRANT SELECT, INSERT, UPDATE ON public.recipe_categories TO authenticated;
GRANT ALL ON public.recipe_categories TO service_role;

-- ---------------------------------------------------------------------------
-- 3) Helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.normalize_recipe_category_slug(p_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(
    trim(both '_' FROM lower(regexp_replace(trim(COALESCE(p_value, '')), '[^a-zA-Z0-9]+', '_', 'g'))),
    ''
  );
$$;

CREATE OR REPLACE FUNCTION public.ensure_default_recipe_categories(p_organization_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_organization_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.recipe_categories (
    organization_id, name, slug, display_order, is_active, is_system
  )
  SELECT
    p_organization_id,
    d.name,
    d.slug,
    d.display_order,
    true,
    true
  FROM (
    VALUES
      ('Appetizer', 'appetizer', 10),
      ('Main Course', 'main_course', 20),
      ('Dessert', 'dessert', 30),
      ('Beverage', 'beverage', 40),
      ('Side', 'side', 50),
      ('Sauce', 'sauce', 60)
  ) AS d(name, slug, display_order)
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.recipe_categories rc
    WHERE rc.organization_id = p_organization_id
      AND lower(rc.slug) = d.slug
  );
END;
$$;

-- Seed defaults for all existing organizations (idempotent).
DO $$
DECLARE
  v_org uuid;
BEGIN
  FOR v_org IN SELECT id FROM public.organizations LOOP
    PERFORM public.ensure_default_recipe_categories(v_org);
  END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4) RPCs
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_recipe_categories(
  p_organization_id uuid DEFAULT NULL,
  p_include_inactive boolean DEFAULT false
)
RETURNS SETOF public.recipe_categories
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org uuid := COALESCE(p_organization_id, public.get_my_org());
BEGIN
  IF auth.uid() IS NULL OR v_org IS NULL OR v_org <> public.get_my_org() THEN
    RAISE EXCEPTION 'Not authorized to list recipe categories';
  END IF;

  PERFORM public.ensure_default_recipe_categories(v_org);

  RETURN QUERY
  SELECT rc.*
  FROM public.recipe_categories rc
  WHERE rc.organization_id = v_org
    AND rc.deleted_at IS NULL
    AND (p_include_inactive OR rc.is_active)
  ORDER BY rc.display_order ASC, rc.name ASC;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_recipe_category(
  p_name text,
  p_description text DEFAULT NULL,
  p_organization_id uuid DEFAULT NULL
)
RETURNS public.recipe_categories
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org uuid := COALESCE(p_organization_id, public.get_my_org());
  v_name text := trim(COALESCE(p_name, ''));
  v_slug text;
  v_order integer;
  v_row public.recipe_categories;
BEGIN
  IF auth.uid() IS NULL OR v_org IS NULL OR v_org <> public.get_my_org() OR NOT public.is_manager_or_above() THEN
    RAISE EXCEPTION 'Not authorized to create recipe categories';
  END IF;

  IF v_name = '' THEN
    RAISE EXCEPTION 'Category name is required';
  END IF;

  v_slug := public.normalize_recipe_category_slug(v_name);
  IF v_slug IS NULL THEN
    RAISE EXCEPTION 'Category name is invalid';
  END IF;

  PERFORM public.ensure_default_recipe_categories(v_org);

  IF EXISTS (
    SELECT 1
    FROM public.recipe_categories rc
    WHERE rc.organization_id = v_org
      AND rc.deleted_at IS NULL
      AND (lower(rc.slug) = v_slug OR lower(rc.name) = lower(v_name))
  ) THEN
    RAISE EXCEPTION 'A category with this name already exists';
  END IF;

  SELECT COALESCE(MAX(rc.display_order), 0) + 10
  INTO v_order
  FROM public.recipe_categories rc
  WHERE rc.organization_id = v_org
    AND rc.deleted_at IS NULL;

  INSERT INTO public.recipe_categories (
    organization_id, name, slug, description, display_order, is_active, is_system
  )
  VALUES (
    v_org, v_name, v_slug, NULLIF(trim(COALESCE(p_description, '')), ''), v_order, true, false
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_recipe_category_counts(
  p_organization_id uuid DEFAULT NULL
)
RETURNS TABLE (
  category_id uuid,
  slug text,
  name text,
  display_order integer,
  recipe_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org uuid := COALESCE(p_organization_id, public.get_my_org());
BEGIN
  IF auth.uid() IS NULL OR v_org IS NULL OR v_org <> public.get_my_org() THEN
    RAISE EXCEPTION 'Not authorized to read recipe category counts';
  END IF;

  PERFORM public.ensure_default_recipe_categories(v_org);

  -- Count menu-style recipes only. Avoid recipe_types / recipe_type_id so this
  -- works on QA clones that have not yet received later recipe-type migrations.
  RETURN QUERY
  SELECT
    rc.id AS category_id,
    rc.slug,
    rc.name,
    rc.display_order,
    COALESCE(cnt.recipe_count, 0)::bigint AS recipe_count
  FROM public.recipe_categories rc
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::bigint AS recipe_count
    FROM public.recipes r
    WHERE r.organization_id = v_org
      AND r.deleted_at IS NULL
      AND COALESCE(r.is_batch, false) = false
      AND COALESCE(r.category, '') IS DISTINCT FROM 'prepared_item'
      AND COALESCE(r.category, '') IS DISTINCT FROM 'beverage'
      AND lower(COALESCE(r.category, '')) = lower(rc.slug)
  ) cnt ON true
  WHERE rc.organization_id = v_org
    AND rc.deleted_at IS NULL
    AND rc.is_active
  ORDER BY rc.display_order ASC, rc.name ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.normalize_recipe_category_slug(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ensure_default_recipe_categories(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_recipe_categories(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_recipe_category(text, text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_recipe_category_counts(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.normalize_recipe_category_slug(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ensure_default_recipe_categories(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_recipe_categories(uuid, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_recipe_category(text, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_recipe_category_counts(uuid) TO authenticated, service_role;

COMMIT;
