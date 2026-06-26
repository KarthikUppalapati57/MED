# Schema Transition Post-Mortem: Shared Public Tenancy

As the Data/Schema Architect, here is the exact, categorized list of differences and issues resulting from the complete removal of the schema-per-tenant model. Every delta is mapped by its operational impact to determine whether it changes meaning or just names.

## Category 1: Semantic & Structural Shifts (High Risk)
*These changes break backward compatibility and change the fundamental meaning and access patterns of the data.*

> [!WARNING]
> **Trigger:** 
> When a user uploads an invoice, it gets stuck indefinitely in the "Extracting..." or "Uploading..." state on their dashboard. The UI never automatically updates to show the invoice as "Review Required" or "Processed" without the user manually refreshing the page.

**Mechanism:** 
In `code/src/pages/Invoices.jsx`, the application attempts to establish a real-time WebSocket connection to listen for updates by dynamically constructing a legacy schema namespace (e.g., `tenant_myorg_12345678`). When the background edge function successfully completes extraction and updates the invoice in the `public` schema, the UI's real-time listener completely ignores the event because it is looking at the wrong namespace.

**Root Cause:** 
**Incomplete architectural modernization.** The database layer was flattened to a single `public` schema (meaning all data mutations occur there), but the front-end read paths and real-time listeners still hold remnant logic that anticipates physical namespace-level isolation.

---

## Category 2: Additive & Exposing Changes (Medium Risk)
*These changes do not immediately break queries but silently expand the schema's footprint and potentially expose new data layers.*

> [!CAUTION]
> **Trigger:** 
> A user or background job queries a secondary operational table (like `approval_steps` or `invoice_action_reasons`) and inadvertently retrieves records belonging to other restaurants or organizations. The application continues to function normally, but data is visibly leaking across tenant boundaries.

**Mechanism:** 
When the client issues a standard query (e.g., `supabase.from('approval_steps').select('*')`), PostgreSQL executes this against the `public` schema. Because we removed the tenant namespace, the query relies entirely on Row Level Security (RLS) to act as a filter. If that specific table lacks an `organization_id` column or an active RLS policy, the query successfully returns every record for every organization in the entire system.

**Root Cause:** 
**Implicit Trust vs. Explicit Defenses.** Under the old model, the database relied on the physical schema boundary (`tenant_xxx`) to isolate data. Because of this implicit physical barrier, many secondary tables were never given strict RLS policies. By migrating to a shared public schema, we added all global data into a single pool. Because the structural defenses were not retrofitted to match this new exposure, the data is structurally exposed by default.

---

## Category 3: Syntactic & Cosmetic Changes (Low Risk)
*These changes break queries syntactically but do not change the underlying shape or semantic meaning of the data.*

> [!NOTE]
> **Trigger:** 
> Developers, operators, or administrators looking at the codebase, logs, or the UI get confused. They see UI dashboards labeled `TenantMigrationPanel`, debug logs reporting "routing to target schema," and edge functions accepting a `targetSchema` variable. This leads the team to falsely believe the old, complex architecture is still active.

**Mechanism:** 
In `code/supabase/functions/invoice-processing/index.ts`, the background worker accepts a `schemaName` variable and references it in console logs. However, because the database has been flattened, the Supabase client functionally ignores it and writes directly to `public` by default. Similarly, the UI still imports and renders `TenantMigrationPanel.jsx`, presenting controls for a migration that no longer exists.

**Root Cause:** 
**Dead Code & Ghost Syntax.** When the massive structural shifts were executed at the database level to destroy the tenant schemas, the application layer was only updated enough to keep it functioning. The corresponding search-and-replace sweeps, file deletions, and dead-code elimination passes were not executed. The data's meaning is fully protected and functions perfectly under the new model, but the codebase syntax is still haunted by the names of the old architecture.

---

## Architectural Review Q&A

### Q1: Realtime UI Connections vs. Backend Triggers
> **User Comment:** "so, the legacy namesapce connected from the UI , how good is the approch as long as i know the triggers to dB should br in teh backend logic or api Right?"

