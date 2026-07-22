-- Prove recipe_unit_conversions lifecycle never mutates the source products row.
-- Covers create, edit, deactivate, and delete.

BEGIN;

CREATE TEMP TABLE convown_ids (
  key text PRIMARY KEY,
  value uuid NOT NULL
) ON COMMIT DROP;

CREATE TEMP TABLE convown_results (
  test_name text PRIMARY KEY,
  passed boolean NOT NULL,
  detail text
) ON COMMIT DROP;

DO $$
DECLARE
  v_tenant uuid := gen_random_uuid();
  v_org uuid := gen_random_uuid();
  v_owner uuid := gen_random_uuid();
  v_product uuid := gen_random_uuid();
  v_rule uuid := gen_random_uuid();
BEGIN
  INSERT INTO convown_ids(key, value) VALUES
    ('tenant', v_tenant),
    ('org', v_org),
    ('owner', v_owner),
    ('product', v_product),
    ('rule', v_rule);

  INSERT INTO auth.users (
    id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES (
    v_owner, 'authenticated', 'authenticated', 'convown-owner@example.test', '', now(),
    '{}'::jsonb, '{}'::jsonb, now(), now()
  );

  INSERT INTO public.tenants (id, name, slug, owner_id)
  VALUES (v_tenant, 'ConvOwn Tenant', 'convown-tenant', v_owner);

  INSERT INTO public.organizations (id, tenant_id, name, slug, owner_id)
  VALUES (v_org, v_tenant, 'ConvOwn Org', 'convown-org', v_owner);

  INSERT INTO public.products (
    id, organization_id, name, base_unit, report_by_unit, latest_price, product_id
  ) VALUES (
    v_product, v_org, 'ConvOwn Bacon', 'CS', 'CS', 79.90, 'PRD-CONVOWN'
  );

  -- Create conversion rule
  INSERT INTO public.recipe_unit_conversions (
    id, organization_id, product_id, from_unit, to_unit, factor, is_active
  ) VALUES (
    v_rule, v_org, v_product, 'cs', 'count', 24, true
  );

  -- Edit factor
  UPDATE public.recipe_unit_conversions
  SET factor = 30, updated_at = now()
  WHERE id = v_rule;

  -- Deactivate
  UPDATE public.recipe_unit_conversions
  SET is_active = false, updated_at = now()
  WHERE id = v_rule;

  -- Delete
  DELETE FROM public.recipe_unit_conversions WHERE id = v_rule;
END $$;

INSERT INTO convown_results
SELECT 'product_purchase_fields_unchanged_after_conversion_lifecycle',
       count(*) = 1
         AND max(name) = 'ConvOwn Bacon'
         AND max(base_unit) = 'CS'
         AND max(report_by_unit) = 'CS'
         AND max(latest_price) = 79.90
         AND max(product_id) = 'PRD-CONVOWN',
       format('name=%s unit=%s price=%s sku=%s', max(name), max(base_unit), max(latest_price), max(product_id))
FROM public.products
WHERE id = (SELECT value FROM convown_ids WHERE key = 'product');

INSERT INTO convown_results
SELECT 'conversion_row_removed_after_delete',
       count(*) = 0,
       'remaining=' || count(*)
FROM public.recipe_unit_conversions
WHERE id = (SELECT value FROM convown_ids WHERE key = 'rule');

INSERT INTO convown_results
SELECT 'no_triggers_on_recipe_unit_conversions',
       count(*) = 0,
       'trigger_count=' || count(*)
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname = 'recipe_unit_conversions'
  AND NOT t.tgisinternal;

SELECT * FROM convown_results ORDER BY test_name;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM convown_results WHERE NOT passed) THEN
    RAISE EXCEPTION 'conversion_product_ownership_acceptance failed: %',
      (SELECT string_agg(test_name || ' => ' || detail, ', ') FROM convown_results WHERE NOT passed);
  END IF;
END $$;

ROLLBACK;
