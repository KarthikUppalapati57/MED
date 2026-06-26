BEGIN;

CREATE OR REPLACE FUNCTION public.invoke_edge_function()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  function_name text := TG_ARGV[0];
  v_url text;
  v_functions_url text;
  v_service_role_key text;
  v_headers jsonb;
  v_payload jsonb;
BEGIN
  SELECT setting_value
    INTO v_functions_url
    FROM private.workflow_runtime_settings
   WHERE setting_name = 'functions_url';

  SELECT setting_value
    INTO v_service_role_key
    FROM private.workflow_runtime_settings
   WHERE setting_name = 'service_role_key';

  v_url := COALESCE(
    NULLIF(trim(v_functions_url), ''),
    'https://gsupqfmwlsmwoybphimx.supabase.co/functions/v1'
  ) || '/' || function_name;

  IF v_service_role_key IS NULL OR length(trim(v_service_role_key)) = 0 THEN
    RAISE EXCEPTION 'private.workflow_runtime_settings.service_role_key is required for invoke_edge_function';
  END IF;

  v_headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || v_service_role_key
  );

  v_payload := jsonb_build_object(
    'type', TG_OP,
    'table', TG_TABLE_NAME,
    'schema', TG_TABLE_SCHEMA,
    'record', CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN row_to_json(NEW) ELSE NULL END,
    'old_record', CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN row_to_json(OLD) ELSE NULL END
  );

  PERFORM net.http_post(
    url := v_url,
    body := v_payload,
    headers := v_headers,
    timeout_milliseconds := CASE WHEN function_name = 'invoice-processing' THEN 180000 ELSE 30000 END
  );

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.start_invoice_extraction_workflow(p_invoice_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_invoice public.invoices%ROWTYPE;
  v_functions_url TEXT;
  v_service_role_key TEXT;
  v_url TEXT;
  v_headers JSONB;
  v_payload JSONB;
  v_request_id BIGINT;
BEGIN
  SELECT *
    INTO v_invoice
  FROM public.invoices
  WHERE id = p_invoice_id
    AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice % not found', p_invoice_id USING ERRCODE = 'P0002';
  END IF;

  PERFORM public.assert_org_actor(v_invoice.organization_id);

  IF v_invoice.status NOT IN ('extracting', 'uploading', 'extract_failed') THEN
    RETURN jsonb_build_object(
      'success', true,
      'queued', false,
      'reason', 'invoice_not_extractable',
      'status', v_invoice.status
    );
  END IF;

  IF v_invoice.status = 'extracting'
     AND v_invoice.extraction_started_at IS NOT NULL
     AND v_invoice.extraction_started_at > now() - interval '5 minutes' THEN
    RETURN jsonb_build_object(
      'success', true,
      'queued', false,
      'reason', 'extraction_already_running',
      'status', v_invoice.status,
      'extraction_started_at', v_invoice.extraction_started_at
    );
  END IF;

  UPDATE public.invoices
     SET status = 'extracting',
         ap_status = 'processing',
         extraction_started_at = NULL,
         validation_results = COALESCE(validation_results, '{}'::jsonb) - 'error',
         updated_at = now()
   WHERE id = p_invoice_id
   RETURNING * INTO v_invoice;

  SELECT setting_value
    INTO v_functions_url
    FROM private.workflow_runtime_settings
   WHERE setting_name = 'functions_url';

  SELECT setting_value
    INTO v_service_role_key
    FROM private.workflow_runtime_settings
   WHERE setting_name = 'service_role_key';

  IF v_service_role_key IS NULL OR length(trim(v_service_role_key)) = 0 THEN
    RAISE EXCEPTION 'private.workflow_runtime_settings.service_role_key is required for invoice extraction dispatch';
  END IF;

  v_url := COALESCE(
    NULLIF(trim(v_functions_url), ''),
    'https://gsupqfmwlsmwoybphimx.supabase.co/functions/v1'
  ) || '/invoice-processing';

  v_headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || v_service_role_key
  );

  v_payload := jsonb_build_object(
    'type', 'INSERT',
    'table', 'invoices',
    'schema', 'public',
    'record', row_to_json(v_invoice),
    'old_record', NULL
  );

  SELECT net.http_post(
    url := v_url,
    body := v_payload,
    headers := v_headers,
    timeout_milliseconds := 180000
  ) INTO v_request_id;

  RETURN jsonb_build_object(
    'success', true,
    'queued', true,
    'request_id', v_request_id,
    'invoice_id', v_invoice.id
  );
END;
$$;

COMMIT;