-- 072: Missing MarginEdge-style workflows
-- Adds first-class SmartPrep, purchase card, and Ask Tom schemas with org-scoped RLS.

BEGIN;

CREATE TABLE IF NOT EXISTS public.smart_prep_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  brand_id UUID REFERENCES public.brands(id) ON DELETE SET NULL,
  location_id UUID REFERENCES public.locations(id) ON DELETE SET NULL,
  recipe_id UUID REFERENCES public.recipes(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  prep_date DATE NOT NULL DEFAULT CURRENT_DATE,
  par_quantity NUMERIC(12,2) NOT NULL DEFAULT 0,
  on_hand_quantity NUMERIC(12,2) NOT NULL DEFAULT 0,
  forecast_quantity NUMERIC(12,2) NOT NULL DEFAULT 0,
  prep_quantity NUMERIC(12,2) NOT NULL DEFAULT 0,
  unit TEXT DEFAULT 'portion',
  priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  status TEXT DEFAULT 'planned' CHECK (status IN ('planned', 'in_progress', 'completed', 'skipped')),
  assigned_to UUID REFERENCES auth.users(id),
  completed_by UUID REFERENCES auth.users(id),
  completed_at TIMESTAMPTZ,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.purchase_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  brand_id UUID REFERENCES public.brands(id) ON DELETE SET NULL,
  location_id UUID REFERENCES public.locations(id) ON DELETE SET NULL,
  card_name TEXT NOT NULL,
  cardholder_name TEXT,
  last_four TEXT CHECK (last_four IS NULL OR last_four ~ '^[0-9]{4}$'),
  vendor_id UUID REFERENCES public.vendors(id) ON DELETE SET NULL,
  monthly_limit NUMERIC(12,2) NOT NULL DEFAULT 0,
  current_spend NUMERIC(12,2) NOT NULL DEFAULT 0,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'closed')),
  controls JSONB DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.purchase_card_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  brand_id UUID REFERENCES public.brands(id) ON DELETE SET NULL,
  location_id UUID REFERENCES public.locations(id) ON DELETE SET NULL,
  card_id UUID REFERENCES public.purchase_cards(id) ON DELETE SET NULL,
  vendor_id UUID REFERENCES public.vendors(id) ON DELETE SET NULL,
  transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
  merchant_name TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  category TEXT DEFAULT 'uncategorized',
  receipt_url TEXT,
  invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
  match_status TEXT DEFAULT 'unmatched' CHECK (match_status IN ('unmatched', 'matched', 'needs_review', 'ignored')),
  status TEXT DEFAULT 'posted' CHECK (status IN ('pending', 'posted', 'approved', 'disputed')),
  notes TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ask_tom_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  brand_id UUID REFERENCES public.brands(id) ON DELETE SET NULL,
  location_id UUID REFERENCES public.locations(id) ON DELETE SET NULL,
  title TEXT NOT NULL DEFAULT 'New Ask Tom thread',
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'archived')),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ask_tom_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES public.ask_tom_threads(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  context_snapshot JSONB DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.smart_prep_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_card_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ask_tom_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ask_tom_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "SmartPrep org read access" ON public.smart_prep_plans;
CREATE POLICY "SmartPrep org read access" ON public.smart_prep_plans
  FOR SELECT USING (public.is_platform_admin() OR organization_id = public.get_my_org());

DROP POLICY IF EXISTS "SmartPrep manager write access" ON public.smart_prep_plans;
CREATE POLICY "SmartPrep manager write access" ON public.smart_prep_plans
  FOR ALL USING (public.is_platform_admin() OR (public.is_manager_or_above() AND organization_id = public.get_my_org()))
  WITH CHECK (public.is_platform_admin() OR (public.is_manager_or_above() AND organization_id = public.get_my_org()));

DROP POLICY IF EXISTS "Purchase cards org read access" ON public.purchase_cards;
CREATE POLICY "Purchase cards org read access" ON public.purchase_cards
  FOR SELECT USING (public.is_platform_admin() OR organization_id = public.get_my_org());

DROP POLICY IF EXISTS "Purchase cards manager write access" ON public.purchase_cards;
CREATE POLICY "Purchase cards manager write access" ON public.purchase_cards
  FOR ALL USING (public.is_platform_admin() OR (public.is_manager_or_above() AND organization_id = public.get_my_org()))
  WITH CHECK (public.is_platform_admin() OR (public.is_manager_or_above() AND organization_id = public.get_my_org()));

DROP POLICY IF EXISTS "Card transactions org read access" ON public.purchase_card_transactions;
CREATE POLICY "Card transactions org read access" ON public.purchase_card_transactions
  FOR SELECT USING (public.is_platform_admin() OR organization_id = public.get_my_org());

DROP POLICY IF EXISTS "Card transactions manager write access" ON public.purchase_card_transactions;
CREATE POLICY "Card transactions manager write access" ON public.purchase_card_transactions
  FOR ALL USING (public.is_platform_admin() OR (public.is_manager_or_above() AND organization_id = public.get_my_org()))
  WITH CHECK (public.is_platform_admin() OR (public.is_manager_or_above() AND organization_id = public.get_my_org()));

DROP POLICY IF EXISTS "Ask Tom thread org read access" ON public.ask_tom_threads;
CREATE POLICY "Ask Tom thread org read access" ON public.ask_tom_threads
  FOR SELECT USING (public.is_platform_admin() OR organization_id = public.get_my_org());

DROP POLICY IF EXISTS "Ask Tom thread user write access" ON public.ask_tom_threads;
CREATE POLICY "Ask Tom thread user write access" ON public.ask_tom_threads
  FOR ALL USING (public.is_platform_admin() OR organization_id = public.get_my_org())
  WITH CHECK (public.is_platform_admin() OR organization_id = public.get_my_org());

DROP POLICY IF EXISTS "Ask Tom message org read access" ON public.ask_tom_messages;
CREATE POLICY "Ask Tom message org read access" ON public.ask_tom_messages
  FOR SELECT USING (public.is_platform_admin() OR organization_id = public.get_my_org());

DROP POLICY IF EXISTS "Ask Tom message user insert access" ON public.ask_tom_messages;
CREATE POLICY "Ask Tom message user insert access" ON public.ask_tom_messages
  FOR INSERT WITH CHECK (public.is_platform_admin() OR organization_id = public.get_my_org());

CREATE INDEX IF NOT EXISTS idx_smart_prep_plans_scope_date ON public.smart_prep_plans(organization_id, brand_id, location_id, prep_date);
CREATE INDEX IF NOT EXISTS idx_smart_prep_plans_status ON public.smart_prep_plans(status);
CREATE INDEX IF NOT EXISTS idx_purchase_cards_scope ON public.purchase_cards(organization_id, brand_id, location_id);
CREATE INDEX IF NOT EXISTS idx_card_transactions_scope_date ON public.purchase_card_transactions(organization_id, brand_id, location_id, transaction_date);
CREATE INDEX IF NOT EXISTS idx_card_transactions_match_status ON public.purchase_card_transactions(match_status);
CREATE INDEX IF NOT EXISTS idx_ask_tom_threads_scope ON public.ask_tom_threads(organization_id, brand_id, location_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_ask_tom_messages_thread ON public.ask_tom_messages(thread_id, created_at);

DROP TRIGGER IF EXISTS set_updated_at_smart_prep_plans ON public.smart_prep_plans;
CREATE TRIGGER set_updated_at_smart_prep_plans
  BEFORE UPDATE ON public.smart_prep_plans
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS set_updated_at_purchase_cards ON public.purchase_cards;
CREATE TRIGGER set_updated_at_purchase_cards
  BEFORE UPDATE ON public.purchase_cards
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS set_updated_at_purchase_card_transactions ON public.purchase_card_transactions;
CREATE TRIGGER set_updated_at_purchase_card_transactions
  BEFORE UPDATE ON public.purchase_card_transactions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE FUNCTION public.refresh_purchase_card_spend(p_card_id UUID)
RETURNS VOID AS $$
BEGIN
  IF p_card_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.purchase_cards
  SET current_spend = COALESCE((
    SELECT SUM(amount)
    FROM public.purchase_card_transactions
    WHERE card_id = p_card_id
      AND status <> 'disputed'
  ), 0)
  WHERE id = p_card_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.sync_purchase_card_spend()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.refresh_purchase_card_spend(OLD.card_id);
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.card_id IS DISTINCT FROM NEW.card_id THEN
    PERFORM public.refresh_purchase_card_spend(OLD.card_id);
  END IF;

  PERFORM public.refresh_purchase_card_spend(NEW.card_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_sync_purchase_card_spend ON public.purchase_card_transactions;
CREATE TRIGGER trg_sync_purchase_card_spend
  AFTER INSERT OR UPDATE OR DELETE ON public.purchase_card_transactions
  FOR EACH ROW EXECUTE FUNCTION public.sync_purchase_card_spend();

UPDATE public.plans
SET features = (
  SELECT jsonb_agg(DISTINCT feature)
  FROM (
    SELECT jsonb_array_elements_text(features) AS feature
    UNION ALL SELECT 'smartprep'
    UNION ALL SELECT 'purchase_card'
    UNION ALL SELECT 'ask_tom'
  ) plan_features
)
WHERE id IN ('pro', 'enterprise')
  AND jsonb_typeof(features) = 'array';

UPDATE public.organizations
SET enabled_modules = (
  SELECT jsonb_agg(DISTINCT module_key)
  FROM (
    SELECT jsonb_array_elements_text(enabled_modules) AS module_key
    UNION ALL
    SELECT 'smartprep'
    WHERE enabled_modules ? 'recipes' OR enabled_modules ? 'orders'
    UNION ALL
    SELECT 'purchase_card'
    WHERE enabled_modules ? 'payments'
    UNION ALL
    SELECT 'ask_tom'
    WHERE enabled_modules ? 'performance'
  ) org_modules
)
WHERE jsonb_typeof(enabled_modules) = 'array'
  AND (
    enabled_modules ? 'recipes'
    OR enabled_modules ? 'orders'
    OR enabled_modules ? 'payments'
    OR enabled_modules ? 'performance'
  );

DROP TRIGGER IF EXISTS set_updated_at_ask_tom_threads ON public.ask_tom_threads;
CREATE TRIGGER set_updated_at_ask_tom_threads
  BEFORE UPDATE ON public.ask_tom_threads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMIT;
