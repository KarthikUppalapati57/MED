-- Count sheet workflow fields used by the inventory setup UI.

ALTER TABLE public.count_sheets
  ADD COLUMN IF NOT EXISTS brand_id uuid,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS organize_by text DEFAULT 'auto_category',
  ADD COLUMN IF NOT EXISTS auto_add_product_groups text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS last_count_date date,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_count_sheets_org_location_status
  ON public.count_sheets (organization_id, location_id, status);
