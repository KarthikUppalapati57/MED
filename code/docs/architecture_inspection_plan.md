# Architecture Inspection Plan

Generated: 2026-06-25T16:23:29.796Z

## Live Summary

- Schemas: auth, cron, extensions, graphql, graphql_public, net, private, public, realtime, storage, stripe, supabase_migrations, vault
- Public tables/views inspected: 152
- Public functions inspected: 145
- SECURITY DEFINER functions: 127
- Triggers inspected: 138
- RLS policies inspected: 340
- Public indexes inspected: 716
- Edge Function directories inspected: 40
- Source files inventoried: 317
- RLS/scope review items: 36
- Organization index review items: 0
- Financial-domain functions: 35

## Highest-Risk Findings

| Area | Count | Meaning |
| --- | ---: | --- |
| RLS or scope review | 36 | Tables missing RLS, missing ownership scope, or carrying broad policies. |
| Organization index review | 0 | Organization-scoped tables without an obvious organization_id index. |
| SECURITY DEFINER functions | 127 | Must be reviewed for search_path, scope checks, and privilege boundaries. |
| Financial functions | 35 | Money/invoice/accounting workflows that need idempotency and audit guarantees. |

## RLS / Scope Review Tables

| Table | RLS | Org | Brand | Location | Policies | Public Policy Risk | Missing Scope Review |
| --- | --- | --- | --- | --- | ---: | --- | --- |
| access_requests | yes | no | no | no | 3 | yes | yes |
| approval_steps | yes | no | no | no | 2 | no | yes |
| archived_organizations | yes | no | no | no | 1 | no | yes |
| archived_users | yes | no | no | no | 1 | no | yes |
| commissary_route_stops | yes | no | no | no | 2 | no | yes |
| contact_requests | yes | no | no | no | 3 | yes | yes |
| data_ownership_catalog | yes | no | no | no | 1 | no | yes |
| debug_logs | yes | no | no | no | 1 | no | yes |
| demo_requests | yes | no | no | no | 3 | yes | yes |
| dim_date | yes | no | no | no | 2 | yes | yes |
| error_logs | yes | no | no | no | 1 | no | yes |
| error_logs_default | yes | no | no | no | 2 | no | yes |
| error_logs_y2025 | yes | no | no | no | 2 | no | yes |
| error_logs_y2026 | yes | no | no | no | 2 | no | yes |
| franchise_invoices | yes | no | no | no | 1 | no | yes |
| global_vendor_items | yes | no | no | no | 1 | no | yes |
| invoice_action_reasons | yes | no | no | no | 1 | yes | yes |
| invoice_event_log | yes | no | no | no | 1 | no | yes |
| invoice_processing_jobs | yes | no | no | no | 1 | no | yes |
| invoice_sync_log | yes | no | no | no | 1 | no | yes |
| menu_sync_logs | yes | no | no | no | 1 | no | yes |
| organizations | yes | no | no | no | 3 | no | yes |
| plans | yes | no | no | no | 2 | yes | no |
| pos_order_items | yes | no | no | no | 1 | no | yes |
| purchase_order_items | yes | no | no | no | 2 | no | yes |
| receiving_items | yes | no | no | no | 2 | no | yes |
| role_permissions | yes | no | no | no | 1 | yes | yes |
| roles | yes | yes | no | no | 2 | yes | no |
| royalty_invoices | yes | no | no | no | 1 | no | yes |
| scheduled_payment_invoices | yes | no | no | no | 2 | no | yes |
| tenant_mirror_tables | yes | no | no | no | 1 | no | yes |
| vendor_statement_lines | yes | no | no | no | 2 | no | yes |
| web_vitals_telemetry | yes | yes | no | no | 2 | yes | no |
| webhook_delivery_logs | yes | no | no | no | 1 | no | yes |
| webhook_events | yes | no | no | no | 1 | no | yes |
| webhook_subscriptions | yes | no | no | no | 2 | no | yes |

## Implementation Plan

### Phase 1: Control-plane naming cleanup

Reason: Schema-per-tenant is removed, but names like tenant migration remain in UI/docs/scripts and can confuse operators.

- Rename TenantMigrationPanel or replace it with a Shared Tenancy Health panel.
- Rename tenantRouting/tenantReporting/tenantCutover compatibility shims or remove them if imports are gone.
- Update docs so tenant_registry is described as historical/shared-public tenancy metadata only.

### Phase 2: Canonical table ownership and RLS audit

Reason: 36 public tables need RLS/scope review from live metadata.

- Classify every public table as organization, brand, location, global reference, platform-only, or archive.
- Add/fix organization_id, brand_id, or location_id where needed.
- Remove permissive or ambiguous policies and add policy tests for owner, manager, staff, platform admin, and cross-org denial.

### Phase 3: Scope indexes and scale readiness

Reason: 0 organization-scoped tables may need organization_id-leading indexes for 10k-client scale.

- Add organization_id-leading composite indexes for high-volume list/filter paths.
- Review invoice, payment, inventory, POS, webhook, audit, and dashboard query plans.
- Keep partitioning selective; use it only for very large append-only logs and time-series tables.

### Phase 4: Financial workflow server-side hardening

Reason: 35 live public functions touch invoice/payment/ledger/accounting domains.

- Move remaining client-side financial writes behind tenant-safe SECURITY DEFINER RPCs.
- Require idempotency keys for money movement and payout flows.
- Enforce organization scope inside every financial RPC and write audit/domain events in the same transaction.

### Phase 5: Edge Function security and consistency pass

Reason: 40 Edge Function directories are deployed or deployable.

- Audit service-role use, CORS, auth checks, org-scope validation, and idempotency in every Edge Function.
- Standardize shared helpers for Supabase admin/client creation and request validation.
- Add smoke tests for invoice-processing, payout, Checkbook/Dwolla/Stripe webhooks, POS sync, and webhook dispatcher.

### Phase 6: Operational observability and release gates

Reason: The DB is now shared-public; access mistakes must be caught before production blast radius grows.

- Add CI gates for DB lint, build, RLS policy tests, function smoke tests, and cross-org denial tests.
- Create dashboards for RLS denials, failed financial RPC validation, webhook failures, payout failures, and suspicious cross-org attempts.
- Keep the tenant schema retirement archive service-role-only and add retention/export policy.

## Notes

- This report uses live database metadata from `public.inspect_database_architecture()` plus local source inventory.
- Heuristics are intentionally conservative; each finding should be confirmed before schema changes.
- The full raw metadata is in `reports/architecture-inspection-report.json`.
