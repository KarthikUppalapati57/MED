# Restops Module Architecture Audit

Generated: 2026-06-24

Scope: frontend routes, sidebar/module registry, entity client, Supabase migrations, Edge Functions, webhook/realtime wiring, and the invoice to payments workflow.

## Executive Summary

The system is broad and moving in the right direction, but it is not perfectly aligned yet. The biggest foundation issue is that module boundaries are inconsistent:

- The sidebar has many workflow-level submenu routes.
- `moduleConfig.js` gates only page-level modules.
- Several real pages are not assigned to any module and therefore bypass subscription gating.
- Many submenu artifacts are tabs inside large pages, not independently permissioned or auditable workflows.
- The tenant-schema migration is partial: `apiClient` can route many reads/writes through tenant RPCs, but several RPCs, realtime subscriptions, Edge Functions, and legacy queries still hit `public`.

The paid-invoice behavior is not purely a bug. The code intentionally creates a completed `payments` record for invoices already marked paid, so they appear in payment history. The confusing/broken part is that the UI says “sent to Bill Pay” and redirects to `/Payments?tab=history`, while `Payments.jsx` now reads nested paths such as `/Payments/history`. That mismatch can land the user on the payable queue and make paid invoices look like they were routed incorrectly.

## Critical Findings

### 1. Module Gating Is Incomplete

Code references:

- `src/lib/moduleConfig.js`
- `src/Layout.jsx`
- `src/components/ProtectedModule.jsx`

`isPageInEnabledModules()` allows pages that are not mapped to a module. That means any routed page missing from `MODULE_DEFINITIONS` is effectively ungated after role checks.

Pages visible in navigation but not cleanly covered by `MODULE_DEFINITIONS` include:

- `ExecutiveBI`
- `CustomReports`
- `FoodSafety`
- `VendorBidding`
- `DeliveryAggregator`
- `TimeClock`
- `TipPooling`
- `PayrollExport`
- `ShiftBoard`
- `OrderOnline`
- `Billing`
- `CRM`
- `KDS`
- `DigitalMenu`
- `AuditVault`

Impact: subscription controls, module availability, and tenant packaging are unreliable.

Fix: make module lookup fail-closed for authenticated app pages, then explicitly map every route in `router.jsx` to a module/submodule.

### 2. URL Strategy Is Split Between Nested Routes and Query Tabs

Confirmed examples:

- Payments expects nested path: `src/pages/Payments.jsx` derives `activeTab` from `/Payments/:subpath`.
- Invoices redirects paid invoices to old query style: `navigate('/Payments?tab=history&invoice=...')`.
- Notifications still points to `/Payments?tab=invoices`.
- Dashboard has links using `?tab=` for pages that now use nested route paths.
- Restaurant Setup still uses `?tab=` intentionally.

Impact: users can land on the wrong tab, active sidebar state is unreliable, and deep links are brittle.

Fix: define one canonical subroute scheme per page and update all links through a helper, for example `createModuleUrl('Payments', 'history', params)`.

### 3. Paid Invoice Routing Is Intentionally Creating Payment History

Code reference: `src/pages/Invoices.jsx`, `finalizeApprovedInvoiceWorkflow()`.

When an invoice is already paid:

1. It updates the invoice to `status: 'paid'`, `payment_status: 'paid'`.
2. It checks for existing completed payments.
3. If none exists, it creates a completed `payments` row.
4. It records payment ledger.
5. It redirects to Payments history.

That is valid if the business rule is: “paid invoice uploads must create AP payment history for reconciliation.”

The broken parts:

- Toast says “Paid invoice approved and sent to Bill Pay,” which implies payable queue.
- Redirect uses stale query-tab URL.
- Payments filter includes a `Paid` option even though default queue excludes paid invoices.
- Backend extraction marks paid based on AI confidence and can set `payment_status: 'paid'` before a human confirms the evidence.

Fix:

- Rename message to “Paid invoice approved and recorded in Payment History.”
- Redirect to `/Payments/history?invoice=...`.
- Keep paid invoices out of Payable Queue unless the user explicitly opens Payment History.
- Require human confirmation or strong evidence display before AI-extracted paid status creates history.

