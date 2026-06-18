-- Migration 121: Make shared updated_at trigger safe on mixed schemas
--
-- Some live workflow inserts fail with:
--   record "new" has no field "updated_at"
-- That happens when the generic updated_at trigger function is attached to an
-- object that does not expose an updated_at column. Keep the trigger behavior
-- for normal tables, but no-op safely for tables without that column.

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF to_jsonb(NEW) ? 'updated_at' THEN
    NEW := jsonb_populate_record(NEW, jsonb_build_object('updated_at', now()));
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF to_jsonb(NEW) ? 'updated_at' THEN
    NEW := jsonb_populate_record(NEW, jsonb_build_object('updated_at', now()));
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_updated_at_metadata()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF to_jsonb(NEW) ? 'updated_at' THEN
    NEW := jsonb_populate_record(NEW, jsonb_build_object('updated_at', now()));
  END IF;

  RETURN NEW;
END;
$$;
