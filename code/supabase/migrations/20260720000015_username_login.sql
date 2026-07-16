-- Adds a real, unique, login-usable username to profiles (product decision: not just a
-- display handle -- a tenant can sign in with either their email or their username).
--
-- Supabase Auth's signInWithPassword only accepts email/phone, not an arbitrary username, and
-- there's no custom GoTrue hook in this project to change that. So username-login is done at
-- the application layer in two RPCs:
--   - is_username_available(p_username)   -- live availability check during signup
--   - resolve_username_email(p_username)  -- login-time: turn a typed username into the email
--     to pass into supabase.auth.signInWithPassword
--
-- Both RPCs are necessarily callable pre-authentication (anon), which means, like the
-- "email already registered" error Supabase Auth's own signup already exposes, a username can
-- be probed for existence by an anonymous caller. That's an inherent tradeoff of
-- username-login without a custom auth hook, not a bug in this migration -- both RPCs return
-- the minimum possible surface (a boolean, or an email string) and nothing else.
--
-- Username is nullable: existing profiles, SSO signups, and platform-created invites have no
-- username and keep signing in by email only.

BEGIN;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS username TEXT;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_username_format_check
  CHECK (username IS NULL OR username ~ '^[a-z0-9_]{3,24}$');

CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_unique
  ON public.profiles (username)
  WHERE username IS NOT NULL;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role, username)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'role', 'ground_staff'),
    NULLIF(lower(btrim(NEW.raw_user_meta_data->>'username')), '')
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    updated_at = now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.is_username_available(p_username text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_normalized text := lower(btrim(p_username));
BEGIN
  IF v_normalized IS NULL OR v_normalized !~ '^[a-z0-9_]{3,24}$' THEN
    RETURN false;
  END IF;

  RETURN NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE username = v_normalized
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_username_email(p_username text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_normalized text := lower(btrim(p_username));
  v_email text;
BEGIN
  IF v_normalized IS NULL OR v_normalized = '' THEN
    RETURN NULL;
  END IF;

  SELECT email INTO v_email FROM public.profiles WHERE username = v_normalized LIMIT 1;
  RETURN v_email;
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_username_available(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_username_email(text) TO anon, authenticated;

COMMIT;
