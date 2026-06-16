-- Migration 117: Fix fetch_user_access_tree RPC
-- Fixes an undefined column error (42703) after brands.id was renamed to brands.brand_id in migration 114.

BEGIN;

CREATE OR REPLACE FUNCTION public.fetch_user_access_tree()
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_agg(
    jsonb_build_object(
      'organization', row_to_json(o.*),
      'role', om.role,
      'brands', (
        SELECT jsonb_agg(
          jsonb_build_object(
            'brand', row_to_json(b.*),
            'role', bm.role,
            'locations', (
              SELECT jsonb_agg(
                jsonb_build_object(
                  'location', row_to_json(l.*),
                  'role', lm.role
                )
              )
              FROM public.location_members lm
              JOIN public.locations l ON l.id = lm.location_id
              WHERE lm.user_id = auth.uid() AND l.brand_id = b.brand_id
            )
          )
        )
        FROM public.brand_members bm
        JOIN public.brands b ON b.brand_id = bm.brand_id
        WHERE bm.user_id = auth.uid() AND b.organization_id = o.id
      )
    )
  )
  FROM public.organization_members om
  JOIN public.organizations o ON o.id = om.organization_id
  WHERE om.user_id = auth.uid();
$$;

-- Force PostgREST to reload the schema cache so the frontend can immediately use the updated RPC
NOTIFY pgrst, 'reload schema';

COMMIT;
