-- Store per-user delivery preferences for the Notifications module.
-- Preferences are scoped by module key so the UI can show only modules the user can access.

CREATE TABLE IF NOT EXISTS public.notification_delivery_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  module_key text NOT NULL,
  in_app_enabled boolean NOT NULL DEFAULT true,
  email_enabled boolean NOT NULL DEFAULT false,
  phone_enabled boolean NOT NULL DEFAULT false,
  critical_only boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_delivery_preferences_module_key_check CHECK (module_key ~ '^[a-z0-9_]+$'),
  CONSTRAINT notification_delivery_preferences_user_module_unique UNIQUE (user_id, module_key)
);

CREATE INDEX IF NOT EXISTS idx_notification_delivery_preferences_user_id
  ON public.notification_delivery_preferences (user_id);

CREATE INDEX IF NOT EXISTS idx_notification_delivery_preferences_organization_id
  ON public.notification_delivery_preferences (organization_id);

DROP TRIGGER IF EXISTS set_notification_delivery_preferences_updated_at ON public.notification_delivery_preferences;
CREATE TRIGGER set_notification_delivery_preferences_updated_at
BEFORE UPDATE ON public.notification_delivery_preferences
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.notification_delivery_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_delivery_preferences FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notification_delivery_preferences_select_own ON public.notification_delivery_preferences;
CREATE POLICY notification_delivery_preferences_select_own
ON public.notification_delivery_preferences
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS notification_delivery_preferences_insert_own ON public.notification_delivery_preferences;
CREATE POLICY notification_delivery_preferences_insert_own
ON public.notification_delivery_preferences
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS notification_delivery_preferences_update_own ON public.notification_delivery_preferences;
CREATE POLICY notification_delivery_preferences_update_own
ON public.notification_delivery_preferences
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS notification_delivery_preferences_delete_own ON public.notification_delivery_preferences;
CREATE POLICY notification_delivery_preferences_delete_own
ON public.notification_delivery_preferences
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_delivery_preferences TO authenticated;
GRANT ALL ON public.notification_delivery_preferences TO service_role;