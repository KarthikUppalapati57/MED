-- 084: Configurable Approval Workflow
-- Replaces simple approve/reject with a policy-driven workflow.

BEGIN;

CREATE TYPE approval_instance_status AS ENUM ('pending', 'approved', 'rejected', 'cancelled');
CREATE TYPE approval_step_status AS ENUM ('pending', 'approved', 'rejected');

-- 1. Approval Policies (Rules)
CREATE TABLE IF NOT EXISTS public.approval_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  
  -- Conditions
  min_amount NUMERIC DEFAULT 0,
  max_amount NUMERIC,
  category TEXT, -- If NULL, applies to all
  
  -- Requirement
  required_role TEXT NOT NULL, -- e.g., 'location_manager', 'org_admin'
  
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Approval Instances (The running workflow)
CREATE TABLE IF NOT EXISTS public.approval_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  status approval_instance_status DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Approval Steps (The specific required actions)
CREATE TABLE IF NOT EXISTS public.approval_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id UUID NOT NULL REFERENCES public.approval_instances(id) ON DELETE CASCADE,
  required_role TEXT NOT NULL,
  
  status approval_step_status DEFAULT 'pending',
  approver_id UUID REFERENCES auth.users(id),
  comments TEXT,
  acted_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.approval_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_steps ENABLE ROW LEVEL SECURITY;

-- RLS
CREATE POLICY "View policies" ON public.approval_policies FOR SELECT USING (organization_id = public.get_my_org() OR public.is_platform_admin());
CREATE POLICY "Manage policies" ON public.approval_policies FOR ALL USING (
  (public.is_manager_or_above() AND organization_id = public.get_my_org()) OR public.is_platform_admin()
);

CREATE POLICY "View instances" ON public.approval_instances FOR SELECT USING (
  invoice_id IN (SELECT id FROM public.invoices WHERE organization_id = public.get_my_org())
);
CREATE POLICY "Manage instances" ON public.approval_instances FOR ALL USING (
  invoice_id IN (SELECT id FROM public.invoices WHERE organization_id = public.get_my_org())
);

CREATE POLICY "View steps" ON public.approval_steps FOR SELECT USING (
  instance_id IN (SELECT id FROM public.approval_instances WHERE invoice_id IN (SELECT id FROM public.invoices WHERE organization_id = public.get_my_org()))
);
CREATE POLICY "Manage steps" ON public.approval_steps FOR ALL USING (
  instance_id IN (SELECT id FROM public.approval_instances WHERE invoice_id IN (SELECT id FROM public.invoices WHERE organization_id = public.get_my_org()))
);

-- RPC to Evaluate Policies and Start Workflow
CREATE OR REPLACE FUNCTION public.evaluate_invoice_approval_policy(p_invoice_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_org_id UUID;
  v_amount NUMERIC;
  v_instance_id UUID;
  v_policy RECORD;
  v_steps_created INT := 0;
BEGIN
  -- Get invoice details
  SELECT organization_id, total_amount INTO v_org_id, v_amount
  FROM public.invoices WHERE id = p_invoice_id;

  -- Cancel any existing pending instances for this invoice (e.g. if it was edited)
  UPDATE public.approval_instances 
  SET status = 'cancelled', updated_at = now()
  WHERE invoice_id = p_invoice_id AND status = 'pending';

  -- Create a new instance
  INSERT INTO public.approval_instances (invoice_id, status)
  VALUES (p_invoice_id, 'pending')
  RETURNING id INTO v_instance_id;

  -- Find matching policies
  FOR v_policy IN (
    SELECT required_role FROM public.approval_policies
    WHERE organization_id = v_org_id
      AND (min_amount IS NULL OR v_amount >= min_amount)
      AND (max_amount IS NULL OR v_amount <= max_amount)
  ) LOOP
    -- Insert a step for this policy
    -- Parallel approvals: We insert them all. Any user with the required_role can approve their step.
    INSERT INTO public.approval_steps (instance_id, required_role)
    VALUES (v_instance_id, v_policy.required_role);
    
    v_steps_created := v_steps_created + 1;
  END LOOP;

  IF v_steps_created = 0 THEN
    -- Auto-approve if no policies apply
    UPDATE public.approval_instances SET status = 'approved', updated_at = now() WHERE id = v_instance_id;
    UPDATE public.invoices SET status = 'approved', updated_at = now() WHERE id = p_invoice_id;
    RETURN jsonb_build_object('status', 'auto_approved');
  ELSE
    -- Set to pending approval
    UPDATE public.invoices SET status = 'pending_approval', updated_at = now() WHERE id = p_invoice_id;
    RETURN jsonb_build_object('status', 'pending_approval', 'steps', v_steps_created);
  END IF;
END;
$$;

-- Default policy for all orgs: If no policy exists, let's make a generic one so the feature works
INSERT INTO public.approval_policies (organization_id, required_role)
SELECT id, 'org_admin' FROM public.organizations
ON CONFLICT DO NOTHING;

-- RPC to Execute an Approval Step
CREATE OR REPLACE FUNCTION public.execute_approval_step(p_step_id UUID, p_status TEXT, p_comments TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_instance_id UUID;
  v_invoice_id UUID;
  v_pending_count INT;
BEGIN
  -- Update the step
  UPDATE public.approval_steps
  SET status = p_status::approval_step_status,
      approver_id = auth.uid(),
      comments = p_comments,
      acted_at = now()
  WHERE id = p_step_id
  RETURNING instance_id INTO v_instance_id;

  SELECT invoice_id INTO v_invoice_id FROM public.approval_instances WHERE id = v_instance_id;

  IF p_status = 'rejected' THEN
    -- If one rejects, the whole instance is rejected
    UPDATE public.approval_instances SET status = 'rejected', updated_at = now() WHERE id = v_instance_id;
    UPDATE public.invoices SET status = 'rejected', updated_at = now() WHERE id = v_invoice_id;
    RETURN jsonb_build_object('status', 'rejected');
  END IF;

  IF p_status = 'approved' THEN
    -- Check if any pending steps remain for this instance
    SELECT count(*) INTO v_pending_count FROM public.approval_steps WHERE instance_id = v_instance_id AND status = 'pending';
    
    IF v_pending_count = 0 THEN
      -- All steps approved!
      UPDATE public.approval_instances SET status = 'approved', updated_at = now() WHERE id = v_instance_id;
      UPDATE public.invoices SET status = 'approved', updated_at = now() WHERE id = v_invoice_id;
      RETURN jsonb_build_object('status', 'fully_approved');
    ELSE
      RETURN jsonb_build_object('status', 'partially_approved', 'pending_steps', v_pending_count);
    END IF;
  END IF;

  RETURN jsonb_build_object('status', 'unknown');
END;
$$;

COMMIT;
