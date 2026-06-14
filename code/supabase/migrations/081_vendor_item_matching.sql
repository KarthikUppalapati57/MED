-- 081: Vendor and Item Matching
-- Creates tables for vendor aliases, vendor items, and internal item mappings. Adds fuzzy matching support.

BEGIN;

CREATE EXTENSION IF NOT EXISTS fuzzystrmatch;

-- Vendor Aliases
CREATE TABLE IF NOT EXISTS public.vendor_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  canonical_vendor_id UUID REFERENCES public.vendors(id) ON DELETE CASCADE,
  alias_name TEXT NOT NULL,
  confidence_score FLOAT,
  is_verified BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(organization_id, alias_name)
);

-- Vendor Items Catalog
CREATE TABLE IF NOT EXISTS public.vendor_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  vendor_id UUID REFERENCES public.vendors(id) ON DELETE CASCADE,
  vendor_item_code TEXT,
  vendor_item_name TEXT NOT NULL,
  vendor_unit TEXT,
  default_price NUMERIC,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(organization_id, vendor_id, vendor_item_code, vendor_item_name)
);

-- Mapping from Vendor Items to Internal Products
CREATE TABLE IF NOT EXISTS public.vendor_item_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  vendor_item_id UUID NOT NULL REFERENCES public.vendor_items(id) ON DELETE CASCADE,
  internal_product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
  conversion_multiplier NUMERIC DEFAULT 1.0,
  is_verified BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(vendor_item_id, internal_product_id)
);

ALTER TABLE public.vendor_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_item_mappings ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Vendor aliases read" ON public.vendor_aliases FOR SELECT USING (
  public.is_platform_admin() OR organization_id = public.get_my_org() OR organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid())
);
CREATE POLICY "Vendor aliases write" ON public.vendor_aliases FOR ALL USING (
  public.is_platform_admin() OR organization_id = public.get_my_org() OR organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid())
);

CREATE POLICY "Vendor items read" ON public.vendor_items FOR SELECT USING (
  public.is_platform_admin() OR organization_id = public.get_my_org() OR organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid())
);
CREATE POLICY "Vendor items write" ON public.vendor_items FOR ALL USING (
  public.is_platform_admin() OR organization_id = public.get_my_org() OR organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid())
);

CREATE POLICY "Vendor item mappings read" ON public.vendor_item_mappings FOR SELECT USING (
  public.is_platform_admin() OR organization_id = public.get_my_org() OR organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid())
);
CREATE POLICY "Vendor item mappings write" ON public.vendor_item_mappings FOR ALL USING (
  public.is_platform_admin() OR organization_id = public.get_my_org() OR organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid())
);

CREATE OR REPLACE FUNCTION public.match_vendor(p_org_id UUID, p_vendor_name TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_vendor_id UUID;
  v_exact_match UUID;
  v_alias_match UUID;
  v_fuzzy_match UUID;
BEGIN
  -- 1. Exact match on vendors table
  SELECT id INTO v_exact_match FROM public.vendors 
  WHERE organization_id = p_org_id AND LOWER(name) = LOWER(p_vendor_name)
  LIMIT 1;
  
  IF v_exact_match IS NOT NULL THEN
    RETURN v_exact_match;
  END IF;

  -- 2. Exact match on vendor_aliases
  SELECT canonical_vendor_id INTO v_alias_match FROM public.vendor_aliases
  WHERE organization_id = p_org_id AND LOWER(alias_name) = LOWER(p_vendor_name) AND is_verified = true
  LIMIT 1;

  IF v_alias_match IS NOT NULL THEN
    RETURN v_alias_match;
  END IF;

  -- 3. Fuzzy match using Levenshtein distance
  -- Only consider if distance <= 3 (e.g. slight typo)
  SELECT id INTO v_fuzzy_match FROM public.vendors
  WHERE organization_id = p_org_id AND levenshtein(LOWER(name), LOWER(p_vendor_name)) <= 3
  ORDER BY levenshtein(LOWER(name), LOWER(p_vendor_name)) ASC
  LIMIT 1;
  
  RETURN v_fuzzy_match;
END;
$$;

COMMIT;
