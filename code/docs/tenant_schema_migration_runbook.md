# Tenant Schema Migration Runbook

This runbook tracks the shared-table to schema-per-tenant migration. The current implementation is additive and guarded: tenants stay on public reads and public writes until a platform admin or service-role process explicitly changes modes.

## Current Safety Model

- Tenant users continue to use RLS-scoped public tables until cutover.
- Tenant schemas are not exposed to browser roles.
- `tenant_template` is a blueprint only and must not contain live tenant data.
- Cross-tenant reporting is restricted to `platform_admin` and `service_role`.
- Tenant users can only inspect reporting snapshots for their own organization.
- Write cutover to `tenant_schema` is blocked unless read cutover and validation are already ready, unless `force` is explicitly used.

## Rollout Order

1. Provision tenant schemas.

```sql
select public.provision_planned_tenant_schemas(10);
```

2. Backfill tenant schemas.

```sql
select public.backfill_planned_tenant_schemas(5);
```

For a single tenant:

```sql
select public.backfill_tenant_schema('<organization_id>'::uuid);
```

3. Validate counts.

```sql
select public.validate_tenant_backfill_counts('<organization_id>'::uuid);
```

4. Refresh reporting snapshots.

```sql
select public.refresh_all_tenant_reporting_snapshots(100);
```

For one tenant:

```sql
select public.refresh_tenant_reporting_snapshot('<organization_id>'::uuid);
```

5. Review readiness in the Platform Console.

Open:

```text
PlatformAdmin?tab=tenant-migration
```

A tenant should have:

- `schema_exists = true`
- `ready_for_tenant_schema_reads = true`
- `blocker_count = 0`
- matching or explainable public/tenant row counts

6. Cut over reads for one tenant.

```sql
select public.set_tenant_read_mode('<organization_id>'::uuid, 'tenant_schema', false);
```

7. Observe the tenant after read cutover.

Check app workflows, reporting snapshots, and Supabase logs before write cutover.

8. Cut over writes for one tenant.

```sql
select public.set_tenant_write_mode('<organization_id>'::uuid, 'tenant_schema', null, false);
```

## Rollback

Rollback reads:

```sql
select public.set_tenant_read_mode('<organization_id>'::uuid, 'public', false);
```

Rollback writes:

```sql
select public.set_tenant_write_mode('<organization_id>'::uuid, 'public', 'public', false);
```


## Pilot Tenant Flow

Use this before moving any tenant into tenant-schema reads.

1. Select and prepare one pilot tenant from the Platform Console.

Open:

```text
PlatformAdmin?tab=tenant-migration
```

Click `Prepare Pilot` for exactly one tenant. This provisions the tenant schema, backfills data, refreshes reporting, and records the pilot run. It does not change read or write modes.

Equivalent SQL:

```sql
select public.prepare_tenant_pilot_cutover('<organization_id>'::uuid);
```

2. If the pilot is prepared and blockers are clear, perform read cutover from SQL only.

```sql
select public.apply_tenant_pilot_read_cutover('<organization_id>'::uuid, 'CUTOVER_READ');
```

3. Test the pilot tenant in the app before write cutover.

Minimum workflow checks:

- Login and context switching
- Dashboard data
- Vendors and vendor items
- Products and inventory
- Invoices and invoice detail
- Payments and accounting views
- AI Insights scoped to the tenant/location context

4. If read cutover is stable, perform write cutover from SQL only.

```sql
select public.apply_tenant_pilot_write_cutover('<organization_id>'::uuid, 'CUTOVER_WRITE');
```

5. Mark the pilot complete after observation.

```sql
select public.complete_tenant_pilot_cutover('<organization_id>'::uuid, 'Pilot verified after read/write cutover');
```

Abort tracking if the pilot is stopped before completion:

```sql
select public.abort_tenant_pilot_cutover('<organization_id>'::uuid, 'Reason for stopping pilot');
```

## Checks Before Any Tenant Cutover

- `supabase db lint --linked` returns no schema errors.
- The tenant's latest backfill run is `completed`.
- `validate_tenant_backfill_counts` returns success.
- The Platform Console Tenant Migration panel shows no blockers.
- No tenant should move to tenant-schema writes before tenant-schema reads are active.

## What Not To Do

- Do not grant `authenticated` or `anon` access to tenant schemas.
- Do not manually edit `tenant_registry.read_mode` or `tenant_registry.write_mode`; use the guarded RPCs.
- Do not run `force = true` unless an operator has manually verified the blocker is expected and acceptable.
- Do not delete public-table tenant data until all application reads, writes, reporting, backups, and support workflows are proven on tenant schemas.