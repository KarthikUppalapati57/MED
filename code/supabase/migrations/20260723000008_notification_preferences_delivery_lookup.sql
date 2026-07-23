-- Allow same-organization notification delivery code to honor recipient preferences.
-- Exposes only the existing preference rows to authenticated users in the same org;
-- writes remain restricted to the preference owner by the original policies.

DROP POLICY IF EXISTS notification_delivery_preferences_select_same_org ON public.notification_delivery_preferences;
CREATE POLICY notification_delivery_preferences_select_same_org
ON public.notification_delivery_preferences
FOR SELECT
TO authenticated
USING (
  organization_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.organization_id = notification_delivery_preferences.organization_id
  )
);
