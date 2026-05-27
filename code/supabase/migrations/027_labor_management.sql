-- Migration 027: Labor Management System
-- Creates employees and employee_shifts tables

-- 1. Employees Table
CREATE TABLE IF NOT EXISTS public.employees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    location_id UUID REFERENCES public.locations(id) ON DELETE SET NULL,
    profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL, -- Optional link to app users
    full_name TEXT NOT NULL,
    role TEXT,
    hourly_rate NUMERIC(10,2) DEFAULT 0.00,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'terminated')),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Employee Shifts Table
CREATE TABLE IF NOT EXISTS public.employee_shifts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    employee_id UUID REFERENCES public.employees(id) ON DELETE CASCADE,
    location_id UUID REFERENCES public.locations(id) ON DELETE SET NULL,
    shift_start TIMESTAMPTZ NOT NULL,
    shift_end TIMESTAMPTZ,
    labor_cost NUMERIC(10,2) DEFAULT 0.00,
    status TEXT DEFAULT 'completed' CHECK (status IN ('scheduled', 'in_progress', 'completed')),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Triggers for updated_at
DROP TRIGGER IF EXISTS set_updated_at ON public.employees;
CREATE TRIGGER set_updated_at 
    BEFORE UPDATE ON public.employees 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS set_updated_at ON public.employee_shifts;
CREATE TRIGGER set_updated_at 
    BEFORE UPDATE ON public.employee_shifts 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 4. Enable RLS
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_shifts ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies (Employees)
DROP POLICY IF EXISTS "Users can view employees" ON public.employees;
CREATE POLICY "Users can view employees" ON public.employees 
    FOR SELECT USING (organization_id = public.get_auth_org());

DROP POLICY IF EXISTS "Manager+ can manage employees" ON public.employees;
CREATE POLICY "Manager+ can manage employees" ON public.employees 
    FOR INSERT WITH CHECK (is_manager_or_above() AND organization_id = public.get_auth_org());

DROP POLICY IF EXISTS "Manager+ can update employees" ON public.employees;
CREATE POLICY "Manager+ can update employees" ON public.employees 
    FOR UPDATE USING (is_manager_or_above() AND organization_id = public.get_auth_org());

DROP POLICY IF EXISTS "Admin can delete employees" ON public.employees;
CREATE POLICY "Admin can delete employees" ON public.employees 
    FOR DELETE USING (is_admin() AND organization_id = public.get_auth_org());

-- 6. RLS Policies (Employee Shifts)
DROP POLICY IF EXISTS "Users can view shifts" ON public.employee_shifts;
CREATE POLICY "Users can view shifts" ON public.employee_shifts 
    FOR SELECT USING (organization_id = public.get_auth_org());

DROP POLICY IF EXISTS "Manager+ can manage shifts" ON public.employee_shifts;
CREATE POLICY "Manager+ can manage shifts" ON public.employee_shifts 
    FOR INSERT WITH CHECK (is_manager_or_above() AND organization_id = public.get_auth_org());

DROP POLICY IF EXISTS "Manager+ can update shifts" ON public.employee_shifts;
CREATE POLICY "Manager+ can update shifts" ON public.employee_shifts 
    FOR UPDATE USING (is_manager_or_above() AND organization_id = public.get_auth_org());

DROP POLICY IF EXISTS "Admin can delete shifts" ON public.employee_shifts;
CREATE POLICY "Admin can delete shifts" ON public.employee_shifts 
    FOR DELETE USING (is_admin() AND organization_id = public.get_auth_org());

-- 7. Indexes
CREATE INDEX IF NOT EXISTS idx_employees_org_id ON public.employees(organization_id);
CREATE INDEX IF NOT EXISTS idx_employee_shifts_org_id ON public.employee_shifts(organization_id);
CREATE INDEX IF NOT EXISTS idx_employee_shifts_employee_id ON public.employee_shifts(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_shifts_start ON public.employee_shifts(shift_start);
