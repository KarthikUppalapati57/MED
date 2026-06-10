-- Add Stripe billing fields to organizations table
ALTER TABLE organizations 
ADD COLUMN IF NOT EXISTS stripe_customer_id text,
ADD COLUMN IF NOT EXISTS stripe_subscription_id text,
ADD COLUMN IF NOT EXISTS plan_id text,
ADD COLUMN IF NOT EXISTS subscription_status text;

-- Create an index for faster lookups during webhooks
CREATE INDEX IF NOT EXISTS idx_org_stripe_customer_id ON organizations(stripe_customer_id);

-- Add missing fields to audit_logs so the frontend tracking works correctly
ALTER TABLE audit_logs 
ADD COLUMN IF NOT EXISTS entity_type text,
ADD COLUMN IF NOT EXISTS entity_id uuid,
ADD COLUMN IF NOT EXISTS module text,
ADD COLUMN IF NOT EXISTS org_id uuid,
ADD COLUMN IF NOT EXISTS field_changed text,
ADD COLUMN IF NOT EXISTS old_value text,
ADD COLUMN IF NOT EXISTS new_value text,
ADD COLUMN IF NOT EXISTS user_email text,
ADD COLUMN IF NOT EXISTS details jsonb;

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