### 4. Tenant Schema Cutover Is Partial

Code references:

- `src/lib/apiClient.js`
- `supabase/functions/invoice-processing/index.ts`
- `supabase/migrations/128_fix_lint_errors.sql`
- `supabase/migrations/20260624000007_vendor_ap_routing.sql`

`apiClient` routes many entities through `tenant_select_rows`, `tenant_insert_row`, and `tenant_update_row` when env flags are enabled. But many RPCs still operate only on `public`, including `schedule_invoice_payment`, `schedule_payment_batch`, and parts of invoice processing autopay logic.

Impact: a tenant-schema invoice can be read/updated through one path, while scheduling/payment/autopay updates may mutate `public.invoices` instead. That creates “module not connected” symptoms.

Fix: all workflow RPCs must resolve the tenant route internally or be called through tenant-aware wrappers.

### 5. Webhook and Realtime Wiring Is Fragmented

Confirmed surfaces:

- Invoice extraction trigger migrations are created, dropped, then restored.
- Realtime subscriptions mix `public` and tenant schema targets.
- Webhook dispatcher exists, but several integrations are still placeholders or direct function calls.

Impact: different environments can drift depending on migration history and env flags. Some UI updates may never arrive if the app subscribes to `public` while data lives in tenant schemas, or vice versa.

Fix: document active trigger inventory, add a DB smoke script that verifies expected triggers per tenant schema, and standardize realtime schema selection per entity.

## Module-Wise Artifacts

