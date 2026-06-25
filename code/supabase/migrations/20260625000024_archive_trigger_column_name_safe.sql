BEGIN;

CREATE OR REPLACE FUNCTION public.archive_record_on_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_archive_table TEXT := 'archived_' || TG_TABLE_NAME;
  v_columns TEXT;
  v_values TEXT;
BEGIN
  SELECT
    string_agg(format('%I', archive_columns.column_name), ', ' ORDER BY archive_columns.ordinal_position),
    string_agg(format('($1).%I', archive_columns.column_name), ', ' ORDER BY archive_columns.ordinal_position)
    INTO v_columns, v_values
  FROM information_schema.columns archive_columns
  JOIN information_schema.columns source_columns
    ON source_columns.table_schema = TG_TABLE_SCHEMA
   AND source_columns.table_name = TG_TABLE_NAME
   AND source_columns.column_name = archive_columns.column_name
  WHERE archive_columns.table_schema = TG_TABLE_SCHEMA
    AND archive_columns.table_name = v_archive_table
    AND archive_columns.column_name NOT IN ('archived_at', 'archived_by');

  IF v_columns IS NULL THEN
    RETURN OLD;
  END IF;

  EXECUTE format(
    'INSERT INTO %I.%I (%s, archived_at, archived_by) VALUES (%s, now(), auth.uid())',
    TG_TABLE_SCHEMA,
    v_archive_table,
    v_columns,
    v_values
  )
  USING OLD;

  RETURN OLD;
END;
$$;

COMMENT ON FUNCTION public.archive_record_on_delete() IS
  'Archives deleted rows by matching shared source/archive column names instead of relying on brittle column order.';

COMMIT;
