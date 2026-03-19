-- ============================================================
-- MEVS Platform - Supabase Database Schema
-- Run this in your Supabase SQL Editor:
-- https://gsupqfmwlsmwoybphimx.supabase.co
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 1. PROFILES (extends Supabase auth.users)
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  email TEXT,
  role TEXT NOT NULL DEFAULT 'ground_staff' CHECK (role IN ('ground_staff', 'manager', 'owner', 'admin')),
  avatar_url TEXT,
  phone TEXT,
  invited_by UUID REFERENCES auth.users(id),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Auto-create profile when a user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'role', 'ground_staff')
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- 2. INVITATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'ground_staff' CHECK (role IN ('ground_staff', 'manager', 'owner', 'admin')),
  token TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  invited_by UUID REFERENCES auth.users(id),
  accepted_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ DEFAULT (now() + interval '7 days'),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 3. VENDORS
-- ============================================================
CREATE TABLE IF NOT EXISTS vendors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  contact_name TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  zip_code TEXT,
  country TEXT DEFAULT 'USA',
  payment_terms TEXT DEFAULT 'net_30' CHECK (payment_terms IN ('net_15', 'net_30', 'net_45', 'net_60', 'due_on_receipt')),
  rating NUMERIC(3,2),
  total_orders INTEGER DEFAULT 0,
  total_spent NUMERIC(12,2) DEFAULT 0,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'blacklisted')),
  categories JSONB DEFAULT '[]'::jsonb,
  notes TEXT,
  whatsapp_number TEXT,
  bank_details JSONB DEFAULT '{}'::jsonb,
  latitude NUMERIC(10,7),
  longitude NUMERIC(10,7),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 4. PRODUCTS
-- ============================================================
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id TEXT UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  accounting_category TEXT DEFAULT 'food' CHECK (accounting_category IN ('food', 'beverage', 'supplies', 'equipment', 'packaging', 'cleaning', 'other')),
  is_inventoried BOOLEAN DEFAULT true,
  is_tax_exempt BOOLEAN DEFAULT false,
  report_by_unit TEXT,
  base_unit TEXT,
  latest_price NUMERIC(10,2),
  average_price NUMERIC(10,2),
  price_history JSONB DEFAULT '[]'::jsonb,
  preferred_vendor_id UUID REFERENCES vendors(id),
  par_level NUMERIC(10,2),
  reorder_point NUMERIC(10,2),
  location_specific BOOLEAN DEFAULT false,
  locations JSONB DEFAULT '[]'::jsonb,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'discontinued', 'seasonal')),
  created_from_invoice_id UUID,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 5. INVOICES
