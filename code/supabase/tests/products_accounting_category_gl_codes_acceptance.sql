-- Acceptance test for 20260719000012_products_accounting_category_gl_codes.sql
--
-- Verifies: (1) a GL code (what the Add Product dropdown actually submits) is now accepted,
-- (2) the legacy enum value is still accepted (no regression for existing rows/callers),
-- (3) a genuinely invalid value is still rejected (the constraint still does its job).

BEGIN;

CREATE TEMP TABLE pacgc_results (
  test_name text PRIMARY KEY,
  passed boolean NOT NULL,
  detail text
) ON COMMIT DROP;

DO $$
DECLARE
  v_org uuid := gen_random_uuid();
BEGIN
  INSERT INTO public.organizations (id, name, slug) VALUES (v_org, 'PACGC Org', 'pacgc-org-' || v_org);

  INSERT INTO public.products (organization_id, name, accounting_category) VALUES (v_org, 'PACGC GL Code Product', '5110');
  INSERT INTO public.products (organization_id, name, accounting_category) VALUES (v_org, 'PACGC Legacy Enum Product', 'food');
END $$;

INSERT INTO pacgc_results VALUES ('gl_code_accepted', true, 'insert succeeded above without raising');

DO $$
BEGIN
  BEGIN
    INSERT INTO public.products (organization_id, name, accounting_category)
    VALUES ((SELECT organization_id FROM public.products WHERE name = 'PACGC GL Code Product'), 'PACGC Invalid Category', 'not-a-real-category');
    INSERT INTO pacgc_results VALUES ('invalid_value_still_rejected', false, 'unexpectedly succeeded');
  EXCEPTION WHEN check_violation THEN
    INSERT INTO pacgc_results VALUES ('invalid_value_still_rejected', true, SQLERRM);
  END;
END $$;

SELECT * FROM pacgc_results ORDER BY test_name;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pacgc_results WHERE NOT passed) THEN
    RAISE EXCEPTION 'products_accounting_category_gl_codes_acceptance failed';
  END IF;
END $$;

ROLLBACK;
