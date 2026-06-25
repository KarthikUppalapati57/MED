# Database Modernization Inventory

Generated: 2026-06-25T14:16:06.852Z

Source schema artifact: `live_workflow_schema_audit.json` (2026-06-16T22:49:16.788Z)

## Executive Findings

- Tables inventoried: 123
- Classification counts: `public_intake` 3, `canonical` 67, `archive` 6, `unclassified` 14, `access_control` 14, `derived` 14, `system` 4, `global_reference` 1
- SQL functions found in migrations/source: 146
- RLS policies found in migrations/source: 314
- Triggers found in migrations/source: 76
- Files still referencing schema-per-tenant artifacts: 47
- Files referencing service-role access: 83

## Risk Summary

| Risk | Count |
| `empty_canonical_table_review` | 50 |
| `missing_organization_id_or_parent_scope_review` | 4 |
| `needs_domain_classification` | 14 |

## Canonical Operational Tables

| Table | Rows | organization_id | brand_id | location_id | Code refs |
| `accounting_export_queue` | 1 | yes | no | no | 3 |
| `accounting_sync_logs` | 0 | yes | no | no | 3 |
| `ai_insights` | 1 | yes | no | no | 5 |
| `api_keys` | 0 | yes | no | no | 6 |
| `approval_instances` | 0 | no | no | no | 4 |
| `approval_policies` | 8 | yes | no | no | 3 |
| `approval_steps` | 0 | parent | no | no | 4 |
| `budget_targets` | 0 | yes | yes | yes | 6 |
| `closed_periods` | 0 | yes | no | no | 2 |
| `count_sessions` | 0 | yes | no | no | 4 |
| `count_sheets` | 0 | yes | no | yes | 4 |
| `credit_requests` | 0 | yes | no | yes | 3 |
| `domain_events` | 0 | yes | no | no | 2 |
| `edi_transmissions` | 0 | yes | no | no | 2 |
| `employee_shifts` | 0 | yes | no | yes | 19 |
| `employees` | 0 | yes | no | yes | 11 |
| `general_ledger_entries` | 0 | yes | no | no | 5 |
| `gl_mappings` | 0 | yes | no | no | 5 |
| `integrations` | 0 | yes | no | no | 8 |
| `intercompany_transfers` | 0 | yes | no | no | 4 |
| `inventory` | 8 | yes | yes | yes | 27 |
| `inventory_movements` | 3 | yes | no | yes | 11 |
| `invoice_action_reasons` | 5 | no | no | no | 1 |
| `invoice_allocations` | 0 | yes | no | yes | 7 |
| `invoice_audit_events` | 3 | yes | no | no | 4 |
| `invoice_documents` | 0 | yes | no | no | 2 |
| `invoice_ingestion_jobs` | 0 | yes | no | no | 2 |
| `invoice_line_items` | 14 | yes | no | no | 16 |
| `invoice_line_matches` | 0 | yes | no | no | 3 |
| `invoices` | 6 | yes | yes | yes | 78 |
| `ledger_bills` | 1 | yes | no | no | 5 |
| `ledger_entries` | 0 | yes | no | no | 3 |
| `ledger_payments` | 0 | yes | no | no | 5 |
| `location_groups` | 1 | yes | no | no | 2 |
| `operational_settings` | 2 | yes | yes | yes | 3 |
| `payment_accounts` | 8 | yes | yes | yes | 7 |
| `payments` | 0 | yes | yes | yes | 32 |
| `pos_items` | 0 | yes | no | yes | 4 |
| `pos_menu_mapping` | 0 | yes | no | no | 5 |
| `pos_sales_data` | 0 | yes | no | yes | 15 |
| `processing_jobs` | 0 | yes | no | no | 4 |
| `products` | 8 | yes | yes | yes | 28 |
| `purchase_card_transactions` | 0 | yes | yes | yes | 1 |
| `purchase_cards` | 0 | yes | yes | yes | 1 |
| `purchase_order_items` | 0 | parent | no | no | 6 |
| `purchase_orders` | 0 | yes | no | yes | 6 |
| `receivings` | 0 | yes | no | no | 8 |
| `recipe_ingredients` | 3 | yes | no | no | 9 |
| `recipes` | 4 | yes | yes | yes | 16 |
| `reconciliation_variances` | 0 | yes | no | no | 4 |
| `scheduled_payment_invoices` | 0 | parent | no | no | 5 |
| `scheduled_payments` | 0 | yes | no | no | 5 |
| `smart_prep_plans` | 0 | yes | yes | yes | 5 |
| `tolerance_configurations` | 0 | yes | no | no | 2 |
| `transfers` | 1 | yes | no | no | 6 |
| `vendor_aliases` | 0 | yes | no | no | 3 |
| `vendor_issues` | 0 | yes | no | no | 3 |
| `vendor_item_mappings` | 0 | yes | no | no | 5 |
| `vendor_item_prices` | 0 | yes | no | no | 3 |
| `vendor_items` | 0 | yes | no | no | 9 |
| `vendor_statement_lines` | 0 | parent | no | no | 3 |
| `vendor_statements` | 0 | yes | no | no | 3 |
| `vendors` | 0 | yes | yes | yes | 35 |
| `wastage_logs` | 0 | yes | yes | yes | 9 |
| `webhook_delivery_logs` | 0 | parent | no | no | 4 |
| `webhook_endpoints` | 0 | yes | no | no | 8 |
| `webhook_events_queue` | 0 | yes | no | no | 8 |

