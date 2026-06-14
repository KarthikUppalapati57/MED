-- 076: Dashboard persistence
-- Persists daily dashboard action status, handoff notes, and manager review logs.

CREATE TABLE IF NOT EXISTS public.dashboard_action_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  brand_id UUID REFERENCES public.brands(id) ON DELETE SET NULL,
  location_id UUID REFERENCES public.locations(id) ON DELETE SET NULL,
  scope TEXT NOT NULL CHECK (scope IN ('org', 'brand', 'location', 'staff')),
  scope_key TEXT NOT NULL DEFAULT 'org',
  action_date DATE NOT NULL DEFAULT CURRENT_DATE,
  action_key TEXT NOT NULL,
  action_title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done')),
  completed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  completed_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.dashboard_handoff_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  brand_id UUID REFERENCES public.brands(id) ON DELETE SET NULL,
  location_id UUID REFERENCES public.locations(id) ON DELETE SET NULL,
  scope TEXT NOT NULL CHECK (scope IN ('org', 'brand', 'location', 'staff')),
  scope_key TEXT NOT NULL DEFAULT 'org',
  note_date DATE NOT NULL DEFAULT CURRENT_DATE,
  note TEXT NOT NULL DEFAULT '',
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.dashboard_review_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  brand_id UUID REFERENCES public.brands(id) ON DELETE SET NULL,
  location_id UUID REFERENCES public.locations(id) ON DELETE SET NULL,
  scope TEXT NOT NULL CHECK (scope IN ('org', 'brand', 'location', 'staff')),
  scope_key TEXT NOT NULL DEFAULT 'org',
  review_date DATE NOT NULL DEFAULT CURRENT_DATE,
  completed_count INTEGER NOT NULL DEFAULT 0,
  total_count INTEGER NOT NULL DEFAULT 0,
  data_health_score INTEGER NOT NULL DEFAULT 0,
  week_sales NUMERIC NOT NULL DEFAULT 0,
  prime_cost_percent NUMERIC NOT NULL DEFAULT 0,
  unpaid_amount NUMERIC NOT NULL DEFAULT 0,
  low_stock_count INTEGER NOT NULL DEFAULT 0,
  pending_invoice_count INTEGER NOT NULL DEFAULT 0,
  open_actions JSONB NOT NULL DEFAULT '[]'::jsonb,
  note TEXT NOT NULL DEFAULT '',
  saved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION public.set_dashboard_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  NEW.updated_by = auth.uid();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS dashboard_action_status_updated_at ON public.dashboard_action_status;
CREATE TRIGGER dashboard_action_status_updated_at
BEFORE UPDATE ON public.dashboard_action_status
FOR EACH ROW EXECUTE FUNCTION public.set_dashboard_updated_at();

DROP TRIGGER IF EXISTS dashboard_handoff_notes_updated_at ON public.dashboard_handoff_notes;
CREATE TRIGGER dashboard_handoff_notes_updated_at
BEFORE UPDATE ON public.dashboard_handoff_notes
FOR EACH ROW EXECUTE FUNCTION public.set_dashboard_updated_at();

DROP TRIGGER IF EXISTS dashboard_review_logs_updated_at ON public.dashboard_review_logs;
CREATE TRIGGER dashboard_review_logs_updated_at
BEFORE UPDATE ON public.dashboard_review_logs
FOR EACH ROW EXECUTE FUNCTION public.set_dashboard_updated_at();

CREATE INDEX IF NOT EXISTS idx_dashboard_action_status_scope
  ON public.dashboard_action_status (organization_id, scope, action_date DESC);
CREATE INDEX IF NOT EXISTS idx_dashboard_handoff_notes_scope
  ON public.dashboard_handoff_notes (organization_id, scope, note_date DESC);
