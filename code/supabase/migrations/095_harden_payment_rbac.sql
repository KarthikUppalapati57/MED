-- 095: Harden payment RBAC
-- Replaces broad tenant-wide payment writes with role-aware payment policies.

BEGIN;

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "RLS_SaaS_Isolation_payments" ON public.payments;
DROP POLICY IF EXISTS "All users can view payments" ON public.payments;
DROP POLICY IF EXISTS "Users can view payments" ON public.payments;
DROP POLICY IF EXISTS "Manager+ can manage payments" ON public.payments;
DROP POLICY IF EXISTS "Manager+ can update payments" ON public.payments;
DROP POLICY IF EXISTS "Admin can delete payments" ON public.payments;
DROP POLICY IF EXISTS "Payments role-scoped select" ON public.payments;
DROP POLICY IF EXISTS "Payments role-scoped insert" ON public.payments;
DROP POLICY IF EXISTS "Payments role-scoped update" ON public.payments;
DROP POLICY IF EXISTS "Payments owner delete" ON public.payments;

CREATE POLICY "Payments role-scoped select"
  ON public.payments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (
          p.role = 'platform_admin'
          OR (
            p.organization_id = public.payments.organization_id
            AND p.role IN ('location_manager', 'manager', 'branch_manager', 'org_owner', 'owner', 'admin')
          )
        )
    )
  );

CREATE POLICY "Payments role-scoped insert"
  ON public.payments
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (
          p.role = 'platform_admin'
          OR (
            p.organization_id = public.payments.organization_id
            AND p.role IN ('location_manager', 'manager', 'branch_manager', 'org_owner', 'owner', 'admin')
          )
        )
    )
  );

CREATE POLICY "Payments role-scoped update"
  ON public.payments
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (
          p.role = 'platform_admin'
          OR (
            p.organization_id = public.payments.organization_id
            AND p.role IN ('location_manager', 'manager', 'branch_manager', 'org_owner', 'owner', 'admin')
          )
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (
          p.role = 'platform_admin'
          OR (
            p.organization_id = public.payments.organization_id
            AND p.role IN ('location_manager', 'manager', 'branch_manager', 'org_owner', 'owner', 'admin')
          )
        )
    )
  );

CREATE POLICY "Payments owner delete"
  ON public.payments
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (
          p.role = 'platform_admin'
          OR (
            p.organization_id = public.payments.organization_id
            AND p.role IN ('org_owner', 'owner', 'admin')
          )
        )
    )
  );

COMMIT;