## Tables Requiring Review

| Table | Class | Rows | Risks |
| `brand_members` | access_control | 13 | `missing_organization_id_or_parent_scope_review` |
| `location_members` | access_control | 11 | `missing_organization_id_or_parent_scope_review` |
| `permissions` | access_control | 0 | `missing_organization_id_or_parent_scope_review` |
| `accounting_sync_logs` | canonical | 0 | `empty_canonical_table_review` |
| `api_keys` | canonical | 0 | `empty_canonical_table_review` |
| `approval_instances` | canonical | 0 | `missing_organization_id_or_parent_scope_review`<br>`empty_canonical_table_review` |
| `approval_steps` | canonical | 0 | `empty_canonical_table_review` |
| `budget_targets` | canonical | 0 | `empty_canonical_table_review` |
| `closed_periods` | canonical | 0 | `empty_canonical_table_review` |
| `count_sessions` | canonical | 0 | `empty_canonical_table_review` |
| `count_sheets` | canonical | 0 | `empty_canonical_table_review` |
| `credit_requests` | canonical | 0 | `empty_canonical_table_review` |
| `domain_events` | canonical | 0 | `empty_canonical_table_review` |
| `edi_transmissions` | canonical | 0 | `empty_canonical_table_review` |
| `employee_shifts` | canonical | 0 | `empty_canonical_table_review` |
| `employees` | canonical | 0 | `empty_canonical_table_review` |
| `general_ledger_entries` | canonical | 0 | `empty_canonical_table_review` |
| `gl_mappings` | canonical | 0 | `empty_canonical_table_review` |
| `integrations` | canonical | 0 | `empty_canonical_table_review` |
| `intercompany_transfers` | canonical | 0 | `empty_canonical_table_review` |
| `invoice_allocations` | canonical | 0 | `empty_canonical_table_review` |
| `invoice_documents` | canonical | 0 | `empty_canonical_table_review` |
| `invoice_ingestion_jobs` | canonical | 0 | `empty_canonical_table_review` |
| `invoice_line_matches` | canonical | 0 | `empty_canonical_table_review` |
| `ledger_entries` | canonical | 0 | `empty_canonical_table_review` |
| `ledger_payments` | canonical | 0 | `empty_canonical_table_review` |
| `payments` | canonical | 0 | `empty_canonical_table_review` |
| `pos_items` | canonical | 0 | `empty_canonical_table_review` |
| `pos_menu_mapping` | canonical | 0 | `empty_canonical_table_review` |
| `pos_sales_data` | canonical | 0 | `empty_canonical_table_review` |
| `processing_jobs` | canonical | 0 | `empty_canonical_table_review` |
| `purchase_card_transactions` | canonical | 0 | `empty_canonical_table_review` |
| `purchase_cards` | canonical | 0 | `empty_canonical_table_review` |
| `purchase_order_items` | canonical | 0 | `empty_canonical_table_review` |
| `purchase_orders` | canonical | 0 | `empty_canonical_table_review` |
| `receivings` | canonical | 0 | `empty_canonical_table_review` |
| `reconciliation_variances` | canonical | 0 | `empty_canonical_table_review` |
| `scheduled_payment_invoices` | canonical | 0 | `empty_canonical_table_review` |
| `scheduled_payments` | canonical | 0 | `empty_canonical_table_review` |
| `smart_prep_plans` | canonical | 0 | `empty_canonical_table_review` |
| `tolerance_configurations` | canonical | 0 | `empty_canonical_table_review` |
| `vendor_aliases` | canonical | 0 | `empty_canonical_table_review` |
| `vendor_issues` | canonical | 0 | `empty_canonical_table_review` |
| `vendor_item_mappings` | canonical | 0 | `empty_canonical_table_review` |
| `vendor_item_prices` | canonical | 0 | `empty_canonical_table_review` |
| `vendor_items` | canonical | 0 | `empty_canonical_table_review` |
| `vendor_statement_lines` | canonical | 0 | `empty_canonical_table_review` |
| `vendor_statements` | canonical | 0 | `empty_canonical_table_review` |
| `vendors` | canonical | 0 | `empty_canonical_table_review` |
| `wastage_logs` | canonical | 0 | `empty_canonical_table_review` |
| `webhook_delivery_logs` | canonical | 0 | `empty_canonical_table_review` |
| `webhook_endpoints` | canonical | 0 | `empty_canonical_table_review` |
| `webhook_events_queue` | canonical | 0 | `empty_canonical_table_review` |
| `ask_tom_messages` | unclassified | 4 | `needs_domain_classification` |
| `ask_tom_threads` | unclassified | 2 | `needs_domain_classification` |
| `audit_logs` | unclassified | 57 | `needs_domain_classification` |
| `auto_orders` | unclassified | 1 | `needs_domain_classification` |
| `budgets` | unclassified | 0 | `needs_domain_classification` |
| `dashboard_action_status` | unclassified | 4 | `needs_domain_classification` |
| `dashboard_escalation_rules` | unclassified | 3 | `needs_domain_classification` |
| `dashboard_handoff_notes` | unclassified | 17 | `needs_domain_classification` |
| `dashboard_report_deliveries` | unclassified | 2 | `needs_domain_classification` |
| `dashboard_report_preferences` | unclassified | 12 | `needs_domain_classification` |
| `dashboard_review_logs` | unclassified | 0 | `needs_domain_classification` |
| `notifications` | unclassified | 23 | `needs_domain_classification` |
| `webhook_events` | unclassified | 0 | `needs_domain_classification` |
| `webhook_subscriptions` | unclassified | 0 | `needs_domain_classification` |

