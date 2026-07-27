# Performance Phase 13 Controlled Release Runbook

Last updated: 2026-07-27

This runbook is the release gate for the Performance remediation phases. It is intentionally operational: it records the release order, local evidence, staging evidence that must still be collected, and the explicit approval point before any Supabase migration is applied.

## Scope

Phase 13 covers the controlled release of the local Performance work from phases 5 through 12:

| Phase | Local artifact | Release status |
| --- | --- | --- |
| Phase 5 budget scope | `supabase/migrations/20260727060000_correct_performance_budget_scope.sql` | Needs staging DB integration test before approval |
| Phase 6 active hierarchy validation | `supabase/tests/performance_active_hierarchy_security_acceptance.sql` | Needs staging role matrix execution |
| Phase 7 price-impact evidence | `supabase/migrations/20260727070000_expose_price_mover_impact_evidence.sql` | Needs staging SQL/UI reconciliation |
| Phase 8 location timezone | `supabase/migrations/20260727080000_location_timezone_performance_reports.sql` | Needs staging timezone boundary checks |
| Phase 9 labels and disclosures | Frontend Performance labels and static tests | Locally verified |
| Phase 10 integration tests | `supabase/tests/performance_phase10_integration_acceptance.sql` | Needs staging pgTAP execution |
| Phase 11 scalability bounds | `supabase/migrations/20260727110000_performance_scalability_bounds.sql` | Needs staging query latency and grant verification |
| Phase 12 UX/a11y QA | Shared Performance controls and `tests/frontend/performancePhaseTwelveUxA11y.test.js` | Locally verified |

No migration should be applied merely because it exists locally.

## Release Order

1. Finish code and migrations locally.
2. Run focused frontend/unit tests.
3. Run database integration tests against staging.
4. Run the Performance security role matrix.
5. Reconcile staging UI values with read-only SQL totals.
6. Run the production build.
7. Present migration diff and rollback SQL.
8. Obtain explicit migration approval from the project owner.
9. Apply migrations to the approved Supabase target.
10. Verify RPC grants and PostgREST schema reload.
11. Deploy the matching frontend build.
12. Run production smoke tests.
13. Monitor errors and query latency during the rollback window.

## Local Verification Evidence

Run these from `code/` before requesting staging approval:

```bash
npm run test:frontend -- performancePhaseFiveBudgetScope.test.js performanceLocationSecurity.test.js performancePhaseSevenPriceEvidence.test.js performancePhaseEightTimezone.test.js performancePhaseNineLabels.test.js performancePhaseElevenScalability.test.js performancePhaseTwelveUxA11y.test.js
npm run build
git diff --check
```

Current local evidence collected on 2026-07-27:

| Check | Result |
| --- | --- |
| Focused Phase 12/11/9 frontend tests | Passed: 214 tests |
| Production build | Passed |
| `git diff --check` | Passed; CRLF warnings only |
| `supabase db lint` | Blocked locally because Docker/Supabase local Postgres is not running |
| DB integration tests | Not executed locally; staging required |

## Staging Database Gates

Run against the approved staging Supabase project only after confirming the target project reference:

```bash
supabase db lint --linked
supabase test db --linked
```

If the project does not support `supabase test db --linked`, run the SQL files through a disposable/staging database session with pgTAP enabled and save the output as release evidence.

Required database test files:

| Test file | Purpose |
| --- | --- |
| `supabase/tests/performance_active_hierarchy_security_acceptance.sql` | Active hierarchy and role isolation |
| `supabase/tests/performance_phase10_integration_acceptance.sql` | Deterministic totals, cross-scope denial, timezone, and partial-data behavior |

## Security Role Matrix

The staging run must record allowed/denied outcomes for:

| Scenario | Expected |
| --- | --- |
| Anonymous request | Denied |
| Ground staff | Denied |
| Location manager, active location | Allowed |
| Location manager, different location | Denied |
| Branch manager, active location | Allowed |
| Branch manager, inactive/different location | Denied |
| Brand manager, active brand/location | Allowed |
| Brand manager, other brand | Denied |
| Org manager, active location | Allowed |
| Org manager, inactive location | Denied |
| Tenant admin, active hierarchy | Allowed |
| Cross-organization request | Denied |
| Deleted location | Denied |
| Service role | Allowed only for explicitly designed service paths |

