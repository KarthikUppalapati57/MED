# Final Production Readiness Checklist

Last updated: 2026-07-24

This checklist identifies remaining items required before MEVS/Restops production release. Status labels:

- **Blocked on final decision**: needs business/legal/operations input before engineering can complete it.
- **Drafted for review**: engineering draft exists and needs legal/operations review.
- **Implemented**: code/documentation change is complete, subject to normal QA/review.

## Mandatory Before Production

| # | Area | Required Outcome | Current Status | Repo Artifact |
| --- | --- | --- | --- | --- |
| 1 | Platform Legal Identity | Final legal name, address, legal/privacy/security/support contacts, support phone | Blocked on final decision | `platform_identity_values.md` |
| 2 | Governing Law & Legal Terms | Governing state/country, venue, arbitration, class waiver, liability cap, warranty disclaimer | Blocked on final decision | `legal_terms_decisions.md` |
| 3 | Infrastructure & Data Residency | Primary country/region, data residency, DR region for Supabase, Vercel, Azure OpenAI, Stripe, Resend | Blocked on provider/account confirmation | `infrastructure_data_residency.md` |
| 4 | Security & Compliance Documents | Final review of Privacy, Terms, Security, DPA, AUP, SLA, AI Usage, Cookie, Data Retention | Drafted for review | Public pages plus `ai_usage_policy.md`, `data_retention_policy.md` |
| 5 | DSAR | Complete privacy request workflow | Drafted for review | `dsar_workflow.md` |
| 6 | Organization Deletion | Hierarchy archive/restore/permanent delete process | Drafted for review | `organization_deletion_procedure.md` |
| 7 | Support Operations | Verify 24x7 and 10-minute critical response capabilities | Blocked on operations staffing | `support_operations_validation.md` |
| 8 | Backup & DR | Backup frequency, RPO, RTO, restore tests, DR process | Blocked on production provider settings | `backup_disaster_recovery.md` |
| 9 | Incident Response | Owner, severity, escalation, notification, investigation process | Drafted for review | `incident_response_plan.md` |
| 10 | Internal Admin Security | Admin verification, least privilege, approvals, reviews, offboarding, audit logging | Drafted for review | `internal_administrative_security.md` |
| 11 | Payment & ACH Review | ACH authorization, Stripe Connect, retries, returns, reversals, late fees, revocation | Drafted for legal review | `payment_ach_review.md` |
| 12 | AI Verification | Exact Azure OpenAI deployment/model name verified before publication | Blocked on Azure deployment confirmation | `ai_usage_policy.md` |
| 13 | AI Feature Classification | AI Assistant/chatbot production vs beta classification | Blocked on product decision | `ai_usage_policy.md` |
| 14 | Open Source Compliance | OSS inventory, license review, notices, update process | Drafted for review | `open_source_compliance.md` |

## Recommended After Launch

| Area | Recommendation | Suggested Artifact |
| --- | --- | --- |
| Customer Data Export | Expand profile-only export to organization-level export | Product/engineering backlog |
| Administrative Deletion Workflow | UI for archive, restore, permanent deletion, audit review | Product/engineering backlog |
| Subprocessor Management | Public/admin-managed subprocessor page with effective dates and regions | `subprocessor_management.md` |
| Consent Management | Immutable acceptance logs for Terms, Privacy, ACH, e-sign, cookies, policy versions | `consent_management.md` |
| Automated Testing | Tests for inactivity logout, manual-entry confirmation, consent, deletion, AI review, RBAC/RLS | Test backlog |

## Completion Criteria

Production readiness requires all mandatory items to be either completed or formally approved, all customer-facing documents to match implemented behavior, and operational commitments to match actual staffing and provider capabilities.