| Module | Implemented Artifact | Primary Tables / RPCs / Functions | Alignment Status | Missing / Risk |
| --- | --- | --- | --- | --- |
| Dashboard | `src/pages/Dashboard.jsx`, dashboard widgets | summary RPCs, notifications, invoices, inventory, sales/labor data | Partial | Several links use stale `?tab=` URLs; some dashboard tasks pass module keys/pages inconsistently. |
| Performance | `src/pages/Performance.jsx`, performance widgets | `get_performance_dashboard_metrics`, PnL, labor variance, menu engineering, benchmarks | Partial | Good tab coverage, but many aggregates depend on data completeness from POS, labor, invoices, and inventory. |
| Inbox | `src/pages/Notifications.jsx`, bell in `Layout.jsx` | `notifications`, realtime insert/update | Partial | Navigation treats Inbox as `Notifications`, but user module list names Inbox; link targets include stale payment query URLs. |
| Invoices | `src/pages/Invoices.jsx`, invoice components | `invoices`, `invoice_line_items`, `invoice-processing`, `sync_invoice_products`, approval/workflow RPCs | High but fragile | AI paid detection can set paid early; approval finalization mixes invoice, inventory, ledger, payment history, and routing. |
| Payments | `src/pages/Payments.jsx`, payment modal/forms | `payments`, `payment_accounts`, `schedule_invoice_payment`, `record_invoice_payment`, Stripe/PayPal forms | Partial | Query loads invoices broadly then filters in memory; paid history behavior is valid but messaging/routing is wrong. |
| Payable Queue | `Payments/invoices` tab | invoices where AP route is payments and not paid | Partial | Missing DB-level filter for `ap_routing_destination='payments'` and unpaid status. |
| Scheduled Payments | `Payments/schedule` tab, scheduled payment RPCs | `scheduled_payments`, `scheduled_payment_invoices`, invoice schedule fields | Partial | RPC currently targets `public`; batch scheduling must become tenant-aware. |
| Payment History | `Payments/history` tab | `payments` | Good intent | Paid invoice redirect uses stale query URL; should deep-link to nested history route. |
| Reconciliation | `Payments/reconciliation`, accounting reconciliation | payments, invoices, ledger, vendor statements | Partial | Multiple reconciliation concepts live in Payments, Accounting, Vendors, and Invoices without one source of truth. |
| Gateway Setup | `Payments/setup`, gateway modal/forms | Stripe/PayPal/bank/manual forms, payment settings | Partial | Checkout and some Stripe paths are mock/dev or incomplete. |
| Platform Subscription | `Payments/subscription`, `Billing.jsx` | plans, Stripe portal/checkout functions | Weak | `create-checkout-session` returns mock checkout URL; real billing lifecycle not production-ready. |
| Products | `src/pages/Products.jsx` | products, global items, vendor items, price variances | Partial | Sidebar subitems do not exactly match tabs: “master catalog” maps to all products/global items, “AI verification” exists as tab. |
| Inventory | `src/pages/Inventory.jsx`, inventory components | inventory, movements, counts, wastage, POS depletion | Partial | Many submenus are tabs/widgets; POS sync has mock generated sales in UI path. |
| Orders | `src/pages/AutoOrdering.jsx` | auto_orders, purchase_orders, receivings, transfers, invoices | Partial | Uses tabs for PO/place order/invoice approval/receiving; invoice approval overlaps Invoices module. |
| Smart Prep | `src/pages/SmartPrep.jsx`, smartprep cron | smart_prep_plans, recipes, forecasts | Partial | Forecasting depends on POS/inventory quality; cron path needs env/secret validation. |
| Commissary | `src/pages/Commissary.jsx` | intercompany transfers, locations, inventory | Partial | Connected to inventory/transfers but module registry includes it under Inventory, not standalone. |
| Recipes | `src/pages/Recipes.jsx`, Menu Engineering page | recipes, products, recipe ingredients, PMIX mapping | Partial | Menu engineering exists both as Recipes subitem and standalone page. |
| Vendors | `src/pages/Vendors.jsx`, vendor list/detail tabs | vendors, vendor_items, vendor_statements, vendor AP routing | Strong surface, partial backend | Vendor statements upload is mocked; AP routing is newly added and not fully propagated to all payment RPCs. |
| Labor | `src/pages/Labor.jsx`, scheduling/time/payroll pages | employees, shifts, time clock, payroll/tips | Partial | Several labor submodules are separate pages not mapped in module registry. |
| Accounting | `src/pages/Accounting.jsx`, accounting components | ledger_bills, ledger_entries, ledger_payments, GL mappings, exports | Partial | Bill Pay appears in Accounting and Payments; sync-accounting Edge Function is still demo/stubbed. |
| Organization Settings | `src/pages/OrgManagement.jsx` | organizations, brands, locations, roles, approval policies | Partial | Page has nested tabs, but module registry groups this under admin and sidebar labels differ. |
| Team Members | `src/pages/UserManagement.jsx` | profiles, invitations, roles | Partial | Team Members is mapped as admin page; custom roles also appears under Org Settings. |
| Restaurant Setup | `src/pages/RestaurantSetup.jsx` | integrations, POS config, notification/settings | Partial | Uses query-string tab pattern while most newer modules use nested path tabs. |
| Integrations Hub | `src/pages/Integrations.jsx`, Developer Portal | integrations, api_keys, webhook endpoints/logs, POS/accounting/EDI | Partial | Several functions are placeholders; MCP server menu item not represented as a concrete module/page. |
| Audit Logs | `src/pages/AuditLogs.jsx`, platform audit logs | audit_logs, event logs, webhook logs | Partial | Org audit and platform audit are separate routes; audit consistency depends on all workflows writing events. |

## Dependency Hotspots

### Invoice to Payments to Accounting

Intended flow:

`Invoice upload -> extraction -> review -> approval -> AP routing -> payable queue OR storage/accounting/history -> payment/schedule/record -> ledger -> reconciliation/export`

Current risk:

- AI extraction can set `payment_status`.
- Approval finalization handles routing in frontend.
- Payment scheduling/recording uses RPCs that are not clearly tenant-routed.
- Ledger write happens in frontend helpers and RPCs.
- Reconciliation exists in multiple modules.

Recommended architecture:

Move final AP routing and “paid invoice history creation” into one server-side RPC, for example `approve_invoice_and_route(p_invoice_id)`, which:

- Locks invoice row.
- Resolves vendor AP preference.
- Writes `ap_routing_destination`.
- Creates ledger bill only for unpaid payable/accounting flows.
- Creates payment history only for confirmed already-paid invoices.
- Emits audit/event rows.
- Returns destination for UI navigation.

