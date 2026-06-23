-- MEVS Platform Performance Audit: Phase 3 Database Indexes
-- Adding composite B-Tree indexes for frequently queried and filtered columns across the heaviest tables.

-- Invoices Indexes
CREATE INDEX IF NOT EXISTS idx_invoices_organization_status ON public.invoices (organization_id, status);
CREATE INDEX IF NOT EXISTS idx_invoices_organization_payment_status ON public.invoices (organization_id, payment_status);
CREATE INDEX IF NOT EXISTS idx_invoices_vendor_id ON public.invoices (vendor_id);
CREATE INDEX IF NOT EXISTS idx_invoices_created_at ON public.invoices (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON public.invoices (due_date DESC);

-- Payments Indexes
CREATE INDEX IF NOT EXISTS idx_payments_organization_status ON public.payments (organization_id, status);
CREATE INDEX IF NOT EXISTS idx_payments_invoice_id ON public.payments (invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_created_at ON public.payments (created_at DESC);

-- Audit and Event Logs (High Volume)
CREATE INDEX IF NOT EXISTS idx_event_logs_org_event_name ON public.event_logs (organization_id, event_name);
CREATE INDEX IF NOT EXISTS idx_event_logs_created_at ON public.event_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_org_action ON public.audit_logs (organization_id, action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs (created_at DESC);

-- Realtime Webhooks
CREATE INDEX IF NOT EXISTS idx_webhook_events_queue_status ON public.webhook_events_queue (status);

-- Organizations and Users
CREATE INDEX IF NOT EXISTS idx_profiles_organization_id ON public.profiles (organization_id);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles (role);

-- Inventory (Large Scans)
CREATE INDEX IF NOT EXISTS idx_inventory_org_location ON public.inventory (organization_id, location_id);
CREATE INDEX IF NOT EXISTS idx_inventory_product_id ON public.inventory (product_id);
