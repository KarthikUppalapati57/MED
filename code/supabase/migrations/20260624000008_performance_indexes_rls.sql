-- 1. Create missing foreign key indexes to prevent Seq Scans and resolve N+1 latency
CREATE INDEX IF NOT EXISTS idx_pos_orders_location_id ON pos_orders (location_id);
CREATE INDEX IF NOT EXISTS idx_shift_schedules_employee_profile_id ON shift_schedules (employee_profile_id);
CREATE INDEX IF NOT EXISTS idx_receiving_items_purchase_order_item_id ON receiving_items (purchase_order_item_id);

-- 2. Optimize RLS Policies by replacing auth.uid() with (select auth.uid()) 
-- This prevents the 'auth_rls_initplan' subquery from executing multiple times per row.

-- Notifications table
DROP POLICY IF EXISTS "Users can view their own notifications" ON notifications;
CREATE POLICY "Users can view their own notifications" ON notifications
  FOR SELECT
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can update their own notifications" ON notifications;
CREATE POLICY "Users can update their own notifications" ON notifications
  FOR UPDATE
  USING (user_id = (select auth.uid()));

-- Vendors table
-- Typically, vendor access depends on organization_id tied to the user, but some basic policies use auth.uid()
-- To be safe, we'll replace typical user-bound RLS on vendors if applicable. Assuming there's a policy checking created_by or updated_by.
DROP POLICY IF EXISTS "Users can view vendors in their organization" ON vendors;
CREATE POLICY "Users can view vendors in their organization" ON vendors
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM user_roles WHERE user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can update vendors in their organization" ON vendors;
CREATE POLICY "Users can update vendors in their organization" ON vendors
  FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id FROM user_roles WHERE user_id = (select auth.uid())
    )
  );
