-- 20260717000001_inventory_count_session_persistence.sql was meant to widen
-- count_sessions_status_check to allow 'saved'/'closed' (the values
-- save_inventory_count_session/close_inventory_count_session actually write),
-- but it never took effect on production -- the live constraint was still the
-- original 4-value one from 051_inventory_count_sheets.sql, so every "Save
-- inventory count" failed with "violates check constraint
-- count_sessions_status_check". Re-applying idempotently here so a fresh
-- replay (or any environment that also missed the earlier migration) gets it.

ALTER TABLE public.count_sessions DROP CONSTRAINT IF EXISTS count_sessions_status_check;

ALTER TABLE public.count_sessions
  ADD CONSTRAINT count_sessions_status_check
  CHECK (status IN ('in_progress', 'review', 'completed', 'cancelled', 'saved', 'closed'));
