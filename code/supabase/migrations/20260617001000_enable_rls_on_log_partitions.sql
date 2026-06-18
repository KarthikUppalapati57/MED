-- Migration 129: Enable RLS on audit and error log partitions
--
-- Supabase advisor flags child partitions when RLS is disabled even if the
-- partitioned parent table has policies. These policies protect direct access
-- to the physical partitions while preserving normal authenticated logging.

BEGIN;

ALTER TABLE public.audit_logs_default ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs_y2025 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs_y2026 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.error_logs_default ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.error_logs_y2025 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.error_logs_y2026 ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Platform admins can view audit log partition" ON public.audit_logs_default;
DROP POLICY IF EXISTS "Platform admins can view audit log partition" ON public.audit_logs_y2025;
DROP POLICY IF EXISTS "Platform admins can view audit log partition" ON public.audit_logs_y2026;
DROP POLICY IF EXISTS "Authenticated users can insert audit log partition" ON public.audit_logs_default;
DROP POLICY IF EXISTS "Authenticated users can insert audit log partition" ON public.audit_logs_y2025;
DROP POLICY IF EXISTS "Authenticated users can insert audit log partition" ON public.audit_logs_y2026;

CREATE POLICY "Platform admins can view audit log partition"
  ON public.audit_logs_default
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'platform_admin'
    )
  );

CREATE POLICY "Platform admins can view audit log partition"
  ON public.audit_logs_y2025
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'platform_admin'
    )
  );

CREATE POLICY "Platform admins can view audit log partition"
  ON public.audit_logs_y2026
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'platform_admin'
    )
  );

CREATE POLICY "Authenticated users can insert audit log partition"
  ON public.audit_logs_default
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert audit log partition"
  ON public.audit_logs_y2025
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert audit log partition"
  ON public.audit_logs_y2026
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Platform admins can view error log partition" ON public.error_logs_default;
DROP POLICY IF EXISTS "Platform admins can view error log partition" ON public.error_logs_y2025;
DROP POLICY IF EXISTS "Platform admins can view error log partition" ON public.error_logs_y2026;
DROP POLICY IF EXISTS "Authenticated users can insert error log partition" ON public.error_logs_default;
DROP POLICY IF EXISTS "Authenticated users can insert error log partition" ON public.error_logs_y2025;
DROP POLICY IF EXISTS "Authenticated users can insert error log partition" ON public.error_logs_y2026;

CREATE POLICY "Platform admins can view error log partition"
  ON public.error_logs_default
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'platform_admin'
    )
  );

CREATE POLICY "Platform admins can view error log partition"
  ON public.error_logs_y2025
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'platform_admin'
    )
  );

CREATE POLICY "Platform admins can view error log partition"
  ON public.error_logs_y2026
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'platform_admin'
    )
  );

CREATE POLICY "Authenticated users can insert error log partition"
  ON public.error_logs_default
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert error log partition"
  ON public.error_logs_y2025
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert error log partition"
  ON public.error_logs_y2026
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

COMMIT;
