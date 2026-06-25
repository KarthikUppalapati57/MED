# MEVS Shared Public Tenancy Modernization Runbook

Status: active execution plan

Decision date: 2026-06-24

## Architecture Decision

MEVS is removing schema-per-tenant as a core database model. The target
architecture is a hardened shared public-table multi-tenant database:

- `public` tables are the canonical OLTP data plane.
- `organization_id` is the hard tenant boundary on every tenant-owned business table.
- `brand_id` and `location_id` enforce sub-tenant access where relevant.
- RLS/RBAC is the security boundary, backed by database membership tables and helper functions.
- Financial workflow mutations must happen through tenant-safe server-side RPCs.
- Reporting tables, materialized views, and analytics models are derived and rebuildable.
- Schema-per-tenant artifacts are deprecated and retained only until audit/back-migration is complete.

## Non-Negotiable Rules

- No new tenant schema provisioning.
- No new tenant-owned table without `organization_id`.
- No new financial state transition from frontend-only orchestration.
- No derived table can become the source of truth.
- No RLS policy without a matching cross-tenant denial test.
- No production schema change without a migration, rollback/repair note, test plan, and documentation update.

## Phase 0: Governance Freeze

Objective: stop the architecture from drifting while cleanup begins.

Required actions:

- Apply `20260624000016_freeze_schema_per_tenant_default.sql`.
- Confirm the old `auto_provision_new_tenant_schema` trigger is gone.
- Confirm new organizations receive `tenant_registry.read_mode = 'public'` and `write_mode = 'public'`.
- Keep existing tenant schemas untouched until back-migration verification is complete.
- Disable `VITE_TENANT_SCHEMA_ACCESS_ENABLED`, `VITE_TENANT_SCHEMA_READS_ENABLED`, and `VITE_TENANT_SCHEMA_WRITES_ENABLED` in all deployed environments.

Success criteria:

- New tenant onboarding does not create a schema.
- New tenant onboarding writes to canonical public tables.
- The app does not route ordinary entity access through tenant-schema RPCs.

## Phase 1: Discovery And Assessment

Objective: inventory every object that can affect tenancy, access, or source-of-truth ownership.

Inventory:

- Public tables, views, materialized views, indexes, constraints, triggers, functions, and RLS policies.
- Tenant schemas and row counts by tenant/table.
- `tenant_template` and `tenant_template_tables`.
- Tenant routing RPCs: `tenant_select_rows`, `tenant_insert_row`, `tenant_update_row`, `tenant_delete_row`.
- Workflow RPCs that directly read/write `public` tables.
- Edge Functions using service-role access.
- Storage buckets and storage RLS policies.
- Realtime subscriptions and event triggers.

Success criteria:

- Each DB object is classified as `canonical`, `derived`, `control_plane`, `deprecated`, or `candidate_remove`.
- Every table has an owner, domain, lifecycle, and tenant scope.
- Every service-role function has an access validation path.

## Phase 2: Business Domain Ownership

Objective: make table ownership unambiguous before cleanup.

Initial domains:

- Identity and Access
- Organizations, Brands, and Locations
- Invoices and AP Routing
- Payments and Payouts
- Accounting and Ledger
- Vendors and Procurement
- Inventory and Recipes
- Documents and Intake
- Integrations and Webhooks
- Reporting and Analytics
- Audit, Events, and Observability

Success criteria:

- No table is owned by more than one domain.
- Cross-domain workflows have explicit RPC/event contracts.

## Phase 3: Canonical Data Ownership

Objective: remove duplicate source-of-truth ambiguity.

Current decisions:

- `invoice_line_items` is canonical; `invoices.line_items` is compatibility/cache only.
- `payments` is canonical for payment execution; `fact_payments` is derived analytics only.
- `invoices` is canonical for AP invoice header/workflow state.
- `ledger_bills`, `ledger_payments`, `ledger_entries`, and `general_ledger_entries` are accounting representations, not invoice/payment replacements.
- `fact_*`, `dim_*`, `mv_*`, `v_*`, and `vw_*` are derived/read models.
- `archived_*` tables are retention/history.

Required actions:

