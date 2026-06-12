-- 071: Workflow depth completion
-- Persists budget targets, richer order/transfer state, and invoice matching metadata.

BEGIN;

CREATE TABLE IF NOT EXISTS public.budget_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  brand_id UUID REFERENCES public.brands(id) ON DELETE CASCADE,
  location_id UUID REFERENCES public.locations(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  category TEXT NOT NULL,
  target_amount NUMERIC NOT NULL DEFAULT 0,
  target_percent NUMERIC,
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, brand_id, location_id, period_start, period_end, category)
);

ALTER TABLE public.budget_targets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Budget targets org read access" ON public.budget_targets;
CREATE POLICY "Budget targets org read access"
  ON public.budget_targets
  FOR SELECT
  USING (
    public.is_platform_admin()
    OR organization_id = public.get_my_org()
    OR organization_id IN (
      SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Budget targets manager write access" ON public.budget_targets;
CREATE POLICY "Budget targets manager write access"
  ON public.budget_targets
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

CREATE INDEX IF NOT EXISTS idx_budget_targets_scope_period
  ON public.budget_targets(organization_id, brand_id, location_id, period_start, period_end);

CREATE OR REPLACE FUNCTION public.touch_budget_targets_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_budget_targets_updated_at ON public.budget_targets;
CREATE TRIGGER trg_budget_targets_updated_at
  BEFORE UPDATE ON public.budget_targets
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_budget_targets_updated_at();

ALTER TABLE public.auto_orders
  DROP CONSTRAINT IF EXISTS auto_orders_status_check;

ALTER TABLE public.auto_orders
  ADD CONSTRAINT auto_orders_status_check CHECK (
    status IS NULL OR status IN (
      'pending',
      'pending_approval',
      'approved',
      'sent',
      'partially_received',
      'received',
      'ordered',
      'cancelled'
    )
  );

ALTER TABLE public.auto_orders
  ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sent_via TEXT,
  ADD COLUMN IF NOT EXISTS delivery_status TEXT DEFAULT 'not_sent',
  ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS invoice_status TEXT DEFAULT 'not_matched',
  ADD COLUMN IF NOT EXISTS last_workflow_step TEXT,
  ADD COLUMN IF NOT EXISTS workflow_metadata JSONB DEFAULT '{}'::jsonb;

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS purchase_order_id UUID REFERENCES public.auto_orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS matched_order_id UUID REFERENCES public.auto_orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS match_status TEXT DEFAULT 'unmatched',
  ADD COLUMN IF NOT EXISTS validation_notes TEXT,
  ADD COLUMN IF NOT EXISTS validation_results JSONB DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_invoices_purchase_order_id ON public.invoices(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_invoices_matched_order_id ON public.invoices(matched_order_id);

ALTER TABLE public.transfers
  DROP CONSTRAINT IF EXISTS transfers_status_check;

ALTER TABLE public.transfers
  ADD CONSTRAINT transfers_status_check CHECK (
    status IS NULL OR status IN ('pending', 'in_transit', 'completed', 'cancelled')
  );

ALTER TABLE public.transfers
  ADD COLUMN IF NOT EXISTS completed_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS notes TEXT;

ALTER TABLE public.processing_jobs
  ADD COLUMN IF NOT EXISTS job_type TEXT,
  ADD COLUMN IF NOT EXISTS source_type TEXT,
  ADD COLUMN IF NOT EXISTS source_id UUID,
  ADD COLUMN IF NOT EXISTS payload JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);

-- Keep webhook dispatch from remaining purely passive when pg_net is available.
CREATE OR REPLACE FUNCTION public.notify_webhook_dispatcher()
RETURNS TRIGGER AS $$
DECLARE
  v_dispatcher_url TEXT;
BEGIN
  v_dispatcher_url := current_setting('app.settings.webhook_dispatcher_url', true);

  IF v_dispatcher_url IS NOT NULL AND v_dispatcher_url <> '' THEN
    PERFORM net.http_post(
      url := v_dispatcher_url,
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body := jsonb_build_object('queue_id', NEW.id)
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS invoke_webhook_dispatcher ON public.webhook_events_queue;
CREATE TRIGGER invoke_webhook_dispatcher
  AFTER INSERT ON public.webhook_events_queue
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_webhook_dispatcher();

COMMIT;
