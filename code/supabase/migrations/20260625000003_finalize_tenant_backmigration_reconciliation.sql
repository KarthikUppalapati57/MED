BEGIN;

CREATE OR REPLACE FUNCTION public.enforce_invoice_line_item_total()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.total_price := COALESCE(NEW.quantity, 0) * COALESCE(NEW.unit_price, 0);
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_invoice_line_item_total() IS
  'Maintains invoice_line_items.total_price from quantity and unit_price. Legacy tenant schemas are read-only during back-migration.';

CREATE OR REPLACE FUNCTION public.audit_tenant_schema_backmigration()
RETURNS TABLE (
  organization_id UUID,
  schema_name TEXT,
  table_name TEXT,
  tenant_rows BIGINT,
  public_rows_for_org BIGINT,
  missing_by_id BIGINT,
  compare_mode TEXT,
  sample_missing_ids UUID[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  registry_record RECORD;
  table_record RECORD;
  tenant_count BIGINT;
  public_count BIGINT;
  missing_count BIGINT;
  missing_ids UUID[];
  tenant_has_id BOOLEAN;
  public_has_id BOOLEAN;
  public_has_org BOOLEAN;
  tenant_table_regclass REGCLASS;
  public_table_regclass REGCLASS;
BEGIN
  FOR registry_record IN
    SELECT tr.organization_id, tr.schema_name
    FROM public.tenant_registry tr
    WHERE tr.schema_name IS NOT NULL
      AND tr.schema_name ~ '^tenant_[a-z0-9_]+$'
      AND to_regnamespace(tr.schema_name) IS NOT NULL
    ORDER BY tr.schema_name
  LOOP
    FOR table_record IN
      SELECT ttt.table_name
      FROM public.tenant_template_tables ttt
      ORDER BY ttt.copy_order, ttt.table_name
    LOOP
      tenant_table_regclass := to_regclass(format('%I.%I', registry_record.schema_name, table_record.table_name));
      public_table_regclass := to_regclass(format('public.%I', table_record.table_name));

      IF tenant_table_regclass IS NULL OR public_table_regclass IS NULL THEN
        CONTINUE;
      END IF;

      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns c
        WHERE c.table_schema = registry_record.schema_name
          AND c.table_name = table_record.table_name
          AND c.column_name = 'id'
      )
      INTO tenant_has_id;

      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns c
        WHERE c.table_schema = 'public'
          AND c.table_name = table_record.table_name
          AND c.column_name = 'id'
      )
      INTO public_has_id;

      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns c
        WHERE c.table_schema = 'public'
          AND c.table_name = table_record.table_name
          AND c.column_name = 'organization_id'
      )
      INTO public_has_org;

      EXECUTE format('SELECT count(*) FROM %I.%I', registry_record.schema_name, table_record.table_name)
        INTO tenant_count;

      IF public_has_org THEN
        EXECUTE format('SELECT count(*) FROM public.%I WHERE organization_id = $1', table_record.table_name)
          INTO public_count
          USING registry_record.organization_id;
      ELSE
        EXECUTE format('SELECT count(*) FROM public.%I', table_record.table_name)
          INTO public_count;
      END IF;

      missing_count := NULL;
      missing_ids := ARRAY[]::UUID[];

      IF tenant_has_id AND public_has_id AND public_has_org AND table_record.table_name = 'products' THEN
        EXECUTE format(
          'SELECT count(*)
             FROM %I.products t
            WHERE NOT EXISTS (
              SELECT 1
                FROM public.products p
               WHERE p.id = t.id
                 AND p.organization_id = $1
            )
              AND NOT EXISTS (
                SELECT 1
                  FROM public.products p
                 WHERE p.organization_id = $1
                   AND lower(p.name) = lower(t.name)
              )',
          registry_record.schema_name
        )
        INTO missing_count
        USING registry_record.organization_id;

        EXECUTE format(
          'SELECT COALESCE(array_agg(id), ARRAY[]::UUID[])
             FROM (
               SELECT t.id
                 FROM %I.products t
                WHERE NOT EXISTS (
                  SELECT 1
                    FROM public.products p
                   WHERE p.id = t.id
                     AND p.organization_id = $1
                )
                  AND NOT EXISTS (
                    SELECT 1
                      FROM public.products p
                     WHERE p.organization_id = $1
                       AND lower(p.name) = lower(t.name)
                  )
                ORDER BY t.id
                LIMIT 10
             ) missing',
          registry_record.schema_name
        )
        INTO missing_ids
        USING registry_record.organization_id;
      ELSIF tenant_has_id AND public_has_id AND public_has_org THEN
        EXECUTE format(
          'SELECT count(*)
             FROM %I.%I t
            WHERE NOT EXISTS (
              SELECT 1
                FROM public.%I p
               WHERE p.id = t.id
                 AND p.organization_id = $1
            )',
          registry_record.schema_name,
          table_record.table_name,
          table_record.table_name
        )
        INTO missing_count
        USING registry_record.organization_id;

        EXECUTE format(
          'SELECT COALESCE(array_agg(id), ARRAY[]::UUID[])
             FROM (
               SELECT t.id
                 FROM %I.%I t
                WHERE NOT EXISTS (
                  SELECT 1
                    FROM public.%I p
                   WHERE p.id = t.id
                     AND p.organization_id = $1
                )
                ORDER BY t.id
                LIMIT 10
             ) missing',
          registry_record.schema_name,
          table_record.table_name,
          table_record.table_name
        )
        INTO missing_ids
        USING registry_record.organization_id;
      ELSIF tenant_has_id AND public_has_id THEN
        EXECUTE format(
          'SELECT count(*)
             FROM %I.%I t
            WHERE NOT EXISTS (
              SELECT 1 FROM public.%I p WHERE p.id = t.id
            )',
          registry_record.schema_name,
          table_record.table_name,
          table_record.table_name
        )
        INTO missing_count;

        EXECUTE format(
          'SELECT COALESCE(array_agg(id), ARRAY[]::UUID[])
             FROM (
               SELECT t.id
                 FROM %I.%I t
                WHERE NOT EXISTS (
                  SELECT 1 FROM public.%I p WHERE p.id = t.id
                )
                ORDER BY t.id
                LIMIT 10
             ) missing',
          registry_record.schema_name,
          table_record.table_name,
          table_record.table_name
        )
        INTO missing_ids;
      END IF;

      organization_id := registry_record.organization_id;
      schema_name := registry_record.schema_name;
      table_name := table_record.table_name;
      tenant_rows := tenant_count;
      public_rows_for_org := public_count;
      missing_by_id := missing_count;
      compare_mode := CASE
        WHEN tenant_has_id AND public_has_id AND public_has_org AND table_record.table_name = 'products' THEN 'id_or_product_name'
        WHEN tenant_has_id AND public_has_id AND public_has_org THEN 'id_and_organization_id'
        WHEN tenant_has_id AND public_has_id THEN 'id_only'
        ELSE 'row_count_only'
      END;
      sample_missing_ids := missing_ids;

      RETURN NEXT;
    END LOOP;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.backfill_tenant_schema_missing_rows(
  p_schema_name TEXT DEFAULT NULL,
  p_apply BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
  organization_id UUID,
  schema_name TEXT,
  table_name TEXT,
  dry_run BOOLEAN,
  missing_rows BIGINT,
  inserted_rows BIGINT,
  copied_columns TEXT[],
  error_text TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  registry_record RECORD;
  table_record RECORD;
  tenant_table_regclass REGCLASS;
  public_table_regclass REGCLASS;
  public_has_org BOOLEAN;
  tenant_has_id BOOLEAN;
  public_has_id BOOLEAN;
  column_names TEXT[];
  insert_columns TEXT;
  select_columns TEXT;
  missing_count BIGINT;
  inserted_count BIGINT;
  conflict_clause TEXT;
BEGIN
  FOR registry_record IN
    SELECT tr.organization_id, tr.schema_name
    FROM public.tenant_registry tr
    WHERE tr.schema_name IS NOT NULL
      AND tr.schema_name ~ '^tenant_[a-z0-9_]+$'
      AND to_regnamespace(tr.schema_name) IS NOT NULL
      AND (p_schema_name IS NULL OR tr.schema_name = p_schema_name)
    ORDER BY tr.schema_name
  LOOP
    FOR table_record IN
      SELECT *
      FROM (
        VALUES
          (10, 'products'),
          (20, 'invoices'),
          (30, 'vendor_items'),
          (40, 'ledger_bills'),
          (50, 'invoice_line_items'),
          (60, 'inventory'),
          (70, 'inventory_movements')
      ) AS ordered_tables(copy_order, table_name)
      ORDER BY copy_order
    LOOP
      tenant_table_regclass := to_regclass(format('%I.%I', registry_record.schema_name, table_record.table_name));
      public_table_regclass := to_regclass(format('public.%I', table_record.table_name));

      organization_id := registry_record.organization_id;
      schema_name := registry_record.schema_name;
      table_name := table_record.table_name;
      dry_run := NOT p_apply;
      missing_rows := 0;
      inserted_rows := 0;
      copied_columns := ARRAY[]::TEXT[];
      error_text := NULL;

      IF tenant_table_regclass IS NULL OR public_table_regclass IS NULL THEN
        CONTINUE;
      END IF;

      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns c
        WHERE c.table_schema = registry_record.schema_name
          AND c.table_name = table_record.table_name
          AND c.column_name = 'id'
      )
      INTO tenant_has_id;

      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns c
        WHERE c.table_schema = 'public'
          AND c.table_name = table_record.table_name
          AND c.column_name = 'id'
      )
      INTO public_has_id;

      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns c
        WHERE c.table_schema = 'public'
          AND c.table_name = table_record.table_name
          AND c.column_name = 'organization_id'
      )
      INTO public_has_org;

      IF NOT tenant_has_id OR NOT public_has_id OR NOT public_has_org THEN
        CONTINUE;
      END IF;

      IF table_record.table_name = 'products' THEN
        EXECUTE format(
          'SELECT count(*)
             FROM %I.products t
            WHERE NOT EXISTS (
              SELECT 1
                FROM public.products p
               WHERE p.id = t.id
                 AND p.organization_id = $1
            )
              AND NOT EXISTS (
                SELECT 1
                  FROM public.products p
                 WHERE p.organization_id = $1
                   AND lower(p.name) = lower(t.name)
              )',
          registry_record.schema_name
        )
        INTO missing_count
        USING registry_record.organization_id;
      ELSE
        EXECUTE format(
          'SELECT count(*)
             FROM %I.%I t
            WHERE NOT EXISTS (
              SELECT 1
                FROM public.%I p
               WHERE p.id = t.id
                 AND p.organization_id = $1
            )',
          registry_record.schema_name,
          table_record.table_name,
          table_record.table_name
        )
        INTO missing_count
        USING registry_record.organization_id;
      END IF;

      missing_rows := missing_count;

      IF missing_count = 0 THEN
        RETURN NEXT;
        CONTINUE;
      END IF;

      SELECT
        array_agg(pub.column_name ORDER BY pub.ordinal_position),
        string_agg(format('%I', pub.column_name), ', ' ORDER BY pub.ordinal_position),
        string_agg(
          CASE
            WHEN pub.column_name = 'organization_id' THEN '$1::uuid'
            WHEN table_record.table_name = 'invoice_line_items' AND pub.column_name = 'internal_product_id' THEN format(
              '(SELECT p.id FROM public.products p JOIN %I.products tp ON tp.id = t.internal_product_id WHERE p.organization_id = $1 AND lower(p.name) = lower(tp.name) LIMIT 1)',
              registry_record.schema_name
            )
            ELSE format('t.%I', pub.column_name)
          END,
          ', '
          ORDER BY pub.ordinal_position
        )
      INTO column_names, insert_columns, select_columns
      FROM information_schema.columns pub
      JOIN information_schema.columns tenant
        ON tenant.table_schema = registry_record.schema_name
       AND tenant.table_name = pub.table_name
       AND tenant.column_name = pub.column_name
      WHERE pub.table_schema = 'public'
        AND pub.table_name = table_record.table_name
        AND COALESCE(pub.is_generated, 'NEVER') = 'NEVER'
        AND COALESCE(pub.identity_generation, '') <> 'ALWAYS';

      copied_columns := COALESCE(column_names, ARRAY[]::TEXT[]);

      IF insert_columns IS NULL OR select_columns IS NULL THEN
        error_text := 'No common insertable columns found between tenant and public table.';
        RETURN NEXT;
        CONTINUE;
      END IF;

      conflict_clause := CASE
        WHEN table_record.table_name = 'products' THEN ' ON CONFLICT ON CONSTRAINT products_org_name_key DO NOTHING'
        ELSE ''
      END;

      IF p_apply THEN
        BEGIN
          EXECUTE format(
            'INSERT INTO public.%I (%s)
             SELECT %s
               FROM %I.%I t
              WHERE NOT EXISTS (
                SELECT 1
                  FROM public.%I p
                 WHERE p.id = t.id
                   AND p.organization_id = $1
              )%s',
            table_record.table_name,
            insert_columns,
            select_columns,
            registry_record.schema_name,
            table_record.table_name,
            table_record.table_name,
            conflict_clause
          )
          USING registry_record.organization_id;

          GET DIAGNOSTICS inserted_count = ROW_COUNT;
          inserted_rows := inserted_count;
        EXCEPTION
          WHEN OTHERS THEN
            inserted_rows := 0;
            error_text := SQLERRM;
        END;
      END IF;

      RETURN NEXT;
    END LOOP;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.audit_tenant_schema_backmigration() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.audit_tenant_schema_backmigration() FROM anon;
REVOKE ALL ON FUNCTION public.audit_tenant_schema_backmigration() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.audit_tenant_schema_backmigration() TO service_role;

REVOKE ALL ON FUNCTION public.backfill_tenant_schema_missing_rows(TEXT, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.backfill_tenant_schema_missing_rows(TEXT, BOOLEAN) FROM anon;
REVOKE ALL ON FUNCTION public.backfill_tenant_schema_missing_rows(TEXT, BOOLEAN) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.backfill_tenant_schema_missing_rows(TEXT, BOOLEAN) TO service_role;

COMMIT;
