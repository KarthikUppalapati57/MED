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

CREATE POLICY "Platform admins can view all audit logs" ON audit_logs
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role = 'platform_admin'
        )
    );

CREATE POLICY "System can insert audit logs" ON audit_logs
    FOR INSERT
    WITH CHECK (true); -- Usually restricted to service role or authenticated users
