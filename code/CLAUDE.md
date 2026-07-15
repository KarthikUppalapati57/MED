# CLAUDE.md — MED Multi-Tenant Hardening Context

This file is standing context for any Claude (Claude Code, IDE, or chat) working on this
repo. It captures the locked decisions, completed work, pending plan, and workflow rules for
the multi-tenant security hardening of the MED restaurant-ops SaaS. **Read this fully before
making any change.** When a step is completed, update the "Status" section at the bottom.

---

## 0. What this project is

MED is a multi-tenant restaurant-operations SaaS (Supabase / Postgres, shared-table model,
React frontend, ~20 edge functions). Example tenant: **Wing Brothers LLC** (org) →
**Craven Wings** (brand) → **Craven Wings Choto** and **Craven Wings Seymore** (locations).

The DB is hybrid: an **OLTP core** (invoices, payments, inventory, orders — small fast
per-record transactions) plus an **OLAP reporting layer** (`fact_*` / `dim_*` star-schema
tables, populated by triggers from the OLTP tables). Hardening work targets the OLTP tables;
the `fact_*`/`dim_*` tables are derived reporting, not edited directly.

The hardening exists because the DB went through a schema-per-tenant → shared-table
architecture round-trip, leaving fossils (stale triggers, dual-write mirrors, legacy role
strings, org-wide RLS policies that ignore brand/location) across every module.

---

## 1. WORKFLOW RULES (non-negotiable)

- **LOCAL ONLY.** All work is tested against the local Supabase in Docker
  (container `supabase_db_gsupqfmwlsmwoybphimx`). Production (hosted DB in `.env`) is
  unreachable from the dev environment and is deployed to later, separately.
- **Apply migrations via targeted psql**, never a full reset:
  `docker exec supabase_db_gsupqfmwlsmwoybphimx psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/<file>.sql`
- **NEVER run `supabase db reset`.** Migration `026_normalize_invoice_line_items.sql`
  contains a TRUNCATE (now guarded by a row-count check, but still — do not clean-replay).
- **Every migration ships with a rollback-scoped `.sql` acceptance test** (no framework,
  no fixtures): seed → assert → `ROLLBACK`. The test is the proof the logic works.
- **One migration per step. Stop and report after each step for human review** before the
  next. This review discipline has caught every significant issue — keep it.
- **Read live state before rewriting.** Before replacing any function or policy, read its
  current live body (`pg_get_functiondef`, `pg_policies`) and report it. Never rewrite blind.
- **Drop stale policies, don't add beside them.** Postgres ORs permissive policies together,
  so a leftover org-wide policy silently defeats a new hierarchical one. Enumerate and drop
  ALL existing policies on a table before creating the new set.

---

## 2. LOCKED VOCABULARY (exact strings — getting these wrong silently breaks everything)

- **Tenancy column:** `organization_id` (NOT `tenant_id` / `org_id`).
- **Role strings (the ONLY valid ones):**
  `ground_staff`, `location_manager`, `branch_manager`, `org_owner`, `platform_admin`.
  Legacy fossils that match NOTHING and must never be used: `manager`, `owner`, `admin`,
  `brand_manager`, `org_admin`. **The brand-tier role is `branch_manager`, not
  `brand_manager`.** A policy checking `'brand_manager'` matches zero rows silently.
- **Resolvers (profiles-based, single source of truth):**
  - `get_auth_org()` → delegates to `get_my_org()` → reads `profiles.organization_id`.
  - `get_auth_role()` → reads `profiles.role`. (Do NOT read role/org from the JWT
    `app_metadata`/`user_metadata` — that was the two-source-of-truth bug; profiles wins.)
