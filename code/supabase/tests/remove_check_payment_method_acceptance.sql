-- Acceptance test for 20260720000019_remove_check_payment_method.sql
--
-- Verifies: (1) confirm_check_payment_received() no longer exists; (2) 'check' is no longer
-- an accepted payment_method_type value; (3) the other existing values ('card', 'ach', etc.)
-- still work -- proving this was a targeted revert, not a broader regression.

BEGIN;

SELECT plan(3);

CREATE TEMP TABLE rcpm_ids (
  key text PRIMARY KEY,
  value uuid NOT NULL
) ON COMMIT DROP;

CREATE TEMP TABLE rcpm_results (
  test_name text PRIMARY KEY,
  passed boolean NOT NULL,
  detail text
) ON COMMIT DROP;

GRANT SELECT, INSERT, UPDATE, DELETE ON rcpm_ids TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON rcpm_results TO authenticated;

DO $$
DECLARE
  v_tenant uuid := gen_random_uuid();
BEGIN
  INSERT INTO rcpm_ids(key, value) VALUES ('tenant', v_tenant);

  INSERT INTO auth.users (
    id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES
    (v_tenant, 'authenticated', 'authenticated', 'rcpm-tenant@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

  INSERT INTO public.profiles (id, email, full_name, role, status, payment_method_type)
  VALUES (v_tenant, 'rcpm-tenant@example.test', 'RCPM Tenant', 'tenant_super_admin', 'active', 'card')
  ON CONFLICT (id) DO UPDATE SET payment_method_type = EXCLUDED.payment_method_type;
END $$;

-- ===== confirm_check_payment_received no longer exists =====

INSERT INTO rcpm_results
SELECT 'confirm_check_payment_received_function_removed',
       NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'confirm_check_payment_received'),
       'checked pg_proc';

-- ===== 'check' is no longer an accepted payment_method_type =====

DO $$
BEGIN
  BEGIN
    UPDATE public.profiles SET payment_method_type = 'check' WHERE id = (SELECT value FROM rcpm_ids WHERE key = 'tenant');
    INSERT INTO rcpm_results VALUES ('check_value_rejected_by_constraint', false, 'UPDATE to check did not raise');
  EXCEPTION WHEN check_violation THEN
    INSERT INTO rcpm_results VALUES ('check_value_rejected_by_constraint', true, SQLERRM);
  END;
END $$;

-- ===== other existing values still accepted (targeted revert, not a regression) =====

DO $$
BEGIN
  BEGIN
    UPDATE public.profiles SET payment_method_type = 'stripe_subscription' WHERE id = (SELECT value FROM rcpm_ids WHERE key = 'tenant');
    INSERT INTO rcpm_results VALUES ('other_values_still_accepted', true, 'stripe_subscription accepted as expected');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO rcpm_results VALUES ('other_values_still_accepted', false, SQLERRM);
  END;
END $$;

-- ===================== verdict =====================

SELECT ok(passed, test_name) FROM rcpm_results ORDER BY test_name;

SELECT * FROM finish();

ROLLBACK;
