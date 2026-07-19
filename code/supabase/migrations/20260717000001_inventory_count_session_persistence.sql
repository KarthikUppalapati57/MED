-- Persist saved/closed inventory count sessions for Stock Counts.

ALTER TABLE public.count_sessions
  ADD COLUMN IF NOT EXISTS location_id uuid,
  ADD COLUMN IF NOT EXISTS brand_id uuid,
  ADD COLUMN IF NOT EXISTS scope_key text DEFAULT 'all',
  ADD COLUMN IF NOT EXISTS type text DEFAULT 'Inventory',
  ADD COLUMN IF NOT EXISTS count_date date DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS items jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS total_value numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS item_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS saved_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS notes text;

DO $$
DECLARE
  v_constraint text;
BEGIN
  FOR v_constraint IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.count_sessions'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE public.count_sessions DROP CONSTRAINT IF EXISTS %I', v_constraint);
  END LOOP;
END $$;

ALTER TABLE public.count_sessions
  ADD CONSTRAINT count_sessions_status_check
  CHECK (status IN ('in_progress', 'review', 'completed', 'cancelled', 'saved', 'closed'));

CREATE INDEX IF NOT EXISTS idx_count_sessions_org_location_date
  ON public.count_sessions (organization_id, location_id, count_date DESC);

DROP FUNCTION IF EXISTS public.save_inventory_count_session(uuid, uuid, uuid, text, text, date, jsonb, uuid, uuid);

CREATE OR REPLACE FUNCTION public.save_inventory_count_session(
  p_organization_id uuid,
  p_location_id uuid DEFAULT NULL,
  p_brand_id uuid DEFAULT NULL,
  p_count_sheet_id uuid DEFAULT NULL,
  p_scope_key text DEFAULT 'all',
  p_type text DEFAULT 'Inventory',
  p_count_date date DEFAULT CURRENT_DATE,
  p_items jsonb DEFAULT '[]'::jsonb,
  p_user_id uuid DEFAULT NULL,
  p_session_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_row public.count_sessions;
  v_items jsonb := COALESCE(p_items, '[]'::jsonb);
  v_total numeric := 0;
  v_item_count integer := 0;
BEGIN
  SELECT
    COALESCE(SUM(COALESCE((item->>'value')::numeric, 0)), 0),
    COUNT(*)
  INTO v_total, v_item_count
  FROM jsonb_array_elements(v_items) AS item;

  IF p_session_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.count_sessions
    WHERE id = p_session_id
      AND organization_id = p_organization_id
      AND deleted_at IS NULL
      AND status <> 'closed'
  ) THEN
    UPDATE public.count_sessions
    SET
      location_id = p_location_id,
      brand_id = p_brand_id,
      count_sheet_id = p_count_sheet_id,
      scope_key = COALESCE(NULLIF(p_scope_key, ''), 'all'),
      type = COALESCE(NULLIF(p_type, ''), 'Inventory'),
      count_date = COALESCE(p_count_date, CURRENT_DATE),
      items = v_items,
      counted_data = v_items,
      total_value = v_total,
      item_count = v_item_count,
      status = 'saved',
      saved_at = COALESCE(saved_at, now()),
      updated_at = now(),
      counted_by = COALESCE(p_user_id, counted_by),
      created_by = COALESCE(created_by, p_user_id)
    WHERE id = p_session_id
      AND organization_id = p_organization_id
    RETURNING * INTO v_row;
  ELSE
    INSERT INTO public.count_sessions (
      organization_id,
      location_id,
      brand_id,
      count_sheet_id,
      scope_key,
      type,
      count_date,
      items,
      counted_data,
      total_value,
      item_count,
      status,
      saved_at,
      updated_at,
      counted_by,
      created_by
    )
    VALUES (
      p_organization_id,
      p_location_id,
      p_brand_id,
      p_count_sheet_id,
      COALESCE(NULLIF(p_scope_key, ''), 'all'),
      COALESCE(NULLIF(p_type, ''), 'Inventory'),
      COALESCE(p_count_date, CURRENT_DATE),
      v_items,
      v_items,
      v_total,
      v_item_count,
      'saved',
      now(),
      now(),
      p_user_id,
      p_user_id
    )
    RETURNING * INTO v_row;
  END IF;

  RETURN to_jsonb(v_row);
END;
$function$;

CREATE OR REPLACE FUNCTION public.close_inventory_count_session(
  p_organization_id uuid,
  p_session_id uuid,
  p_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_row public.count_sessions;
BEGIN
  UPDATE public.count_sessions
  SET
    status = 'closed',
    completed_at = COALESCE(completed_at, now()),
    closed_at = COALESCE(closed_at, now()),
    updated_at = now(),
    counted_by = COALESCE(counted_by, p_user_id)
  WHERE id = p_session_id
    AND organization_id = p_organization_id
    AND deleted_at IS NULL
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Inventory count session not found';
  END IF;

  RETURN to_jsonb(v_row);
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_inventory_count_session(
  p_organization_id uuid,
  p_session_id uuid,
  p_user_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.count_sessions
  SET deleted_at = now(), updated_at = now()
  WHERE id = p_session_id
    AND organization_id = p_organization_id
    AND deleted_at IS NULL;

  RETURN FOUND;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.save_inventory_count_session(uuid, uuid, uuid, uuid, text, text, date, jsonb, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_inventory_count_session(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_inventory_count_session(uuid, uuid, uuid) TO authenticated;
