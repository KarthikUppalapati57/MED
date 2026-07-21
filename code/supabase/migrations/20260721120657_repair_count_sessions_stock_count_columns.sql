BEGIN;

-- Repair production schemas where the stock count persistence migration was
-- marked applied before these columns existed.
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

CREATE INDEX IF NOT EXISTS idx_count_sessions_org_location_date
  ON public.count_sessions (organization_id, location_id, count_date DESC);

NOTIFY pgrst, 'reload schema';

COMMIT;
