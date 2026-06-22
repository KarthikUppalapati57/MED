-- code/supabase/migrations/140_rbac_approval_limits.sql

ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS invoice_approval_limit NUMERIC DEFAULT 0.00;

CREATE OR REPLACE FUNCTION update_user_approval_limit(
    target_user_id UUID,
    new_limit NUMERIC
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE profiles
    SET invoice_approval_limit = new_limit,
        updated_at = NOW()
    WHERE id = target_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION approve_invoice_with_limit(
    p_invoice_id UUID,
    p_user_id UUID,
    p_amount NUMERIC
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_limit NUMERIC;
BEGIN
    SELECT invoice_approval_limit INTO v_user_limit 
    FROM profiles 
    WHERE id = p_user_id;

    IF v_user_limit IS NULL OR p_amount > v_user_limit THEN
        RAISE EXCEPTION 'Approval limit exceeded. Your limit is $%, but the invoice is $%.', COALESCE(v_user_limit, 0), p_amount;
    END IF;

    -- If approved, update the invoice
    UPDATE invoices
    SET status = 'approved',
        updated_at = NOW()
    WHERE id = p_invoice_id;

    RETURN jsonb_build_object('success', true, 'message', 'Invoice approved successfully');
END;
$$;
