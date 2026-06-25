# Tenant Back-Migration Audit

Generated: 2026-06-25T06:40:02.551Z

## Summary

- Tenant schemas audited: 9
- Schema/table pairs audited: 414
- Tenant tables with rows: 37
- Tables with rows missing from public by id: 0
- Total missing rows by id: 0
- Row-count-only tables with data: 0

## Schema Summary

| Schema | Organization | Tenant Tables With Rows | Tenant Rows | Missing By ID | Row-Count-Only Tables With Rows |
| --- | --- | ---: | ---: | ---: | ---: |
| tenant_bk_22b10c66 | 22b10c66-b25a-4642-9af9-7cabdb029c3d | 9 | 79 | 0 | 0 |
| tenant_bkk_3676cd13 | 3676cd13-cf35-403b-8407-5c62bb2cb1c3 | 4 | 13 | 0 | 0 |
| tenant_king_llc_942_27cc6676 | 27cc6676-3c12-4c34-a4fa-6618a3c885e3 | 2 | 2 | 0 | 0 |
| tenant_origin_3b4c0025 | 3b4c0025-4520-4d2e-8030-7f319326abcb | 1 | 2 | 0 | 0 |
| tenant_qa_bistro_group_2ad29c49 | 2ad29c49-8796-4f4c-89a2-3de1f8d165f7 | 2 | 2 | 0 | 0 |
| tenant_qa_coastal_restaurants_bf330c83 | bf330c83-5721-4ff2-8d69-10a810254935 | 2 | 2 | 0 | 0 |
| tenant_queen_llc_365_ac4d036f | ac4d036f-f135-4074-bdf1-d2be045a9c53 | 2 | 2 | 0 | 0 |
| tenant_rswings_fdcb184a | fdcb184a-7030-4da9-97bd-eadc73e9c181 | 2 | 2 | 0 | 0 |
| tenant_tej_s_kitchen_9c65f808 | 9c65f808-64ba-4214-9108-ad9030ab90f4 | 13 | 35 | 0 | 0 |

## Missing Rows By ID

No tenant rows with an `id` comparison are missing from public canonical tables.

## Row-Count-Only Tables With Data

No row-count-only tenant tables contain data.

## Notes

- `missing_by_id` is the actionable backfill count for tables that have stable `id` columns.
- `row_count_only` means the table lacks comparable `id` metadata in either tenant or public scope and needs manual table-specific review before copying.
- This audit is read-only. It does not copy, update, delete, or lock tenant data.
