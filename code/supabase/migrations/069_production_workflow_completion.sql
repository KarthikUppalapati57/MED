-- 069: Production workflow completion
-- Adds persisted operational settings used by setup, ordering, payments, and notifications.

BEGIN;

CREATE TABLE IF NOT EXISTS public.operational_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  brand_id UUID REFERENCES public.brands(id) ON DELETE CASCADE,
  location_id UUID REFERENCES public.locations(id) ON DELETE CASCADE,
  scope TEXT NOT NULL DEFAULT 'organization' CHECK (scope IN ('organization', 'brand', 'location')),
  category TEXT NOT NULL,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, brand_id, location_id, category)
);

ALTER TABLE public.operational_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Operational settings org read access" ON public.operational_settings;
CREATE POLICY "Operational settings org read access"
  ON public.operational_settings
  FOR SELECT
  USING (
    public.is_platform_admin()
    OR organization_id = public.get_my_org()
    OR organization_id IN (
      SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Operational settings manager write access" ON public.operational_settings;
CREATE POLICY "Operational settings manager write access"
  ON public.operational_settings
  FOR ALL
  USING (
    public.is_platform_admin()
    OR (
      public.is_manager_or_above()
      AND (
        organization_id = public.get_my_org()
        OR organization_id IN (
          SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
        )
      )
    )
  )
  WITH CHECK (
    public.is_platform_admin()
    OR (
      public.is_manager_or_above()
      AND (
        organization_id = public.get_my_org()
        OR organization_id IN (
          SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
        )
      )
    )
  );

CREATE INDEX IF NOT EXISTS idx_operational_settings_scope
  ON public.operational_settings(organization_id, brand_id, location_id, category);

CREATE OR REPLACE FUNCTION public.touch_operational_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_operational_settings_updated_at ON public.operational_settings;
CREATE TRIGGER trg_operational_settings_updated_at
  BEFORE UPDATE ON public.operational_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_operational_settings_updated_at();

-- Integration hardening for locally configured providers such as email_imap, POS APIs, and MCP connectors.
ALTER TABLE public.integrations
  DROP CONSTRAINT IF EXISTS integrations_provider_check;

ALTER TABLE public.integrations
  ADD CONSTRAINT integrations_provider_check CHECK (
    provider IN (
      'quickbooks',
      'xero',
      'netsuite',
      'stripe',
      'email_imap',
      'toast',
      'square',
      'clover',
      'lightspeed',
      '7shifts',
      'spoton',
      'supabase',
      'cloudrun',
      'sage',
      'other'
    )
  );

COMMIT;