- **Scope helpers (verified correct):** `is_platform_admin()`,
  `get_my_accessible_brand_ids()`, `get_my_accessible_location_ids()`
  (the location helper already includes all locations under a branch_manager's brand).
- **Role-gate helpers (fixed in Step 1):** `is_manager_or_above()` = true for
  `location_manager`, `branch_manager`, `org_owner`, `platform_admin`; false for
  `ground_staff`. `is_admin()` / `is_owner_or_admin()` = `org_owner`, `platform_admin` only.

---

## 3. THE HIERARCHY & VISIBILITY MODEL (the heart of the system)

Hierarchy: **organization → brand → location.**

**Visibility (who can SEE a row):**
- `org_owner` → all rows in their org.
- `branch_manager` → all rows under their brand (every location in it).
- `location_manager` → only their own location's rows.
- `ground_staff` → only their own (fixed-profile) location's rows.
- `platform_admin` → everything.
- **Soft-deleted rows (`deleted_at IS NOT NULL`) are hidden from everyone**, including the
  owner. (Recovery, if ever needed, is a separate admin path — not the default.)

**Scope source — the most important rule:** an invoice's scope comes ONLY from the
**uploader's context at upload time**, NEVER from the invoice's printed content. The printed
address is unreliable (e.g. 7shifts printed a Texas address on a Choto bill; US Foods prints
the Choto address). Every invoice is stamped at insert with `organization_id` + `brand_id` +
`location_id` + `created_by`. Two locations can upload the same vendor's bill and each copy
belongs to the uploader's location.

**Context source is role-aware:**
- `org_owner` / `branch_manager` → context from the **ContextSwitcher** (they can switch
  within their accessible scope).
- `location_manager` → NO switcher. Context is FIXED to their onboarded
  `profiles.organization_id` / `brand_id` / `location_id`. The upload stamps from their fixed
  profile, never a picker.

**NULL-tier rule (financial tables):** a row with NULL `brand_id` AND NULL `location_id` is
**org-level → visible to `org_owner` / `platform_admin` only.** (Rare in practice — almost
every restaurant transaction has a location.)

---

## 4. REFERENCE vs TRANSACTIONAL SPLIT (Batch 2 model — validated against MarginEdge)

Two different scope patterns depending on whether data is shared *definitions* or per-location
*events*:

**A. REFERENCE (hybrid: brand-shared + location-specific)** — `vendors`, `products`,
`recipes`:
- A row stamped at **brand level** (brand set, location NULL) is **brand-shared** — visible to
  everyone whose accessible brands include that brand (e.g. "US Foods" → all Craven Wings
  locations).
- A row stamped at **location level** (location set) is visible only to that location and the
  managers above it (e.g. "Joe's Corner Market", a one-off local store Choto bought from →
  Choto only; Seymore never sees it).
- **Writes:** only `branch_manager` / `org_owner` / `platform_admin` may create or edit a
  **brand-shared** (location-NULL) row. A `location_manager` may create a **location-specific**
  row, auto-scoped to their own location. `ground_staff` cannot write reference tables.
- This is the MarginEdge "Global vs Restricted" model (their Sous-Chef can only create
  unit-restricted entries; making something global requires Restaurant Admin).

**B. LOCATION-SCOPED (transactional)** — `inventory`, `inventory_movements`, `wastage_logs`,
`auto_orders`, `purchase_orders`:
- Same hierarchy as the financial tables (owner all / branch his brand / location his
  location / soft-deleted hidden).
- `inventory` = live per-location stock counts (transactional, NOT the shared catalog).
- **Ground-staff writes allowed** where operational: `inventory` counts, `wastage_logs`
  (scoped to their fixed location). NOT `auto_orders` / `purchase_orders` (manager actions).
- `inventory_movements` = append + manager-update, no delete.

Principle: **reference data (what's available) is shared; transactional data (what happened at
a location) is scoped.** The vendor *list* is shared; a *purchase order* to that vendor is
location-scoped.

---

## 5. DATA INTEGRITY RULES

- **Soft-delete only. Never hard-delete or TRUNCATE tenant financial tables.** These are
  financial records (retention/audit/compliance), and in a shared-table model a TRUNCATE
  wipes ALL tenants at once. Revoke `TRUNCATE` from `anon`/`authenticated` on every tenant
  table; the app sets `deleted_at`; RLS filters `deleted_at IS NULL`.
- **Append-only tables** (`invoice_audit_events`, `ledger_entries`) get SELECT + INSERT
  policies only — no UPDATE/DELETE. They are immutable audit/accounting records.
- **Child tables inherit scope AND soft-delete from their parent invoice** via an EXISTS
  check against `invoices` (which includes `deleted_at IS NULL`). Soft-deleting an invoice
  hides its line items, documents, audit events, bills, and matches.

---

## 6. APPROVAL MODEL (tiered, amount-based, scope-aware)

Replaces the old flat "any manager who sees it first approves" model.

- **Ground staff** upload/save invoices but cannot approve.
- **Approval is by the lowest authorized tier for the invoice's amount, within its scope,
  escalating up.** Each person has a dollar ceiling: `profiles.invoice_approval_limit`.
  Invoice ≤ your limit AND in your scope → you can approve; over your limit → escalates up.
- **Two independent guardrails, both required:** SCOPE (is this invoice in your area?) via the
  RLS hierarchy, AND LIMIT (is it small enough for your authority?) via
  `invoice_approval_limit`.
- **Limit-setting cascades DOWN only:** `org_owner` sets `branch_manager` limits;
  `branch_manager` sets `location_manager` limits (his brand only). No one sets their own; no
  one grants above their own limit. Enforced in the DB function, not the UI.
- **All enforcement is DB-side, never UI-only.** The UI is not a security boundary.

Existing infra (partially built, mostly dormant): tables `approval_policies` /
`approval_instances` / `approval_steps`; column `profiles.invoice_approval_limit`; functions
`evaluate_invoice_approval_policy`, `execute_approval_step`, `approve_invoice_with_limit`
(the limit-checker — was dormant), `bulk_process_invoices`. The seeded `approval_policies` row
uses the fossil `required_role = 'org_admin'` and must be re-seeded with correct vocabulary in
the Phase 3 redesign.

---

## 7. COMPLETED WORK (all applied to LOCAL, all acceptance tests green)

- **Phase 0** — `20260628000000_remove_tenant_mirror_fossils.sql`: dropped 43 fossil
  `tenant_mirror_dual_write` triggers + the auto-register trigger and 3 mirror functions.
- **Phase 0.5** — Edited `026_normalize_invoice_line_items.sql` in place: guarded its bare
  `TRUNCATE invoices CASCADE` with a row-count check so a populated DB is never wiped.
- **Phase 1** — `20260628000001_consolidate_org_resolver_and_force_rls.sql`: `get_auth_org()`
  now delegates to profiles-based `get_my_org()` (fixed JWT-vs-profiles isolation bug); scoped
  two permissive `WITH CHECK(true)` inserts; FORCE RLS on all 121 organization_id tables;
  granted EXECUTE on resolvers to authenticated.
- **Phase 2a** — `20260628000002_consolidate_role_resolver.sql`: `get_auth_role()` now reads
  `profiles.role` instead of JWT (closed role-escalation hole). NOTE: re-check
  null-profile-role count on PRODUCTION before deploy.
- **Context plumbing** — `20260628000003_harden_context_plumbing.sql`: hardened
  `switch_user_context` (validates brand/location against accessible scope, writes profiles
  ONLY — dropped the app_metadata scope write); replaced org-wide `brands`/`locations` policies
  with hierarchical ones; fixed grants (revoked weird TRUNCATE/REFERENCES/TRIGGER from
  anon/authenticated, granted SELECT, granted EXECUTE on switch fn).
- **Step 1** — `20260628000004_fix_role_gate_helpers.sql`: rewrote `is_manager_or_above()` /
  `is_admin()` / `is_owner_or_admin()` from legacy strings to live role strings.
- **Step 2** — `20260628000005_secure_approval_primitives.sql`: revoked PUBLIC/anon EXECUTE on
  `update_user_approval_limit` / `approve_invoice_with_limit` / `bulk_process_invoices` /
  `execute_approval_step`; hardened `update_user_approval_limit` with the cascade rules; added
  `assert_can_approve_invoice_scope()`; added a `BEFORE INSERT OR UPDATE OF status, ap_status`
  trigger `enforce_invoice_approval_authorization` on `invoices` so EVERY path setting
  status=approved must pass DB-side scope/role auth.
- **Step 3 (Batch 1 financial RLS)** — `20260628000006_hierarchical_rls_batch1_financial.sql`:
  hierarchical RLS on 12 financial tables (`invoices`, `payments`, `invoice_allocations`,
  `credit_requests`, `invoice_line_items`, `invoice_documents`, `reconciliation_variances`,
  `invoice_audit_events`, `ledger_bills`, `invoice_line_matches`, `ledger_payments`,
  `ledger_entries`) via reusable scope helpers. Ground-staff invoice INSERT allowed scoped to
  fixed location; append-only tables read+insert only; soft-delete inherited through parents;
  `ledger_entries` stays org-level. Helpers (CURRENTLY named `financial_scope_visible` /
  `financial_scope_writable` plus invoice-child / two-hop helpers).

### Scope-class map for the 12 financial tables (reference for any future change)
- DIRECT brand+location: `invoices`, `payments`
- DIRECT location-only: `invoice_allocations`, `credit_requests`
- PARENT-INHERITED via `invoice_id`: `invoice_line_items`, `invoice_documents`,
  `reconciliation_variances`, `invoice_audit_events`, `ledger_bills`
- TWO-HOP: `invoice_line_matches` (`invoice_line_id`→`invoice_line_items`→`invoices`),
  `ledger_payments` (`bill_id`→`ledger_bills`→`invoices`)
- ORG-only, append-only: `ledger_entries`

- **Identity/hierarchy RLS batch (tenant_super_admin/org_manager gap fix)** —
  `20260718000001_profiles_rls_tenant_super_admin_fix.sql` /
  `20260718000002_organizations_rls_hierarchy_rebuild.sql` /
  `20260718000003_brands_locations_rls_tenant_super_admin_fix.sql` /
  `20260718000004_fix_reminders_role_list.sql`: the `20260708000002` role-model migration
  (which introduced `tenant_super_admin`/`org_manager`, renamed `org_owner`→`org_manager`)
  never propagated into `profiles`, `brands`, `locations`, `organizations` — those tables
  predate it and still gated on the dead `'org_owner'` string or stale JWT-`user_metadata`/
  `owner_id` policies, so neither `org_manager` nor `tenant_super_admin` could manage other
  users' profiles, create/edit a brand or location, or (for `tenant_super_admin`) see across
  the orgs in their own tenant. Fixed by routing `profiles` through the existing
  `access_membership_readable/writable()` primitives (already correct, already used by the
  membership tables), rebuilding `organizations` RLS on `get_auth_role()`/`get_auth_tenant()`
  (drop-all-then-rebuild, per the rule above), and rebuilding `brands`/`locations` on the
  existing `get_my_accessible_brand_ids/location_ids()` helpers with proper INSERT
  parent-scope checks and UPDATE re-parenting guards (`WITH CHECK` validates the NEW row, not
  just the OLD row via `USING`). Product decision: `branch_manager` can manage brands/locations
  already assigned to them but cannot create a new brand (rank floor raised to `org_manager`
  for brand INSERT). Also patched two fossils that shipped after the role model existed:
  `create-dwolla-funding-source` edge function and the `send_due_date_reminders` cron function
  both still checked `'org_owner'`. New acceptance test
  `tenant_super_admin_identity_rls_acceptance.sql` exercises real RLS via role impersonation
  (unlike the original `tenant_super_admin_org_manager_acceptance.sql`, which only checked
  helper-function booleans as the postgres superuser and so never caught this gap).
  **Deferred, not done here:** `organizations.enabled_modules` has zero DB-level enforcement
  anywhere (RLS/trigger/edge function) — it's checked only in `moduleConfig.js` client-side,
  and `org_manager`/`tenant_super_admin` bypass it by design. Tracked as its own follow-up
  ("DB-level module enablement enforcement") — do NOT casually add a parameter to the shared
  `tenant_scope_*`/`reference_scope_*` functions for this; see that plan's overload/dependency
  warning before touching those functions.

---

## 8. PENDING PLAN (in dependency order)

1. **Batch 2 — operational tables RLS** (next; spec fully defined in §4). First do a small
   helper rename `financial_scope_*` → `tenant_scope_*` (so the name reads honestly for
   non-financial tables) and add a new `reference_scope_visible/writable` helper for the hybrid
   pattern. Then wire `vendors`/`products`/`recipes` (reference hybrid) and
   `inventory`/`inventory_movements`/`wastage_logs`/`auto_orders`/`purchase_orders`
   (location-scoped). Drop the dangerous stale JWT-`user_metadata` policies on these tables.
   After the rename, RE-RUN the Batch 1 financial acceptance test to confirm no regression.
2. **Batch 3** — remaining tenant tables with brand/location columns.
3. **Phase 2c — special cases:** `profiles` (recursion-safe policy — the scope helpers read
   profiles, so its own policy must not recurse); `dashboard_*` (reconcile the separate
   `can_access_dashboard_scope` wrapper).
4. **Phase 3 — full tiered-approval redesign:** consolidate the 4+ approval paths into ONE;
   activate `invoice_approval_limit` as the live amount check with escalation; re-seed
   `approval_policies` with correct role vocabulary (fix the `org_admin` fossil); clean the
   leftover `'org_admin'` in `execute_approval_step`'s role list; **fix every invoice INSERT
   path to stamp full scope** — especially `process-email-invoices` (drops brand/location/
   created_by — the "black-hole" bug) and `save_invoice_workflow` (doesn't require
   brand/location); fix `save_invoice_workflow` column drift (`extraction_method` missing).
5. **Squash** — regenerate a clean migration baseline from the verified local DB (retires the
   251-migration round-trip history + remaining fossils like `tenant_registry`,
   `tenant_schema_retirement_archive`). Also a good time to clean helper names module-wide.
6. **Production deploy** — backup; apply tested migrations in a maintenance window; re-run
   isolation + approval tests against prod. **PROD CHECKLIST:** (a) re-run the null-profile-role
   count (Phase 2a); (b) re-run the grant-state query for `switch_user_context` / `brands` /
   `locations` — prod likely HAS the grants local lacks (the switcher works in prod
   screenshots), so the org-wide exposure may be LIVE in prod and these fixes are urgent there.

---

## 9. KNOWN OPEN ITEMS / FLAGS

- **`execute_approval_step` line ~419** still lists `'org_admin'` in an allowed-role check —
  harmless (never matches) but a fossil; clean in Phase 3.
- **Seeded `approval_policies` row** has `required_role = 'org_admin'` — re-seed in Phase 3.
- **Performance note (not a bug):** the RLS scope functions do a per-row profile lookup. Fine
  now; at tens-of-thousands of rows, consider caching the caller's role+scope once per
  statement. Upgrade path only — do not pre-optimize.
- **Prod ≠ local on grants.** Local lacks grants that prod appears to have. Always re-check
  grant state against prod before deploying; never assume local's grant state is
  representative.

- **`trg_invoices_webhook` is unfiltered.** It fires `net.http_post` on EVERY invoice
  UPDATE, including validation-only writes from `validate_invoice`. It should get a WHEN
  clause scoping it to inserts + real status changes; this fixes spurious webhooks for ALL
  invoice writers, not just validation. Needs its own investigation of what currently
  depends on the trigger firing on updates.
---

## STATUS (update as steps complete)

- [x] Phase 0 / 0.5 — fossil triggers removed, 026 TRUNCATE guarded
- [x] Phase 1 / 1.5 — org resolver → profiles, FORCE RLS, no write black-holes
- [x] Phase 2a — role resolver → profiles
- [x] Context plumbing — switcher reader/writer/grants hardened, `branch_manager` confirmed
- [x] Step 1 — role-gate helpers fixed
- [x] Step 2 — approval security hotfix (grants locked, cascade limits, enforcement trigger)
- [x] Step 3 — Batch 1 financial RLS (12 tables)
- [ ] Batch 2 — operational tables (reference hybrid + location-scoped) ← NEXT
- [ ] Batch 3 — remaining tenant tables
- [x] Phase 2c (partial) — `profiles` RLS fixed (see Identity/hierarchy RLS batch above);
      `brands`/`locations`/`organizations` also fixed as part of the same batch (not originally
      scoped under Phase 2c, but same root cause). `dashboard_*` special case still open.
- [ ] Phase 3 — full tiered-approval redesign + insert-path scope fixes
- [ ] Squash — clean baseline
- [ ] Production deploy — with prod-state re-checks
