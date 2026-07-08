BEGIN;

CREATE TEMP TABLE role_gate_results (
  role_name text PRIMARY KEY,
  manager_or_above boolean,
  admin boolean,
  owner_or_admin boolean
) ON COMMIT DROP;

DO $$
DECLARE
  v_user_id uuid;
  v_original_role text;
  v_role text;
  v_expected_manager boolean;
  v_expected_admin boolean;
  v_manager boolean;
  v_admin boolean;
  v_owner_or_admin boolean;
BEGIN
  SELECT id, role
    INTO v_user_id, v_original_role
  FROM public.profiles
  ORDER BY created_at NULLS LAST, id
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Acceptance test requires at least one profile row';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_user_id::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_user_id::text, 'role', 'authenticated')::text,
    true
  );

  FOREACH v_role IN ARRAY ARRAY[
    'ground_staff',
    'location_manager',
    'branch_manager',
    'org_manager',
    'platform_admin'
  ]
  LOOP
    UPDATE public.profiles
       SET role = v_role
     WHERE id = v_user_id;

    v_expected_manager := v_role IN (
      'location_manager',
      'branch_manager',
      'org_manager',
      'platform_admin'
    );
    v_expected_admin := v_role IN ('org_manager', 'platform_admin');

    SELECT public.is_manager_or_above(),
           public.is_admin(),
           public.is_owner_or_admin()
      INTO v_manager, v_admin, v_owner_or_admin;

    INSERT INTO role_gate_results
      (role_name, manager_or_above, admin, owner_or_admin)
    VALUES
      (v_role, v_manager, v_admin, v_owner_or_admin);

    IF v_manager IS DISTINCT FROM v_expected_manager THEN
      RAISE EXCEPTION 'is_manager_or_above mismatch for role %, got %, expected %',
        v_role, v_manager, v_expected_manager;
    END IF;

    IF v_admin IS DISTINCT FROM v_expected_admin THEN
      RAISE EXCEPTION 'is_admin mismatch for role %, got %, expected %',
        v_role, v_admin, v_expected_admin;
    END IF;

    IF v_owner_or_admin IS DISTINCT FROM v_expected_admin THEN
      RAISE EXCEPTION 'is_owner_or_admin mismatch for role %, got %, expected %',
        v_role, v_owner_or_admin, v_expected_admin;
    END IF;
  END LOOP;

  UPDATE public.profiles
     SET role = v_original_role
   WHERE id = v_user_id;
END $$;

SELECT *
FROM role_gate_results
ORDER BY CASE role_name
  WHEN 'ground_staff' THEN 1
  WHEN 'location_manager' THEN 2
  WHEN 'branch_manager' THEN 3
  WHEN 'org_manager' THEN 4
  WHEN 'platform_admin' THEN 5
END;

ROLLBACK;
