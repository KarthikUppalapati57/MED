# RestOps-360 Legal Package — Changelog and Launch Checklist

**Prepared:** July 24, 2026  
**Owner:** Mindful Tech Solutions Inc.  
**Product:** RestOps-360

> Internal document. This is a drafting and implementation package, not a substitute for advice from licensed counsel.

## 1. Files in This Package

| File | Suggested route | Purpose |
|---|---|---|
| `privacy_policy.md` | `/privacy` | Comprehensive privacy notice, including SMS, AI, vendors, state rights, retention, and subprocessors |
| `terms_of_service.md` | `/terms` | B2B SaaS contract terms |
| `sms_terms_and_conditions.md` | `/sms-terms` | ACS/carrier-ready terms for transactional OTP messages |
| `acceptable_use_policy.md` | `/acceptable-use` | Security, payment, data, API, AI, and messaging restrictions |
| `cookie_policy.md` | `/cookies` | Current necessary-storage approach and future consent controls |
| `data_processing_addendum.md` | `/dpa` | Customer DPA with U.S. state terms, subprocessors, incident obligations, and safeguards |
| `security_policy.md` | `/security` | Public security overview without unverified certification claims |
| `service_level_agreement.md` | `/sla` | 99.9% SLA, credit tiers, support priorities, exclusions, and claim process |
| `subprocessor_list.md` | `/subprocessors` | Standalone production subprocessor disclosure |
| `website_sms_compliance_implementation.md` | Internal | Exact opt-in copy, templates, Azure application language, screenshots, records, and QA |

## 2. Material Corrections Made

- Standardized the product name as **RestOps-360**.
- Identified the operating business as **Mindful Tech Solutions Inc.**
- Added a dedicated transactional **SMS Terms and Conditions** page.
- Added SMS consent, no-marketing, opt-out, HELP, carrier, retention, and mobile-data-sharing disclosures.
- Added Microsoft Azure Communication Services to the privacy, DPA, security, and subprocessor disclosures.
- Replaced the proposed **1% per day** late fee with the lesser of **1.5% per month or the maximum legal rate**.
- Replaced an unqualified 24x7/10-minute promise with a support severity model and a 30-minute P1 target.
- Added binding SLA service-credit tiers and a 30-day claim process.
- Added customer-data ownership, confidentiality, third-party integrations, AI review, indemnity, warranty, liability, termination, export, and dispute terms.
- Added U.S. state service-provider/contractor restrictions to the DPA.
- Added a detailed security schedule and active-only subprocessor approach.
- Removed planned vendors from the production subprocessor list until actually enabled.
- Expanded the AUP to cover SMS spam, consent misuse, opt-out evasion, payment fraud, tenant abuse, and AI misuse.
- Removed internal source-code references from public policy copy.

## 3. Critical Launch Decisions to Confirm

### Legal identity and address

- Confirm the exact registered legal name. Current drafting uses **Mindful Tech Solutions Inc.**
- Confirm whether the correct office suite is **Suite 111 or Suite 211**. Public sources are inconsistent.
- This package intentionally uses the street address without a suite until confirmed.

### Contact routing

The current package uses `contact@mindfultechsol.com` and `+1 (865) 666-7690`. For stronger brand and operational separation, create and monitor:

- `privacy@restops-360.com`
- `security@restops-360.com`
- `support@restops-360.com`
- `legal@restops-360.com`
- `abuse@restops-360.com`

Do not publish an address until it is configured, monitored, and included in escalation procedures.

### Commercial terms

Confirm before publication:

- actual monthly price and per-location definition;
- whether subscriptions are monthly, annual, or both;
- cancellation notice and committed-term rules;
- trial eligibility and conversion;
- refund policy;
- implementation and data-migration fees;
- late-payment and returned-payment fees;
- tax handling;
- data-export format and post-termination access; and
- whether negotiated enterprise Orders override public terms.

### SLA readiness

Confirm that operations can support:

- 99.9% monthly Core Platform availability;
- 24x7 intake for Priority 1 incidents;
- 30-minute P1 initial response;
- 48-hour maintenance notice;
- telemetry sufficient to calculate availability; and
- service-credit administration.

Adjust the SLA before publication if the team cannot reliably meet these commitments.

### Security claims

Validate in production:

- password policy and session timeout;
- MFA behavior;
- RBAC and row-level security coverage;
- tenant and location isolation tests;
- encryption and secret-storage design;
- backup frequency, retention, and restore testing;
- incident roles and notification contacts;
- dependency and vulnerability processes;
- production logging and access review;
- provider regions and data residency; and
- deletion from active systems and backups.

Do not claim SOC 2, ISO 27001, PCI DSS, HIPAA, or other certification until formally verified.

### Subprocessors

Confirm active production use and contracts for:

- Supabase;
- Vercel;
- Microsoft Azure / Azure OpenAI / Azure Communication Services;
- Stripe; and
- Resend.

Do not list Checkbook, Dwolla, Plaid, Google Cloud Run, PostHog, Sentry, Gemini, EmailJS, or another provider as active unless it actually processes production customer personal data and is contractually approved.

## 4. Website Publishing Requirements

- Publish all policy pages over HTTPS.
- Link Privacy, Terms, SMS Terms, Cookies, Security, DPA, SLA, and Subprocessors in the global footer.
- Ensure pages are available without login.
- Ensure mobile rendering and accessible heading structure.
- Add the effective date to every page.
- Use stable URLs and avoid redirects during ACS verification.
- Version acceptance for Terms, Privacy, SMS Terms, ACH authorizations, and material updates.
- Keep immutable copies of each published version.
- Record user ID, timestamp, version, IP/session evidence where appropriate, and acceptance action.
- Make Privacy and SMS Terms links visible beside every phone collection field used for SMS.
- Do not bury SMS disclosure only in the footer or behind a tooltip.
- Do not use a pre-checked SMS consent box.
- Separate transactional OTP consent from any future marketing consent.

## 5. Azure Communication Services Submission Gate

Do not submit toll-free verification until:

- the public website is fully established and active;
- Privacy Policy and SMS Terms are live;
- the opt-in page is publicly demonstrable;
- screenshots show the disclosure at the point of phone-number collection;
- sample OTP, STOP, START, and HELP messages are finalized;
- the toll-free number is associated with the correct Azure resource;
- business registration information matches the legal entity;
- expected monthly volume is documented;
- the sender identity is consistent as RestOps-360 / Mindful Tech Solutions Inc.; and
- a production suppression and consent-record process is tested.

## 6. Counsel Review Priorities

Ask U.S. technology/SaaS counsel to review:

1. legal entity and DBA usage;
2. subscription, renewal, cancellation, trial, and refund terms;
3. liability cap, indemnities, and Tennessee forum;
4. ACH, payments, vendor authorization, and NACHA language;
5. privacy rights and state-law applicability;
6. SMS/TCPA, carrier, and ACS registration materials;
7. tax-identifier and banking-data handling;
8. AI disclosures and customer responsibilities;
9. DPA, international-transfer positioning, and security commitments; and
10. enforceable clickwrap and electronic-record implementation.

## 7. Recommended Acceptance Events

| Event | Required acceptance |
|---|---|
| Account creation | Terms of Service + Privacy Policy acknowledgment |
| Send Verification Code | SMS disclosure and SMS Terms link |
| Subscription checkout | Order terms, pricing, renewal, cancellation, Terms |
| ACH enrollment | Standalone ACH authorization and provider terms |
| Vendor bank change | Re-verification, authorization, and audit record |
| Material policy update | Notice and re-acceptance when legally or contractually required |
