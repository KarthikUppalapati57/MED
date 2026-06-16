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
-- Migration 028: Accounting and Onboarding
-- Creates accounting_sync_logs, integrations, and onboarding_progress tables

-- 1. Onboarding Progress Table
CREATE TABLE IF NOT EXISTS public.onboarding_progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    current_step TEXT DEFAULT 'signup',
    completed_steps TEXT[] DEFAULT '{}',
    is_completed BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Integrations Table
CREATE TABLE IF NOT EXISTS public.integrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    provider TEXT NOT NULL CHECK (provider IN ('quickbooks', 'xero', 'netsuite', 'stripe', 'other')),
    access_token TEXT,
    refresh_token TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    is_active BOOLEAN DEFAULT true,
    connected_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Accounting Sync Logs Table
CREATE TABLE IF NOT EXISTS public.accounting_sync_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    integration_id UUID REFERENCES public.integrations(id) ON DELETE CASCADE,
    entity_type TEXT NOT NULL CHECK (entity_type IN ('invoice', 'payment', 'vendor', 'inventory')),
    entity_id UUID, -- Can be invoice_id, payment_id, etc.
    sync_status TEXT DEFAULT 'pending' CHECK (sync_status IN ('pending', 'success', 'failed')),
    error_message TEXT,
    synced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Triggers for updated_at
DROP TRIGGER IF EXISTS set_updated_at ON public.onboarding_progress;
CREATE TRIGGER set_updated_at 
    BEFORE UPDATE ON public.onboarding_progress 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS set_updated_at ON public.integrations;
CREATE TRIGGER set_updated_at 
    BEFORE UPDATE ON public.integrations 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 5. Enable RLS
ALTER TABLE public.onboarding_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_sync_logs ENABLE ROW LEVEL SECURITY;

-- 6. RLS Policies
-- Onboarding Progress
DROP POLICY IF EXISTS "Users can view onboarding" ON public.onboarding_progress;
CREATE POLICY "Users can view onboarding" ON public.onboarding_progress 
    FOR SELECT USING (organization_id = public.get_auth_org());

DROP POLICY IF EXISTS "Users can manage onboarding" ON public.onboarding_progress;
CREATE POLICY "Users can manage onboarding" ON public.onboarding_progress 
    FOR ALL USING (organization_id = public.get_auth_org());

-- Integrations
DROP POLICY IF EXISTS "Users can view integrations" ON public.integrations;
CREATE POLICY "Users can view integrations" ON public.integrations 
    FOR SELECT USING (organization_id = public.get_auth_org());

DROP POLICY IF EXISTS "Admin can manage integrations" ON public.integrations;
CREATE POLICY "Admin can manage integrations" ON public.integrations 
    FOR ALL USING (is_owner_or_admin() AND organization_id = public.get_auth_org());

-- Accounting Sync Logs
DROP POLICY IF EXISTS "Users can view sync logs" ON public.accounting_sync_logs;
CREATE POLICY "Users can view sync logs" ON public.accounting_sync_logs 
    FOR SELECT USING (organization_id = public.get_auth_org());

DROP POLICY IF EXISTS "System can insert sync logs" ON public.accounting_sync_logs;
CREATE POLICY "System can insert sync logs" ON public.accounting_sync_logs 
    FOR INSERT WITH CHECK (organization_id = public.get_auth_org());

-- 7. Indexes
CREATE INDEX IF NOT EXISTS idx_onboarding_org_id ON public.onboarding_progress(organization_id);
CREATE INDEX IF NOT EXISTS idx_integrations_org_id ON public.integrations(organization_id);
CREATE INDEX IF NOT EXISTS idx_accounting_logs_org_id ON public.accounting_sync_logs(organization_id);
CREATE INDEX IF NOT EXISTS idx_accounting_logs_entity ON public.accounting_sync_logs(entity_type, entity_id);
-- Migration 029: Standardize RLS to use organization_id
-- Cleans up redundant columns (e.g. org_id) from audit_logs that were added by mistake in previous migrations.

-- 1. audit_logs already has organization_id. Let's drop org_id if it exists.
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='audit_logs' AND column_name='org_id') THEN
        ALTER TABLE public.audit_logs DROP COLUMN org_id CASCADE;
    END IF;
END $$;

-- 2. Drop the index if it exists
DROP INDEX IF EXISTS public.idx_audit_logs_org_id;
-- Migration 030: Enterprise RLS Upgrade (Phase 1)
-- Upgrades RLS to be database-driven rather than relying on stale JWT metadata.

-- 1. Create the new get_my_org() function as specified in the upgrade plan
CREATE OR REPLACE FUNCTION public.get_my_org()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT organization_id
  FROM public.profiles
  WHERE id = auth.uid();
$$;

-- 2. Overwrite the existing get_auth_org() function to use the database-driven approach.
-- This instantly upgrades all existing RLS policies that rely on get_auth_org() without needing to recreate them all.
CREATE OR REPLACE FUNCTION public.get_auth_org()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT public.get_my_org();
$$;

-- Note: Role-based helpers (is_manager_or_above, etc.) already query the profiles table directly via get_user_role(),
-- so they do not suffer from the stale JWT issue and require no changes.
-- Migration 031: Recipe Normalization (Phase 1)
-- Normalizes recipe ingredients from a JSONB array into a relational table.

-- 1. Create recipe_ingredients table
CREATE TABLE IF NOT EXISTS public.recipe_ingredients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    recipe_id UUID NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
    product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
    quantity NUMERIC(10,2) NOT NULL DEFAULT 0,
    unit TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Add trigger for updated_at
DROP TRIGGER IF EXISTS set_updated_at ON public.recipe_ingredients;
CREATE TRIGGER set_updated_at 
    BEFORE UPDATE ON public.recipe_ingredients 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 3. Enable RLS
ALTER TABLE public.recipe_ingredients ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies
DROP POLICY IF EXISTS "Users can view recipe ingredients" ON public.recipe_ingredients;
CREATE POLICY "Users can view recipe ingredients" ON public.recipe_ingredients 
    FOR SELECT USING (organization_id = public.get_my_org());