-- ============================================================
CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID REFERENCES vendors(id),
  vendor_name TEXT NOT NULL,
  invoice_number TEXT NOT NULL,
  invoice_date DATE,
  due_date DATE,
  payment_terms TEXT,
  total_amount NUMERIC(12,2) NOT NULL,
  subtotal NUMERIC(12,2),
  tax_amount NUMERIC(10,2),
  fuel_surcharge NUMERIC(10,2),
  delivery_fee NUMERIC(10,2),
  other_charges NUMERIC(10,2),
  currency TEXT DEFAULT 'USD',
  status TEXT DEFAULT 'pending_review' CHECK (status IN ('pending_review', 'validated', 'approved', 'paid', 'rejected', 'duplicate', 'flagged')),
  payment_status TEXT DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'partial', 'paid')),
  source TEXT DEFAULT 'manual_upload' CHECK (source IN ('manual_upload', 'email_import', 'vendor_portal')),
  file_url TEXT,
  line_items JSONB DEFAULT '[]'::jsonb,
  account_number TEXT,
  validation_results JSONB DEFAULT '{}'::jsonb,
  validation_notes TEXT,
  approved_by UUID REFERENCES auth.users(id),
  approved_date TIMESTAMPTZ,
  location TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 6. PAYMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID REFERENCES invoices(id),
  vendor_id UUID REFERENCES vendors(id),
  vendor_name TEXT,
  invoice_number TEXT,
  amount NUMERIC(12,2) NOT NULL,
  due_date DATE,
  payment_method TEXT DEFAULT 'bank_transfer' CHECK (payment_method IN ('stripe', 'paypal', 'bank_transfer', 'cheque', 'manual')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  transaction_id TEXT,
  payment_date DATE,
  notes TEXT,
  approved_by UUID REFERENCES auth.users(id),
  cheque_number TEXT,
  bank_reference TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 7. INVENTORY
-- ============================================================
CREATE TABLE IF NOT EXISTS inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id TEXT,
  product_name TEXT NOT NULL,
  category TEXT,
  accounting_category TEXT,
  location TEXT,
  current_quantity NUMERIC(10,2) DEFAULT 0,
  current_unit TEXT,
  current_value NUMERIC(12,2) DEFAULT 0,
  previous_quantity NUMERIC(10,2),
  previous_value NUMERIC(12,2),
  unit_cost NUMERIC(10,2),
  par_level NUMERIC(10,2),
  reorder_point NUMERIC(10,2),
  report_by TEXT,
  last_counted_date DATE,
  last_counted_by UUID REFERENCES auth.users(id),
  conversion_rates JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 8. WASTAGE LOGS
-- ============================================================
CREATE TABLE IF NOT EXISTS wastage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id TEXT,
  product_name TEXT NOT NULL,
  quantity NUMERIC(10,2) NOT NULL,
  unit TEXT,
  value NUMERIC(10,2),
  reason TEXT NOT NULL CHECK (reason IN ('expired', 'damaged', 'spoiled', 'overproduction', 'customer_return', 'other')),
  notes TEXT,
  location TEXT,
  logged_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 9. RECIPES
-- ============================================================
CREATE TABLE IF NOT EXISTS recipes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  category TEXT CHECK (category IN ('appetizer', 'main_course', 'dessert', 'beverage', 'side', 'sauce', 'other')),
  yield_quantity NUMERIC(10,2),
  yield_unit TEXT,
  prep_time_minutes INTEGER,
  cook_time_minutes INTEGER,
  ingredients JSONB DEFAULT '[]'::jsonb,
  labor_cost NUMERIC(10,2),
  labor_time_minutes INTEGER,
  labor_rate_per_hour NUMERIC(10,2),
  packaging_items JSONB DEFAULT '[]'::jsonb,
  total_ingredient_cost NUMERIC(10,2),
  total_packaging_cost NUMERIC(10,2),
  total_cost NUMERIC(10,2),
  cost_per_serving NUMERIC(10,2),
  suggested_price NUMERIC(10,2),
  instructions TEXT,
  image_url TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'seasonal')),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 10. AUTO ORDERS
-- ============================================================
CREATE TABLE IF NOT EXISTS auto_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number TEXT,
  vendor_id UUID REFERENCES vendors(id),
  vendor_name TEXT NOT NULL,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'pending_approval', 'approved', 'sent', 'received', 'cancelled')),
  items JSONB DEFAULT '[]'::jsonb,
  total_amount NUMERIC(12,2),
  external_suggestions JSONB DEFAULT '[]'::jsonb,
  notes TEXT,
  chat_history JSONB DEFAULT '[]'::jsonb,
  approved_by UUID REFERENCES auth.users(id),
  approved_date TIMESTAMPTZ,
  sent_via TEXT CHECK (sent_via IN ('email', 'whatsapp', 'both')),
  delivery_date DATE,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 11. NOTIFICATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT CHECK (type IN ('invoice', 'payment', 'order', 'inventory', 'system', 'alert')),
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  is_read BOOLEAN DEFAULT false,
  link TEXT,
  reference_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- AUTO-UPDATE updated_at TRIGGER
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all tables with updated_at
DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY['profiles', 'vendors', 'products', 'invoices', 'payments', 'inventory', 'recipes', 'auto_orders'])
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS set_updated_at ON %I', t);
    EXECUTE format('CREATE TRIGGER set_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()', t);
  END LOOP;
END;
$$;

-- ============================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE wastage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE auto_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Helper function to get current user's role
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS TEXT AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper: check if user is manager or above
CREATE OR REPLACE FUNCTION is_manager_or_above()
RETURNS BOOLEAN AS $$
  SELECT get_user_role() IN ('manager', 'owner', 'admin');
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper: check if user is owner or admin
CREATE OR REPLACE FUNCTION is_owner_or_admin()
RETURNS BOOLEAN AS $$
  SELECT get_user_role() IN ('owner', 'admin');
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper: check if user is admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
  SELECT get_user_role() = 'admin';
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ---- PROFILES ----
DROP POLICY IF EXISTS "Users can view all profiles" ON profiles;
CREATE POLICY "Users can view all profiles" ON profiles FOR SELECT USING (true);
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
DROP POLICY IF EXISTS "Owner/Admin can update any profile" ON profiles;
CREATE POLICY "Owner/Admin can update any profile" ON profiles FOR UPDATE USING (is_owner_or_admin());
DROP POLICY IF EXISTS "Owner/Admin can manage profiles" ON profiles;
CREATE POLICY "Owner/Admin can manage profiles" ON profiles FOR ALL USING (is_owner_or_admin());

