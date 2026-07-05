BEGIN;

CREATE TEMP TABLE approval_hotfix_results (
  test_name text PRIMARY KEY,
  passed boolean NOT NULL,
  detail text
) ON COMMIT DROP;

INSERT INTO private.workflow_runtime_settings (setting_name, setting_value, updated_at)
VALUES ('service_role_key', 'rollback-test-service-role-key', now())
ON CONFLICT (setting_name) DO UPDATE
   SET setting_value = EXCLUDED.setting_value,
       updated_at = now();

DO $$
DECLARE
  v_org uuid := gen_random_uuid();
  v_brand1 uuid := gen_random_uuid();
  v_brand2 uuid := gen_random_uuid();
  v_loc1 uuid := gen_random_uuid();
  v_loc2 uuid := gen_random_uuid();
  v_owner uuid := gen_random_uuid();
  v_branch1 uuid := gen_random_uuid();
  v_branch2 uuid := gen_random_uuid();
  v_loc_mgr1 uuid := gen_random_uuid();
  v_loc_mgr2 uuid := gen_random_uuid();
  v_invoice_in_scope uuid;
  v_invoice_out_scope uuid;
  v_instance uuid;
  v_step uuid;
  v_result jsonb;
BEGIN
  INSERT INTO auth.users (
    id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES
    (v_owner, 'authenticated', 'authenticated', 'step2-owner@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_branch1, 'authenticated', 'authenticated', 'step2-branch1@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_branch2, 'authenticated', 'authenticated', 'step2-branch2@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_loc_mgr1, 'authenticated', 'authenticated', 'step2-loc1@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_loc_mgr2, 'authenticated', 'authenticated', 'step2-loc2@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

  INSERT INTO public.organizations (id, name, slug, owner_id)
  VALUES (v_org, 'Step 2 Approval Hotfix Org', 'step-2-approval-hotfix-org', v_owner);

  INSERT INTO public.brands (brand_id, organization_id, name)
  VALUES
    (v_brand1, v_org, 'Step 2 Brand 1'),
    (v_brand2, v_org, 'Step 2 Brand 2');

  INSERT INTO public.locations (id, brand_id, organization_id, name)
  VALUES
    (v_loc1, v_brand1, v_org, 'Step 2 Location 1'),
    (v_loc2, v_brand2, v_org, 'Step 2 Location 2');

  INSERT INTO public.profiles (
    id, email, full_name, role, organization_id, brand_id, location_id,
    access_level, invoice_approval_limit
  ) VALUES
    (v_owner, 'step2-owner@example.test', 'Step 2 Owner', 'org_owner', v_org, NULL, NULL, 'organization', 1000),
    (v_branch1, 'step2-branch1@example.test', 'Step 2 Branch 1', 'branch_manager', v_org, v_brand1, NULL, 'brand', 500),
    (v_branch2, 'step2-branch2@example.test', 'Step 2 Branch 2', 'branch_manager', v_org, v_brand2, NULL, 'brand', 500),
    (v_loc_mgr1, 'step2-loc1@example.test', 'Step 2 Loc 1', 'location_manager', v_org, v_brand1, v_loc1, 'location', 100),
    (v_loc_mgr2, 'step2-loc2@example.test', 'Step 2 Loc 2', 'location_manager', v_org, v_brand2, v_loc2, 'location', 100)
  ON CONFLICT (id) DO UPDATE
     SET email = EXCLUDED.email,
         full_name = EXCLUDED.full_name,
         role = EXCLUDED.role,
         organization_id = EXCLUDED.organization_id,
         brand_id = EXCLUDED.brand_id,
         location_id = EXCLUDED.location_id,
         access_level = EXCLUDED.access_level,
         invoice_approval_limit = EXCLUDED.invoice_approval_limit,
         deleted_at = NULL,
         updated_at = now();

  INSERT INTO public.organization_members (organization_id, user_id, role)
  VALUES
    (v_org, v_owner, 'org_owner'),
    (v_org, v_branch1, 'branch_manager'),
    (v_org, v_branch2, 'branch_manager'),
    (v_org, v_loc_mgr1, 'location_manager'),
    (v_org, v_loc_mgr2, 'location_manager');

  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_owner::text, 'role', 'authenticated')::text,
    true
  );
  PERFORM public.update_user_approval_limit(v_branch1, 300);

  INSERT INTO approval_hotfix_results
  SELECT 'admin_can_set_subordinate_limit',
         invoice_approval_limit = 300,
         'branch manager limit is ' || invoice_approval_limit
  FROM public.profiles
  WHERE id = v_branch1;

  BEGIN
    PERFORM public.update_user_approval_limit(v_owner, 400);
    INSERT INTO approval_hotfix_results VALUES (
      'user_cannot_set_own_limit',
      false,
      'self-set unexpectedly succeeded'
    );
  EXCEPTION WHEN others THEN
    INSERT INTO approval_hotfix_results VALUES (
      'user_cannot_set_own_limit',
      true,
      SQLERRM
    );
  END;

  PERFORM set_config('request.jwt.claim.sub', v_branch1::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_branch1::text, 'role', 'authenticated')::text,
    true
  );

  BEGIN
    PERFORM public.update_user_approval_limit(v_branch2, 200);
    INSERT INTO approval_hotfix_results VALUES (
      'user_cannot_set_peer_limit',
      false,
      'peer-set unexpectedly succeeded'
    );
  EXCEPTION WHEN others THEN
    INSERT INTO approval_hotfix_results VALUES (
      'user_cannot_set_peer_limit',
      true,
      SQLERRM
    );
  END;

  INSERT INTO public.invoices (
    vendor_name, invoice_number, total_amount, status, ap_status,
    organization_id, brand_id, location_id, created_by, source
  ) VALUES (
    'Step 2 Vendor', 'STEP2-IN-SCOPE', 25, 'pending_approval', 'pending_approval',
    v_org, v_brand1, v_loc1, v_loc_mgr1, 'manual_upload'
  )
  RETURNING id INTO v_invoice_in_scope;

  INSERT INTO public.approval_instances (invoice_id, status, organization_id)
  VALUES (v_invoice_in_scope, 'pending', v_org)
  RETURNING id INTO v_instance;

  INSERT INTO public.approval_steps (instance_id, required_role)
  VALUES (v_instance, 'branch_manager')
  RETURNING id INTO v_step;

  v_result := public.execute_approval_step(v_step, 'approved', 'in scope approval');

  INSERT INTO approval_hotfix_results
  SELECT 'in_scope_manager_can_approve',
         status = 'approved',
         'rpc=' || v_result::text || ', invoice_status=' || status
  FROM public.invoices
  WHERE id = v_invoice_in_scope;

  INSERT INTO public.invoices (
    vendor_name, invoice_number, total_amount, status, ap_status,
    organization_id, brand_id, location_id, created_by, source
  ) VALUES (
    'Step 2 Vendor', 'STEP2-OUT-SCOPE', 25, 'pending_approval', 'pending_approval',
    v_org, v_brand2, v_loc2, v_loc_mgr2, 'manual_upload'
  )
  RETURNING id INTO v_invoice_out_scope;

  INSERT INTO public.approval_instances (invoice_id, status, organization_id)
  VALUES (v_invoice_out_scope, 'pending', v_org)
  RETURNING id INTO v_instance;

  INSERT INTO public.approval_steps (instance_id, required_role)
  VALUES (v_instance, 'branch_manager')
  RETURNING id INTO v_step;

  BEGIN
    PERFORM public.execute_approval_step(v_step, 'approved', 'out of scope approval');
    INSERT INTO approval_hotfix_results VALUES (
      'out_of_scope_user_cannot_approve',
      false,
      'out-of-scope approval unexpectedly succeeded'
    );
  EXCEPTION WHEN others THEN
    INSERT INTO approval_hotfix_results VALUES (
      'out_of_scope_user_cannot_approve',
      true,
      SQLERRM
    );
  END;

  INSERT INTO approval_hotfix_results VALUES (
    'anon_can_call_none',
    NOT has_function_privilege('anon', 'public.update_user_approval_limit(uuid,numeric)', 'EXECUTE')
      AND NOT has_function_privilege('anon', 'public.approve_invoice_with_limit(uuid,uuid,numeric)', 'EXECUTE')
      AND NOT has_function_privilege('anon', 'public.bulk_process_invoices(uuid[],text)', 'EXECUTE')
      AND NOT has_function_privilege('anon', 'public.execute_approval_step(uuid,text,text)', 'EXECUTE'),
    'anon execute privileges: update=' ||
      has_function_privilege('anon', 'public.update_user_approval_limit(uuid,numeric)', 'EXECUTE') ||
      ', approve=' ||
      has_function_privilege('anon', 'public.approve_invoice_with_limit(uuid,uuid,numeric)', 'EXECUTE') ||
      ', bulk=' ||
      has_function_privilege('anon', 'public.bulk_process_invoices(uuid[],text)', 'EXECUTE') ||
      ', step=' ||
      has_function_privilege('anon', 'public.execute_approval_step(uuid,text,text)', 'EXECUTE')
  );
END $$;

SELECT *
FROM approval_hotfix_results
ORDER BY test_name;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM approval_hotfix_results WHERE NOT passed) THEN
    RAISE EXCEPTION 'Approval hotfix acceptance test failed';
  END IF;
END $$;

ROLLBACK;