DROP POLICY IF EXISTS "Manager+ can manage recipe ingredients" ON public.recipe_ingredients;
CREATE POLICY "Manager+ can manage recipe ingredients" ON public.recipe_ingredients 
    FOR INSERT WITH CHECK (is_manager_or_above() AND organization_id = public.get_my_org());

DROP POLICY IF EXISTS "Manager+ can update recipe ingredients" ON public.recipe_ingredients;
CREATE POLICY "Manager+ can update recipe ingredients" ON public.recipe_ingredients 
    FOR UPDATE USING (is_manager_or_above() AND organization_id = public.get_my_org());

DROP POLICY IF EXISTS "Admin can delete recipe ingredients" ON public.recipe_ingredients;
CREATE POLICY "Admin can delete recipe ingredients" ON public.recipe_ingredients 
    FOR DELETE USING (is_admin() AND organization_id = public.get_my_org());

-- 5. Indexes
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_recipe_id ON public.recipe_ingredients(recipe_id);
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_org_id ON public.recipe_ingredients(organization_id);
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_product_id ON public.recipe_ingredients(product_id);
-- Migration 032: Inventory Movements (Phase 1)
-- Tracks the audit trail of all stock changes for enterprise reporting

-- 1. Create inventory_movements table
CREATE TABLE IF NOT EXISTS public.inventory_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    location_id UUID REFERENCES public.locations(id) ON DELETE SET NULL,
    inventory_id UUID NOT NULL REFERENCES public.inventory(id) ON DELETE CASCADE,
    movement_type TEXT NOT NULL CHECK (movement_type IN ('invoice_received', 'recipe_consumption', 'manual_adjustment', 'transfer', 'wastage', 'spoilage', 'purchase_order', 'stock_count')),
    quantity NUMERIC(10,2) NOT NULL,
    source_type TEXT, -- e.g. 'invoice', 'wastage_log'
    source_id UUID,   -- e.g. invoice_id
    previous_quantity NUMERIC(10,2),
    new_quantity NUMERIC(10,2),
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Enable RLS
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;

-- 3. RLS Policies
DROP POLICY IF EXISTS "Users can view inventory movements" ON public.inventory_movements;
CREATE POLICY "Users can view inventory movements" ON public.inventory_movements 
    FOR SELECT USING (organization_id = public.get_my_org());

DROP POLICY IF EXISTS "Manager+ can manage inventory movements" ON public.inventory_movements;
CREATE POLICY "Manager+ can manage inventory movements" ON public.inventory_movements 
    FOR INSERT WITH CHECK (is_manager_or_above() AND organization_id = public.get_my_org());

-- 4. Indexes
CREATE INDEX IF NOT EXISTS idx_inventory_movements_org_id ON public.inventory_movements(organization_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_inventory_id ON public.inventory_movements(inventory_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_created_at ON public.inventory_movements(created_at);
-- Migration 033: Soft Deletes System (Phase 1)
-- Replaces dangerous hard deletes with soft deletes for enterprise auditing and compliance.

-- 1. Add deleted_at and deleted_by columns to critical tables
ALTER TABLE public.invoices 
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES auth.users(id);

ALTER TABLE public.payments 
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES auth.users(id);

ALTER TABLE public.inventory 
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES auth.users(id);

ALTER TABLE public.products 
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES auth.users(id);

ALTER TABLE public.recipes 
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES auth.users(id);

-- 2. Update SELECT RLS Policies to exclude soft-deleted rows
-- INVOICES
DROP POLICY IF EXISTS "Users can view invoices" ON public.invoices;
CREATE POLICY "Users can view invoices" ON public.invoices 
    FOR SELECT USING (organization_id = public.get_my_org() AND deleted_at IS NULL);

-- PAYMENTS
DROP POLICY IF EXISTS "Users can view payments" ON public.payments;
CREATE POLICY "Users can view payments" ON public.payments 
    FOR SELECT USING (organization_id = public.get_my_org() AND deleted_at IS NULL);

-- INVENTORY
DROP POLICY IF EXISTS "Users can view inventory" ON public.inventory;
CREATE POLICY "Users can view inventory" ON public.inventory 
    FOR SELECT USING (organization_id = public.get_my_org() AND deleted_at IS NULL);

-- PRODUCTS
DROP POLICY IF EXISTS "Users can view products" ON public.products;
CREATE POLICY "Users can view products" ON public.products 
    FOR SELECT USING (organization_id = public.get_my_org() AND deleted_at IS NULL);

-- RECIPES
DROP POLICY IF EXISTS "Users can view recipes" ON public.recipes;
CREATE POLICY "Users can view recipes" ON public.recipes 
    FOR SELECT USING (organization_id = public.get_my_org() AND deleted_at IS NULL);

-- 3. Add index for fast exclusion of deleted rows
CREATE INDEX IF NOT EXISTS idx_invoices_deleted_at ON public.invoices(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payments_deleted_at ON public.payments(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inventory_deleted_at ON public.inventory(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_products_deleted_at ON public.products(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_recipes_deleted_at ON public.recipes(deleted_at) WHERE deleted_at IS NOT NULL;
-- Migration 034: Purchase Order System (Phase 1)
-- Normalizes procurement workflows

-- 1. Create purchase_orders table
CREATE TABLE IF NOT EXISTS public.purchase_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    location_id UUID REFERENCES public.locations(id) ON DELETE SET NULL,
    vendor_id UUID REFERENCES public.vendors(id) ON DELETE SET NULL,
    status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'pending_approval', 'approved', 'sent', 'partially_received', 'received', 'cancelled')),
    total_amount NUMERIC(12,2) DEFAULT 0,
    created_by UUID REFERENCES auth.users(id),
    approved_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Create purchase_order_items table
CREATE TABLE IF NOT EXISTS public.purchase_order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    purchase_order_id UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
    product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
    quantity NUMERIC(10,2) NOT NULL DEFAULT 1,
    unit_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
    total_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Add triggers for updated_at
DROP TRIGGER IF EXISTS set_updated_at ON public.purchase_orders;
CREATE TRIGGER set_updated_at 
    BEFORE UPDATE ON public.purchase_orders 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS set_updated_at ON public.purchase_order_items;
CREATE TRIGGER set_updated_at 
    BEFORE UPDATE ON public.purchase_order_items 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 4. Enable RLS
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies
DROP POLICY IF EXISTS "Users can view purchase orders" ON public.purchase_orders;
CREATE POLICY "Users can view purchase orders" ON public.purchase_orders 
    FOR SELECT USING (organization_id = public.get_my_org());

DROP POLICY IF EXISTS "Manager+ can manage purchase orders" ON public.purchase_orders;
CREATE POLICY "Manager+ can manage purchase orders" ON public.purchase_orders 
    FOR ALL USING (is_manager_or_above() AND organization_id = public.get_my_org());

DROP POLICY IF EXISTS "Users can view purchase order items" ON public.purchase_order_items;
CREATE POLICY "Users can view purchase order items" ON public.purchase_order_items 
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.purchase_orders po 
            WHERE po.id = purchase_order_items.purchase_order_id 
            AND po.organization_id = public.get_my_org()
        )
    );

DROP POLICY IF EXISTS "Manager+ can manage purchase order items" ON public.purchase_order_items;
CREATE POLICY "Manager+ can manage purchase order items" ON public.purchase_order_items 
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.purchase_orders po 
            WHERE po.id = purchase_order_items.purchase_order_id 
            AND po.organization_id = public.get_my_org()
            AND is_manager_or_above()
        )
    );

