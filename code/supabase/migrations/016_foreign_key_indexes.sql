-- ============================================================
-- 016: Foreign Key Indexing (Performance Optimization)
-- ============================================================
-- Fixes:
--   [PERFORMANCE] Over 30 foreign keys lack indexes, leading to
--   full table scans on DELETE/UPDATE of parent rows.
-- ============================================================

BEGIN;

-- ────────────────────────────────────────────────────────────
-- 1: Core Tables
-- ────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_audit_logs_org_id ON public.audit_logs(organization_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON public.audit_logs(user_id);

CREATE INDEX IF NOT EXISTS idx_error_logs_user_id ON public.error_logs(user_id);

CREATE INDEX IF NOT EXISTS idx_invitations_org_id ON public.invitations(organization_id);
CREATE INDEX IF NOT EXISTS idx_invitations_brand_id ON public.invitations(brand_id);
CREATE INDEX IF NOT EXISTS idx_invitations_loc_id ON public.invitations(location_id);

CREATE INDEX IF NOT EXISTS idx_invoices_created_by ON public.invoices(created_by);
CREATE INDEX IF NOT EXISTS idx_invoices_approved_by ON public.invoices(approved_by);

CREATE INDEX IF NOT EXISTS idx_organizations_owner_id ON public.organizations(owner_id);
CREATE INDEX IF NOT EXISTS idx_organizations_plan_id ON public.organizations(plan_id);

CREATE INDEX IF NOT EXISTS idx_profiles_org_id ON public.profiles(organization_id);
CREATE INDEX IF NOT EXISTS idx_profiles_brand_id ON public.profiles(brand_id);
CREATE INDEX IF NOT EXISTS idx_profiles_loc_id ON public.profiles(location_id);


-- ────────────────────────────────────────────────────────────
-- 2: Star Schema Dimensions
-- ────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_dim_product_org_id ON public.dim_product(organization_id);
CREATE INDEX IF NOT EXISTS idx_dim_product_loc_id ON public.dim_product(location_id);

CREATE INDEX IF NOT EXISTS idx_dim_user_org_id ON public.dim_user(organization_id);

CREATE INDEX IF NOT EXISTS idx_dim_vendor_org_id ON public.dim_vendor(organization_id);
CREATE INDEX IF NOT EXISTS idx_dim_vendor_loc_id ON public.dim_vendor(location_id);


-- ────────────────────────────────────────────────────────────
-- 3: Star Schema Facts
-- ────────────────────────────────────────────────────────────
-- fact_inventory
CREATE INDEX IF NOT EXISTS idx_fact_inventory_snapshot_date ON public.fact_inventory(snapshot_date_key);
CREATE INDEX IF NOT EXISTS idx_fact_inventory_product_key ON public.fact_inventory(product_key);
CREATE INDEX IF NOT EXISTS idx_fact_inventory_org_id ON public.fact_inventory(organization_id);
CREATE INDEX IF NOT EXISTS idx_fact_inventory_loc_id ON public.fact_inventory(location_id);

-- fact_invoices
CREATE INDEX IF NOT EXISTS idx_fact_invoices_invoice_date ON public.fact_invoices(invoice_date_key);
CREATE INDEX IF NOT EXISTS idx_fact_invoices_due_date ON public.fact_invoices(due_date_key);
CREATE INDEX IF NOT EXISTS idx_fact_invoices_vendor_key ON public.fact_invoices(vendor_key);
CREATE INDEX IF NOT EXISTS idx_fact_invoices_created_by ON public.fact_invoices(created_by_key);
CREATE INDEX IF NOT EXISTS idx_fact_invoices_org_id ON public.fact_invoices(organization_id);
CREATE INDEX IF NOT EXISTS idx_fact_invoices_loc_id ON public.fact_invoices(location_id);

-- fact_orders
CREATE INDEX IF NOT EXISTS idx_fact_orders_order_date ON public.fact_orders(order_date_key);
CREATE INDEX IF NOT EXISTS idx_fact_orders_delivery_date ON public.fact_orders(delivery_date_key);
CREATE INDEX IF NOT EXISTS idx_fact_orders_vendor_key ON public.fact_orders(vendor_key);
CREATE INDEX IF NOT EXISTS idx_fact_orders_created_by ON public.fact_orders(created_by_key);
CREATE INDEX IF NOT EXISTS idx_fact_orders_approved_by ON public.fact_orders(approved_by_key);
CREATE INDEX IF NOT EXISTS idx_fact_orders_org_id ON public.fact_orders(organization_id);

-- fact_payments
CREATE INDEX IF NOT EXISTS idx_fact_payments_payment_date ON public.fact_payments(payment_date_key);
CREATE INDEX IF NOT EXISTS idx_fact_payments_due_date ON public.fact_payments(due_date_key);
CREATE INDEX IF NOT EXISTS idx_fact_payments_vendor_key ON public.fact_payments(vendor_key);
CREATE INDEX IF NOT EXISTS idx_fact_payments_created_by ON public.fact_payments(created_by_key);
CREATE INDEX IF NOT EXISTS idx_fact_payments_org_id ON public.fact_payments(organization_id);

-- fact_wastage
CREATE INDEX IF NOT EXISTS idx_fact_wastage_wastage_date ON public.fact_wastage(wastage_date_key);
CREATE INDEX IF NOT EXISTS idx_fact_wastage_product_key ON public.fact_wastage(product_key);
CREATE INDEX IF NOT EXISTS idx_fact_wastage_org_id ON public.fact_wastage(organization_id);
CREATE INDEX IF NOT EXISTS idx_fact_wastage_loc_id ON public.fact_wastage(location_id);
CREATE INDEX IF NOT EXISTS idx_fact_wastage_logged_by ON public.fact_wastage(logged_by_key);

COMMIT;
