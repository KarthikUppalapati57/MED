-- 070: Labor shift compatibility aliases
-- Some reporting RPCs reference start_time/end_time while the table stores shift_start/shift_end.

BEGIN;

ALTER TABLE public.employee_shifts
  ADD COLUMN IF NOT EXISTS start_time TIMESTAMPTZ GENERATED ALWAYS AS (shift_start) STORED,
  ADD COLUMN IF NOT EXISTS end_time TIMESTAMPTZ GENERATED ALWAYS AS (shift_end) STORED;

CREATE INDEX IF NOT EXISTS idx_employee_shifts_start_time ON public.employee_shifts(start_time);

COMMIT;