-- 6. Indexes
CREATE INDEX IF NOT EXISTS idx_po_org_id ON public.purchase_orders(organization_id);
CREATE INDEX IF NOT EXISTS idx_po_vendor_id ON public.purchase_orders(vendor_id);
CREATE INDEX IF NOT EXISTS idx_po_items_po_id ON public.purchase_order_items(purchase_order_id);
-- Migration 035: Indexing Strategy (Phase 1)
-- Adds performance indexing to prevent full table scans on large enterprise tenants.

-- 1. Inventory indexes
CREATE INDEX IF NOT EXISTS idx_inventory_org ON public.inventory(organization_id);
CREATE INDEX IF NOT EXISTS idx_inventory_location ON public.inventory(location_id);

-- 2. Invoice indexes
CREATE INDEX IF NOT EXISTS idx_invoices_vendor ON public.invoices(vendor_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON public.invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_created_at ON public.invoices(created_at);

-- 3. Product indexes
CREATE INDEX IF NOT EXISTS idx_products_category ON public.products(accounting_category);
-- Migration 036: Financial Ledger System (Phase 2)
-- Implements double-entry accounting foundation.

-- 1. Ledger Bills Table (Aligns with existing invoices system)
CREATE TABLE IF NOT EXISTS public.ledger_bills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    vendor_id UUID REFERENCES public.vendors(id) ON DELETE SET NULL,
    invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
    subtotal NUMERIC(12,2) DEFAULT 0,
    tax NUMERIC(12,2) DEFAULT 0,
    total NUMERIC(12,2) DEFAULT 0,
    due_date DATE,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'paid', 'voided')),
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Ledger Payments Table
CREATE TABLE IF NOT EXISTS public.ledger_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    bill_id UUID REFERENCES public.ledger_bills(id) ON DELETE CASCADE,
    payment_account_id UUID,
    payment_method TEXT,
    amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    payment_date TIMESTAMPTZ,
    status TEXT DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
    deleted_at TIMESTAMPTZ,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Ledger Entries Table (Double-Entry Core)
CREATE TABLE IF NOT EXISTS public.ledger_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    account_code TEXT NOT NULL,
    debit NUMERIC(12,2) DEFAULT 0,
    credit NUMERIC(12,2) DEFAULT 0,
    reference_type TEXT CHECK (reference_type IN ('invoice', 'bill', 'payment', 'adjustment')),
    reference_id UUID,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Triggers
DROP TRIGGER IF EXISTS set_updated_at ON public.ledger_bills;
CREATE TRIGGER set_updated_at 
    BEFORE UPDATE ON public.ledger_bills 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 5. RLS Policies
ALTER TABLE public.ledger_bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger_entries ENABLE ROW LEVEL SECURITY;

-- Ledger Bills
DROP POLICY IF EXISTS "Users can view ledger_bills" ON public.ledger_bills;
CREATE POLICY "Users can view ledger_bills" ON public.ledger_bills FOR SELECT USING (organization_id = public.get_my_org() AND deleted_at IS NULL);

DROP POLICY IF EXISTS "Manager+ can manage ledger_bills" ON public.ledger_bills;
CREATE POLICY "Manager+ can manage ledger_bills" ON public.ledger_bills FOR ALL USING (is_manager_or_above() AND organization_id = public.get_my_org());

-- Ledger Payments
DROP POLICY IF EXISTS "Users can view ledger_payments" ON public.ledger_payments;
CREATE POLICY "Users can view ledger_payments" ON public.ledger_payments FOR SELECT USING (organization_id = public.get_my_org() AND deleted_at IS NULL);

DROP POLICY IF EXISTS "Manager+ can manage ledger_payments" ON public.ledger_payments;
CREATE POLICY "Manager+ can manage ledger_payments" ON public.ledger_payments FOR ALL USING (is_manager_or_above() AND organization_id = public.get_my_org());

-- Ledger Entries (Immutable Audit)
DROP POLICY IF EXISTS "Users can view ledger_entries" ON public.ledger_entries;
CREATE POLICY "Users can view ledger_entries" ON public.ledger_entries FOR SELECT USING (organization_id = public.get_my_org());

