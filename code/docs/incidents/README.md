# Incident archive — historical record only

These files are kept for history. **None of the `.sql` files here should ever be run against any
current database.** They predate this repo's multi-tenant hierarchy (`organization_id` → `brand_id`
→ `location_id`), the current role vocabulary (`ground_staff` / `location_manager` /
`branch_manager` / `org_manager` / `tenant_super_admin` / `platform_admin` — see `code/CLAUDE.md`
§2), and the profiles-based RLS model that replaced JWT-`user_metadata` role checks.

Running any of the recovery scripts here against the live database would drop every RLS policy in
`public` (both files), drop every trigger in `public` (`..._repair_v5.sql` only — this would take
out invoice approval enforcement, every notification/webhook/sync/audit trigger, everything), and
rebuild access control as `USING (true)` — unrestricted read on invoices, payments, vendors,
products, inventory — checked only against a JWT field, not `profiles`. That JWT-vs-profiles
pattern is the exact bug this repo's hardening effort exists to close.

- `2026-06_rls_recursion_recovery_v4.sql` (was `supabase_recovery.sql`) — a from-scratch schema
  rebuild plus a full RLS policy purge, from an early RLS-recursion incident.
- `2026-06_rls_recursion_repair_v5.sql` (was `supabase_recursion_repair.sql`) — a later, more
  aggressive pass on the same incident: drops every trigger in `public` in addition to every
  policy.
- `2026-06_admin_access_diagnostic.sql` (was `supabase_diagnostic.sql`) — a smaller diagnostic/
  force-admin script from the same period. Doesn't touch policies or triggers, but still
  force-writes the legacy `'admin'` role string, which matches nothing in the current role model.
- `2026-06-16_schema_table_audit.json` (was `live_supabase_rest_audit.json`) — a static table-name
  inventory snapshot from that period. Inert data, not a script; kept only for context.

Moved here 2026-07-27 from repo root, where their presence risked being mistaken for current,
runnable tooling. See `code/CLAUDE.md` §9 for the fuller writeup of why these are dangerous as-is.
