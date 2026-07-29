# QA Final Snapshot to R&D - 2026-07-27

Source QA project: `gsupqfmwlsmwoybphimx`
Target R&D project: `vkfrsoakhssvvavmjeoy`

## Imported into R&D

- Public schema final snapshot: tables, views/materialized views, enums/types, indexes, constraints, triggers.
- Public RLS/RBAC/security grants from the QA snapshot.
- Public RPC/functions from the QA snapshot.
- Public table data from QA.
- Storage bucket definitions for `MED`, `vendor_documents`, `db-backups`, and `invoices`.
- Storage policies from QA.
- Realtime publication membership for 23 public tables.

## Verification Counts After Import

- Public tables: 219
- Public routines: 409
- Public policies: 554
- Storage buckets: 4
- Storage policies: 18
- Realtime public tables: 23
- Cron jobs: 0 intentionally left disabled
- Key data counts: organizations 12, profiles 58, invoices 467, products 579

## Files

- `010_qa_schema_snapshot.sql` - original broad schema dump including managed schemas; not used for import because Supabase blocks direct managed schema restore.
- `020_qa_data_snapshot.sql` - original broad data dump including auth/storage; not used directly.
- `011_qa_schema_snapshot_no_auth.sql` - no-auth broad dump; not used directly because realtime managed schema restore is blocked.
- `021_qa_data_snapshot_no_auth.sql` - no-auth broad data dump; not used directly.
- `012_qa_public_schema_snapshot.sql` - imported into R&D.
- `022_qa_public_data_snapshot.sql` - imported into R&D.
- `031_storage_buckets_and_policies_no_alter.sql` - imported into R&D.
- `040_realtime_publication.sql` - imported into R&D.
- `041_pending_rnd_service_role_cron.sql` - pending cron template requiring R&D service-role key.

## Pending / Manual

- Auth users and auth provider settings were not restored through SQL. Supabase blocks direct managed `auth` schema restore through the Management API, and this should be handled through Supabase-supported auth export/import or recreated for R&D users.
- Actual Supabase Storage files were not copied. SQL restores bucket definitions and policies, but not object bytes. Do not import `storage.objects` metadata unless files are copied too.
- Cron jobs are intentionally left disabled. Some QA cron jobs can send webhooks/reminders or include QA service-role tokens. Review and enable R&D-safe cron jobs manually.
- Edge Functions still need deployment from the R&D branch.
- Edge Function secrets and Auth redirect URLs still need R&D-specific setup.