-- Acceptance test for 20260720000015_username_login.sql
--
-- Verifies: (1) handle_new_user() picks up a username from raw_user_meta_data and stores it
-- lowercased; (2) profiles without a username are unaffected (nullable, no regression for
-- SSO/invite-created profiles); (3) is_username_available() is case-insensitive and rejects
-- bad formats; (4) the unique index actually blocks a second profile from taking the same
-- username (case-insensitively, since it's stored lowercased); (5)
-- resolve_username_email() returns the right email case-insensitively and NULL for unknowns;
-- (6) both RPCs are callable as anon (required for pre-auth signup/login checks).

BEGIN;

SELECT plan(9);

CREATE TEMP TABLE ul_ids (
  key text PRIMARY KEY,
  value uuid NOT NULL
) ON COMMIT DROP;

CREATE TEMP TABLE ul_results (
  test_name text PRIMARY KEY,
  passed boolean NOT NULL,
  detail text
) ON COMMIT DROP;

GRANT SELECT, INSERT, UPDATE, DELETE ON ul_ids TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON ul_results TO authenticated, anon;

DO $$
DECLARE
  v_user_with_username uuid := gen_random_uuid();
  v_user_no_username uuid := gen_random_uuid();
BEGIN
  INSERT INTO ul_ids(key, value) VALUES ('user_with_username', v_user_with_username), ('user_no_username', v_user_no_username);

  -- Insert directly into auth.users to exercise the real on_auth_user_created trigger path.
  INSERT INTO auth.users (
    id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES
    (v_user_with_username, 'authenticated', 'authenticated', 'ul-chef-karthik@example.test', '', now(), '{}'::jsonb, jsonb_build_object('full_name', 'Chef Karthik', 'username', 'ChefKarthik'), now(), now()),
    (v_user_no_username, 'authenticated', 'authenticated', 'ul-nousername@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());
END $$;

INSERT INTO ul_results
SELECT 'trigger_stores_username_lowercased',
       username = 'chefkarthik',
       'username=' || COALESCE(username, '<null>')
FROM public.profiles
WHERE id = (SELECT value FROM ul_ids WHERE key = 'user_with_username');

INSERT INTO ul_results
SELECT 'profile_without_username_is_null_not_error',
       username IS NULL,
       'username=' || COALESCE(username, '<null>')
FROM public.profiles
WHERE id = (SELECT value FROM ul_ids WHERE key = 'user_no_username');

-- ===== is_username_available() checks, run as anon (pre-signup caller) =====

SET LOCAL ROLE anon;

INSERT INTO ul_results
SELECT 'available_check_rejects_taken_username_case_insensitive',
       public.is_username_available('CHEFKARTHIK') = false,
       'result=' || public.is_username_available('CHEFKARTHIK');

INSERT INTO ul_results
SELECT 'available_check_accepts_free_username',
       public.is_username_available('brandnewchef') = true,
       'result=' || public.is_username_available('brandnewchef');

INSERT INTO ul_results
SELECT 'available_check_rejects_bad_format_too_short',
       public.is_username_available('ab') = false,
       'result=' || public.is_username_available('ab');

INSERT INTO ul_results
SELECT 'available_check_rejects_bad_format_special_chars',
       public.is_username_available('bad-name!') = false,
       'result=' || public.is_username_available('bad-name!');

-- ===== resolve_username_email() checks, run as anon (pre-login caller) =====

INSERT INTO ul_results
SELECT 'resolve_email_case_insensitive_match',
       public.resolve_username_email('ChefKarthik') = 'ul-chef-karthik@example.test',
       'result=' || COALESCE(public.resolve_username_email('ChefKarthik'), '<null>');

INSERT INTO ul_results
SELECT 'resolve_email_returns_null_for_unknown_username',
       public.resolve_username_email('nobody_has_this_handle') IS NULL,
       'result=' || COALESCE(public.resolve_username_email('nobody_has_this_handle'), '<null>');

RESET ROLE;

-- ===== unique index actually blocks a case-insensitive duplicate at the DB level =====
-- (attempted inside a nested exception block so a unique-violation doesn't abort this
-- whole transaction; the function records whether it was correctly rejected)

CREATE OR REPLACE FUNCTION pg_temp.test_conflict() RETURNS boolean AS $$
BEGIN
  BEGIN
    UPDATE public.profiles SET username = 'chefkarthik' WHERE id = (SELECT value FROM ul_ids WHERE key = 'user_no_username');
    RETURN false; -- if we get here, the unique constraint failed to block the duplicate
  EXCEPTION WHEN unique_violation THEN
    RETURN true; -- correctly rejected
  END;
END;
$$ LANGUAGE plpgsql;

INSERT INTO ul_results
SELECT 'unique_index_blocks_case_insensitive_duplicate', pg_temp.test_conflict(), 'checked via nested exception block';

-- ===================== verdict =====================

SELECT ok(passed, test_name) FROM ul_results ORDER BY test_name;

SELECT * FROM finish();

ROLLBACK;