DROP POLICY IF EXISTS "System can insert ledger_entries" ON public.ledger_entries;
CREATE POLICY "System can insert ledger_entries" ON public.ledger_entries FOR INSERT WITH CHECK (organization_id = public.get_my_org());
-- No UPDATE or DELETE on ledger_entries to preserve accounting integrity.

-- 6. Indexes
CREATE INDEX IF NOT EXISTS idx_ledger_bills_org ON public.ledger_bills(organization_id);
CREATE INDEX IF NOT EXISTS idx_ledger_payments_org ON public.ledger_payments(organization_id);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_org ON public.ledger_entries(organization_id);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_account ON public.ledger_entries(account_code);
-- Migration 037: Notification System (Phase 2)
-- Centralized system for operational and AI alerts.

CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('low_inventory', 'invoice_approved', 'payment_failed', 'AI_alert', 'vendor_update', 'labor_alert', 'system')),
    title TEXT NOT NULL,
    body TEXT,
    read BOOLEAN DEFAULT false,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Users can only view their own notifications
DROP POLICY IF EXISTS "Users can view own notifications" ON public.notifications;
CREATE POLICY "Users can view own notifications" ON public.notifications 
    FOR SELECT USING (user_id = auth.uid() AND organization_id = public.get_my_org());

-- System can create notifications for anyone in the org
DROP POLICY IF EXISTS "System can insert notifications" ON public.notifications;
CREATE POLICY "System can insert notifications" ON public.notifications 
    FOR INSERT WITH CHECK (organization_id = public.get_my_org());

-- Users can mark their own notifications as read
DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
CREATE POLICY "Users can update own notifications" ON public.notifications 
    FOR UPDATE USING (user_id = auth.uid() AND organization_id = public.get_my_org());

CREATE INDEX IF NOT EXISTS idx_notifications_user ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_org ON public.notifications(organization_id);
-- Migration 038: AI and Event Architecture (Phase 2)
-- Infrastructure for async pipelines and persistent AI storage.

-- 1. AI Insights Table
CREATE TABLE IF NOT EXISTS public.ai_insights (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    insight_type TEXT NOT NULL,
    severity TEXT CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    title TEXT NOT NULL,
    description TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    resolved BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Domain Events Table (Event Sourcing)
CREATE TABLE IF NOT EXISTS public.domain_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    aggregate_type TEXT NOT NULL,
    aggregate_id UUID NOT NULL,
    payload JSONB NOT NULL,
    processed BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Processing Jobs (Worker queues and observability)
CREATE TABLE IF NOT EXISTS public.processing_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    job_type TEXT NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    payload JSONB,
    error_message TEXT,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Enable RLS
ALTER TABLE public.ai_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.domain_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.processing_jobs ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies
DROP POLICY IF EXISTS "Users can view ai_insights" ON public.ai_insights;
CREATE POLICY "Users can view ai_insights" ON public.ai_insights FOR SELECT USING (organization_id = public.get_my_org());

DROP POLICY IF EXISTS "System can insert ai_insights" ON public.ai_insights;
CREATE POLICY "System can insert ai_insights" ON public.ai_insights FOR INSERT WITH CHECK (organization_id = public.get_my_org());

DROP POLICY IF EXISTS "Manager+ can resolve ai_insights" ON public.ai_insights;
CREATE POLICY "Manager+ can resolve ai_insights" ON public.ai_insights FOR UPDATE USING (is_manager_or_above() AND organization_id = public.get_my_org());

DROP POLICY IF EXISTS "System can manage domain_events" ON public.domain_events;
CREATE POLICY "System can manage domain_events" ON public.domain_events FOR ALL USING (organization_id = public.get_my_org());

DROP POLICY IF EXISTS "System can manage processing_jobs" ON public.processing_jobs;
CREATE POLICY "System can manage processing_jobs" ON public.processing_jobs FOR ALL USING (organization_id = public.get_my_org());

-- 6. Indexes
CREATE INDEX IF NOT EXISTS idx_ai_insights_org ON public.ai_insights(organization_id);
CREATE INDEX IF NOT EXISTS idx_domain_events_org ON public.domain_events(organization_id);
CREATE INDEX IF NOT EXISTS idx_processing_jobs_org ON public.processing_jobs(organization_id);
-- Migration 039: Granular RBAC System (Phase 2)
-- Replaces single-column role strings with an enterprise RBAC schema.
-- We are running this in parallel with profiles.role for safety during transition.

-- 1. Roles Table
CREATE TABLE IF NOT EXISTS public.roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT UNIQUE NOT NULL
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM pg_constraint 
        WHERE conrelid = 'public.roles'::regclass AND contype = 'u'
    ) THEN
        ALTER TABLE public.roles ADD CONSTRAINT roles_name_key UNIQUE (name);
    END IF;
END $$;

-- 2. Permissions Table
CREATE TABLE IF NOT EXISTS public.permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key TEXT UNIQUE NOT NULL
);