## Schema-Per-Tenant References

These files still reference tenant-schema, tenant-template, tenant-registry, or tenant-routed RPC artifacts. They are expected during the transition, but each must be retired or justified before schema-per-tenant can be removed completely.

- `docs/database_modernization_inventory_2026-06-24.md`
- `docs/module_architecture_audit_2026-06-24.md`
- `docs/shared_public_tenancy_modernization_runbook.md`
- `docs/tenant_backmigration_backfill_apply.md`
- `docs/tenant_backmigration_backfill_dry-run.md`
- `docs/tenant_schema_migration_runbook.md`
- `scripts/db-modernization-inventory.mjs`
- `scripts/tenant-backmigration-audit.mjs`
- `scripts/tenant-backmigration-backfill.mjs`
- `scripts/tenant-modernization-audit.mjs`
- `src/components/platform/TenantMigrationPanel.jsx`
- `src/lib/tenantCutover.js`
- `src/lib/tenantReporting.js`
- `supabase/migrations/136_fix_invoice_status_constraint.sql`
- `supabase/migrations/20260618153000_create_tenant_registry.sql`
- `supabase/migrations/20260618154500_create_tenant_template_schema.sql`
- `supabase/migrations/20260618160000_provision_tenant_schema.sql`
- `supabase/migrations/20260618161500_tenant_access_routing.sql`
- `supabase/migrations/20260618163000_dual_write_mirror_infrastructure.sql`
- `supabase/migrations/20260618164500_tenant_backfill_validation.sql`
- `supabase/migrations/20260618170000_tenant_read_cutover_controls.sql`
- `supabase/migrations/20260619101500_tenant_write_cutover_controls.sql`
- `supabase/migrations/20260619103000_tenant_reporting_snapshots.sql`
- `supabase/migrations/20260619104500_fix_tenant_reporting_manifest_columns.sql`
- `supabase/migrations/20260619105000_fix_tenant_reporting_backfill_timestamp.sql`
- `supabase/migrations/20260619110000_tenant_pilot_cutover_controls.sql`
- `supabase/migrations/20260619113000_tenant_entity_read_rpc.sql`
- `supabase/migrations/20260619114500_tenant_entity_write_rpc.sql`
- `supabase/migrations/20260619115500_fix_tenant_update_row_lint.sql`
- `supabase/migrations/20260619120500_add_vendor_statements_to_tenant_manifest.sql`
- `supabase/migrations/20260619121500_tenant_vendor_statement_lines_rpc.sql`
- `supabase/migrations/20260620010000_auto_provision_new_tenants_to_schema.sql`
- `supabase/migrations/20260620011000_verify_new_tenant_auto_provisioning.sql`
- `supabase/migrations/20260624000000_invoice_schema_upgrade.sql`
- `supabase/migrations/20260624000002_fix_tenant_webhook_triggers.sql`
- `supabase/migrations/20260624000005_drop_invoice_webhook_triggers.sql`
- `supabase/migrations/20260624000006_restore_invoice_webhook_triggers.sql`
- `supabase/migrations/20260624000007_vendor_ap_routing.sql`
- `supabase/migrations/20260624000011_batch4_admin_accounting.sql`
- `supabase/migrations/20260624000016_freeze_schema_per_tenant_default.sql`
- `supabase/migrations/20260625000001_tenant_backmigration_audit_rpc.sql`
- `supabase/migrations/20260625000002_backfill_tenant_schema_missing_rows.sql`
- `supabase/migrations/20260625000003_finalize_tenant_backmigration_reconciliation.sql`
- `supabase/migrations/20260625000004_retire_schema_tenant_rpc_surface.sql`
- `supabase/migrations/20260625000005_archive_and_drop_legacy_tenant_schemas.sql`
- `supabase/migrations/20260625000015_cleanup_legacy_schema_tenant_artifacts.sql`
- `supabase/migrations/20260625000016_drop_stale_tenant_backfill_overload.sql`

