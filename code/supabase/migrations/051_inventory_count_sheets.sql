-- Migration: 051_inventory_count_sheets
-- Description: Add count sheets and count sessions for inventory workflows

CREATE TABLE IF NOT EXISTS count_sheets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    location_id UUID REFERENCES locations(id),
    name TEXT NOT NULL,
    description TEXT,
    items JSONB NOT NULL DEFAULT '[]',
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS count_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    count_sheet_id UUID REFERENCES count_sheets(id),
    status TEXT DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'review', 'completed', 'cancelled')),
    counted_data JSONB NOT NULL DEFAULT '{}',
    variance_data JSONB,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    completed_at TIMESTAMP WITH TIME ZONE,
    counted_by UUID REFERENCES auth.users(id)
);

-- RLS
ALTER TABLE count_sheets ENABLE ROW LEVEL SECURITY;
ALTER TABLE count_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Count_sheets org read access" ON count_sheets FOR SELECT USING (
  organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid())
);
CREATE POLICY "Count_sheets org write access" ON count_sheets FOR ALL USING (
  organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid())
);

CREATE POLICY "Count_sessions org read access" ON count_sessions FOR SELECT USING (
  organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid())
);
CREATE POLICY "Count_sessions org write access" ON count_sessions FOR ALL USING (
  organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid())
);
