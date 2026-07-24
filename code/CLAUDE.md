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

- **Tenancy column:** `organization_id` (NOT `tenant_id` / `org_id`) is still the primary scope
  anchor everywhere RLS reads it. `invoices` and `payments` additionally carry a denormalized
  `tenant_id` column (added 2026-07-21, auto-populated by a `BEFORE INSERT OR UPDATE OF
  organization_id` trigger, `sync_tenant_id_from_organization()`) for direct tenant-scoped
  queries without a join — don't hand-set it, the trigger owns it.
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

**Visibility (who can SEE a row) — REVISED (2026-07-21), see §7:**
- `org_manager` / `tenant_super_admin` / `branch_manager` → **only the ONE location currently
  active on their `profiles.location_id`** (written by `switch_user_context` whenever they
  switch). No org-wide, tenant-wide, or brand-wide aggregate view anymore for `invoices`/
  `payments`/`inventory` (and the other `tenant_scope_visible()`-gated tables) — if they haven't
  switched into a specific location, they see **zero** rows there, full stop.
  ~~Previously: `org_owner` saw all rows in their org; `branch_manager` saw all rows under
  their brand (every location in it).~~ That aggregate-viewing capability was deliberately
  removed, not a bug fix — see §7's "Require exact location match" entry for why.
- `location_manager` / `ground_staff` → only their own (fixed-profile) location's rows.
  **Unchanged** — this rule already worked this way for them before the revision above.
- `platform_admin` → everything.
- **Soft-deleted rows (`deleted_at IS NOT NULL`) are hidden from everyone**, including the
  owner. (Recovery, if ever needed, is a separate admin path — not the default.)
- **Exception, also unchanged:** a row with NULL `brand_id` AND NULL `location_id` (the
  `ledger_entries` org-level tier) is still visible on `organization_id` match alone, to
  `org_manager`/`tenant_super_admin`/`platform_admin` — this tier was explicitly NOT part of
  the revision, it's the one deliberate aggregate exception left.
- **Extended to reference data (2026-07-21), see §4/§7:** the same "no exceptions" rule now
  also gates `vendors`/`products`/`recipes` via `reference_scope_visible()` — see §4 for how
  the brand-shared pattern fits into an exact-location-match world.

**Scope source — the most important rule:** an invoice's scope comes ONLY from the
**uploader's context at upload time**, NEVER from the invoice's printed content. The printed
address is unreliable (e.g. 7shifts printed a Texas address on a Choto bill; US Foods prints
the Choto address). Every invoice is stamped at insert with `organization_id` + `brand_id` +
`location_id` + `created_by`. Two locations can upload the same vendor's bill and each copy
belongs to the uploader's location.

**Context source is role-aware:**
- `org_manager` / `tenant_super_admin` / `branch_manager` → context from the
  **ContextSwitcher** (they can switch within their accessible scope). As of the visibility
  revision above, this isn't just where uploads get stamped from anymore — it's now also the
  ONLY thing that makes any `invoices`/`payments`/`inventory` row visible to them at all.
- `location_manager` → NO switcher. Context is FIXED to their onboarded
  `profiles.organization_id` / `brand_id` / `location_id`. The upload stamps from their fixed
  profile, never a picker.