## Service-Role Surfaces

Each file below must validate tenant scope internally before reading or writing tenant-owned data.

- `docs/shared_public_tenancy_modernization_runbook.md`
- `docs/solution_architecture_final_report.md`
- `docs/tenant_schema_migration_runbook.md`
- `scripts/check-release-env.mjs`
- `scripts/core-workflow-smoke-test.mjs`
- `scripts/db-modernization-inventory.mjs`
- `scripts/seed-role-qa-data.mjs`
- `scripts/supabase-latency-check.mjs`
- `scripts/tenant-backmigration-audit.mjs`
- `scripts/tenant-backmigration-backfill.mjs`
- `scripts/ui-smoke-test-role-qa-platform.mjs`
- `scripts/workflow-smoke-test-role-qa-platform.mjs`
- `supabase/functions/_shared/supabase.ts`
- `supabase/functions/api-gateway/index.ts`
- `supabase/functions/billing-worker/index.ts`
- `supabase/functions/calculate-depletion/index.ts`
- `supabase/functions/calculate-royalties/index.ts`
- `supabase/functions/checkbook-webhook/index.ts`
- `supabase/functions/create-api-key/index.ts`
- `supabase/functions/create-checkout-session/index.ts`
- `supabase/functions/create-stripe-invoice/index.ts`
- `supabase/functions/create-webhook-endpoint/index.ts`
- `supabase/functions/evaluate-vendor-bids/index.ts`
- `supabase/functions/forecast-labor/index.ts`
- `supabase/functions/generate-prep-sheet/index.ts`
- `supabase/functions/invite-client/index.ts`
- `supabase/functions/invite-user/index.ts`
- `supabase/functions/invoice-processing/index.ts`
- `supabase/functions/iot-ingest/index.ts`
- `supabase/functions/iot-webhook/index.ts`
- `supabase/functions/notify-demo-request/index.ts`
- `supabase/functions/payout-webhook/index.ts`
- `supabase/functions/pg-backup/index.ts`
- `supabase/functions/pos-sync/index.ts`
- `supabase/functions/pos-webhook/index.ts`
- `supabase/functions/process-checkbook-payout/index.ts`
- `supabase/functions/process-email-invoices/index.ts`
- `supabase/functions/process-marketing/index.ts`
- `supabase/functions/process-onboarding/index.ts`
- `supabase/functions/process-payout/index.ts`
- `supabase/functions/schedule-reports/index.ts`
- `supabase/functions/smartprep-cron/index.ts`
- `supabase/functions/stripe-webhook/index.ts`
- `supabase/functions/sync-accounting/index.ts`
- `supabase/functions/sync-delivery-menus/index.ts`
- `supabase/functions/team-worker/index.ts`
- `supabase/functions/vendor-onboarding/index.ts`
- `supabase/functions/voice-copilot-parser/index.ts`
- `supabase/functions/webhook-dispatcher/index.ts`
- `supabase/migrations/004_repair_schemas.sql`
- `supabase/migrations/014_security_hardening_and_rls_optimization.sql`
- `supabase/migrations/021_add_phone_and_check_email_exists.sql`
- `supabase/migrations/120_native_workflow_triggers.sql`
- `supabase/migrations/122_harden_native_workflow_triggers.sql`
- `supabase/migrations/135_prevent_privilege_escalation.sql`
- `supabase/migrations/20260617003000_secure_webhook_dispatcher_cron.sql`
- `supabase/migrations/20260618043000_grant_auth_helper_execute_to_api_roles.sql`
- `supabase/migrations/20260618044000_grant_access_helper_execute_to_api_roles.sql`
- `supabase/migrations/20260618143000_remove_legacy_access_levels.sql`
- `supabase/migrations/20260618154500_create_tenant_template_schema.sql`
- `supabase/migrations/20260618160000_provision_tenant_schema.sql`
- `supabase/migrations/20260618161500_tenant_access_routing.sql`
- `supabase/migrations/20260618163000_dual_write_mirror_infrastructure.sql`
- `supabase/migrations/20260618164500_tenant_backfill_validation.sql`
- `supabase/migrations/20260618170000_tenant_read_cutover_controls.sql`
- `supabase/migrations/20260619101500_tenant_write_cutover_controls.sql`
- `supabase/migrations/20260619103000_tenant_reporting_snapshots.sql`
- `supabase/migrations/20260619104500_fix_tenant_reporting_manifest_columns.sql`
- `supabase/migrations/20260619105000_fix_tenant_reporting_backfill_timestamp.sql`
- `supabase/migrations/20260619110000_tenant_pilot_cutover_controls.sql`
- `supabase/migrations/20260619113000_tenant_entity_read_rpc.sql`
- `supabase/migrations/20260619114500_tenant_entity_write_rpc.sql`
- `supabase/migrations/20260619121500_tenant_vendor_statement_lines_rpc.sql`
- `supabase/migrations/20260619122500_tenant_joined_read_rpcs.sql`
- `supabase/migrations/20260620010000_auto_provision_new_tenants_to_schema.sql`
- `supabase/migrations/20260624000000_invoice_schema_upgrade.sql`
- `supabase/migrations/20260624000003_strict_storage_rls.sql`
- `supabase/migrations/20260624000007_vendor_ap_routing.sql`
- `supabase/migrations/20260625000001_tenant_backmigration_audit_rpc.sql`
- `supabase/migrations/20260625000002_backfill_tenant_schema_missing_rows.sql`
- `supabase/migrations/20260625000003_finalize_tenant_backmigration_reconciliation.sql`
- `supabase/migrations/20260625000004_retire_schema_tenant_rpc_surface.sql`
- `supabase/migrations/20260625000005_archive_and_drop_legacy_tenant_schemas.sql`

## Next Required Actions

1. Review every `missing_organization_id_or_parent_scope_review` table and decide whether to add `organization_id` or document parent-scoped access.
2. Review every `empty_canonical_table_review` table and classify it as active, future, or candidate removal.
3. Replace app/entity usage of tenant-routed RPCs with direct public-table access protected by RLS/RBAC.
4. Inventory tenant schemas and row counts from the live database before any destructive cleanup.
5. Start Phase 4 hardening with RLS/RBAC tests for organization, brand, and location isolation.
