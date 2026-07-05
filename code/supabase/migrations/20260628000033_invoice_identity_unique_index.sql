BEGIN;

-- ponytail: invoice identity is (org, vendor, invoice_number). Ceiling: assumes
-- a vendor never legitimately reuses an invoice number, confirmed by product.
-- Upgrade path: if a real reuse case appears, drop this hard constraint and use
-- an advisory duplicate_check in validate_invoice keyed on this tuple plus
-- invoice_date / total_amount signals.
CREATE UNIQUE INDEX IF NOT EXISTS uq_invoice_identity
  ON public.invoices (organization_id, vendor_id, invoice_number)
  WHERE deleted_at IS NULL;

COMMIT;