-- ---- INVITATIONS ----
DROP POLICY IF EXISTS "Manager+ can view invitations" ON invitations;
CREATE POLICY "Manager+ can view invitations" ON invitations FOR SELECT USING (is_manager_or_above());
DROP POLICY IF EXISTS "Manager+ can create invitations" ON invitations;
CREATE POLICY "Manager+ can create invitations" ON invitations FOR INSERT WITH CHECK (is_manager_or_above());
DROP POLICY IF EXISTS "Anyone can view their own invite by token" ON invitations;
CREATE POLICY "Anyone can view their own invite by token" ON invitations FOR SELECT USING (true);

-- ---- VENDORS ----
DROP POLICY IF EXISTS "All users can view vendors" ON vendors;
CREATE POLICY "All users can view vendors" ON vendors FOR SELECT USING (true);
DROP POLICY IF EXISTS "Manager+ can manage vendors" ON vendors;
CREATE POLICY "Manager+ can manage vendors" ON vendors FOR INSERT WITH CHECK (is_manager_or_above());
DROP POLICY IF EXISTS "Manager+ can update vendors" ON vendors;
CREATE POLICY "Manager+ can update vendors" ON vendors FOR UPDATE USING (is_manager_or_above());
DROP POLICY IF EXISTS "Admin can delete vendors" ON vendors;
CREATE POLICY "Admin can delete vendors" ON vendors FOR DELETE USING (is_admin());

-- ---- PRODUCTS ----
DROP POLICY IF EXISTS "All users can view products" ON products;
CREATE POLICY "All users can view products" ON products FOR SELECT USING (true);
DROP POLICY IF EXISTS "All users can create products" ON products;
CREATE POLICY "All users can create products" ON products FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Manager+ can update products" ON products;
CREATE POLICY "Manager+ can update products" ON products FOR UPDATE USING (is_manager_or_above());
DROP POLICY IF EXISTS "Admin can delete products" ON products;
CREATE POLICY "Admin can delete products" ON products FOR DELETE USING (is_admin());

-- ---- INVOICES ----
DROP POLICY IF EXISTS "All users can view invoices" ON invoices;
CREATE POLICY "All users can view invoices" ON invoices FOR SELECT USING (true);
DROP POLICY IF EXISTS "All users can upload invoices" ON invoices;
CREATE POLICY "All users can upload invoices" ON invoices FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Manager+ can update invoices" ON invoices;
CREATE POLICY "Manager+ can update invoices" ON invoices FOR UPDATE USING (is_manager_or_above());
DROP POLICY IF EXISTS "Admin can delete invoices" ON invoices;
CREATE POLICY "Admin can delete invoices" ON invoices FOR DELETE USING (is_admin());

-- ---- PAYMENTS ----
DROP POLICY IF EXISTS "All users can view payments" ON payments;
CREATE POLICY "All users can view payments" ON payments FOR SELECT USING (true);
DROP POLICY IF EXISTS "Manager+ can manage payments" ON payments;
CREATE POLICY "Manager+ can manage payments" ON payments FOR INSERT WITH CHECK (is_manager_or_above());
DROP POLICY IF EXISTS "Manager+ can update payments" ON payments;
CREATE POLICY "Manager+ can update payments" ON payments FOR UPDATE USING (is_manager_or_above());
DROP POLICY IF EXISTS "Admin can delete payments" ON payments;
CREATE POLICY "Admin can delete payments" ON payments FOR DELETE USING (is_admin());

-- ---- INVENTORY ----
DROP POLICY IF EXISTS "All users can view inventory" ON inventory;
CREATE POLICY "All users can view inventory" ON inventory FOR SELECT USING (true);
DROP POLICY IF EXISTS "All users can create inventory" ON inventory;
CREATE POLICY "All users can create inventory" ON inventory FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Manager+ can update inventory" ON inventory;
CREATE POLICY "Manager+ can update inventory" ON inventory FOR UPDATE USING (is_manager_or_above());
DROP POLICY IF EXISTS "Admin can delete inventory" ON inventory;
CREATE POLICY "Admin can delete inventory" ON inventory FOR DELETE USING (is_admin());

