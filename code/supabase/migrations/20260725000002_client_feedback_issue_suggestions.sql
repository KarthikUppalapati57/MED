BEGIN;

CREATE TABLE IF NOT EXISTS public.platform_feedback_settings (
  id BOOLEAN PRIMARY KEY DEFAULT true,
  issue_to TEXT[] NOT NULL DEFAULT ARRAY['pradeepk@mindfultechsol.com']::TEXT[],
  issue_cc TEXT[] NOT NULL DEFAULT ARRAY['karthiku@mindfultechsol.com', 'Narendrapydi@mindfultechsol.com']::TEXT[],
  suggestion_to TEXT[] NOT NULL DEFAULT ARRAY['Karthiku@MIndfultechsol.com']::TEXT[],
  suggestion_cc TEXT[] NOT NULL DEFAULT ARRAY['Narendrapydi@mindfultechsol.com']::TEXT[],
  updated_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT platform_feedback_settings_singleton CHECK (id = true)
);

INSERT INTO public.platform_feedback_settings (id)
VALUES (true)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.platform_feedback_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS platform_feedback_settings_read ON public.platform_feedback_settings;
CREATE POLICY platform_feedback_settings_read
  ON public.platform_feedback_settings FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS platform_feedback_settings_admin_update ON public.platform_feedback_settings;
CREATE POLICY platform_feedback_settings_admin_update
  ON public.platform_feedback_settings FOR UPDATE
  USING (public.get_auth_role() = 'platform_admin')
  WITH CHECK (public.get_auth_role() = 'platform_admin');

CREATE OR REPLACE FUNCTION public.touch_platform_feedback_settings_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := now();
  NEW.updated_by := auth.uid();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_platform_feedback_settings ON public.platform_feedback_settings;
CREATE TRIGGER trg_touch_platform_feedback_settings
  BEFORE UPDATE ON public.platform_feedback_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_platform_feedback_settings_updated_at();

CREATE TABLE IF NOT EXISTS public.client_feedback_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('issue', 'suggestion')),
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  priority TEXT,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email TEXT,
  user_name TEXT,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  organization_name TEXT,
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'emailed', 'email_failed', 'reviewed', 'closed')),
  email_to TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  email_cc TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  email_sent BOOLEAN NOT NULL DEFAULT false,
  email_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.client_feedback_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS client_feedback_insert_own ON public.client_feedback_submissions;
CREATE POLICY client_feedback_insert_own
  ON public.client_feedback_submissions FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND (user_id IS NULL OR user_id = auth.uid()));

DROP POLICY IF EXISTS client_feedback_read_own_or_platform ON public.client_feedback_submissions;
CREATE POLICY client_feedback_read_own_or_platform
  ON public.client_feedback_submissions FOR SELECT
  USING (public.get_auth_role() = 'platform_admin' OR user_id = auth.uid());

DROP POLICY IF EXISTS client_feedback_platform_update ON public.client_feedback_submissions;
CREATE POLICY client_feedback_platform_update
  ON public.client_feedback_submissions FOR UPDATE
  USING (public.get_auth_role() = 'platform_admin')
  WITH CHECK (public.get_auth_role() = 'platform_admin');

CREATE INDEX IF NOT EXISTS idx_client_feedback_submissions_type_created
  ON public.client_feedback_submissions(type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_client_feedback_submissions_user
  ON public.client_feedback_submissions(user_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.touch_client_feedback_submissions_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_client_feedback_submissions ON public.client_feedback_submissions;
CREATE TRIGGER trg_touch_client_feedback_submissions
  BEFORE UPDATE ON public.client_feedback_submissions
  FOR EACH ROW EXECUTE FUNCTION public.touch_client_feedback_submissions_updated_at();

CREATE OR REPLACE FUNCTION public.get_platform_feedback_settings()
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'issue_to', issue_to,
    'issue_cc', issue_cc,
    'suggestion_to', suggestion_to,
    'suggestion_cc', suggestion_cc,
    'updated_at', updated_at
  )
  FROM public.platform_feedback_settings
  WHERE id = true;
$$;

CREATE OR REPLACE FUNCTION public.update_platform_feedback_settings(
  p_issue_to TEXT[],
  p_issue_cc TEXT[],
  p_suggestion_to TEXT[],
  p_suggestion_cc TEXT[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_settings public.platform_feedback_settings%ROWTYPE;
BEGIN
  IF public.get_auth_role() <> 'platform_admin' THEN
    RAISE EXCEPTION 'Platform admin access required';
  END IF;

  UPDATE public.platform_feedback_settings
  SET issue_to = COALESCE(p_issue_to, issue_to),
      issue_cc = COALESCE(p_issue_cc, issue_cc),
      suggestion_to = COALESCE(p_suggestion_to, suggestion_to),
      suggestion_cc = COALESCE(p_suggestion_cc, suggestion_cc)
  WHERE id = true
  RETURNING * INTO v_settings;

  RETURN jsonb_build_object(
    'success', true,
    'issue_to', v_settings.issue_to,
    'issue_cc', v_settings.issue_cc,
    'suggestion_to', v_settings.suggestion_to,
    'suggestion_cc', v_settings.suggestion_cc,
    'updated_at', v_settings.updated_at
  );
END;
$$;

GRANT SELECT ON public.platform_feedback_settings TO authenticated;
GRANT SELECT, INSERT ON public.client_feedback_submissions TO authenticated;
GRANT UPDATE ON public.client_feedback_submissions TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_platform_feedback_settings() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_platform_feedback_settings(TEXT[], TEXT[], TEXT[], TEXT[]) TO authenticated, service_role;

COMMIT;
