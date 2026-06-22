-- Restops360 Master Demo Seed Script

BEGIN;

-- Insert a demo organization
INSERT INTO public.organizations (id, name, timezone, plan_id)
VALUES ('10000000-0000-0000-0000-000000000001', 'Demo Restaurant Group', 'America/New_York', 'enterprise_annual')
ON CONFLICT DO NOTHING;

-- Insert a demo location
INSERT INTO public.locations (id, organization_id, name, type)
VALUES ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Downtown Flagship', 'restaurant')
ON CONFLICT DO NOTHING;

-- Insert global items (ingredients)
INSERT INTO public.global_items (id, organization_id, name, category, standard_uom, base_cost)
VALUES 
('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Chicken Breast (Raw)', 'Proteins', 'lb', 3.50),
('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'Romaine Lettuce', 'Produce', 'head', 1.20),
('30000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'Tomatoes', 'Produce', 'lb', 0.80),
('30000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', 'Cheddar Cheese', 'Dairy', 'lb', 4.10)
ON CONFLICT DO NOTHING;

-- Insert Vendors
INSERT INTO public.vendors (id, organization_id, name, email, phone)
VALUES
('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Sysco Foods', 'orders@sysco.demo', '555-0100'),
('40000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'US Foods', 'orders@usfoods.demo', '555-0200')
ON CONFLICT DO NOTHING;

-- Insert Customers for CRM
INSERT INTO public.customers (id, organization_id, first_name, last_name, email, phone_number, total_spent)
VALUES
('50000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'John', 'Doe', 'john@demo.com', '555-1234', 450.00),
('50000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'Jane', 'Smith', 'jane@demo.com', '555-5678', 1200.00)
ON CONFLICT DO NOTHING;

-- Loyalty Memberships
INSERT INTO public.loyalty_memberships (id, organization_id, customer_id, points_balance, tier)
VALUES
('60000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 450, 'silver'),
('60000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000002', 1200, 'gold')
ON CONFLICT DO NOTHING;

COMMIT;
