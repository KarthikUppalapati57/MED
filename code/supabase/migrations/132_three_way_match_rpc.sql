-- Migration 132: Three-Way Match RPC and Trigger

-- 1. Create the RPC to return match status
CREATE OR REPLACE FUNCTION public.get_three_way_match_status(p_purchase_order_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_po RECORD;
  v_invoice RECORD;
  v_receiving RECORD;
  v_po_total NUMERIC := 0;
  v_inv_total NUMERIC := 0;
  v_rec_qty NUMERIC := 0;
  v_po_qty NUMERIC := 0;
  v_variance_amount NUMERIC := 0;
  v_variance_percent NUMERIC := 0;
  v_status TEXT := 'matched';
BEGIN
  -- Get PO details
  SELECT * INTO v_po FROM public.purchase_orders WHERE id = p_purchase_order_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'PO not found'); END IF;

  v_po_total := v_po.total_amount;

  -- Get Invoice details (assume 1 invoice per PO for simplicity)
  SELECT * INTO v_invoice FROM public.invoices WHERE purchase_order_id = p_purchase_order_id ORDER BY created_at DESC LIMIT 1;
  IF FOUND THEN
    v_inv_total := v_invoice.total_amount;
  END IF;

  -- Get total PO quantity
  SELECT COALESCE(SUM(quantity), 0) INTO v_po_qty FROM public.purchase_order_items WHERE purchase_order_id = p_purchase_order_id;

  -- Get total Received quantity
  SELECT COALESCE(SUM(ri.quantity_received), 0) INTO v_rec_qty 
  FROM public.receivings r
  JOIN public.receiving_items ri ON ri.receiving_id = r.id
  WHERE r.purchase_order_id = p_purchase_order_id;

  -- Calculate variance based on invoice vs PO cost
  IF v_inv_total > 0 AND v_po_total > 0 THEN
    v_variance_amount := ABS(v_inv_total - v_po_total);
    v_variance_percent := (v_variance_amount / v_po_total) * 100;
  END IF;

  -- Determine status
  IF v_rec_qty < v_po_qty THEN
    v_status := 'quantity_variance';
  END IF;

  IF v_variance_percent > 5 OR v_variance_amount > 50 THEN
    v_status := 'price_variance';
  END IF;

  -- If both, just say critical_variance
  IF v_rec_qty < v_po_qty AND (v_variance_percent > 5 OR v_variance_amount > 50) THEN
    v_status := 'critical_variance';
  END IF;

  RETURN jsonb_build_object(
    'po_total', v_po_total,
    'invoice_total', v_inv_total,
    'po_quantity', v_po_qty,
    'received_quantity', v_rec_qty,
    'variance_amount', v_variance_amount,
    'variance_percent', v_variance_percent,
    'match_status', v_status
  );
END;
$$;

-- 2. Create Trigger Function to block invoice
CREATE OR REPLACE FUNCTION public.check_three_way_match_before_invoice_approval()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_match_data JSONB;
BEGIN
  -- Only run if there's a PO attached and it's trying to move to approved or pending_payment
  IF NEW.purchase_order_id IS NOT NULL AND NEW.status IN ('approved', 'pending_payment') THEN
    
    -- If it's already pending_match_approval, we don't loop
    IF OLD.status = 'pending_match_approval' AND NEW.status != 'pending_match_approval' THEN
      -- A manager is forcing the approval. Let it pass.
      RETURN NEW;
    END IF;

    v_match_data := public.get_three_way_match_status(NEW.purchase_order_id);
    
    IF v_match_data->>'match_status' IN ('price_variance', 'critical_variance') THEN
      NEW.status := 'pending_match_approval';
      NEW.validation_notes := 'Blocked by Three-Way Match: Variance > 5% or > $50. Requires manager override.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_three_way_match_invoice ON public.invoices;
CREATE TRIGGER trigger_three_way_match_invoice
  BEFORE INSERT OR UPDATE OF status, total_amount ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.check_three_way_match_before_invoice_approval();
