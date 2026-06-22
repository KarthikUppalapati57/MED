-- code/supabase/migrations/141_saas_subscriptions.sql

CREATE TABLE IF NOT EXISTS public.subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT,
    plan_tier TEXT NOT NULL DEFAULT 'starter', -- starter, pro, enterprise
    status TEXT NOT NULL DEFAULT 'incomplete', -- active, past_due, canceled, incomplete
    current_period_end TIMESTAMP WITH TIME ZONE,
    cancel_at_period_end BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(organization_id)
);

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admins can manage all subscriptions" ON public.subscriptions
    FOR ALL USING (public.is_platform_admin());

CREATE POLICY "Users can view their organization's subscription" ON public.subscriptions
    FOR SELECT USING (organization_id IN (SELECT auth.get_user_orgs()));

-- Automatically create a starter subscription when an organization is created
CREATE OR REPLACE FUNCTION handle_new_organization_subscription()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    INSERT INTO public.subscriptions (organization_id, plan_tier, status)
    VALUES (NEW.id, 'starter', 'active');
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_organization_created_subscription ON public.organizations;
CREATE TRIGGER on_organization_created_subscription
    AFTER INSERT ON public.organizations
    FOR EACH ROW EXECUTE FUNCTION handle_new_organization_subscription();

-- Backfill existing organizations
INSERT INTO public.subscriptions (organization_id, plan_tier, status)
SELECT id, 'pro', 'active' FROM public.organizations
WHERE id NOT IN (SELECT organization_id FROM public.subscriptions);
