-- Migration: 052_enterprise_readiness
-- Description: Add closed_periods and location_groups for enterprise scaling

CREATE TABLE IF NOT EXISTS closed_periods (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    period_name TEXT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    closed_by UUID REFERENCES auth.users(id),
    closed_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    notes TEXT,
    UNIQUE(organization_id, start_date, end_date)
);

CREATE TABLE IF NOT EXISTS location_groups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Add group_id to locations
ALTER TABLE locations ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES location_groups(id) ON DELETE SET NULL;

-- RLS for closed_periods
ALTER TABLE closed_periods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Closed_periods org read access" ON closed_periods FOR SELECT USING (
  organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid())
);
CREATE POLICY "Closed_periods org write access" ON closed_periods FOR ALL USING (
  organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid())
);

-- RLS for location_groups
ALTER TABLE location_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Location_groups org read access" ON location_groups FOR SELECT USING (
  organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid())
);
CREATE POLICY "Location_groups org write access" ON location_groups FOR ALL USING (
  organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid())
);