CREATE INDEX IF NOT EXISTS idx_dashboard_review_logs_scope
  ON public.dashboard_review_logs (organization_id, scope, review_date DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_dashboard_action_status_scope
  ON public.dashboard_action_status (organization_id, scope, scope_key, action_date, action_key);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_dashboard_handoff_notes_scope
  ON public.dashboard_handoff_notes (organization_id, scope, scope_key, note_date);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_dashboard_review_logs_scope
  ON public.dashboard_review_logs (organization_id, scope, scope_key, review_date);

ALTER TABLE public.dashboard_action_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dashboard_handoff_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dashboard_review_logs ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.can_access_dashboard_scope(
  p_org_id UUID,
  p_brand_id UUID,
  p_location_id UUID,
  p_scope TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND (
        p.role = 'platform_admin'
        OR (
          p.organization_id = p_org_id
          AND (
            p.role = 'org_owner'
            OR (p_scope = 'brand' AND p.role IN ('brand_manager', 'branch_manager') AND (p.brand_id IS NULL OR p.brand_id = p_brand_id))
            OR (p_scope IN ('location', 'staff') AND p.role IN ('location_manager', 'ground_staff') AND (p.location_id IS NULL OR p.location_id = p_location_id))
            OR (p_scope IN ('location', 'staff') AND p.role IN ('brand_manager', 'branch_manager') AND (p.brand_id IS NULL OR p.brand_id = p_brand_id))
          )
        )
      )
  );
$$;

DROP POLICY IF EXISTS "dashboard_action_status_select" ON public.dashboard_action_status;
CREATE POLICY "dashboard_action_status_select"
  ON public.dashboard_action_status FOR SELECT
  USING (public.can_access_dashboard_scope(organization_id, brand_id, location_id, scope));

DROP POLICY IF EXISTS "dashboard_action_status_insert" ON public.dashboard_action_status;
CREATE POLICY "dashboard_action_status_insert"
  ON public.dashboard_action_status FOR INSERT
  WITH CHECK (public.can_access_dashboard_scope(organization_id, brand_id, location_id, scope));

DROP POLICY IF EXISTS "dashboard_action_status_update" ON public.dashboard_action_status;
CREATE POLICY "dashboard_action_status_update"
  ON public.dashboard_action_status FOR UPDATE
  USING (public.can_access_dashboard_scope(organization_id, brand_id, location_id, scope))
  WITH CHECK (public.can_access_dashboard_scope(organization_id, brand_id, location_id, scope));

DROP POLICY IF EXISTS "dashboard_handoff_notes_select" ON public.dashboard_handoff_notes;
CREATE POLICY "dashboard_handoff_notes_select"
  ON public.dashboard_handoff_notes FOR SELECT
  USING (public.can_access_dashboard_scope(organization_id, brand_id, location_id, scope));

DROP POLICY IF EXISTS "dashboard_handoff_notes_insert" ON public.dashboard_handoff_notes;
CREATE POLICY "dashboard_handoff_notes_insert"
  ON public.dashboard_handoff_notes FOR INSERT
  WITH CHECK (public.can_access_dashboard_scope(organization_id, brand_id, location_id, scope));

DROP POLICY IF EXISTS "dashboard_handoff_notes_update" ON public.dashboard_handoff_notes;
CREATE POLICY "dashboard_handoff_notes_update"
  ON public.dashboard_handoff_notes FOR UPDATE
  USING (public.can_access_dashboard_scope(organization_id, brand_id, location_id, scope))
  WITH CHECK (public.can_access_dashboard_scope(organization_id, brand_id, location_id, scope));

DROP POLICY IF EXISTS "dashboard_review_logs_select" ON public.dashboard_review_logs;
CREATE POLICY "dashboard_review_logs_select"
  ON public.dashboard_review_logs FOR SELECT
  USING (public.can_access_dashboard_scope(organization_id, brand_id, location_id, scope));

DROP POLICY IF EXISTS "dashboard_review_logs_insert" ON public.dashboard_review_logs;
CREATE POLICY "dashboard_review_logs_insert"
  ON public.dashboard_review_logs FOR INSERT
  WITH CHECK (public.can_access_dashboard_scope(organization_id, brand_id, location_id, scope));

DROP POLICY IF EXISTS "dashboard_review_logs_update" ON public.dashboard_review_logs;
CREATE POLICY "dashboard_review_logs_update"
  ON public.dashboard_review_logs FOR UPDATE
  USING (public.can_access_dashboard_scope(organization_id, brand_id, location_id, scope))
  WITH CHECK (public.can_access_dashboard_scope(organization_id, brand_id, location_id, scope));

DROP POLICY IF EXISTS "dashboard_review_logs_delete" ON public.dashboard_review_logs;
CREATE POLICY "dashboard_review_logs_delete"
  ON public.dashboard_review_logs FOR DELETE
  USING (public.can_access_dashboard_scope(organization_id, brand_id, location_id, scope));

GRANT SELECT, INSERT, UPDATE ON public.dashboard_action_status TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.dashboard_handoff_notes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dashboard_review_logs TO authenticated;

ALTER TABLE public.dashboard_action_status REPLICA IDENTITY FULL;
ALTER TABLE public.dashboard_handoff_notes REPLICA IDENTITY FULL;
ALTER TABLE public.dashboard_review_logs REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'dashboard_action_status'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.dashboard_action_status;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'dashboard_handoff_notes'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.dashboard_handoff_notes;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'dashboard_review_logs'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.dashboard_review_logs;
    END IF;
  END IF;
END $$;
