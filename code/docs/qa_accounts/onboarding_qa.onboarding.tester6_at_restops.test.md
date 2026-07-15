# Tester 6 - Onboarding Scenario Account

## Login

```text
Staging URL: ask admin / project owner
Email: qa.onboarding.tester6@restops.test
Password: ask admin for ONBOARDING_SANDBOX_PASSWORD
```

## Assigned Use

```text
Person: Tester 6
Scenario: Subscription payment verified, hierarchy setup next
Use this account to: Test organization, brand, and location hierarchy setup.
```

## Fake Business Details

```text
Legal business name: QA Sandbox Company 006 LLC
Business type: LLC
Tax identifier type: EIN
Fake EIN: 99-8800677
Stored EIN last 4: 0067
Business email: qa.onboarding.tester6@restops.test
Business phone: +18655551006
Website: https://qa-sandbox-006.example.test
```

## Fake Address Details

Use this same fake address for business, mailing, billing, and service address if the flow asks for it.

```text
Address line 1: 106 Sandbox Test Way
Address line 2: leave blank
City: Knoxville
State: TN
ZIP: 37916
Country: US
```

## Fake Organization Details

```text
Organization: QA Sandbox Org 006
Brand: QA Sandbox Brand 006
Location: QA Sandbox Location 006
```

## Fake Bank Details

The seeded app stores only last-four style fake values for the saved account. If a manual sandbox bank-entry screen asks for full values, use the manual sandbox values below.

```text
Bank name: Sandbox Bank 006
Account holder: QA Sandbox Company 006 LLC
Account type: checking
Seeded routing last 4: 1006
Seeded account last 4: 9006
Manual sandbox routing number: 222222226
Manual sandbox account number: 1000000006
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