**Answer:** 
The approach of having the UI listen directly to the database via WebSockets (Supabase Realtime) is actually a highly efficient and correct architectural pattern for modern real-time applications. It bypasses the need for the UI to constantly poll the API or for the backend to push events through a separate message broker.
The structural flaw in this specific case is *not* that the UI is listening to the database directly, but rather that the UI is hardcoded to listen to a legacy `tenant_xxx` channel instead of the `public` channel where the actual backend updates are happening. The correct fix is to update the UI's subscription to listen to `public.invoices` and apply a filter (e.g., `organization_id=eq.YOUR_ORG_ID`) to ensure it only receives relevant events securely.

### Q2: RLS Enforcement on Shared Public Tables
> **User Comment:** "check the new db schema for RLS on all the the tables. list out tables which needs this RLS enforcement and propose a plan to implement tenant boiundaries"

**Answer:** 
According to the `database_modernization_inventory_2026-06-24.md` report, there are currently **50 canonical operational tables** that lack adequate RLS or ownership scopes, posing a severe cross-tenant data leak risk. 

*High-Risk Tables Requiring Immediate RLS Enforcement:*
`accounting_sync_logs`, `api_keys`, `approval_instances`, `approval_steps`, `budget_targets`, `closed_periods`, `count_sessions`, `count_sheets`, `credit_requests`, `domain_events`, `edi_transmissions`, `employee_shifts`, `employees`, `general_ledger_entries`, `gl_mappings`, `integrations`, `intercompany_transfers`, `invoice_allocations`, `invoice_documents`, `invoice_ingestion_jobs`, `invoice_line_matches`, `ledger_entries`, `ledger_payments`, `payments`, `pos_items`, `pos_menu_mapping`, `pos_sales_data`, `processing_jobs`, `purchase_card_transactions`, `purchase_cards`, `purchase_order_items`, `purchase_orders`, `receivings`, `reconciliation_variances`, `scheduled_payment_invoices`, `scheduled_payments`, `smart_prep_plans`, `tolerance_configurations`, `vendor_aliases`, `vendor_issues`, `vendor_item_mappings`, `vendor_item_prices`, `vendor_items`, `vendor_statement_lines`, `vendor_statements`, `vendors`, `wastage_logs`, `webhook_delivery_logs`, `webhook_endpoints`, `webhook_events_queue`.

**Implementation Plan for Tenant Boundaries:**
1. **Schema Audit:** Verify whether each of the 50 tables natively contains an `organization_id` column (the `database_modernization_inventory` indicates that 4 tables explicitly lack parent scopes).
2. **Migration Generation:** Write a single, comprehensive SQL migration that:
   - Adds `organization_id UUID REFERENCES organizations(id)` to any table missing it.
   - Enables RLS on all 50 tables (`ALTER TABLE public.table_name ENABLE ROW LEVEL SECURITY;`).
   - Applies a standard tenant boundary policy: `CREATE POLICY "tenant_isolation" ON public.table_name FOR ALL USING (organization_id = public.get_my_org() OR public.get_my_org() IS NULL);`
3. **Application Verification:** Ensure that all insert queries and RPCs populate `organization_id` correctly.

### Q3: Systematic Dead-Code Elimination
> **User Comment:** "can you systemantically check all the references to the old architecture including coloum names, "

**Answer:** 
Yes, a systematic check has already been performed by our modernization audit. The `database_modernization_inventory_2026-06-24.md` report flagged exactly **47 files** that still inappropriately reference `tenant-schema`, `tenant-registry`, or legacy `tenant-routed` artifacts.

To systematically eliminate these ghost syntax references, we will execute the following pass:
1. **Targeted Deletions:** Delete completely deprecated files (e.g., `src/components/platform/TenantMigrationPanel.jsx`, `src/lib/tenantCutover.js`, and the 15+ legacy `tenant_*` SQL migrations).
2. **Search-and-Replace:** Globally search the codebase for regex patterns like `tenant_`, `targetSchema`, `tenantRouting`, and replace them with standard `public` routing paths.
3. **Edge Function Cleanup:** Remove unused parameters (like `schemaName`) from edge functions such as `invoice-processing/index.ts` and ensure they default to standard public behavior without generating dead code.
