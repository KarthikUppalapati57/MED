-- Harden parent-scoped child table RLS for shared public tenancy.
-- These tables intentionally do not carry organization_id; tenant scope is proven
-- through their parent records and, where present, same-org secondary references.

BEGIN;

ALTER TABLE public.approval_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receiving_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduled_payment_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_statement_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_delivery_logs ENABLE ROW LEVEL SECURITY;

-- Approval workflow child rows inherit organization scope from approval_instances.
DROP POLICY IF EXISTS "View steps" ON public.approval_steps;
DROP POLICY IF EXISTS "Manage steps" ON public.approval_steps;
DROP POLICY IF EXISTS "approval_steps_org_read" ON public.approval_steps;
CREATE POLICY "approval_steps_org_read"
ON public.approval_steps
FOR SELECT
USING (
  public.is_platform_admin()
  OR EXISTS (
    SELECT 1
    FROM public.approval_instances ai
    WHERE ai.id = approval_steps.instance_id
      AND ai.organization_id = public.get_my_org()
  )
);

DROP POLICY IF EXISTS "approval_steps_org_manage" ON public.approval_steps;
CREATE POLICY "approval_steps_org_manage"
ON public.approval_steps
FOR ALL
USING (
  public.is_platform_admin()
  OR (
    public.is_manager_or_above()
    AND EXISTS (
      SELECT 1
      FROM public.approval_instances ai
      WHERE ai.id = approval_steps.instance_id
        AND ai.organization_id = public.get_my_org()
    )
  )
)
WITH CHECK (
  public.is_platform_admin()
  OR (
    public.is_manager_or_above()
    AND EXISTS (
      SELECT 1
      FROM public.approval_instances ai
      WHERE ai.id = approval_steps.instance_id
        AND ai.organization_id = public.get_my_org()
    )
  )
);

-- Purchase order items inherit organization scope from purchase_orders.
-- Optional product_id must also belong to the same organization as the parent PO.
DROP POLICY IF EXISTS "Users can view purchase order items" ON public.purchase_order_items;
CREATE POLICY "Users can view purchase order items"
ON public.purchase_order_items
FOR SELECT
USING (
  public.is_platform_admin()
  OR EXISTS (
    SELECT 1
    FROM public.purchase_orders po
    WHERE po.id = purchase_order_items.purchase_order_id
      AND po.organization_id = public.get_my_org()
  )
);

DROP POLICY IF EXISTS "Manager+ can manage purchase order items" ON public.purchase_order_items;
CREATE POLICY "Manager+ can manage purchase order items"
ON public.purchase_order_items
FOR ALL
USING (
  public.is_platform_admin()
  OR (
    public.is_manager_or_above()
    AND EXISTS (
      SELECT 1
      FROM public.purchase_orders po
      WHERE po.id = purchase_order_items.purchase_order_id
        AND po.organization_id = public.get_my_org()
    )
  )
)
WITH CHECK (
  public.is_platform_admin()
  OR (
    public.is_manager_or_above()
    AND EXISTS (
      SELECT 1
      FROM public.purchase_orders po
      WHERE po.id = purchase_order_items.purchase_order_id
        AND po.organization_id = public.get_my_org()
        AND (
          purchase_order_items.product_id IS NULL
          OR EXISTS (
            SELECT 1
            FROM public.products p
            WHERE p.id = purchase_order_items.product_id
              AND p.organization_id = po.organization_id
          )
        )
    )
  )
);

-- Receiving items inherit organization scope from receivings.
-- Optional product and purchase-order-item references must remain in the parent org.
DROP POLICY IF EXISTS "Users can view receiving items" ON public.receiving_items;
CREATE POLICY "Users can view receiving items"
ON public.receiving_items
FOR SELECT
USING (
  public.is_platform_admin()
  OR EXISTS (
    SELECT 1
    FROM public.receivings r
    WHERE r.id = receiving_items.receiving_id
      AND r.organization_id = public.get_my_org()
  )
);

DROP POLICY IF EXISTS "Manager+ can manage receiving items" ON public.receiving_items;
CREATE POLICY "Manager+ can manage receiving items"
ON public.receiving_items
FOR ALL
USING (
  public.is_platform_admin()
  OR (
    public.is_manager_or_above()
    AND EXISTS (
      SELECT 1
      FROM public.receivings r
      WHERE r.id = receiving_items.receiving_id
        AND r.organization_id = public.get_my_org()
    )
  )
)
WITH CHECK (
  public.is_platform_admin()
  OR (
    public.is_manager_or_above()
    AND EXISTS (
      SELECT 1
      FROM public.receivings r
      WHERE r.id = receiving_items.receiving_id
        AND r.organization_id = public.get_my_org()
        AND (
          receiving_items.product_id IS NULL
          OR EXISTS (
            SELECT 1
            FROM public.products p
            WHERE p.id = receiving_items.product_id
              AND p.organization_id = r.organization_id
          )
        )
        AND (
          receiving_items.purchase_order_item_id IS NULL
          OR EXISTS (
            SELECT 1
            FROM public.purchase_order_items poi
            JOIN public.purchase_orders po ON po.id = poi.purchase_order_id
            WHERE poi.id = receiving_items.purchase_order_item_id
              AND po.organization_id = r.organization_id
          )
        )
    )
  )
);

