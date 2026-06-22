BEGIN;

-- Customers Table
CREATE TABLE IF NOT EXISTS public.customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    first_name TEXT,
    last_name TEXT,
    email TEXT,
    phone_number TEXT,
    total_spent NUMERIC(10, 2) DEFAULT 0,
    lifetime_orders INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(organization_id, email),
    UNIQUE(organization_id, phone_number)
);

-- Loyalty Memberships
CREATE TABLE IF NOT EXISTS public.loyalty_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    points_balance INTEGER DEFAULT 0,
    tier TEXT DEFAULT 'bronze',
    joined_date TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(organization_id, customer_id)
);

-- Marketing Campaigns
CREATE TABLE IF NOT EXISTS public.marketing_campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('email', 'sms')),
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'sending', 'completed', 'failed')),
    target_segment TEXT DEFAULT 'all',
    content TEXT NOT NULL,
    scheduled_for TIMESTAMPTZ,
    sent_count INTEGER DEFAULT 0,
    click_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS Policies
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org users can read customers" ON public.customers FOR SELECT USING (organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "Org users can modify customers" ON public.customers FOR ALL USING (organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Org users can read loyalty" ON public.loyalty_memberships FOR SELECT USING (organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "Org users can modify loyalty" ON public.loyalty_memberships FOR ALL USING (organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Org users can read campaigns" ON public.marketing_campaigns FOR SELECT USING (organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "Org users can modify campaigns" ON public.marketing_campaigns FOR ALL USING (organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

COMMIT;