-- 3. Role Permissions Table
CREATE TABLE IF NOT EXISTS public.role_permissions (
    role_id UUID REFERENCES public.roles(id) ON DELETE CASCADE,
    permission_id UUID REFERENCES public.permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

-- 4. User Roles Table
CREATE TABLE IF NOT EXISTS public.user_roles (
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    role_id UUID REFERENCES public.roles(id) ON DELETE CASCADE,
    location_id UUID REFERENCES public.locations(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, role_id)
);

-- 5. Enable RLS
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 6. RLS Policies
DROP POLICY IF EXISTS "Users can view roles" ON public.roles;
CREATE POLICY "Users can view roles" ON public.roles FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can view permissions" ON public.permissions;
CREATE POLICY "Users can view permissions" ON public.permissions FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can view role_permissions" ON public.role_permissions;
CREATE POLICY "Users can view role_permissions" ON public.role_permissions FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can view own user_roles" ON public.user_roles;
CREATE POLICY "Users can view own user_roles" ON public.user_roles FOR SELECT USING (user_id = auth.uid() OR organization_id = public.get_my_org());

DROP POLICY IF EXISTS "Admin can manage user_roles" ON public.user_roles;
CREATE POLICY "Admin can manage user_roles" ON public.user_roles FOR ALL USING (is_admin() AND organization_id = public.get_my_org());

-- 7. Seed Default Data & Backfill from profiles
DO $$
DECLARE
    r_plat_id UUID;
    r_owner_id UUID;
    r_branch_id UUID;
    r_staff_id UUID;
BEGIN
    -- Seed default roles
    INSERT INTO public.roles (name) VALUES ('platform_admin') ON CONFLICT (name) DO UPDATE SET name=EXCLUDED.name RETURNING id INTO r_plat_id;
    INSERT INTO public.roles (name) VALUES ('org_owner') ON CONFLICT (name) DO UPDATE SET name=EXCLUDED.name RETURNING id INTO r_owner_id;
    INSERT INTO public.roles (name) VALUES ('branch_manager') ON CONFLICT (name) DO UPDATE SET name=EXCLUDED.name RETURNING id INTO r_branch_id;
    INSERT INTO public.roles (name) VALUES ('ground_staff') ON CONFLICT (name) DO UPDATE SET name=EXCLUDED.name RETURNING id INTO r_staff_id;

    -- Backfill existing profiles into user_roles
    INSERT INTO public.user_roles (user_id, role_id, location_id, organization_id)
    SELECT 
        p.id as user_id,
        CASE 
            WHEN p.role = 'platform_admin' THEN r_plat_id
            WHEN p.role = 'org_owner' THEN r_owner_id
            WHEN p.role = 'branch_manager' THEN r_branch_id
            ELSE r_staff_id
        END as role_id,
        p.location_id,
        p.organization_id
    FROM public.profiles p
    WHERE p.organization_id IS NOT NULL
    ON CONFLICT (user_id, role_id) DO NOTHING;
END $$;
-- ============================================================
-- Migration 040: Multi-Tenant Multi-Role Architecture
-- ============================================================

BEGIN;

-- 1. Create Membership Tables
CREATE TABLE IF NOT EXISTS public.organization_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'ground_staff',
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(organization_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.brand_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'ground_staff',
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(brand_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.location_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    location_id UUID NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'ground_staff',
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(location_id, user_id)
);

-- Enable RLS
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.location_members ENABLE ROW LEVEL SECURITY;

-- Basic RLS for viewing memberships
DROP POLICY IF EXISTS "Users can view own organization_members" ON public.organization_members;
CREATE POLICY "Users can view own organization_members" ON public.organization_members FOR SELECT USING (user_id = auth.uid() OR organization_id = public.get_auth_org() OR public.get_auth_role() = 'platform_admin');

DROP POLICY IF EXISTS "Users can view own brand_members" ON public.brand_members;
CREATE POLICY "Users can view own brand_members" ON public.brand_members FOR SELECT USING (user_id = auth.uid() OR public.get_auth_role() = 'platform_admin' OR EXISTS (SELECT 1 FROM public.brands WHERE id = brand_id AND organization_id = public.get_auth_org()));

DROP POLICY IF EXISTS "Users can view own location_members" ON public.location_members;
CREATE POLICY "Users can view own location_members" ON public.location_members FOR SELECT USING (user_id = auth.uid() OR public.get_auth_role() = 'platform_admin' OR EXISTS (SELECT 1 FROM public.locations WHERE id = location_id AND organization_id = public.get_auth_org()));

-- 2. Data Migration: Copy existing users from `profiles` to membership tables
INSERT INTO public.organization_members (organization_id, user_id, role)
SELECT organization_id, id, role
FROM public.profiles
WHERE organization_id IS NOT NULL
ON CONFLICT (organization_id, user_id) DO UPDATE SET role = EXCLUDED.role;

INSERT INTO public.brand_members (brand_id, user_id, role)
SELECT brand_id, id, role
FROM public.profiles
WHERE brand_id IS NOT NULL
ON CONFLICT (brand_id, user_id) DO UPDATE SET role = EXCLUDED.role;

INSERT INTO public.location_members (location_id, user_id, role)
SELECT location_id, id, role
FROM public.profiles
WHERE location_id IS NOT NULL
ON CONFLICT (location_id, user_id) DO UPDATE SET role = EXCLUDED.role;

-- 3. Context Switcher RPC
CREATE OR REPLACE FUNCTION public.switch_user_context(
    p_organization_id UUID,
    p_brand_id UUID DEFAULT NULL,
    p_location_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id UUID;
    v_role TEXT;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Verify membership in the organization
    SELECT role INTO v_role
    FROM public.organization_members
    WHERE organization_id = p_organization_id AND user_id = v_user_id;

    IF v_role IS NULL AND (SELECT COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') != 'platform_admin') THEN
        RAISE EXCEPTION 'User is not a member of this organization';
    END IF;

    IF v_role IS NULL THEN
        -- If platform admin, keep their role
        v_role := 'platform_admin';
    END IF;

    -- Update app_metadata for fast RLS checks (Preserves existing workflow)
    UPDATE auth.users
    SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object(
        'role', v_role,
        'organization_id', p_organization_id::text,
        'brand_id', COALESCE(p_brand_id::text, null),
        'location_id', COALESCE(p_location_id::text, null)
    )
    WHERE id = v_user_id;

    -- Also update profile to keep legacy queries from breaking
    UPDATE public.profiles
    SET organization_id = p_organization_id,
        brand_id = p_brand_id,
        location_id = p_location_id,
        role = v_role,
        updated_at = now()
    WHERE id = v_user_id;

    RETURN jsonb_build_object(
        'success', true,
        'role', v_role,
        'organization_id', p_organization_id,
        'brand_id', p_brand_id,
        'location_id', p_location_id
    );
END;
$$;

-- 4. Update setup_organization_full to insert into members table
CREATE OR REPLACE FUNCTION public.setup_organization_full(
  p_user_id UUID,
  p_org_name TEXT,
  p_org_slug TEXT,
  p_brand_name TEXT,
  p_location_name TEXT,
  p_location_address TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_org_id UUID;
  v_brand_id UUID;
  v_location_id UUID;
BEGIN
  IF auth.uid() != p_user_id AND public.get_auth_role() != 'platform_admin' THEN
    RAISE EXCEPTION 'Not authorized to onboard another user';
  END IF;

  INSERT INTO public.organizations (name, slug, owner_id)
  VALUES (p_org_name, p_org_slug, p_user_id)
  RETURNING id INTO v_org_id;

  INSERT INTO public.brands (organization_id, name)
  VALUES (v_org_id, p_brand_name)
  RETURNING id INTO v_brand_id;

  INSERT INTO public.locations (organization_id, brand_id, name, address)
  VALUES (v_org_id, v_brand_id, p_location_name, p_location_address)
  RETURNING id INTO v_location_id;

  -- Insert into new multi-tenant tables
  INSERT INTO public.organization_members (organization_id, user_id, role) VALUES (v_org_id, p_user_id, 'org_owner');
  INSERT INTO public.brand_members (brand_id, user_id, role) VALUES (v_brand_id, p_user_id, 'org_owner');
  INSERT INTO public.location_members (location_id, user_id, role) VALUES (v_location_id, p_user_id, 'org_owner');

  -- Update profiles for fallback
  UPDATE public.profiles
  SET organization_id = v_org_id,
      brand_id        = v_brand_id,
      location_id     = v_location_id,
      role            = 'org_owner',
      access_level    = 'organization',
      updated_at      = now()
  WHERE id = p_user_id;

  -- Update app_metadata
  UPDATE auth.users
  SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object(
    'role', 'org_owner',
    'organization_id', v_org_id::text
  )
  WHERE id = p_user_id;

  RETURN jsonb_build_object(
    'org_id',      v_org_id,
    'brand_id',    v_brand_id,
    'location_id', v_location_id
  );
END;
$$;

-- 5. Update accept_invitation to insert into members table
CREATE OR REPLACE FUNCTION public.accept_invitation(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_invite RECORD;
  v_user_id UUID;
  v_user_email TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT email INTO v_user_email FROM auth.users WHERE id = v_user_id;

  SELECT * INTO v_invite
  FROM public.invitations
  WHERE token::text = p_token
    AND accepted_at IS NULL
    AND LOWER(email) = LOWER(v_user_email);

  IF v_invite IS NULL THEN
    RAISE EXCEPTION 'Invalid, expired, or already-accepted invitation';
  END IF;

  -- Insert into new multi-tenant tables
  INSERT INTO public.organization_members (organization_id, user_id, role) 
  VALUES (v_invite.organization_id, v_user_id, v_invite.role)
  ON CONFLICT (organization_id, user_id) DO UPDATE SET role = EXCLUDED.role;
  
  IF v_invite.brand_id IS NOT NULL THEN
      INSERT INTO public.brand_members (brand_id, user_id, role) 
      VALUES (v_invite.brand_id, v_user_id, v_invite.role)
      ON CONFLICT (brand_id, user_id) DO UPDATE SET role = EXCLUDED.role;
  END IF;

  IF v_invite.location_id IS NOT NULL THEN
      INSERT INTO public.location_members (location_id, user_id, role) 
      VALUES (v_invite.location_id, v_user_id, v_invite.role)
      ON CONFLICT (location_id, user_id) DO UPDATE SET role = EXCLUDED.role;
  END IF;

  UPDATE public.profiles
  SET role            = v_invite.role,
      organization_id = v_invite.organization_id,
      brand_id        = COALESCE(v_invite.brand_id, brand_id),
      location_id     = COALESCE(v_invite.location_id, location_id),
      updated_at      = now()
  WHERE id = v_user_id;

  UPDATE public.invitations
  SET accepted_at = now(),
      accepted_by = v_user_id
  WHERE id = v_invite.id;

  -- Update app_metadata for fast RLS
  UPDATE auth.users
  SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object(
    'role', v_invite.role,
    'organization_id', v_invite.organization_id::text
  )
  WHERE id = v_user_id;

  RETURN jsonb_build_object(
    'success',         true,
    'role',            v_invite.role,
    'organization_id', v_invite.organization_id
  );
END;
$$;

-- 6. Update admin_update_user_role to update members table
CREATE OR REPLACE FUNCTION public.admin_update_user_role(
  target_user_id    UUID,
  new_role          TEXT,
  new_status        TEXT         DEFAULT NULL,
  new_department    TEXT         DEFAULT NULL,
  new_location      TEXT         DEFAULT NULL,
  new_permissions   JSONB        DEFAULT NULL,
  new_brand_id      UUID         DEFAULT NULL,
  new_location_id   UUID         DEFAULT NULL,
  new_access_level  TEXT         DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_role TEXT;
  caller_org  UUID;
  target_org  UUID;
BEGIN
  caller_role := public.get_auth_role();
  caller_org  := public.get_auth_org();

  IF caller_role NOT IN ('org_owner', 'platform_admin') THEN
    RAISE EXCEPTION 'Insufficient permissions: only org_owner or platform_admin can update user roles';
  END IF;

  SELECT organization_id INTO target_org
  FROM public.profiles
  WHERE id = target_user_id;

  IF caller_role = 'org_owner' AND target_org IS DISTINCT FROM caller_org THEN
    RAISE EXCEPTION 'Cannot modify users outside your organization';
  END IF;

  IF caller_role != 'platform_admin' AND new_role IS NOT NULL THEN
    IF NOT public.can_invite_role(new_role) THEN
      RAISE EXCEPTION 'Cannot assign a role equal to or above your own';
    END IF;
  END IF;

  IF target_user_id = auth.uid() AND caller_role = 'org_owner' AND new_role != 'org_owner' THEN
    RAISE EXCEPTION 'Cannot change your own role. Transfer ownership first.';
  END IF;
  
  -- Update membership tables
  IF new_role IS NOT NULL AND target_org IS NOT NULL THEN
      INSERT INTO public.organization_members (organization_id, user_id, role)
      VALUES (target_org, target_user_id, new_role)
      ON CONFLICT (organization_id, user_id) DO UPDATE SET role = EXCLUDED.role;
  END IF;

  UPDATE public.profiles
  SET role         = COALESCE(new_role, role),
      status       = COALESCE(new_status, status),
      department   = COALESCE(new_department, department),
      permissions  = COALESCE(new_permissions, permissions),
      brand_id     = COALESCE(new_brand_id, brand_id),
      location_id  = COALESCE(new_location_id, location_id),
      access_level = COALESCE(new_access_level, access_level),
      updated_at   = now()
  WHERE id = target_user_id;

  -- Only update app_metadata if this is their ACTIVE org, otherwise let it be
  -- (If we update their app_metadata here blindly, we might kick them out of their current context)
  IF (SELECT raw_app_meta_data->>'organization_id' FROM auth.users WHERE id = target_user_id) = target_org::text THEN
      UPDATE auth.users
      SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object(
        'role', COALESCE(new_role, (SELECT role FROM public.profiles WHERE id = target_user_id))
      )
      WHERE id = target_user_id;
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- 7. Add fetch_user_access_tree RPC for Frontend Context Initialization
CREATE OR REPLACE FUNCTION public.fetch_user_access_tree()
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_agg(
    jsonb_build_object(
      'organization', row_to_json(o.*),
      'role', om.role,
      'brands', (
        SELECT jsonb_agg(
          jsonb_build_object(
            'brand', row_to_json(b.*),
            'role', bm.role,
            'locations', (
              SELECT jsonb_agg(
                jsonb_build_object(
                  'location', row_to_json(l.*),
                  'role', lm.role
                )
              )
              FROM public.location_members lm
              JOIN public.locations l ON l.id = lm.location_id
              WHERE lm.user_id = auth.uid() AND l.brand_id = b.brand_id
            )
          )
        )
        FROM public.brand_members bm
        JOIN public.brands b ON b.brand_id = bm.brand_id
        WHERE bm.user_id = auth.uid() AND b.organization_id = o.id
      )
    )
  )
  FROM public.organization_members om
  JOIN public.organizations o ON o.id = om.organization_id
  WHERE om.user_id = auth.uid();
$$;

COMMIT;
-- ============================================================
-- Migration 041: Admin Delete User RPC & Archiving
-- ============================================================

-- 1. Create an Archive Table for Deleted Users
CREATE TABLE IF NOT EXISTS public.archived_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    original_user_id UUID NOT NULL,
    email TEXT,
    full_name TEXT,
    role TEXT,
    deleted_by UUID REFERENCES auth.users(id),
    deleted_at TIMESTAMPTZ DEFAULT now()
);

-- Protect the archive table
ALTER TABLE public.archived_users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Platform admins can view archived users" ON public.archived_users;
CREATE POLICY "Platform admins can view archived users" ON public.archived_users 
FOR SELECT USING (COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'platform_admin');

-- 2. Function to safely delete and archive a user
CREATE OR REPLACE FUNCTION public.admin_delete_user(target_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    caller_role TEXT;
    v_email TEXT;
    v_full_name TEXT;
    v_role TEXT;
BEGIN
    -- 1. Check if caller is authenticated
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- 2. Verify the caller is a platform_admin
    caller_role := COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '');
    
    IF caller_role != 'platform_admin' THEN
        RAISE EXCEPTION 'Insufficient permissions: only platform_admin can delete users permanently';
    END IF;

    -- 3. Prevent self-deletion via this route
    IF target_user_id = auth.uid() THEN
        RAISE EXCEPTION 'You cannot delete your own account.';
    END IF;

    -- 4. Gather user details before deletion for the archive
    SELECT email, full_name, role INTO v_email, v_full_name, v_role
    FROM public.profiles
    WHERE id = target_user_id;

    -- If profile was missing, fallback to auth.users for email
    IF v_email IS NULL THEN
        SELECT email INTO v_email FROM auth.users WHERE id = target_user_id;
    END IF;

    -- 5. Archive the user
    INSERT INTO public.archived_users (original_user_id, email, full_name, role, deleted_by)
    VALUES (target_user_id, v_email, v_full_name, v_role, auth.uid());

    -- 6. Delete the user from auth.users
    -- Because this function is SECURITY DEFINER, it runs with the privileges 
    -- of the user who created it (postgres superuser during migrations),
    -- allowing it to safely bypass the auth schema restrictions.
    DELETE FROM auth.users WHERE id = target_user_id;

    RETURN jsonb_build_object('success', true);
END;
$$;


-- ============================================================
-- Migration 042: Org Member Management RPCs
-- ============================================================

-- 1. org_remove_member
-- Allows an org_owner to safely remove a user from their organization.
CREATE OR REPLACE FUNCTION public.org_remove_member(
    target_user_id UUID,
    target_org_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_role TEXT;
  caller_org  UUID;
  active_org  UUID;
BEGIN
  caller_role := public.get_auth_role();
  caller_org  := COALESCE(target_org_id, public.get_auth_org());

  IF caller_role != 'org_owner' AND caller_role != 'platform_admin' THEN
    RAISE EXCEPTION 'Insufficient permissions: only org_owner or platform_admin can remove users';
  END IF;

  IF target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot remove yourself. Transfer ownership first.';
  END IF;

  -- Remove from organization_members
  DELETE FROM public.organization_members 
  WHERE user_id = target_user_id AND organization_id = caller_org;
  
  -- Remove from brand_members for this org
  DELETE FROM public.brand_members 
  WHERE user_id = target_user_id 
    AND brand_id IN (SELECT id FROM public.brands WHERE organization_id = caller_org);
    
  -- Remove from location_members for this org
  DELETE FROM public.location_members 
  WHERE user_id = target_user_id 
    AND location_id IN (SELECT id FROM public.locations WHERE organization_id = caller_org);

  -- Update profiles if this was their active org
  UPDATE public.profiles 
  SET organization_id = NULL, brand_id = NULL, location_id = NULL, role = 'ground_staff'
  WHERE id = target_user_id AND organization_id = caller_org;

  -- Update app_metadata if this is their active context
  IF (SELECT raw_app_meta_data->>'organization_id' FROM auth.users WHERE id = target_user_id) = caller_org::text THEN
      UPDATE auth.users
      SET raw_app_meta_data = raw_app_meta_data - 'organization_id' - 'role' - 'brand_id' - 'location_id'
      WHERE id = target_user_id;
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;


-- 2. Update admin_update_user_role to support signing_privileges
CREATE OR REPLACE FUNCTION public.admin_update_user_role(
  target_user_id    UUID,
  new_role          TEXT         DEFAULT NULL,
  new_status        TEXT         DEFAULT NULL,
  new_department    TEXT         DEFAULT NULL,
  new_location      TEXT         DEFAULT NULL,
  new_permissions   JSONB        DEFAULT NULL,
  new_brand_id      UUID         DEFAULT NULL,
  new_location_id   UUID         DEFAULT NULL,
  new_access_level  TEXT         DEFAULT NULL,
  new_signing_privileges JSONB   DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_role TEXT;
  caller_org  UUID;
  target_org  UUID;
BEGIN
  caller_role := public.get_auth_role();
  caller_org  := public.get_auth_org();

  IF caller_role NOT IN ('org_owner', 'platform_admin') THEN
    RAISE EXCEPTION 'Insufficient permissions: only org_owner or platform_admin can update user roles';
  END IF;

  SELECT organization_id INTO target_org
  FROM public.profiles
  WHERE id = target_user_id;

  IF caller_role = 'org_owner' AND target_org IS DISTINCT FROM caller_org THEN
    RAISE EXCEPTION 'Cannot modify users outside your organization';
  END IF;

  IF caller_role != 'platform_admin' AND new_role IS NOT NULL THEN
    IF NOT public.can_invite_role(new_role) THEN
      RAISE EXCEPTION 'Cannot assign a role equal to or above your own';
    END IF;
  END IF;

  IF target_user_id = auth.uid() AND caller_role = 'org_owner' AND new_role != 'org_owner' THEN
    RAISE EXCEPTION 'Cannot change your own role. Transfer ownership first.';
  END IF;
  
  -- Update membership tables
  IF new_role IS NOT NULL AND target_org IS NOT NULL THEN
      INSERT INTO public.organization_members (organization_id, user_id, role)
      VALUES (target_org, target_user_id, new_role)
      ON CONFLICT (organization_id, user_id) DO UPDATE SET role = EXCLUDED.role;
  END IF;

  UPDATE public.profiles
  SET role               = COALESCE(new_role, role),
      status             = COALESCE(new_status, status),
      department         = COALESCE(new_department, department),
      permissions        = COALESCE(new_permissions, permissions),
      signing_privileges = COALESCE(new_signing_privileges, signing_privileges),
      brand_id           = COALESCE(new_brand_id, brand_id),
      location_id        = COALESCE(new_location_id, location_id),
      access_level       = COALESCE(new_access_level, access_level),
      updated_at         = now()
  WHERE id = target_user_id;

  -- Only update app_metadata if this is their ACTIVE org
  IF (SELECT raw_app_meta_data->>'organization_id' FROM auth.users WHERE id = target_user_id) = target_org::text THEN
      UPDATE auth.users
      SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object(
        'role', COALESCE(new_role, (SELECT role FROM public.profiles WHERE id = target_user_id))
      )
      WHERE id = target_user_id;
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;
-- Fix schema mismatch between main tables and archived tables
-- The archive_record_on_delete trigger relies on exact column ordering.
-- We must recreate the archived tables to match the current schema.

DO $$
DECLARE
    t TEXT;
BEGIN
    FOR t IN SELECT unnest(ARRAY['organizations', 'brands', 'locations', 'profiles', 'invitations'])
    LOOP
        EXECUTE format('DROP TABLE IF EXISTS public.%I CASCADE', 'archived_' || t);
        EXECUTE format('CREATE TABLE public.%I AS SELECT * FROM public.%I WHERE false', 'archived_' || t, t);
        EXECUTE format('ALTER TABLE public.%I ADD COLUMN archived_at TIMESTAMPTZ DEFAULT now()', 'archived_' || t);
        EXECUTE format('ALTER TABLE public.%I ADD COLUMN archived_by UUID', 'archived_' || t);
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', 'archived_' || t);
        EXECUTE format('CREATE POLICY "Platform admins can view archived records" ON public.%I FOR SELECT USING (auth.jwt() -> ''user_metadata'' ->> ''role'' = ''platform_admin'')', 'archived_' || t);
    END LOOP;
END $$;
-- Add Stripe billing fields to organizations table
ALTER TABLE organizations 
ADD COLUMN IF NOT EXISTS stripe_customer_id text,
ADD COLUMN IF NOT EXISTS stripe_subscription_id text,
ADD COLUMN IF NOT EXISTS plan_id text,
ADD COLUMN IF NOT EXISTS subscription_status text;

-- Create an index for faster lookups during webhooks
CREATE INDEX IF NOT EXISTS idx_org_stripe_customer_id ON organizations(stripe_customer_id);

-- Optional: Create audit log table (for Phase 3, might as well do it now)
CREATE TABLE IF NOT EXISTS audit_logs (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    action text NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid,
    details jsonb,
    ip_address text,
    created_at timestamptz DEFAULT now()
);

-- Audit logs should be append-only
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Platform admins can view all audit logs" ON audit_logs;
CREATE POLICY "Platform admins can view all audit logs" ON audit_logs
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role = 'platform_admin'
        )
    );

DROP POLICY IF EXISTS "System can insert audit logs" ON audit_logs;
CREATE POLICY "System can insert audit logs" ON audit_logs
    FOR INSERT
    WITH CHECK (true); -- Usually restricted to service role or authenticated users
ALTER TABLE plans ADD COLUMN IF NOT EXISTS stripe_price_id text;