- Audit all app, RPC, trigger, and Edge Function reads/writes for the tables above.
- Add consistency checks where compatibility fields remain.
- Classify empty/future tables before adding new UX on top of them.

Success criteria:

- One canonical write path exists for each business fact.
- Derived models can be rebuilt from canonical public tables.

## Phase 4: Shared Tenant Access Hardening

Objective: make the shared public model safe for 10,000 customers.

Required table contract:

- `organization_id` on every tenant-owned table.
- `brand_id` when brand-scoped.
- `location_id` when location-scoped.
- `created_at` and `updated_at`.
- `created_by` and `updated_by` where auditability matters.
- `deleted_at` where soft deletion is supported.

Required index patterns:

- `(organization_id)`
- `(organization_id, status)`
- `(organization_id, brand_id)`
- `(organization_id, location_id)`
- `(organization_id, vendor_id)`
- `(organization_id, created_at)`
- Domain-specific indexes for invoice date, payment status, AP route, and external provider IDs.

Required RLS/RBAC model:

- `platform_admin`: platform-wide.
- `org_owner`: organization-wide.
- `brand_manager`: assigned brands.
- `location_manager`: assigned locations.
- `ground_staff` or staff roles: assigned location workflows only.
- `service_role`: backend jobs only, with internal tenant validation.

Success criteria:

- Tenant A cannot read, update, delete, or infer Tenant B data.
- Location-scoped users cannot access unrelated locations.
- Role escalation is only possible through audited admin RPCs.

## Phase 5: Financial Workflow Consolidation

Objective: remove frontend orchestration from critical financial state changes.

Required server-side RPCs:

- `approve_invoice_and_route(p_invoice_id)`
- `schedule_invoice_payment(...)`
- `record_invoice_payment(...)`
- `release_invoice_funds(...)`
- `record_payment_ledger(...)`

Workflow requirements:

- Lock rows with `FOR UPDATE` before state transitions.
- Validate caller role and tenant scope inside the RPC.
- Enforce AP route before payment scheduling/release.
- Create payment history only for confirmed payment events.
- Create ledger records atomically with payment/invoice transitions.
- Emit audit/domain events.
- Return a UI destination, not UI-owned business logic.

Success criteria:

- Invoice approval, AP routing, payments, payouts, and ledger updates cannot diverge.
- A failed workflow rolls back cleanly.
- Every financial mutation has an audit trail.

## Phase 6: Event, Realtime, And Reporting

Objective: separate OLTP from read models and user notifications.

Required actions:

- Standardize domain events such as `invoice.approved`, `invoice.routed`, `payment.scheduled`, `payment.released`, `payment.completed`, and `ledger.entry_created`.
- Route realtime subscriptions against public tables/events using tenant scope.
- Rebuild `fact_*`, `dim_*`, dashboard summaries, and materialized views from canonical tables.

Success criteria:

- Reporting tables are rebuildable.
- Realtime updates do not depend on tenant schemas.
- Dashboard queries avoid large client-side aggregations.

## Phase 7: Observability, Backup, And Release Gates

Objective: make production drift visible.

Required checks:

- `npm run check:schema`
- `supabase db lint --linked`
- backend RLS/RBAC tests
- tenant index coverage checks
- service-role function exposure checks
- slow query and table growth monitoring
- PITR and restore drill documentation

Success criteria:

- A migration cannot silently weaken tenant isolation.
- A release cannot ship with known schema connectivity failures.
- Restore procedure is tested, not merely documented.

## Phase 8: Tenant-Schema Back-Migration And Removal

Objective: remove schema-per-tenant artifacts after proving public data completeness.

Required actions:

- For each tenant schema, count rows by table.
- Back-merge rows into canonical public tables with the correct `organization_id`.
- Validate counts and business totals.
- Run workflow smoke tests for migrated tenants.
- Mark the tenant registry row with `schema_migration_status = 'merged_to_public'` in metadata.
- Only then drop tenant schemas and tenant-routing functions.

Do not remove:

- `tenant_registry` until all code, ops reports, and audit tooling no longer depend on it.

Success criteria:

- No live tenant data remains outside public canonical tables.
- No application code references tenant-schema routing.
- No migration propagates changes to `tenant_template`.
