# Tenant Back-Migration Backfill Apply

Generated: 2026-06-25T06:31:53.267Z

## Summary

- Mode: apply
- Schema: all
- Returned rows: 63
- Actionable tables: 1
- Missing rows: 8
- Inserted rows: 8
- Errored tables: 0

## Actionable Tables

| Schema | Table | Organization | Missing Rows | Inserted Rows | Error |
| --- | --- | --- | ---: | ---: | --- |
| tenant_bk_22b10c66 | invoice_line_items | 22b10c66-b25a-4642-9af9-7cabdb029c3d | 8 | 8 |  |

## Notes

- Dry run reports rows that would be copied but does not mutate data.
- Apply mode copies only rows missing by `id` in the public table for the tenant organization.
- `organization_id` is forced from `tenant_registry`, even if the legacy tenant row contains a different value.
