-- 011_fix_onboarding_rls.sql
-- This migration adds necessary INSERT policies for the onboarding process.
-- When a new user completes onboarding, they need to create an organization, 
-- a brand, and a location before their JWT metadata is updated.

-- 1. Allow authenticated users to create their own organization
CREATE POLICY "Users can create their own organization"
ON public.organizations
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = owner_id);

-- 2. Allow organization owners to create brands (even if organization_id is not in their JWT yet)
CREATE POLICY "Owners can create brands for their organizations"
ON public.brands
FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.organizations
        WHERE organizations.id = organization_id
        AND organizations.owner_id = auth.uid()
    )
);

-- 3. Allow organization owners to create locations (even if organization_id is not in their JWT yet)
CREATE POLICY "Owners can create locations for their organizations"
ON public.locations
FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.organizations
        WHERE organizations.id = organization_id
        AND organizations.owner_id = auth.uid()
    )
);

-- 4. Ensure organization owners can see their own organizations (even if organization_id is not in their JWT yet)
-- This supplements the existing JWT-based SELECT policies.
CREATE POLICY "Owners can view their own organizations"
ON public.organizations
FOR SELECT
TO authenticated
USING (auth.uid() = owner_id);