### Vendor AP Routing

New artifacts:

- `src/lib/apRouting.js`
- `supabase/migrations/20260624000007_vendor_ap_routing.sql`
- vendor accounting controls and statements update route preference.

Risk:

- New invoice route resolution happens in frontend at approval time.
- Historical invoice route is captured, which is good.
- But scheduling and batch payment RPCs do not validate `ap_routing_destination`.

Fix:

- Enforce route in DB: payment RPCs should reject invoices where `ap_routing_destination <> 'payments'`.
- Backfill unresolved approved invoices.

### Realtime and Cache

Risks:

- Payments subscribes to `public.payments` and `public.invoices`.
- Invoices dynamically subscribes to tenant schema.
- Layout notifications/org subscriptions use `public`.
- Query keys are inconsistent: `['invoices-dashboard', orgId]`, `['invoices-payments', orgId, ...]`, `['payments', orgId, ...]`, and several generic invalidations.

Fix:

- Centralize realtime subscription schema resolution.
- Centralize query key factories by entity/scope.
- Avoid generic invalidations except after global admin changes.

## Latency and Performance Risks

Already improved:

- Route lazy loading exists.
- High-volume tables use paginated queries and visible-row windowing.
- Bundle budget scripts exist.

Remaining:

- Payments fetches invoice pages then filters AP route/payment status client-side. Add server/RPC filters.
- Dashboard remains dependent on many cross-module aggregates.
- Realtime invalidation can still over-refresh broad query prefixes.
- Client-side EmailJS for transactional emails can add user-perceived latency and weak delivery guarantees.
- Edge Functions that call external APIs need timeouts, retry strategy, idempotency keys, and delivery logs.

## Stubbed or Not Production-Ready Integrations

Found production-path placeholders:

- `create-checkout-session`: mock Stripe token and mock checkout URL.
- `stripe-webhook`: signature verification left as production TODO.
- `pos-webhook`: signature verification not implemented.
- `sync-accounting`: mock accounting sync.
- `sync-delivery-menus`: mock provider calls.
- `calculate-royalties`: mock gross sales.
- `process-marketing`: simulated dispatch.
- `iot-ingest`: alert dispatch placeholder.
- `CreditRequestDialog`: mock photo upload.
- `VendorStatementsTab`: mock upload.
- `AIVendorAnalyst`: mock responses.
- `CustomReports`: mock report data.

These need to be marked in the module artifact inventory as incomplete integrations.

## Recommended Fix Order

1. Fix paid-invoice routing language and URL: change redirect to `/Payments/history?invoice=...` and toast to “recorded in Payment History.”
2. Add DB/RPC guard so payable queue/payment scheduling only accepts `ap_routing_destination='payments'` and unpaid invoices.
3. Convert invoice approval finalization into one server-side RPC.
4. Replace permissive unmapped-page behavior in `moduleConfig.js` with explicit route mapping.
5. Normalize all tabs to nested routes or query params per page, then update all links.
6. Make schedule/payment/batch RPCs tenant-schema aware.
7. Add `scripts/module-artifact-audit.mjs` to assert every route has a module, every sidebar item has a route, and every named module has at least page/component/table artifacts.
8. Replace or clearly flag mock integrations before demoing those modules as real.

## Immediate Diagnosis: Why Paid Invoices Are Going To Payments

Because the current workflow treats “uploaded invoice already paid” as a payment-history event:

- `invoice-processing` may set `payment_status: 'paid'` from extraction evidence.
- `Invoices.jsx` sees paid status during approval.
- `finalizeApprovedInvoiceWorkflow()` creates a completed `payments` row if none exists.
- The UI redirects to Payments.

This is acceptable only if Payments means “AP payments ledger/history.” It is wrong if the user expects Payments to mean only “Payable Queue.”

The fix is not to delete payment history creation. The fix is to split semantics:

- Payable Queue: approved, unpaid, routed to payments.
- Payment History: completed payment records, including invoices uploaded after payment.
- Storage/Accounting: approved invoices that should not be paid through Bill Pay.

