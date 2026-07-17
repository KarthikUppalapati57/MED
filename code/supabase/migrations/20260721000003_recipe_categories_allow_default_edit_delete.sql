-- Allow edit/delete for default (is_system) categories under the same rules as custom.
-- Soft-deleted defaults must not be re-seeded by ensure_default_recipe_categories.

BEGIN;

-- Do not resurrect soft-deleted default slugs on list/create.
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

CREATE OR REPLACE FUNCTION public.update_recipe_category(
  p_category_id uuid,
  p_name text,
  p_description text DEFAULT NULL,
  p_is_active boolean DEFAULT NULL,
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
  v_old public.recipe_categories;
  v_row public.recipe_categories;
BEGIN
  IF auth.uid() IS NULL OR v_org IS NULL OR v_org <> public.get_my_org() OR NOT public.is_manager_or_above() THEN
    RAISE EXCEPTION 'Not authorized to update recipe categories';
  END IF;

  IF p_category_id IS NULL THEN
    RAISE EXCEPTION 'Category id is required';
  END IF;

  IF v_name = '' THEN
    RAISE EXCEPTION 'Category name is required';
  END IF;

  SELECT *
  INTO v_old
  FROM public.recipe_categories rc
  WHERE rc.id = p_category_id
    AND rc.organization_id = v_org
    AND rc.deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Category not found';
  END IF;

  v_slug := public.normalize_recipe_category_slug(v_name);
  IF v_slug IS NULL THEN
    RAISE EXCEPTION 'Category name is invalid';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.recipe_categories rc
    WHERE rc.organization_id = v_org
      AND rc.deleted_at IS NULL
      AND rc.id <> v_old.id
      AND (lower(rc.slug) = v_slug OR lower(rc.name) = lower(v_name))
  ) THEN
    RAISE EXCEPTION 'A category with this name already exists';
  END IF;

  UPDATE public.recipe_categories rc
  SET
    name = v_name,
    slug = v_slug,
    description = NULLIF(trim(COALESCE(p_description, '')), ''),
    is_active = COALESCE(p_is_active, rc.is_active),
    updated_at = now()
  WHERE rc.id = v_old.id
  RETURNING * INTO v_row;

  -- Keep recipe assignments when slug changes (recipes store category as slug text).
  IF lower(v_old.slug) IS DISTINCT FROM lower(v_row.slug) THEN
    UPDATE public.recipes r
    SET
      category = v_row.slug,
      updated_at = now()
    WHERE r.organization_id = v_org
      AND r.deleted_at IS NULL
      AND lower(COALESCE(r.category, '')) = lower(v_old.slug);

    -- If a default seed slug was vacated by rename, leave a soft-deleted tombstone
    -- so ensure_default_recipe_categories does not recreate the old default.
    IF lower(v_old.slug) IN ('appetizer', 'main_course', 'dessert', 'beverage', 'side', 'sauce')
       AND NOT EXISTS (
         SELECT 1
         FROM public.recipe_categories rc
         WHERE rc.organization_id = v_org
           AND lower(rc.slug) = lower(v_old.slug)
       )
    THEN
      INSERT INTO public.recipe_categories (
        organization_id, name, slug, description, display_order, is_active, is_system, deleted_at
      )
      VALUES (
        v_org,
        v_old.name,
        v_old.slug,
        v_old.description,
        v_old.display_order,
        false,
        true,
        now()
      );
    END IF;
  END IF;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_recipe_category(
  p_category_id uuid,
  p_organization_id uuid DEFAULT NULL
)
RETURNS public.recipe_categories
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org uuid := COALESCE(p_organization_id, public.get_my_org());
  v_old public.recipe_categories;
  v_row public.recipe_categories;
  v_count bigint := 0;
BEGIN
  IF auth.uid() IS NULL OR v_org IS NULL OR v_org <> public.get_my_org() OR NOT public.is_manager_or_above() THEN
    RAISE EXCEPTION 'Not authorized to delete recipe categories';
  END IF;

  IF p_category_id IS NULL THEN
    RAISE EXCEPTION 'Category id is required';
  END IF;

  SELECT *
  INTO v_old
  FROM public.recipe_categories rc
  WHERE rc.id = p_category_id
    AND rc.organization_id = v_org
    AND rc.deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Category not found';
  END IF;

  SELECT COUNT(*)::bigint
  INTO v_count
  FROM public.recipes r
  WHERE r.organization_id = v_org
    AND r.deleted_at IS NULL
    AND lower(COALESCE(r.category, '')) = lower(v_old.slug);

  IF v_count > 0 THEN
    RAISE EXCEPTION 'This category is used by % recipes and cannot be deleted.', v_count;
  END IF;

  UPDATE public.recipe_categories rc
  SET
    deleted_at = now(),
    is_active = false,
    updated_at = now()
  WHERE rc.id = v_old.id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_default_recipe_categories(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_recipe_category(uuid, text, text, boolean, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_recipe_category(uuid, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.ensure_default_recipe_categories(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_recipe_category(uuid, text, text, boolean, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_recipe_category(uuid, uuid) TO authenticated, service_role;

COMMIT;
