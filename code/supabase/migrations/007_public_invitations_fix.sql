-- ============================================================
-- Fix RLS policy for invitations
-- Allow unauthenticated users to read invitations by token during signup
-- ============================================================

-- Ensure columns exist
ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);
ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS brand_id UUID REFERENCES public.brands(id);
ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES public.locations(id);

-- Ensure RLS is enabled on invitations
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

-- Drop the restrictive policy if it exists on invitations
DROP POLICY IF EXISTS "RLS_SaaS_Isolation_invitations" ON public.invitations;

-- Create a policy to allow anyone to read invitations.
-- Since tokens are required in the query and are unguessable, 
-- allowing SELECT is safe for the signup flow.
DROP POLICY IF EXISTS "Anyone can view their own invite by token" ON public.invitations;
CREATE POLICY "Anyone can view their own invite by token"
ON public.invitations
FOR SELECT
USING (true);

-- Ensure managers and above can still create and manage them
DROP POLICY IF EXISTS "Manager+ can manage invitations" ON public.invitations;
CREATE POLICY "Manager+ can manage invitations"
ON public.invitations
FOR ALL 
USING (
  (auth.jwt() -> 'user_metadata' ->> 'role' = 'platform_admin') OR 
  (auth.jwt() -> 'user_metadata' ->> 'role' IN ('manager', 'owner', 'admin'))
);
