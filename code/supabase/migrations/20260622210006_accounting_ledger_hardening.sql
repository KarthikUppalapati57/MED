-- code/supabase/migrations/138_accounting_ledger_hardening.sql

CREATE OR REPLACE FUNCTION record_payment_ledger(
    p_organization_id UUID,
    p_bill_id UUID,
    p_source_payment_id UUID,
    p_payment_method TEXT,
    p_amount NUMERIC,
    p_payment_date TIMESTAMP WITH TIME ZONE,
    p_user_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_ledger_payment_id UUID;
    v_existing_payment_id UUID;
BEGIN
    -- Check if payment already exists
    SELECT id INTO v_existing_payment_id
    FROM ledger_payments
    WHERE source_payment_id = p_source_payment_id;

    IF v_existing_payment_id IS NOT NULL THEN
        RETURN jsonb_build_object('success', true, 'ledger_payment_id', v_existing_payment_id, 'message', 'Payment already recorded.');
    END IF;

    -- Create Ledger Payment
    INSERT INTO ledger_payments (
        organization_id, bill_id, source_payment_id, payment_method, amount, payment_date, status, created_by
    ) VALUES (
        p_organization_id, p_bill_id, p_source_payment_id, p_payment_method, p_amount, p_payment_date, 'completed', p_user_id
    ) RETURNING id INTO v_ledger_payment_id;

    -- Create Debit Ledger Entry (Accounts Payable)
    INSERT INTO ledger_entries (
        organization_id, account_code, debit, credit, reference_type, reference_id
    ) VALUES (
        p_organization_id, '2000', p_amount, 0, 'payment', p_source_payment_id
    );

    -- Create Credit Ledger Entry (Cash/Bank)
    INSERT INTO ledger_entries (
        organization_id, account_code, debit, credit, reference_type, reference_id
    ) VALUES (
        p_organization_id, '1000', 0, p_amount, 'payment', p_source_payment_id
    );

    RETURN jsonb_build_object('success', true, 'ledger_payment_id', v_ledger_payment_id);
END;
$$;