## UI And SQL Reconciliation

Before production deployment, reconcile at least one staging location and period against read-only SQL for:

| Metric | Expected reconciliation |
| --- | --- |
| Purchasing spend | Category report allocated spend equals SQL invoice allocation total |
| Budget variance | Category report budget equals exact location/period/category budget |
| Price impact | Difference times normalized quantity equals estimated impact |
| Inventory usage | Opening plus receipts/transfers/adjustments minus closing equals usage |
| Inventory value | Current on-hand times trusted unit cost equals displayed current value |
| Reorder risk | Overview and Inventory Usage row counts match |
| Invoice exposure | Outstanding balance equals total minus paid minus credit, floored at zero |
| Payment status | Payment attempt totals remain separate from invoice exposure |
| Timezone metadata | Report metadata uses location timezone, not browser timezone |

## Migration Diff To Present For Approval

Present these migration files and their matching rollback files before any apply step:

| Migration | Rollback |
| --- | --- |
| `supabase/migrations/20260727060000_correct_performance_budget_scope.sql` | `supabase/rollback/20260727060000_correct_performance_budget_scope_rollback.sql` |
| `supabase/migrations/20260727070000_expose_price_mover_impact_evidence.sql` | `supabase/rollback/20260727070000_expose_price_mover_impact_evidence_rollback.sql` |
| `supabase/migrations/20260727080000_location_timezone_performance_reports.sql` | `supabase/rollback/20260727080000_location_timezone_performance_reports_rollback.sql` |
| `supabase/migrations/20260727110000_performance_scalability_bounds.sql` | `supabase/rollback/20260727110000_performance_scalability_bounds_rollback.sql` |

Approval request must include:

```bash
supabase db push --linked
```

The request must name the target Supabase project and environment. Do not run this command until the owner explicitly approves that exact target.

## Post-Migration Verification

After applying to the approved target:

1. Verify all affected RPCs exist.
2. Verify `GRANT EXECUTE` is present only for intended roles.
3. Verify `anon` and `PUBLIC` cannot execute protected Performance RPCs.
4. Verify `NOTIFY pgrst, 'reload schema'` has taken effect by making an authenticated RPC call.
5. Re-run staging or production smoke checks with the matching frontend build.

Suggested grant verification SQL:

```sql
select
  routine_name,
  grantee,
  privilege_type
from information_schema.routine_privileges
where routine_schema = 'public'
  and routine_name in (
    'get_location_category_performance_report',
    'get_location_category_performance_drilldown',
    'get_location_inventory_usage_report',
    'get_location_price_movers_report',
    'get_location_performance_overview_rollup',
    'resolve_performance_location_timezone'
  )
order by routine_name, grantee;
```

## Production Smoke Tests

Run after frontend deployment:

```bash
npm run check:release-gate:ui:report
```

Also manually smoke Performance for:

| Workflow | Expected result |
| --- | --- |
| Active location load | Dashboard cards render without previous-location stale values |
| Location switch | Old location figures disappear while new location queries load |
| Category report | Spend, budget, variance, and labels match staging evidence |
| Price movers | Impact formula and normalized quantity evidence are visible |
| Inventory usage | Missing counts remain unavailable while current reorder risk still evaluates |
| Export | Partial-data export uses the current filters and metadata |
| Expired session | Protected report calls fail closed and prompt re-authentication |

## Monitoring And Rollback Window

Keep a rollback window open after production deployment. Monitor:

| Signal | Action threshold |
| --- | --- |
| Supabase RPC errors | Any repeated Performance RPC error after deploy requires triage |
| Query latency | Sustained interactive report latency above 2 seconds requires investigation |
| PostgREST schema cache errors | Reload schema and verify function signatures/grants |
| Cross-location or cross-brand data report | Treat as security incident and roll back immediately |
| UI metric mismatch versus SQL | Pause rollout and reconcile before broad release |

Rollback SQL is stored under `supabase/rollback/`. A rollback must be approved the same way as a forward migration unless there is an active security or production outage incident.
