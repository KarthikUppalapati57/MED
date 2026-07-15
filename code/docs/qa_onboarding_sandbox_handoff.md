# QA Onboarding Sandbox Handoff

Use this document to test tenant onboarding in staging. This sandbox is for testers and developers only.

## Purpose

The staging onboarding sandbox lets the team test the full onboarding process without using real business, tax, payment, or banking information.

Do not use real customer data in staging.

Do not use:

- Real EIN
- Real SSN
- Real routing number
- Real bank account number
- Real credit/debit card
- Real business documents
- Real customer/vendor information

## Staging URL

Use the staging app URL provided by the admin:

```text
STAGING_URL: ask admin / project owner
```

## Shared Sandbox Password

All sandbox onboarding accounts use the same test-only password.

```text
Password: ask admin for ONBOARDING_SANDBOX_PASSWORD
```

This password is only for staging/sandbox. Do not reuse it for production or personal accounts.

## Tester Account Assignments

Each tester gets two accounts:

1. An onboarding scenario account for testing a specific onboarding state.
2. A full-access account for testing the entire platform after onboarding is complete.

Do not share one account across all testers.

### Onboarding Scenario Accounts

| Person | Login Email | Scenario |
| --- | --- | --- |
| Tester 1 | `qa.onboarding.tester1@restops.test` | Fresh signup, no onboarding started |
| Tester 2 | `qa.onboarding.tester2@restops.test` | Business form draft saved |
| Tester 3 | `qa.onboarding.tester3@restops.test` | Business verification pending platform review |
| Tester 4 | `qa.onboarding.tester4@restops.test` | Business verification rejected and editable again |
| Tester 5 | `qa.onboarding.tester5@restops.test` | Business verified, payment method next |
| Tester 6 | `qa.onboarding.tester6@restops.test` | Subscription payment verified, hierarchy setup next |
| Tester 7 | `qa.onboarding.tester7@restops.test` | Organization created, operating bank saved, signature pending |
| Tester 8 | `qa.onboarding.tester8@restops.test` | Full onboarding completed |
| Developer | `qa.onboarding.developer@restops.test` | Full onboarding completed for developer checks |

### Full-Platform Access Accounts

Use these accounts when testing modules like invoices, invoice upload, payments, vendors, inventory, products, recipes, labor, accounting, integrations, performance, admin, and dashboard.

| Person | Login Email | Access |
| --- | --- | --- |
| Tester 1 | `qa.fullaccess.tester1@restops.test` | Full platform access, all modules enabled |
| Tester 2 | `qa.fullaccess.tester2@restops.test` | Full platform access, all modules enabled |
| Tester 3 | `qa.fullaccess.tester3@restops.test` | Full platform access, all modules enabled |
| Tester 4 | `qa.fullaccess.tester4@restops.test` | Full platform access, all modules enabled |
| Tester 5 | `qa.fullaccess.tester5@restops.test` | Full platform access, all modules enabled |
| Tester 6 | `qa.fullaccess.tester6@restops.test` | Full platform access, all modules enabled |
| Tester 7 | `qa.fullaccess.tester7@restops.test` | Full platform access, all modules enabled |
| Tester 8 | `qa.fullaccess.tester8@restops.test` | Full platform access, all modules enabled |
| Developer | `qa.fullaccess.developer@restops.test` | Full platform access, all modules enabled |

## How To Test The Entire Platform

For full-platform testing, use the `qa.fullaccess.*@restops.test` accounts, not the blocked onboarding-state accounts.

These full-access accounts are seeded as completed onboarding users with all modules enabled, including:

- Dashboard
- Invoices
- Payments
- Products
- Inventory
- Orders
- SmartPrep
- Ask Tom
- Recipes
- Vendors
- Labor
- Admin
- Integrations
- Performance
- Accounting
- Setup

Examples of workflows testers can use full-access accounts for:

- Upload invoices
- Review extracted invoice data
- Edit invoice line items
- Validate invoice approvals
- Check invoice payment status
- Test vendor payments
- Test ACH/check payout screens
- Manage products and inventory
- Review dashboard and performance pages
- Test accounting and integration screens
## Dedicated Fake Details Per Account

Each QA account has its own dedicated fake business, address, organization, and bank details.

Open the account detail index here:

[QA account detail files](./qa_accounts/README.md)

Use the file matching your assigned login email.
## What Each Scenario Is For

### Tester 1: Fresh Signup

Use this account to test the onboarding flow from the beginning.

Expected starting point:

```text
Business verification has not started.
```

### Tester 2: Draft Business Form

Use this account to test saved progress and continuing a draft.

Expected starting point:

```text
Business verification form has existing draft data.
```

### Tester 3: Pending Business Review

Use this account to test what a customer sees after submitting business verification and waiting for admin approval.

Expected starting point:

