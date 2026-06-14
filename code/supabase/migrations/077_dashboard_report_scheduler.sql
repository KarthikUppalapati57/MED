-- 077: Dashboard report scheduler backend
-- Tracks automated dashboard report runs and prevents duplicate sends.

CREATE TABLE IF NOT EXISTS public.dashboard_report_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  brand_id UUID REFERENCES public.brands(id) ON DELETE SET NULL,
  location_id UUID REFERENCES public.locations(id) ON DELETE SET NULL,
  preference_id UUID REFERENCES public.dashboard_report_preferences(id) ON DELETE SET NULL,
  scope TEXT NOT NULL CHECK (scope IN ('org', 'brand', 'location', 'staff')),
  scope_key TEXT NOT NULL DEFAULT 'org',
  report_type TEXT NOT NULL CHECK (report_type IN ('daily', 'weekly')),
  report_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'sent', 'failed', 'skipped')),
  recipient_roles TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  recipient_count INTEGER NOT NULL DEFAULT 0,
  notification_ids UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  error_message TEXT,
  report_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ
);

DROP TRIGGER IF EXISTS dashboard_report_deliveries_updated_at ON public.dashboard_report_deliveries;
CREATE TRIGGER dashboard_report_deliveries_updated_at
BEFORE UPDATE ON public.dashboard_report_deliveries
FOR EACH ROW EXECUTE FUNCTION public.set_dashboard_updated_at();

CREATE INDEX IF NOT EXISTS idx_dashboard_report_deliveries_scope
  ON public.dashboard_report_deliveries (organization_id, scope, scope_key, report_date DESC);
CREATE INDEX IF NOT EXISTS idx_dashboard_report_deliveries_status
  ON public.dashboard_report_deliveries (status, report_date DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_dashboard_report_delivery_run
  ON public.dashboard_report_deliveries (organization_id, scope, scope_key, report_type, report_date);

ALTER TABLE public.dashboard_report_deliveries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dashboard_report_deliveries_select" ON public.dashboard_report_deliveries;
CREATE POLICY "dashboard_report_deliveries_select"
  ON public.dashboard_report_deliveries FOR SELECT
  USING (public.can_access_dashboard_scope(organization_id, brand_id, location_id, scope));

DROP POLICY IF EXISTS "dashboard_report_deliveries_insert" ON public.dashboard_report_deliveries;
CREATE POLICY "dashboard_report_deliveries_insert"
  ON public.dashboard_report_deliveries FOR INSERT
  WITH CHECK (public.can_access_dashboard_scope(organization_id, brand_id, location_id, scope));

DROP POLICY IF EXISTS "dashboard_report_deliveries_update" ON public.dashboard_report_deliveries;
CREATE POLICY "dashboard_report_deliveries_update"
  ON public.dashboard_report_deliveries FOR UPDATE
  USING (public.can_access_dashboard_scope(organization_id, brand_id, location_id, scope))
  WITH CHECK (public.can_access_dashboard_scope(organization_id, brand_id, location_id, scope));

GRANT SELECT, INSERT, UPDATE ON public.dashboard_report_deliveries TO authenticated;

ALTER TABLE public.dashboard_report_deliveries REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'dashboard_report_deliveries'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.dashboard_report_deliveries;
    END IF;
  END IF;
END $$;
