# Backup and Disaster Recovery Procedure

Status: Blocked on production provider settings.

## Required Values

| Item | Final Value | Source |
| --- | --- | --- |
| Supabase backup tier | To Be Confirmed | Supabase project settings |
| Backup frequency | To Be Confirmed | Supabase project settings |
| PITR availability | To Be Confirmed | Supabase project settings |
| RPO | To Be Finalized | Operations/legal/customer commitments |
| RTO | To Be Finalized | Operations/legal/customer commitments |
| Restore test schedule | To Be Finalized | Operations |
| Disaster recovery owner | To Be Finalized | Operations |

## Restore Drill Process Draft

1. Select non-production restore target.
2. Restore latest backup or PITR snapshot.
3. Verify schema, RLS, core tenant data, auth compatibility, and sensitive vault compatibility.
4. Run smoke tests for login, invoices, vendors, payments, and reports.
5. Record drill date, elapsed restore time, issues, and remediation.

## Customer-Facing Statement Rule

If backup/PITR settings are not finalized, public documents must state only verified capabilities and avoid fixed RPO/RTO claims.
