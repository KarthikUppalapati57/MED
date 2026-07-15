# Onboarding Sandbox Staging Runbook

This runbook prepares staging for onboarding QA without using real business, tax, card, or bank data.

## What This Sandbox Covers

The seeded accounts cover the full tenant onboarding path:

| Account | Scenario |
| --- | --- |
| `qa.onboarding.tester1@restops.test` | Fresh signup, no onboarding started |
| `qa.onboarding.tester2@restops.test` | Business verification draft saved |
| `qa.onboarding.tester3@restops.test` | Business verification pending platform review |
| `qa.onboarding.tester4@restops.test` | Business verification rejected and editable |
| `qa.onboarding.tester5@restops.test` | Business verified, payment method next |
| `qa.onboarding.tester6@restops.test` | Subscription payment verified, hierarchy next |
| `qa.onboarding.tester7@restops.test` | Org created, operating bank saved, signature pending |
| `qa.onboarding.tester8@restops.test` | Full onboarding complete |
| qa.onboarding.developer@restops.test | Full onboarding complete for developer checks |
| qa.fullaccess.tester1@restops.test - qa.fullaccess.tester8@restops.test | Full platform access with all modules enabled |
| qa.fullaccess.developer@restops.test | Full platform access with all modules enabled for developer checks |

All seeded business and bank values are fake, unique per account, and marked with sandbox metadata.

## Required Staging Environment Variables

Set these in the staging host and in local shells when seeding:

```bash
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
ROLE_QA_BASE_URL=https://staging.example.com
ONBOARDING_SANDBOX_PASSWORD=...
```

Keep `SUPABASE_SERVICE_ROLE_KEY`, provider secrets, and webhook secrets server-side only.

## Provider Sandbox Variables

### Stripe

Use Stripe sandbox/test keys only:

```bash
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

Useful Stripe test values:

| Scenario | Value |
| --- | --- |
| Successful Visa card | `4242 4242 4242 4242` |
| Successful test PaymentMethod | `pm_card_visa` |
| Expiry | Any future date, for example `12/34` |
| CVC | Any 3 digits |

Source: Stripe testing docs: https://docs.stripe.com/testing

### Dwolla

Use Dwolla sandbox credentials only:

```bash
DWOLLA_ENVIRONMENT=sandbox
DWOLLA_KEY=...
DWOLLA_SECRET=...
```

This repo uses `DWOLLA_ENVIRONMENT=sandbox` to route API calls to `https://api-sandbox.dwolla.com`. Do not set `DWOLLA_ENVIRONMENT=production` in staging.

Useful Dwolla sandbox values:

| Scenario | Value |
| --- | --- |
| API base URL | `https://api-sandbox.dwolla.com` |
| Funding-source routing number | `222222226` |
| Funding-source account number | Any random 4-17 digit number |
| Successful microdeposit verification | Any two amounts below `$0.10` |
| Failed microdeposit attempt simulation | `0.09` and `0.09` |
| Transfer processing | Use `/sandbox-simulations` or the Sandbox Dashboard process button |
| ACH failure simulation | Set funding source `name` to values like `R01`, `R03`, `R01-late`, or `R03-late` |

For bank numbers inside this app's seeded onboarding sandbox, use the generated fake account values from `scripts/seed-onboarding-sandbox.mjs` unless you are intentionally exercising the real Dwolla sandbox API.

Source: Dwolla sandbox testing docs: https://developers.dwolla.com/docs/testing

### Checkbook.io

Use Checkbook sandbox keys only:

```bash
CHECKBOOK_ENV=sandbox
CHECKBOOK_API_KEY=...
CHECKBOOK_API_SECRET=...
CHECKBOOK_WEBHOOK_SECRET=...
```

This repo currently sends non-production Checkbook calls to `https://demo.checkbook.io/v3/check` unless `CHECKBOOK_ENV=production`. Checkbook's current docs list sandbox API base URL as `api.sandbox.checkbook.io`; before enabling full Checkbook sandbox payout testing, align the edge function base URL with your Checkbook account's sandbox endpoint.

Useful Checkbook sandbox values:

| Scenario | Value |
| --- | --- |
| Instant bank verification username | `user_good` |
| Instant bank verification password | `pass_good` |
| Manual microdeposit amounts | `0.07` and `0.15` |
| Verification code | `123123` |

Source: Checkbook environments docs: https://docs.checkbook.io/docs/concepts/environments/

### Plaid

Plaid is present in env config but is not currently wired as the active onboarding payment rail in this repo.

```bash
PLAID_CLIENT_ID=...
PLAID_SECRET=...
PLAID_ENV=sandbox
```

Useful Plaid sandbox values:

| Scenario | Value |
| --- | --- |
| Basic username | `user_good` |
| Basic password | `pass_good` |
| Auth microdeposit username | `user_good` |
| Auth microdeposit password | `microdeposits_good` |
| Limited-purpose checking username | `user_limited_purpose_checking` |
| Limited-purpose checking password | `pass_good` |

Source: Plaid sandbox test credentials: https://plaid.com/docs/sandbox/test-credentials/

## Commands

From `code/`:

```bash
npm run check:staging-sandbox
npm run seed:onboarding-sandbox
npm run seed:role-qa
npm run smoke:role
```

For PowerShell local seeding:

```powershell
$env:SUPABASE_SERVICE_ROLE_KEY="..."
$env:ONBOARDING_SANDBOX_PASSWORD="StrongTestOnlyPassword123!"
npm run check:staging-sandbox
npm run seed:onboarding-sandbox
```

## Safety Rules

- Never use real EIN, SSN, bank account, routing, card, or customer data in staging QA.
- Never use `pk_live_`, `sk_live_`, `DWOLLA_ENVIRONMENT=production`, `CHECKBOOK_ENV=production`, or `PLAID_ENV=production` in staging.
- Give each tester their own account. Do not let 8 testers share one onboarding user.
- Rerun `npm run seed:onboarding-sandbox` whenever QA needs a clean onboarding state.
- Provider credentials belong in Supabase/Vercel/environment secrets, not committed files.
