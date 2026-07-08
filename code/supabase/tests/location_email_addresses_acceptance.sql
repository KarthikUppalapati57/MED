BEGIN;

CREATE TEMP TABLE location_email_ids (
  key text PRIMARY KEY,
  value uuid NOT NULL
) ON COMMIT DROP;

CREATE TEMP TABLE location_email_results (
  test_name text PRIMARY KEY,
  passed boolean NOT NULL,
  detail text
) ON COMMIT DROP;

GRANT SELECT, INSERT, UPDATE, DELETE ON location_email_ids TO authenticated, anon, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON location_email_results TO authenticated, anon, service_role;

DO $$
DECLARE
  v_org uuid := gen_random_uuid();
  v_other_org uuid := gen_random_uuid();
  v_brand1 uuid := gen_random_uuid();
  v_brand2 uuid := gen_random_uuid();
  v_choto uuid := gen_random_uuid();
  v_seymore uuid := gen_random_uuid();
  v_brand2_location uuid := gen_random_uuid();
  v_owner uuid := gen_random_uuid();
  v_branch uuid := gen_random_uuid();
  v_choto_manager uuid := gen_random_uuid();
  v_seymore_manager uuid := gen_random_uuid();
  v_ground uuid := gen_random_uuid();
BEGIN
  INSERT INTO location_email_ids(key, value) VALUES
    ('org', v_org),
    ('other_org', v_other_org),
    ('brand1', v_brand1),
    ('brand2', v_brand2),
    ('choto', v_choto),
    ('seymore', v_seymore),
    ('brand2_location', v_brand2_location),
    ('owner', v_owner),
    ('branch', v_branch),
    ('choto_manager', v_choto_manager),
    ('seymore_manager', v_seymore_manager),
    ('ground', v_ground);

  INSERT INTO auth.users (
    id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES
    (v_owner, 'authenticated', 'authenticated', 'location-email-owner@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_branch, 'authenticated', 'authenticated', 'location-email-branch@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_choto_manager, 'authenticated', 'authenticated', 'location-email-choto@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_seymore_manager, 'authenticated', 'authenticated', 'location-email-seymore@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_ground, 'authenticated', 'authenticated', 'location-email-ground@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

  INSERT INTO public.organizations (id, name, slug, owner_id)
  VALUES
    (v_org, 'Location Email Org', 'location-email-org', v_owner),
    (v_other_org, 'Location Email Other Org', 'location-email-other-org', v_owner);

  INSERT INTO public.brands (brand_id, organization_id, name)
  VALUES
    (v_brand1, v_org, 'Craven Wings'),
    (v_brand2, v_org, 'Other Brand');

  INSERT INTO public.locations (id, brand_id, organization_id, name)
  VALUES
    (v_choto, v_brand1, v_org, 'Choto'),
    (v_seymore, v_brand1, v_org, 'Seymore'),
    (v_brand2_location, v_brand2, v_org, 'Brand 2 Location');

  INSERT INTO public.profiles (
    id, email, full_name, role, organization_id, brand_id, location_id,
    access_level, invoice_approval_limit
  ) VALUES
    (v_owner, 'location-email-owner@example.test', 'Location Email Owner', 'org_manager', v_org, NULL, NULL, 'organization', 10000),
    (v_branch, 'location-email-branch@example.test', 'Location Email Branch', 'branch_manager', v_org, v_brand1, NULL, 'brand', 1000),
    (v_choto_manager, 'location-email-choto@example.test', 'Choto Manager', 'location_manager', v_org, v_brand1, v_choto, 'location', 500),
    (v_seymore_manager, 'location-email-seymore@example.test', 'Seymore Manager', 'location_manager', v_org, v_brand1, v_seymore, 'location', 500),
    (v_ground, 'location-email-ground@example.test', 'Ground Staff', 'ground_staff', v_org, v_brand1, v_choto, 'location', 0)
  ON CONFLICT (id) DO UPDATE
     SET role = EXCLUDED.role,
         organization_id = EXCLUDED.organization_id,
         brand_id = EXCLUDED.brand_id,
         location_id = EXCLUDED.location_id,
         access_level = EXCLUDED.access_level,
         invoice_approval_limit = EXCLUDED.invoice_approval_limit,
         deleted_at = NULL,
         updated_at = now();

  INSERT INTO public.organization_members (organization_id, user_id, role)
  VALUES
    (v_org, v_owner, 'org_manager'),
    (v_org, v_branch, 'branch_manager'),
    (v_org, v_choto_manager, 'location_manager'),
    (v_org, v_seymore_manager, 'location_manager'),
    (v_org, v_ground, 'ground_staff');
END $$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM location_email_ids WHERE key='owner'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

INSERT INTO public.location_email_addresses (
  email, organization_id, brand_id, location_id, label
) VALUES (
  'Choto-Invoices@Example.Test',
  (SELECT value FROM location_email_ids WHERE key='other_org'),
  (SELECT value FROM location_email_ids WHERE key='brand2'),
  (SELECT value FROM location_email_ids WHERE key='choto'),
  'Choto'
);

INSERT INTO location_email_results
SELECT 'derive_from_location_overrides_bad_org_brand',
       EXISTS (
         SELECT 1
         FROM public.location_email_addresses lea
         WHERE lea.email = 'choto-invoices@example.test'
           AND lea.location_id = (SELECT value FROM location_email_ids WHERE key='choto')
           AND lea.organization_id = (SELECT value FROM location_email_ids WHERE key='org')
           AND lea.brand_id = (SELECT value FROM location_email_ids WHERE key='brand1')
       ),
       'stored scope came from locations, email lowercased';

DO $$
BEGIN
  BEGIN
    INSERT INTO public.location_email_addresses (email, organization_id, brand_id, location_id)
    VALUES (
      'CHOTO-INVOICES@example.test',
      (SELECT value FROM location_email_ids WHERE key='org'),
      (SELECT value FROM location_email_ids WHERE key='brand1'),
      (SELECT value FROM location_email_ids WHERE key='seymore')
    );
    INSERT INTO location_email_results VALUES ('case_insensitive_unique_email_rejects_second_location', false, 'insert unexpectedly succeeded');
  EXCEPTION WHEN others THEN
    INSERT INTO location_email_results VALUES ('case_insensitive_unique_email_rejects_second_location', true, SQLERRM);
  END;
END $$;

INSERT INTO public.location_email_addresses (email, organization_id, brand_id, location_id, label)
VALUES
  ('owner-seymore@example.test', (SELECT value FROM location_email_ids WHERE key='other_org'), (SELECT value FROM location_email_ids WHERE key='brand2'), (SELECT value FROM location_email_ids WHERE key='seymore'), 'owner seymore'),
  ('owner-brand2@example.test', (SELECT value FROM location_email_ids WHERE key='other_org'), (SELECT value FROM location_email_ids WHERE key='brand1'), (SELECT value FROM location_email_ids WHERE key='brand2_location'), 'owner brand2');

INSERT INTO location_email_results
SELECT 'org_manager_can_add_any_location',
       EXISTS (SELECT 1 FROM public.location_email_addresses WHERE email = 'owner-seymore@example.test')
       AND EXISTS (SELECT 1 FROM public.location_email_addresses WHERE email = 'owner-brand2@example.test'),
       'owner inserted brand1 and brand2 locations';

RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM location_email_ids WHERE key='choto_manager'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

DO $$
BEGIN
  BEGIN
    INSERT INTO public.location_email_addresses (email, organization_id, brand_id, location_id)
    VALUES (
      'choto-manager@example.test',
      (SELECT value FROM location_email_ids WHERE key='org'),
      (SELECT value FROM location_email_ids WHERE key='brand1'),
      (SELECT value FROM location_email_ids WHERE key='choto')
    );
    INSERT INTO location_email_results VALUES ('choto_manager_can_add_choto', true, 'insert succeeded');
  EXCEPTION WHEN others THEN
    INSERT INTO location_email_results VALUES ('choto_manager_can_add_choto', false, SQLERRM);
  END;
END $$;

DO $$
BEGIN
  BEGIN
    INSERT INTO public.location_email_addresses (email, organization_id, brand_id, location_id)
    VALUES (
      'choto-manager-seymore@example.test',
      (SELECT value FROM location_email_ids WHERE key='org'),
      (SELECT value FROM location_email_ids WHERE key='brand1'),
      (SELECT value FROM location_email_ids WHERE key='seymore')
    );
    INSERT INTO location_email_results VALUES ('choto_manager_cannot_add_seymore', false, 'insert unexpectedly succeeded');
  EXCEPTION WHEN others THEN
    INSERT INTO location_email_results VALUES ('choto_manager_cannot_add_seymore', true, SQLERRM);
  END;
END $$;

DO $$
BEGIN
  BEGIN
    INSERT INTO public.location_email_addresses (email, organization_id, brand_id, location_id)
    VALUES (
      'choto-manager-brand2@example.test',
      (SELECT value FROM location_email_ids WHERE key='org'),
      (SELECT value FROM location_email_ids WHERE key='brand2'),
      (SELECT value FROM location_email_ids WHERE key='brand2_location')
    );
    INSERT INTO location_email_results VALUES ('choto_manager_cannot_add_brand2_location', false, 'insert unexpectedly succeeded');
  EXCEPTION WHEN others THEN
    INSERT INTO location_email_results VALUES ('choto_manager_cannot_add_brand2_location', true, SQLERRM);
  END;
END $$;

INSERT INTO location_email_results
SELECT 'choto_manager_read_scope',
       EXISTS (SELECT 1 FROM public.location_email_addresses WHERE email = 'choto-invoices@example.test')
       AND NOT EXISTS (SELECT 1 FROM public.location_email_addresses WHERE email = 'owner-brand2@example.test'),
       'choto manager sees own location, not brand2';

RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM location_email_ids WHERE key='branch'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

DO $$
BEGIN
  BEGIN
    INSERT INTO public.location_email_addresses (email, organization_id, brand_id, location_id)
    VALUES (
      'branch-choto@example.test',
      (SELECT value FROM location_email_ids WHERE key='org'),
      (SELECT value FROM location_email_ids WHERE key='brand1'),
      (SELECT value FROM location_email_ids WHERE key='choto')
    );
    INSERT INTO location_email_results VALUES ('branch_manager_can_add_choto', true, 'insert succeeded');
  EXCEPTION WHEN others THEN
    INSERT INTO location_email_results VALUES ('branch_manager_can_add_choto', false, SQLERRM);
  END;
END $$;

DO $$
BEGIN
  BEGIN
    INSERT INTO public.location_email_addresses (email, organization_id, brand_id, location_id)
    VALUES (
      'branch-seymore@example.test',
      (SELECT value FROM location_email_ids WHERE key='org'),
      (SELECT value FROM location_email_ids WHERE key='brand1'),
      (SELECT value FROM location_email_ids WHERE key='seymore')
    );
    INSERT INTO location_email_results VALUES ('branch_manager_can_add_seymore', true, 'insert succeeded');
  EXCEPTION WHEN others THEN
    INSERT INTO location_email_results VALUES ('branch_manager_can_add_seymore', false, SQLERRM);
  END;
END $$;

DO $$
BEGIN
  BEGIN
    INSERT INTO public.location_email_addresses (email, organization_id, brand_id, location_id)
    VALUES (
      'branch-brand2@example.test',
      (SELECT value FROM location_email_ids WHERE key='org'),
      (SELECT value FROM location_email_ids WHERE key='brand2'),
      (SELECT value FROM location_email_ids WHERE key='brand2_location')
    );
    INSERT INTO location_email_results VALUES ('branch_manager_cannot_add_brand2_location', false, 'insert unexpectedly succeeded');
  EXCEPTION WHEN others THEN
    INSERT INTO location_email_results VALUES ('branch_manager_cannot_add_brand2_location', true, SQLERRM);
  END;
END $$;

INSERT INTO location_email_results
SELECT 'branch_manager_read_scope',
       EXISTS (SELECT 1 FROM public.location_email_addresses WHERE email = 'choto-invoices@example.test')
       AND EXISTS (SELECT 1 FROM public.location_email_addresses WHERE email = 'owner-seymore@example.test')
       AND NOT EXISTS (SELECT 1 FROM public.location_email_addresses WHERE email = 'owner-brand2@example.test'),
       'branch manager sees brand1, not brand2';

RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM location_email_ids WHERE key='ground'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

DO $$
BEGIN
  BEGIN
    INSERT INTO public.location_email_addresses (email, organization_id, brand_id, location_id)
    VALUES (
      'ground-choto@example.test',
      (SELECT value FROM location_email_ids WHERE key='org'),
      (SELECT value FROM location_email_ids WHERE key='brand1'),
      (SELECT value FROM location_email_ids WHERE key='choto')
    );
    INSERT INTO location_email_results VALUES ('ground_staff_cannot_add', false, 'insert unexpectedly succeeded');
  EXCEPTION WHEN others THEN
    INSERT INTO location_email_results VALUES ('ground_staff_cannot_add', true, SQLERRM);
  END;
END $$;

RESET ROLE;

UPDATE public.location_email_addresses
   SET deleted_at = now()
 WHERE email = 'owner-seymore@example.test';

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM location_email_ids WHERE key='branch'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
INSERT INTO location_email_results
SELECT 'soft_deleted_address_hidden',
       NOT EXISTS (SELECT 1 FROM public.location_email_addresses WHERE email = 'owner-seymore@example.test'),
       'soft-deleted row filtered by tenant_scope_visible';
RESET ROLE;

SET LOCAL ROLE anon;
DO $$
BEGIN
  BEGIN
    PERFORM 1 FROM public.location_email_addresses LIMIT 1;
    INSERT INTO location_email_results VALUES ('anon_select_denied', false, 'anon select unexpectedly succeeded');
  EXCEPTION WHEN others THEN
    INSERT INTO location_email_results VALUES ('anon_select_denied', true, SQLERRM);
  END;
END $$;

DO $$
BEGIN
  BEGIN
    TRUNCATE public.location_email_addresses;
    INSERT INTO location_email_results VALUES ('anon_truncate_denied', false, 'anon truncate unexpectedly succeeded');
  EXCEPTION WHEN others THEN
    INSERT INTO location_email_results VALUES ('anon_truncate_denied', true, SQLERRM);
  END;
END $$;
RESET ROLE;

SELECT test_name, passed, detail
FROM location_email_results
ORDER BY test_name;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM location_email_results WHERE NOT passed) THEN
    RAISE EXCEPTION 'location_email_addresses acceptance failed';
  END IF;
END $$;

ROLLBACK;
