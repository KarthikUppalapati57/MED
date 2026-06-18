# Database Source Of Truth Audit

Last reviewed: 2026-06-18

This note documents database areas that can look duplicated. It is meant to prevent accidental divergence between operational tables, analytics tables, archive tables, and UI workflows.

## Current Health

- `supabase db lint --linked` reported no schema errors during the review.
- `live_table_counts.txt` listed 123 live database objects, with 69 empty tables or views.
- Empty tables are not automatically bad. Several represent future workflows, optional integrations, or audit/reporting structures.

## Canonical Operational Tables

These should be treated as the main write/read source for product workflows:

- `invoices`: invoice header, status, approval, AP workflow state.
- `invoice_line_items`: canonical normalized invoice line-item table.
- `payments`: actual payment execution records.
- `scheduled_payments`: planned bill-pay batches and scheduling.
- `payment_accounts`: bank/card/account setup for payments.
- `ledger_bills`, `ledger_payments`, `ledger_entries`, `general_ledger_entries`: accounting/ledger representation.
- `purchase_orders`, `purchase_order_items`: purchase ordering.
- `receivings`, `receiving_items`: receiving workflow, pending final review.
- `vendors`, `vendor_items`, `vendor_item_mappings`, `vendor_item_prices`: vendor master and item intelligence.
- `products`, `inventory`, `inventory_movements`: product and inventory operations.

## Intentional Derived Or Duplicate-Looking Tables

These tables duplicate concepts by design and should not be treated as primary workflow storage:

- `fact_*` and `dim_*`: analytics/reporting layer.
- `mv_*` materialized views: dashboard/reporting cache layer.
- `v_*` and `vw_*` views: read models.
- `archived_*`: retention and deletion history.

## Open Investigation Items

### Invoice Line Items

Current overlap:

- `invoices.line_items` JSONB exists for legacy/compatibility style reads.
- `invoice_line_items` exists as the normalized table.

Decision:

- Treat `invoice_line_items` as canonical.
- Treat `invoices.line_items` as compatibility/cache only.
- Future code should not independently write both sources.

Next steps:

- Audit every `line_items` read/write in app code, RPCs, and Edge Functions.
- If `invoices.line_items` remains necessary, generate it from `invoice_line_items`.
- Add a consistency query or migration comment before making schema changes.

### Payments

Current concern:

- `live_table_counts.txt` shows `payments: 0`.
- `fact_payments: 4` has rows.

Decision:

- `payments` should be canonical for actual payment execution records.
- `fact_payments` should be analytics only.

Next steps:

- Trace the four `fact_payments` rows back to source records.
- Decide whether `fact_payments` should be rebuilt from `payments`.
- Confirm whether invoice payment fields are temporarily replacing `payments`.
- Repair/backfill only after source IDs and workflow expectations are clear.

### Receivings

Current concern:

- `receivings` appears in more than one migration path.
- The live table is currently empty.

Decision:

- `receivings` and `receiving_items` should be canonical for receiving if the workflow is active.

Next steps:

- Compare final live columns with `AutoOrdering`, vendor receiving tabs, and three-way-match RPCs.
- Confirm one receiving model before adding new receiving UX.

## Empty Table Classification

Priority tables to classify before any removal:

- `payments`
- `vendors`
- `receivings`
- `purchase_orders`
- `invoice_documents`
- `vendor_items`
- `vendor_statements`
- `pos_items`
- `pos_menu_mapping`
- `pos_sales_data`
- `webhook_events`
- `webhook_events_queue`
- `webhook_delivery_logs`
- `webhook_subscriptions`

Classification buckets:

- Keep: future feature.
- Keep: configured but no production data yet.
- Investigate: expected to have data.
- Candidate for removal later.

No table should be dropped until code references, RPC references, Edge Function references, RLS policies, and roadmap ownership are checked.

