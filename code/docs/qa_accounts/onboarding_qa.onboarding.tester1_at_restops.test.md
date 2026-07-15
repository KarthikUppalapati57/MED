# Tester 1 - Onboarding Scenario Account

## Login

```text
Staging URL: ask admin / project owner
Email: qa.onboarding.tester1@restops.test
Password: ask admin for ONBOARDING_SANDBOX_PASSWORD
```

## Assigned Use

```text
Person: Tester 1
Scenario: Fresh signup, no onboarding started
Use this account to: Test onboarding from the very beginning.
```

## Fake Business Details

```text
Legal business name: QA Sandbox Company 001 LLC
Business type: LLC
Tax identifier type: EIN
Fake EIN: 99-8800177
Stored EIN last 4: 0017
Business email: qa.onboarding.tester1@restops.test
Business phone: +18655551001
Website: https://qa-sandbox-001.example.test
```

## Fake Address Details

Use this same fake address for business, mailing, billing, and service address if the flow asks for it.

```text
Address line 1: 101 Sandbox Test Way
Address line 2: leave blank
City: Knoxville
State: TN
ZIP: 37911
Country: US
```

## Fake Organization Details

```text
Organization: QA Sandbox Org 001
Brand: QA Sandbox Brand 001
Location: QA Sandbox Location 001
```

## Fake Bank Details

The seeded app stores only last-four style fake values for the saved account. If a manual sandbox bank-entry screen asks for full values, use the manual sandbox values below.

```text
Bank name: Sandbox Bank 001
Account holder: QA Sandbox Company 001 LLC
Account type: checking
Seeded routing last 4: 1001
Seeded account last 4: 9001
Manual sandbox routing number: 222222226
Manual sandbox account number: 1000000001
```

## Payment Sandbox Values

```text
Stripe card: 4242 4242 4242 4242
Stripe expiry: any future date, example 12/34
Stripe CVC: any 3 digits
Stripe PaymentMethod: pm_card_visa
Dwolla routing number: 222222226
Checkbook instant username: user_good
Checkbook instant password: pass_good
Checkbook microdeposits: 0.07 and 0.15
Plaid username: user_good
Plaid password: pass_good
```

## Safety Rules

- Do not use real EIN, SSN, bank, card, or customer data.
- Do not share this account outside the QA/developer team.
- Report this exact email address when filing bugs.
- Ask an admin/developer to rerun `npm run seed:onboarding-sandbox` if the account state becomes messy.
