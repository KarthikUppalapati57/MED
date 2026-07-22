BEGIN;

INSERT INTO public.invoice_action_reasons (
  code,
  label,
  severity,
  resolution_route
) VALUES
  ('possible_duplicate', 'Possible Duplicate', 'critical', '/invoices/review/duplicate'),
  ('validation_flag', 'Validation Flag', 'warning', '/invoices/review/validation'),
  ('missing_receipt', 'Missing Receipt', 'warning', '/orders/receiving'),
  ('missing_purchase_order', 'Missing Purchase Order', 'warning', '/orders/new'),
  ('reconciliation_variance', 'Reconciliation Variance', 'critical', '/invoices/review/reconciliation')
ON CONFLICT (code) DO UPDATE SET
  label = EXCLUDED.label,
  severity = EXCLUDED.severity,
  resolution_route = EXCLUDED.resolution_route,
  updated_at = now();

INSERT INTO public.global_vendor_items (
  vendor_name,
  vendor_item_code,
  item_name,
  most_common_category,
  confidence_score,
  mapping_count
) VALUES
  ('Sysco', 'SYS-101', 'Ground Beef 80/20', 'food_cogs', 95, 412),
  ('US Foods', 'USF-88', 'Heinz Ketchup 1Gal', 'food_cogs', 98, 850),
  ('Ecolab', 'ECO-22', 'Sanitizer Solution', 'cleaning_supplies', 99, 1200),
  ('Local Farm', 'LOC-01', 'Heirloom Tomatoes', 'food_cogs', 85, 45)
ON CONFLICT (vendor_name, vendor_item_code, item_name) DO UPDATE SET
  most_common_category = EXCLUDED.most_common_category,
  confidence_score = EXCLUDED.confidence_score,
  mapping_count = EXCLUDED.mapping_count,
  updated_at = now();

COMMIT;