```text
Business verification is pending platform review.
```

### Tester 4: Rejected Business Review

Use this account to test rejected verification, editing, and resubmission.

Expected starting point:

```text
Business verification was rejected and should be editable again.
```

### Tester 5: Business Verified

Use this account to test payment setup after business verification is already approved.

Expected starting point:

```text
Business verification is complete. Payment method should be next.
```

### Tester 6: Payment Verified

Use this account to test organization, brand, and location hierarchy setup after subscription payment is verified.

Expected starting point:

```text
Payment is verified. Hierarchy setup should be next.
```

### Tester 7: Bank Signature Pending

Use this account to test the operating bank authorization/signature step.

Expected starting point:

```text
Organization exists. Operating bank account is saved but signature is still pending.
```

### Tester 8: Fully Completed

Use this account to test the normal post-onboarding app experience.

Expected starting point:

```text
Onboarding is complete.
```

### Developer Account

Use this account for developer checks, debugging, smoke testing, and post-onboarding validation.

Expected starting point:

```text
Onboarding is complete.
```

## Sandbox Payment Test Details

### Stripe Sandbox

Use only Stripe test values in staging.

```text
Successful test card: 4242 4242 4242 4242
Expiry: any future date, example 12/34
CVC: any 3 digits
ZIP: any valid ZIP
Test PaymentMethod: pm_card_visa
```

Never use a real card in staging.

### Dwolla Sandbox

Use only Dwolla sandbox values in staging.

```text
Environment: sandbox
API base URL: https://api-sandbox.dwolla.com
Routing number: 222222226
Account number: any random 4-17 digit number
Successful microdeposit verification: any two amounts below $0.10
Failed microdeposit simulation: 0.09 and 0.09
```

For seeded onboarding accounts, fake bank details are already generated uniquely per account.

### Checkbook.io Sandbox

Use only Checkbook sandbox values in staging.

```text
Environment: sandbox
API base URL: https://api.sandbox.checkbook.io
Instant bank username: user_good
Instant bank password: pass_good
Manual microdeposit amounts: 0.07 and 0.15
Verification code: 123123
```

### Plaid Sandbox

Use only Plaid sandbox values in staging.

```text
Environment: sandbox
Basic username: user_good
Basic password: pass_good
Microdeposit username: user_good
Microdeposit password: microdeposits_good
Limited-purpose checking username: user_limited_purpose_checking
Limited-purpose checking password: pass_good
```

## Rules For Testers

Follow these rules during testing:

1. Use only your assigned QA account.
2. Do not use real business information.
3. Do not use real bank information.
4. Do not use real card information.
5. Do not upload real tax, identity, or business documents.
6. Do not share the sandbox password outside the team.
7. Report which QA account you used when filing an issue.
8. If your account state becomes messy, ask an admin/developer to reseed the onboarding sandbox.

## How To Report Issues

When reporting a bug, include this information:

```text
Tester account used:
Scenario:
Page/step:
Expected result:
Actual result:
Browser:
Device:
Time and timezone:
Screenshot/video:
Any visible error message:
```

Example:

```text
Tester account used: qa.onboarding.tester4@restops.test
Scenario: rejected business verification
Page/step: business verification resubmission
Expected result: form should be editable and allow resubmission
Actual result: page redirects to dashboard
Browser: Chrome
Device: Windows laptop
Time and timezone: July 15, 2026, 2:30 PM ET
Screenshot/video: attached
Error message: none
```

## Admin / Developer Setup

Run these commands from the `code` folder.

First, set staging environment variables.

PowerShell example:

```powershell
$env:SUPABASE_SERVICE_ROLE_KEY="your-staging-service-role-key"
$env:ONBOARDING_SANDBOX_PASSWORD="StrongTestOnlyPassword123!"
$env:DWOLLA_ENVIRONMENT="sandbox"
$env:CHECKBOOK_ENV="sandbox"
$env:PLAID_ENV="sandbox"
```

Then check that staging is safe:

```bash
npm run check:staging-sandbox
```

Then seed or reset the onboarding sandbox accounts:

```bash
npm run seed:onboarding-sandbox
```

Optional role QA seed:

```bash
npm run seed:role-qa
```

## Staging Safety Check

Before testing, staging should pass:

```bash
npm run check:staging-sandbox
```

This check fails if required sandbox settings are missing or unsafe.

It protects against mistakes like:

```text
Using Stripe live keys in staging
Using DWOLLA_ENVIRONMENT=production in staging
Using CHECKBOOK_ENV=production in staging
Using PLAID_ENV=production in staging
Missing ONBOARDING_SANDBOX_PASSWORD
```

## Production Warning

These accounts and test values are only for staging/sandbox.

Never use these sandbox accounts or shared passwords in production.

Never test production onboarding with fake repeated data unless the compliance/admin team has explicitly approved a production test plan.