-- ---- WASTAGE LOGS ----
DROP POLICY IF EXISTS "All users can view wastage logs" ON wastage_logs;
CREATE POLICY "All users can view wastage logs" ON wastage_logs FOR SELECT USING (true);
DROP POLICY IF EXISTS "All users can log waste" ON wastage_logs;
CREATE POLICY "All users can log waste" ON wastage_logs FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Admin can delete wastage logs" ON wastage_logs;
CREATE POLICY "Admin can delete wastage logs" ON wastage_logs FOR DELETE USING (is_admin());

-- ---- RECIPES ----
DROP POLICY IF EXISTS "All users can view recipes" ON recipes;
CREATE POLICY "All users can view recipes" ON recipes FOR SELECT USING (true);
DROP POLICY IF EXISTS "Manager+ can manage recipes" ON recipes;
CREATE POLICY "Manager+ can manage recipes" ON recipes FOR INSERT WITH CHECK (is_manager_or_above());
DROP POLICY IF EXISTS "Manager+ can update recipes" ON recipes;
CREATE POLICY "Manager+ can update recipes" ON recipes FOR UPDATE USING (is_manager_or_above());
DROP POLICY IF EXISTS "Admin can delete recipes" ON recipes;
CREATE POLICY "Admin can delete recipes" ON recipes FOR DELETE USING (is_admin());

-- ---- AUTO ORDERS ----
DROP POLICY IF EXISTS "All users can view auto orders" ON auto_orders;
CREATE POLICY "All users can view auto orders" ON auto_orders FOR SELECT USING (true);
DROP POLICY IF EXISTS "Manager+ can manage auto orders" ON auto_orders;
CREATE POLICY "Manager+ can manage auto orders" ON auto_orders FOR INSERT WITH CHECK (is_manager_or_above());
DROP POLICY IF EXISTS "Manager+ can update auto orders" ON auto_orders;
CREATE POLICY "Manager+ can update auto orders" ON auto_orders FOR UPDATE USING (is_manager_or_above());
DROP POLICY IF EXISTS "Admin can delete auto orders" ON auto_orders;
CREATE POLICY "Admin can delete auto orders" ON auto_orders FOR DELETE USING (is_admin());

-- ---- NOTIFICATIONS ----
DROP POLICY IF EXISTS "Users can view own notifications" ON notifications;
CREATE POLICY "Users can view own notifications" ON notifications FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "System can create notifications" ON notifications;
CREATE POLICY "System can create notifications" ON notifications FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Users can update own notifications" ON notifications;
CREATE POLICY "Users can update own notifications" ON notifications FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete own notifications" ON notifications;
CREATE POLICY "Users can delete own notifications" ON notifications FOR DELETE USING (auth.uid() = user_id);

-- ============================================================
-- SAFETY CHECKS: Ensure columns exist before indexing (Handles schema drift)
-- ============================================================
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending_review' CHECK (status IN ('pending_review', 'validated', 'approved', 'paid', 'rejected', 'duplicate', 'flagged'));
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'partial', 'paid'));
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS vendor_id UUID REFERENCES vendors(id);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS vendor_name TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS total_amount NUMERIC(12,2);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS invoice_number TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS due_date DATE;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS is_read BOOLEAN DEFAULT false;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'refunded'));
ALTER TABLE payments ADD COLUMN IF NOT EXISTS invoice_id UUID REFERENCES invoices(id);
ALTER TABLE auto_orders ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'ordered', 'received', 'cancelled'));
ALTER TABLE wastage_logs ADD COLUMN IF NOT EXISTS product_id TEXT;
ALTER TABLE wastage_logs ADD COLUMN IF NOT EXISTS product_name TEXT;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS product_id TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS product_id TEXT;

-- ============================================================
-- INDEXES for performance
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_payment_status ON invoices(payment_status);
CREATE INDEX IF NOT EXISTS idx_invoices_vendor_id ON invoices(vendor_id);
CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON invoices(due_date);
CREATE INDEX IF NOT EXISTS idx_payments_invoice_id ON payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_inventory_product_id ON inventory(product_id);
CREATE INDEX IF NOT EXISTS idx_products_product_id ON products(product_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_auto_orders_status ON auto_orders(status);
CREATE INDEX IF NOT EXISTS idx_wastage_logs_product_id ON wastage_logs(product_id);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);

-- ============================================================
-- DONE! All tables, RLS policies, and indexes created.
-- ============================================================