**NULL-tier rule — RETIRED for `invoices`/`payments` (2026-07-21).** Both tables now have
`organization_id`, `tenant_id`, `brand_id`, and `location_id` all `NOT NULL` — a row with no
brand/location can no longer exist. It used to be allowed ("org-level, visible to `org_owner`/
`platform_admin` only"), but that made such rows permanently invisible to `branch_manager`/
`location_manager`/`ground_staff` — the "black-hole bug", see §7. Every insert path (manual
upload, `save_invoice_workflow`, `ingest_email_invoice`) now requires or derives a real
brand+location before the row can be written. `ledger_entries` is the one financial table that
intentionally stays org-level (append-only, org-wide by design) — that's unaffected.

---

## 4. REFERENCE vs TRANSACTIONAL SPLIT (Batch 2 model — validated against MarginEdge)

Two different scope patterns depending on whether data is shared *definitions* or per-location
*events*:

**A. REFERENCE (hybrid: brand-shared + location-specific)** — `vendors`, `products`,
`recipes`:
- **Visibility requires an active location, no exceptions (2026-07-21), see §7.** Same rule as
  invoices/payments/inventory: every role needs a specific location active on
  `profiles.location_id` or sees **zero** rows here too — `org_manager`/`tenant_super_admin` no
  longer get an "any brand I have access to" aggregate pass just because that's architecturally
  a reference table, not a transactional one.
- A row stamped at **brand level** (brand set, location NULL) is **brand-shared**.
  ~~Previously: visible to everyone whose accessible brands include that brand.~~ Now: visible
  when it matches the **brand of the caller's currently active location** — being "at" a
  location is what unlocks the shared catalog for that location's brand, not a standing
  role-level brand grant (e.g. "US Foods" is visible while active at any Craven Wings location,
  invisible with no location selected).
- A row stamped at **location level** (location set) is visible only when it's the caller's
  exact active location (e.g. "Joe's Corner Market", a one-off local store Choto bought from →
  visible only while Choto is the active location; Seymore never sees it, even when active).
- **Incidental gap fix:** `location_manager` previously could not see brand-shared rows at all
  (`get_my_accessible_brand_ids()` has no branch for that role). The new rule computes the
  brand match directly from the caller's own active location instead of that helper, so
  `location_manager` now sees brand-shared rows too, same as everyone else.
- **Writes — UNCHANGED:** only `branch_manager` / `org_owner` / `platform_admin` may create or
  edit a **brand-shared** (location-NULL) row. A `location_manager` may create a
  **location-specific** row, auto-scoped to their own location. `ground_staff` cannot write
  reference tables. `reference_scope_writable()` was deliberately not touched by the visibility
  change above — it already keys off the role plus the *target row's* declared scope, which is
  orthogonal to "what can I currently see." In practice nobody reaches the create form without
  an active location either now (page-level gate, see §7), so this rarely comes up in isolation.
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

- **Context-switch audit + black-hole bug closure** (2026-07-21):
  - `20260721000011_capture_tenant_super_admin_tenant_wide_scope.sql`: `tenant_scope_visible()`
    and `reference_scope_visible()` capped `tenant_super_admin` to their own single org (same
    branch as `org_manager`) instead of tenant-wide access via `get_auth_tenant()` — the same
    gap the Identity/hierarchy RLS batch above fixed for `organizations`/`brands`/`locations`/
    `profiles`, just missed on these two shared scope-primitive functions since they predate
    the `tenant_super_admin` role entirely (written 20260628, role model landed 20260708).
    Fixed to match the `organizations` table's existing pattern exactly.
  - `useUrlHierarchy.js` fired three unawaited `switchContext()` calls back-to-back for a
    `?company=&store=` deep link; each read the same stale closure over
    `activeOrg`/`activeBrand`/`activeLocation`, so the org call (which unconditionally nulls
    brand/location) usually landed last and wiped out what the other two had just set — deep
    links to a specific location silently dropped to the org root. Fixed by adding
    `switchContextTo({organization, brand, location})` to `AuthContext.jsx` — a single atomic
    commit path (shared `applyContext()` helper, no closure-captured prior state) — and having
    `useUrlHierarchy` call it once instead of three racing calls. `switchContext(type, entity)`
    itself is untouched, still used as-is by `ContextSwitcher.jsx`'s one-field-at-a-time clicks.
  - `brand_manager` — the fossil from §2 — was still live in the frontend: assignable from
    `UserManagement.jsx`'s role picker, with its own `ROLE_LEVEL`/`isBrandManager` entries in
    `usePermissions.jsx` treating it as a real, distinct role. Anyone assigned it would
    authenticate fine and see an empty app (RLS matches `branch_manager`, never `brand_manager`).
    Removed from the assignable role list; `normalizeRole()` now aliases `'brand_manager'` →
    `'branch_manager'` (same treatment as the existing `manager`/`owner`/`admin` legacy aliases)
    so any pre-existing row with that string isn't left worse off.
  - `ContextSwitcher.jsx` had a full `isPlatformAdmin` branch (an "All Organizations" option,
    per-org drill-down, a "Viewing: X" badge) that was **entirely unreachable** —
    `Layout.jsx` never renders `<ContextSwitcher />` for that role at all (platform admin gets
    platform-only nav + a separate `PlatformDashboard` instead). Also had `isLocationManager` in
    its full-switcher role list, contradicting both its own docstring and §3's "`location_manager`
    → NO switcher" rule — that one was live, not dead: a `location_manager` clicking the Brand
    dropdown could actually null out their own fixed location. Both removed.
  - **The "black-hole bug"** (§8 Phase 3 originally, pulled forward and closed here): every
    invoice/payment insert path is now guarded against writing `brand_id`/`location_id` as NULL.
    `Invoices.jsx`'s `sanitizeInvoiceData` throws instead of silently deleting the keys;
    `save_invoice_workflow` (`20260721000016_guard_invoice_workflow_scope.sql`) auto-fills from
    the caller's fixed profile for `location_manager`/`ground_staff`, `RAISE EXCEPTION`s for
    everyone else if scope is still missing, on both INSERT and UPDATE; `ingest_email_invoice`
    (`20260721000017_mandatory_invoice_payment_scope_ids.sql`) no longer inserts an orphaned row
    when no `location_email_addresses` match is found — it returns `matched: false` with no
    invoice, and `process-email-invoices` emails the sender (`_shared/email.ts`'s
    `sendTransactionalEmail`) explaining the miss instead. A new `useRequireLocation()` hook
    (`code/src/hooks/useRequireLocation.js`) gates every transactional write button behind a
    selected location — greyed out, toast on click if missing — across Invoices, Payments,
    Inventory (counts, wastage, transfers), and AutoOrdering; ~~reference-data creation
    (vendors/products/recipes, §4) is deliberately exempt since brand-level (no location) is
    valid there~~ — superseded 2026-07-21, see the "Require active location for reference data"
    entry below: reference data now requires an active location too, no exemption. Finally,
    `organization_id`/`tenant_id`/`brand_id`/`location_id` are all
    `NOT NULL` on `invoices` and `payments` now (see §2, §3) — the null-scope state is
    schema-impossible, not just guarded in application code.
  - **`InventoryTransfers.jsx`**: the "From" location field seeded from context once, then a
    broken resync guard (`if (!current) return default; return current;`) silently ignored
    every later context switch — switch locations mid-session without reopening the page and
    the dropdown stays stuck on the old one while "Available Inventory" correctly updates, so a
    transfer submits against the wrong source location. Fixed to resync only while the field is
    still tracking the default (a manual pick survives a later switch, an untouched default
    doesn't go stale).
  - **Acceptance tests added:** `tenant_super_admin_scope_visible_acceptance.sql`,
    `mandatory_invoice_payment_scope_ids_acceptance.sql`.
  - **Not done in this pass** (see §9): full audit only covered 6 of ~21 frontend modules; two
    flagged-not-confirmed cases in `LoadingDockReceiving.jsx`/`VendorBulkTools.jsx`; the
    duplicate `brand_manager` entry in `AuthContext.jsx`'s `hasPermission` map was left alone
    (harmless, intentional).

- **Require exact location match for org_manager/tenant_super_admin/branch_manager**
  (2026-07-21, `20260721190000_require_exact_location_match_for_org_wide_roles.sql`) —
  deliberate product decision, confirmed explicitly (not a bug fix): these three roles no
  longer get an aggregate view of `invoices`/`payments`/`inventory` (and everything else gated
  by `tenant_scope_visible()`) across their whole org/tenant/brand. They must have a specific
  location active on `profiles.location_id` (written by `switch_user_context`, already
  validated there against `get_my_accessible_location_ids()` for whichever role they are) or
  they see **zero** rows in those tables — not "their org's rows", zero. Collapsed the
  function's role-branching into one rule: exact `p_location_id = v_location_id` match for
  every role except `platform_admin` (unchanged, sees everything) and the `ledger_entries`
  org-level tier (unchanged, org match alone, see §3). `location_manager`/`ground_staff`
  behavior is unaffected — their `profiles.location_id` was always fixed and this is exactly
  how they already worked. Frontend: `moduleConfig.js`'s `invoices`/`payments`/`inventory`
  modules now carry `requiresLocation: true`, reusing `ProtectedModule.jsx`'s gate built for
  Kitchen Displays earlier this session — no new frontend code, three lines. **This reverses
  this session's own earlier tenant_super_admin tenant-wide fix and the original
  `org_owner`/`branch_manager` visibility rules from §3 — both were correct for what they were
  solving (a real RLS gap, then a real UX-labeling gap), this is a deliberate, separate,
  later product decision on top of both, not a correction of either.** Acceptance test:
  `require_exact_location_match_acceptance.sql` — 9 cases, all three revised roles at null
  location (zero rows) and at a specific location (only that location, not a sibling one in
  the same org/brand), the `ledger_entries` exception, and both unaffected roles confirmed
  unchanged.

- **Require active location for reference data (Products/Vendors/Recipes)** (2026-07-21,
  `20260721191500_require_active_location_for_reference_data.sql`) — extends the entry above to
  `reference_scope_visible()`, on the same explicit, twice-confirmed instruction ("no exceptions
  anywhere" — the strictest of three offered options, chosen after being told this was
  genuinely different data ). Collapsed the same way: every role except `platform_admin` needs
  an active `profiles.location_id` or sees zero rows; a location-specific row needs an exact
  match; a brand-shared row (location NULL) is visible when its brand matches the brand of the
  caller's *currently active location* (one extra lookup vs. the transactional version, since a
  brand-shared row has no location of its own to compare against directly). Incidental gap fix,
  not the point of the change: `get_my_accessible_brand_ids()` never had a `location_manager`
  branch, so that role could never see brand-shared rows before this — the new rule is computed
  from the caller's own active location instead of that helper, so it now works identically for
  every role. `reference_scope_writable()` untouched — see §4. Frontend: `moduleConfig.js`'s
  `products`/`vendors`/`recipes` modules now carry `requiresLocation: true`, same reused
  `ProtectedModule.jsx` gate, three more lines. Acceptance test:
  `require_active_location_for_reference_data_acceptance.sql` — 7 cases: `org_manager` /
  `tenant_super_admin` / `branch_manager` each at null location (zero rows); `org_manager` and
  `branch_manager` at Location A (see both the Location-A-specific product and the brand-shared
  one); `tenant_super_admin` at Location B — a different location, same brand — (sees the
  brand-shared product, not Location A's specific one); `location_manager` (sees both, proving
  the gap fix). All 7 passed.

- **Org-level reference catalog exception restored** (2026-07-22,
  `20260722000014_org_level_reference_scope_visible.sql`) - supersedes the strict note above
  for reference rows where both `brand_id` and `location_id` are NULL. `reference_scope_visible()`
  now allows organization-level `products`/`vendors`/`recipes` rows to be visible to callers in
  the same organization without requiring an active location, while brand-shared and
  location-specific rows still require the active-location matching rules described above. This
  is deliberate catalog visibility behavior, not an undocumented RLS bypass.

---

## 8. PENDING PLAN (in dependency order)

1. ~~**Batch 2 — operational tables RLS**~~ **ALREADY DONE, this checklist was stale.**
   Verified 2026-07-21 by reading live `pg_policy` on all 8 tables directly: `vendors`,
   `products`, `recipes`, `inventory`, `inventory_movements`, `wastage_logs`, `auto_orders`,
   `purchase_orders` each already have exactly 3 clean policies (`operational_*`
   select/insert/update, no leftover stale ones sitting beside them) built on
   `tenant_scope_visible`/`reference_scope_visible` — the helper rename and the hybrid helper
   this item describes below were also already done, they're the exact functions in use today.
   Whoever did this never updated this section — see the "Require exact location match" entry
   in §7, which further modifies `tenant_scope_visible()` on top of this already-completed work.
   Original spec (kept for history, not a live to-do): spec fully defined in §4, first do a
   small helper rename `financial_scope_*` → `tenant_scope_*` (so the name reads honestly for
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
   leftover `'org_admin'` in `execute_approval_step`'s role list; fix `save_invoice_workflow`
   column drift (`extraction_method` missing — NOTE: this migration has since added columns
   to `save_invoice_workflow`'s INSERT list, re-check whether `extraction_method` is still
   missing before assuming it isn't). **The insert-path-scope slice of this item is DONE**
   (2026-07-21, see §7's "Context-switch audit + black-hole bug closure") —
   `process-email-invoices` and `save_invoice_workflow` both now require/derive full scope
   before writing; that part doesn't need to wait for the rest of this phase.
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

- **Context-switch audit coverage gap.** The sweep that found the Inventory Transfers bug
  (§7) only covered 6 of ~21 frontend modules (invoices, payments, inventory, vendors,
  products, accounting) for stale-context/bypass patterns. `labor`, `recipes`,
  `kitchen_displays`, `performance`, `integrations`, `commissary`, `food_safety`, `smartprep`,
  etc. haven't been checked.
- **Two flagged-not-confirmed cases from that same sweep:** `LoadingDockReceiving.jsx`'s
  receipt location-stamping, and a CSV-import closure in `VendorBulkTools.jsx`. Neither
  confirmed as a bug, neither ruled out.
- **`AuthContext.jsx`'s `hasPermission` roleActionMap still has a `brand_manager` entry**
  (identical permissions to `branch_manager`) — left intentionally as a safety net for any
  pre-existing row with that legacy role string; removing it would silently strip permissions
  from such a row for no benefit. Unlike `usePermissions.jsx`, this one isn't routed through
  `normalizeRole()`, so it still keys on the raw, unaliased role string.
- **PROD CHECKLIST addition:** before applying
  `20260721000017_mandatory_invoice_payment_scope_ids.sql` to prod, re-run its own NULL-count
  check (`SELECT count(*) FILTER (WHERE brand_id IS NULL OR location_id IS NULL) FROM
  invoices` / `payments`) — local had zero existing rows in both tables so it applied cleanly
  there, prod almost certainly has real null-scoped rows from the black-hole bug and will need
  manual scope assignment before the `NOT NULL` constraints can be added.
---

## STATUS (update as steps complete)

- [x] Phase 0 / 0.5 — fossil triggers removed, 026 TRUNCATE guarded
- [x] Phase 1 / 1.5 — org resolver → profiles, FORCE RLS, no write black-holes
- [x] Phase 2a — role resolver → profiles
- [x] Context plumbing — switcher reader/writer/grants hardened, `branch_manager` confirmed
- [x] Step 1 — role-gate helpers fixed
- [x] Step 2 — approval security hotfix (grants locked, cascade limits, enforcement trigger)
- [x] Step 3 — Batch 1 financial RLS (12 tables)
- [x] Batch 2 — operational tables (reference hybrid + location-scoped). This checklist said
      "next" but it was already done — verified 2026-07-21 by reading live `pg_policy` state
      directly, see §8 item 1.
- [ ] Batch 3 — remaining tenant tables
- [x] Phase 2c (partial) — `profiles` RLS fixed (see Identity/hierarchy RLS batch above);
      `brands`/`locations`/`organizations` also fixed as part of the same batch (not originally
      scoped under Phase 2c, but same root cause). `dashboard_*` special case still open.
- [ ] Phase 3 — full tiered-approval redesign (insert-path scope fixes are DONE, see below)
- [ ] Squash — clean baseline
- [ ] Production deploy — with prod-state re-checks
- [x] Context-switch audit + black-hole bug closure (2026-07-21) — tenant_super_admin RLS gap
      in `tenant_scope_visible`/`reference_scope_visible`, `useUrlHierarchy` race condition,
      `brand_manager` frontend fossil, dead/broken `ContextSwitcher` role branches, Inventory
      Transfers stale-location bug, and the full invoice/payment black-hole bug (frontend guard,
      `save_invoice_workflow` guard, `ingest_email_invoice` fix + bounce email, mandatory
      `organization_id`/`tenant_id`/`brand_id`/`location_id` on both tables) — all closed, see
      §7. Coverage gaps and deferred items tracked in §9. Not yet committed to git as of this
      writing.
- [x] Require exact location match for org_manager/tenant_super_admin/branch_manager
      (2026-07-21) — deliberate product decision on top of the line above, not a bug fix: those
      three roles now see zero `invoices`/`payments`/`inventory` rows (and everything else
      gated by `tenant_scope_visible()`) unless they have a specific location actively selected
      via the switcher — no more org-wide/tenant-wide/brand-wide aggregate view. See §3, §7.
      `location_manager`/`ground_staff` unaffected. Not yet committed to git as of this writing.
- [x] Require active location for reference data — Products/Vendors/Recipes (2026-07-21) —
      extends the line above to `reference_scope_visible()`: the same roles need an active
      location for vendors/products/recipes too, and a brand-shared (location-NULL) row now
      resolves against the *brand of the caller's active location* instead of a standing
      role-level brand grant. Incidental fix: `location_manager` previously couldn't see
      brand-shared rows at all — now can, like everyone else. `reference_scope_writable()`
      (who may create/edit) is unchanged. Frontend: `requiresLocation: true` added to
      `products`/`vendors`/`recipes` in `moduleConfig.js`. See §4, §7. Not yet committed to git
      as of this writing.
