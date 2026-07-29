# Supabase Transfer Package - 2026-07-27

Use this folder to transfer the current database and Edge Function setup into the three new Supabase projects.
## Environment Projects

| Environment | Project ref | URL | Role |
| --- | --- | --- | --- |
| QA | `gsupqfmwlsmwoybphimx` | `https://gsupqfmwlsmwoybphimx.supabase.co` | Current source project |
| R&D | `vkfrsoakhssvvavmjeoy` | `https://vkfrsoakhssvvavmjeoy.supabase.co` | New development/R&D target |
| Prod | `mousarlsxzphqmvilepv` | `https://mousarlsxzphqmvilepv.supabase.co` | New production target |


## Recommended Path

Prefer Supabase CLI migrations for each target project:

```powershell
supabase link --project-ref <target-project-ref>
supabase db push
.\exports\supabase-transfer-20260727\deploy_edge_functions.ps1
```

Then set Edge Function secrets manually in the Supabase dashboard or with `supabase secrets set`.

## Files

- `010_all_migrations_in_order.sql` - all 574 migration files combined in filename order. Use for a fresh project only if you are not using `supabase db push`.
- `015_latest_20260727_delta.sql` - latest 19 `20260727*.sql` migrations. Use only when the target already has the older baseline.
- `020_rls_rbac.sql` - extracted RLS/RBAC/security grants from all migrations.
- `030_rpc_functions.sql` - extracted RPC/function/procedure statements from all migrations.
- `040_storage_realtime_cron_extensions.sql` - extracted storage, realtime, cron, pg_net, and extension infrastructure statements.
- `050_seed_reference_data.sql` - current safe seed/reference data.
- `060_edge_functions.md` - Edge Function names and deploy notes.
- `deploy_edge_functions.ps1` - deploy all Edge Functions after linking the target project.
- `migration_manifest.json` - migration inventory.
- `extract_summary.json` - extraction counts.

## SQL Editor Order

If you must use Supabase SQL Editor manually, run in this order:

1. `010_all_migrations_in_order.sql` for a blank project, or `015_latest_20260727_delta.sql` for an already-baselined project.
2. `050_seed_reference_data.sql`.
3. Use `020_rls_rbac.sql`, `030_rpc_functions.sql`, and `040_storage_realtime_cron_extensions.sql` as audit/repair files, because the migration bundle already contains those statements in context.

## Counts

- Migrations: 574
- Latest 20260727 migrations: 19
- RLS/RBAC statements: 2689
- RPC/function statements: 1009
- Storage/realtime/cron/extension statements: 126
- Edge Functions: 47

## Manual Supabase Dashboard Steps

These are not fully transferable as SQL files:

- Auth provider settings
- Auth redirect URLs
- Email/SMS templates and SMTP config
- Edge Function secret values
- Storage bucket public/private dashboard flags, if not already represented in SQL
- Production API keys in hosting/provider dashboards

## Verification Queries

Run after each target project is migrated:

```sql
select id, name, price_monthly, is_active from public.plans order by id;
select plan_id, count(*) from public.organizations group by plan_id order by plan_id;
select plan_id, count(*) from public.locations group by plan_id order by plan_id;
select routine_name from information_schema.routines where routine_schema = 'public' order by routine_name limit 20;
select schemaname, tablename, policyname from pg_policies where schemaname in ('public', 'storage') order by schemaname, tablename, policyname limit 50;
```

Expected plan model: `custom` only for the public commercial plan model. Old `free`, `starter`, `starter-ai`, and `advanced` should not be active plan rows.