-- Scheduled payment invoice links must keep scheduled payment and invoice in one org.
DROP POLICY IF EXISTS "View scheduled payment invoices" ON public.scheduled_payment_invoices;
CREATE POLICY "View scheduled payment invoices"
ON public.scheduled_payment_invoices
FOR SELECT
USING (
  public.is_platform_admin()
  OR EXISTS (
    SELECT 1
    FROM public.scheduled_payments sp
    WHERE sp.id = scheduled_payment_invoices.scheduled_payment_id
      AND sp.organization_id = public.get_my_org()
  )
);

DROP POLICY IF EXISTS "Manage scheduled payment invoices" ON public.scheduled_payment_invoices;
CREATE POLICY "Manage scheduled payment invoices"
ON public.scheduled_payment_invoices
FOR ALL
USING (
  public.is_platform_admin()
  OR EXISTS (
    SELECT 1
    FROM public.scheduled_payments sp
    WHERE sp.id = scheduled_payment_invoices.scheduled_payment_id
      AND sp.organization_id = public.get_my_org()
  )
)
WITH CHECK (
  public.is_platform_admin()
  OR EXISTS (
    SELECT 1
    FROM public.scheduled_payments sp
    JOIN public.invoices i ON i.id = scheduled_payment_invoices.invoice_id
    WHERE sp.id = scheduled_payment_invoices.scheduled_payment_id
      AND sp.organization_id = public.get_my_org()
      AND i.organization_id = sp.organization_id
  )
);

-- Vendor statement lines inherit organization scope from vendor_statements.
-- Matched invoice, when present, must belong to the same organization.
DROP POLICY IF EXISTS "View vendor statement lines" ON public.vendor_statement_lines;
CREATE POLICY "View vendor statement lines"
ON public.vendor_statement_lines
FOR SELECT
USING (
  public.is_platform_admin()
  OR EXISTS (
    SELECT 1
    FROM public.vendor_statements vs
    WHERE vs.id = vendor_statement_lines.statement_id
      AND vs.organization_id = public.get_my_org()
  )
);

DROP POLICY IF EXISTS "Manage vendor statement lines" ON public.vendor_statement_lines;
CREATE POLICY "Manage vendor statement lines"
ON public.vendor_statement_lines
FOR ALL
USING (
  public.is_platform_admin()
  OR EXISTS (
    SELECT 1
    FROM public.vendor_statements vs
    WHERE vs.id = vendor_statement_lines.statement_id
      AND vs.organization_id = public.get_my_org()
  )
)
WITH CHECK (
  public.is_platform_admin()
  OR EXISTS (
    SELECT 1
    FROM public.vendor_statements vs
    WHERE vs.id = vendor_statement_lines.statement_id
      AND vs.organization_id = public.get_my_org()
      AND (
        vendor_statement_lines.matched_invoice_id IS NULL
        OR EXISTS (
          SELECT 1
          FROM public.invoices i
          WHERE i.id = vendor_statement_lines.matched_invoice_id
            AND i.organization_id = vs.organization_id
        )
      )
  )
);

-- Webhook delivery logs inherit tenant scope from webhook_endpoints.
-- Writes remain server/service-role only; authenticated users get read access only.
DROP POLICY IF EXISTS "Users can view webhook delivery logs" ON public.webhook_delivery_logs;
CREATE POLICY "Users can view webhook delivery logs"
ON public.webhook_delivery_logs
FOR SELECT
USING (
  public.is_platform_admin()
  OR EXISTS (
    SELECT 1
    FROM public.webhook_endpoints we
    WHERE we.id = webhook_delivery_logs.endpoint_id
      AND we.organization_id = public.get_my_org()
  )
);
DROP POLICY IF EXISTS "Manage webhook delivery logs" ON public.webhook_delivery_logs;

COMMENT ON POLICY "approval_steps_org_read" ON public.approval_steps IS
  'Tenant scope is inherited through approval_instances.organization_id.';
COMMENT ON POLICY "Users can view purchase order items" ON public.purchase_order_items IS
  'Tenant scope is inherited through purchase_orders.organization_id.';
COMMENT ON POLICY "Users can view receiving items" ON public.receiving_items IS
  'Tenant scope is inherited through receivings.organization_id.';
COMMENT ON POLICY "View scheduled payment invoices" ON public.scheduled_payment_invoices IS
  'Tenant scope is inherited through scheduled_payments.organization_id; invoice links must stay same-org on write.';
COMMENT ON POLICY "View vendor statement lines" ON public.vendor_statement_lines IS
  'Tenant scope is inherited through vendor_statements.organization_id; matched invoices must stay same-org on write.';
COMMENT ON POLICY "Users can view webhook delivery logs" ON public.webhook_delivery_logs IS
  'Tenant scope is inherited through webhook_endpoints.organization_id.';

COMMIT;
