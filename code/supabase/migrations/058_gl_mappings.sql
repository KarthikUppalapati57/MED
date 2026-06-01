-- Migration: 058_gl_mappings
-- Description: Add gl_mappings table for dynamic GL mapping

CREATE TABLE IF NOT EXISTS public.gl_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    category TEXT NOT NULL, -- e.g. 'food', 'alcohol', 'supplies', 'repairs', etc.
    gl_code TEXT NOT NULL,
    gl_name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(organization_id, category)
);

ALTER TABLE public.gl_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view org gl mappings" ON public.gl_mappings 
    FOR SELECT USING (organization_id = public.get_my_org());

CREATE POLICY "Manager+ can manage gl mappings" ON public.gl_mappings 
    FOR ALL USING (is_manager_or_above() AND organization_id = public.get_my_org());

-- Pre-populate some standard mappings for existing organizations
INSERT INTO public.gl_mappings (organization_id, category, gl_code, gl_name, description)
SELECT id, 'food', '5000', 'COGS - Food', 'All food ingredient purchases'
FROM public.organizations
ON CONFLICT (organization_id, category) DO NOTHING;

INSERT INTO public.gl_mappings (organization_id, category, gl_code, gl_name, description)
SELECT id, 'alcohol', '5010', 'COGS - Alcohol', 'All alcoholic beverage purchases'
FROM public.organizations
ON CONFLICT (organization_id, category) DO NOTHING;

INSERT INTO public.gl_mappings (organization_id, category, gl_code, gl_name, description)
SELECT id, 'supplies', '6100', 'Operating Supplies', 'Paper goods, to-go containers, cleaning supplies'
FROM public.organizations
ON CONFLICT (organization_id, category) DO NOTHING;
