# Platform Foundation Implementation Status

Last updated: 2026-07-27

This document tracks the foundation work that turns the platform from feature-complete into production-operable. It intentionally separates enforceable engineering gates from business, legal, provider, and operations decisions.

## Implemented Engineering Gates

| Foundation | Enforcement | Artifact |
| --- | --- | --- |
| Strict build/lint/typecheck behavior | CI scripts no longer mask failures with `|| true`, `IGNORE_BUILD_ERRORS`, or bypass messages. | `package.json` |
| CI app-directory execution | CI installs and runs commands from `./code`. | `.github/workflows/ci.yml` |
| Typecheck in CI | Pull requests run `npm run typecheck`. | `.github/workflows/ci.yml` |
| Foundation audit in CI | Pull requests run `npm run check:foundations`. | `.github/workflows/ci.yml`, `scripts/foundation-readiness-audit.mjs` |
| Release-gate app-directory execution | Release gate installs and runs commands from `./code`. | `.github/workflows/release-gate.yml` |
| Release-gate environment contract | Release gate passes Supabase, QA, app URL, and Stripe variables into `check-release-env`. | `.github/workflows/release-gate.yml`, `scripts/check-release-env.mjs` |
| Foundation audit in release gate | Local and CI release gate includes `foundation_readiness`. | `scripts/release-gate.mjs` |
| Stripe webhook signature/idempotency check | Foundation audit verifies Stripe webhook signature construction and webhook event logging. | `scripts/foundation-readiness-audit.mjs`, `supabase/functions/stripe-webhook/index.ts` |
| Production readiness artifact presence | Foundation audit verifies core readiness docs exist. | `scripts/foundation-readiness-audit.mjs`, `docs/production_readiness/*` |

## Production Owner Blockers

These are not safe to auto-resolve in code. They require final confirmation from the business, provider accounts, legal, or operations owner.

| Area | Required Decision |
| --- | --- |
| Platform legal identity | Final legal name, registered address, legal/privacy/security/support contacts, and support phone. |
| Governing law and legal terms | Governing state/country, venue, arbitration, class waiver, liability cap, and warranty disclaimer. |
| Data residency | Production regions for Supabase, Vercel, Azure OpenAI, Stripe, Resend, backups, and disaster recovery. |
| Support operations | Confirm staffing and tooling for promised response times and escalation coverage. |
| Backup and disaster recovery | Confirm provider backup settings, RPO/RTO, restore test evidence, and DR owner. |
| Azure OpenAI configuration | Confirm exact deployment/model names and production data handling commitments. |
| AI feature classification | Decide which AI experiences are production, beta, advisory, or disabled at launch. |
| Legal/compliance review | Final review of public terms, privacy, security, DPA, AUP, SLA, AI usage, cookie, and retention documents. |

## Remaining Engineering Program

| Priority | Foundation | Recommended Implementation |
| --- | --- | --- |
| P0 | Workflow source of truth | Move invoice approval, AP routing, payment history creation, ledger writes, and reconciliation side effects into one transactional RPC. |
| P0 | Payment provider enforcement | DB/RPC guards should reject scheduling/payment actions unless invoice route, status, tenant, and approval state are valid. |
| P0 | Observability | Add dashboards/alerts for Edge Function errors, webhook failures, payment failures, notification dispatch failures, Supabase latency, and scheduled-job failures. |
| P1 | Integration readiness inventory | Maintain a generated inventory of mock/stub/demo integrations and fail production release when any production-routed stub remains. |
| P1 | Tenant/RBAC/RLS contract tests | Extend module audit into route-to-module-to-RBAC-to-RLS coverage checks for every authenticated route and workflow RPC. |
| P1 | Environment contract by deployment tier | Add staging and production env manifests with required/optional vars, secret owners, and validation mode. |
| P2 | Operational evidence archive | Store release-gate reports, restore-test evidence, incident drills, and provider configuration screenshots as launch artifacts. |

## How To Run

Engineering readiness check:

```bash
npm run check:foundations
```

Strict production readiness check, including owner blockers from the production checklist:

```bash
FOUNDATIONS_STRICT=1 npm run check:foundations
```

Full release gate:

```bash
npm run check:release-gate:ui:report
```