# Platform Legal & Privacy Inventory Draft

Prepared from repository scan on 2026-07-24.

This is an engineering-derived draft, not legal advice. It now includes final governance decisions supplied by the user; remaining `To Be Finalized` items are listed in the governance section.


## Final Governance Decisions Incorporated

Source: `Final Legal & Governance Decisions` attachment reviewed on 2026-07-24.

Finalized decisions now available:

- Launch communication channels are email and in-app notifications only. SMS, telephone, and automated voice are future channels and require separate lawful consent before enablement.
- ACH authorization covers monthly subscription charges, approved recurring platform fees, late payment charges, returned payment fees, gateway processing fees where applicable, retries after failed transactions, and returned ACH item processing.
- Customers may revoke ACH authorization by written notice, but revocation does not remove outstanding obligations.
- Electronic signatures are accepted for ACH authorizations, subscription agreements, Terms & Conditions, customer consents, and other legally binding platform agreements.
- Electronic signature records are retained for the duration required by applicable contractual, financial, tax, regulatory, and legal recordkeeping requirements.
- Sensitive information, including EIN, SSN, W-9s, banking information, ACH authorizations, electronic signatures, and tax documents, follows the hierarchy lifecycle unless longer retention is legally required: active hierarchy -> 30-day archive -> permanent deletion. If longer retention is required, retain only the minimum required information.
- Vendor manual entry requires explicit confirmation: "I confirm that the vendor has authorized me to enter this information into the platform." The submitting user and audit metadata must be recorded.
- Current production subprocessors/technologies are Azure OpenAI, Supabase, Vercel, Stripe ACH Debit, Stripe Connect Custom, and Resend.
- Planned/future technologies are Checkbook, Dwolla, Plaid, and Google Cloud Run.
- Google Gemini, PostHog, and Sentry are deprecated/not intended for production. Existing code/config/legal references must be removed or disabled before production and should not be listed as active production subprocessors.
- AI provider is Azure OpenAI. Model is `GPT-5.4 Mini`, subject to verification against the final Azure deployment name before public publication.
- AI features are invoice extraction, AI Assistant, and optional chatbot. AI-extracted information requires human review and approval before becoming operational records. Customer information is never used to train public or shared AI models.
- Free trial is a promotional three-month trial for the first 100 customer locations across the entire platform, not per customer.
- Late payment policy is a two-calendar-day grace period, then 1% late charge per calendar day, subject to legal review for applicable jurisdictions.
- Support target is 24x7 by email, telephone, and in-app chat, with 10-minute target initial response for critical issues. This commitment must be reviewed before public launch to ensure operations can support it.

Remaining finalization items are tracked in `Outstanding Decisions Before Production Launch` below.


## Outstanding Decisions Before Production Launch

Status: Pending / required before production.

The platform governance package is not complete until the following items are finalized and the production codebase is aligned with the approved architecture.

### 1. Platform Legal Identity

Required values:

- Legal Company Name
- Registered Business Address
- Legal Contact Email
- Privacy Contact Email
- Security Contact Email
- Support Email
- Support Telephone Number

These values will be referenced throughout the Terms & Conditions, Privacy Policy, Security Policy, DPA, SLA, and related legal documents.

### 2. Governing Law And Dispute Resolution

Required decisions:

- Governing State
- Legal Venue / Court / Jurisdiction
- Arbitration Requirement
- Class Action Waiver

These decisions are required before final Terms & Conditions publication.

### 3. Production Infrastructure Regions

The following providers require production region documentation:

- Supabase
- Vercel
- Azure OpenAI
- Stripe
- Resend

For each provider, record:

- Primary Region
- Backup Region, if applicable
- Country
- Data residency notes, if applicable

This information belongs in the Privacy Policy, Security Policy, DPA, and Subprocessor List.

### 4. Technology Inventory Verification

Upstash has been classified as removed. The unused shared Edge Function helper was deleted because no runtime function imported it.

EmailJS has been classified as removed/disabled for production. Browser-side EmailJS dependencies, environment variables, and runtime sending were removed or replaced with a disabled facade; transactional mail must route through Resend-backed Edge Functions.

If either service is not part of production, remove related references from source code, infrastructure configuration, deployment configuration, privacy/security documentation, subprocessor list, and technical documentation.

### 5. Production Cleanup

The following technologies are not approved for production:

- Google Gemini
- PostHog
- Sentry

Before production release, remove or disable all production references, environment variables, dependencies, infrastructure configuration, documentation references, Privacy Policy references, Cookie Policy references, Security Policy references, and Subprocessor List references.

Only technologies active in production may appear in customer-facing documentation.

### Governance Completion Checklist

- [ ] Platform legal identity information finalized.
- [ ] Governing law and dispute resolution finalized.
- [ ] Production infrastructure regions documented.
- [x] Upstash usage verified and removed.
- [x] EmailJS usage verified and disabled/removed for production.
- [x] Google Gemini removed or disabled for production runtime paths.
- [x] PostHog removed or disabled for production.
- [x] Sentry removed or disabled for production.
- [ ] Production codebase aligned with legal, privacy, security, and subprocessor documentation.

## Document Information

| Field | Value |
| --- | --- |
| Platform Name | RestOps / MEVS (`mevs-supabase-app`) |
| Version | App package version `0.0.0`; draft inventory version `2026-07-24` |
| Prepared By | Codex scan of local repository |
| Reviewed By | To Be Finalized |
| Last Updated | 2026-07-24 |
| Status | Draft |

## 1. Platform Overview

RestOps is a multi-tenant restaurant/hospitality operations SaaS for invoice capture, AP workflow, vendor management, inventory, product/catalog management, recipes/menu costing, labor/performance analytics, payments, integrations, and AI-assisted insights.

Target customers appear to be restaurants, multi-unit hospitality groups, kitchens, and operations teams. The business model is monthly subscription billing per active Location, with AutoPay required. The promotional free trial is three months for the first 100 customer Locations across the entire platform. Refunds are not offered; cancellation requires three months written notice; suspension begins after 10 days of nonpayment and termination after 30 days.

Initial production launch geography is United States only. Canada and international expansion are planned future phases and require compliance review before launch. Privacy rights are provided according to applicable law until a global privacy model is adopted.

Core modules found: authentication, organization/brand/location management, RBAC, vendor management, invoice processing, approval workflows, payments/bill pay, accounting/ledger, inventory, products, recipes/menu engineering, reporting, API keys, webhooks, notifications, AI insights, OCR extraction, billing/subscriptions, labor, POS/delivery integrations, commissary, food safety, CRM/marketing, mobile app, platform admin console, and audit logs.

## 2. User & Role Matrix

Implemented role vocabulary includes `platform_admin`, `tenant_super_admin`, `org_manager`, `org_owner`, `branch_manager`, `location_manager`, `ground_staff`, and custom role tables. Some older docs use `org_owner`; newer auth code includes `tenant_super_admin` and `org_manager`. Needs cleanup before legal docs: choose final customer-facing role names.

| Role | Responsibilities | Permissions | Restrictions |
| --- | --- | --- | --- |
| Platform Admin | Platform-wide support/admin, plans, tenants, audit vault | Platform-wide access via policies and platform console | Should be limited to authorized internal staff |
| Tenant Super Admin / Org Owner | Owns tenant organization | Manage tenant/org, users, accounting, context, modules | Tenant-scoped except support/platform paths |
| Org Manager | Organization administration and accounting | Manage users/org/accounting and most operational modules | Tenant-scoped |
| Branch Manager | Brand-level operations | Manage brand/location users, approve/create/edit/delete within scope | Brand-scoped |
| Location Manager | Store/location workflows | Upload, edit, approve, create, manage local users/staff workflows | Location-scoped |
| Ground Staff | Frontline operational work | View/upload limited operational data | No admin or broad financial control |
| Vendor | Vendor onboarding and document/banking/tax submission paths appear implemented | Vendor link/token workflows | External portal scope only; final permissions need confirmation |
| Auditor | Not a first-class app role found; audit pages available to org/platform admins | Needs decision | Needs decision |
| Support Staff | Not a first-class role found except platform admin | Needs decision | Needs decision |

## 3. Account & Identity

Authentication uses Supabase Auth with email/password, password reset, OAuth SSO hooks, persistent sessions, auto token refresh, and TOTP MFA enrollment/challenge. The app supports invitation acceptance and onboarding gates.

Account lifecycle found: signup, login, logout, password reset, profile update, MFA enroll/unenroll, invitation acceptance, skeleton profile creation, role/context switching, user deletion/deactivation paths, data export, and account deletion request logging. The profile privacy UI records deletion requests and notifies managers; it does not appear to self-serve hard-delete the account.

Final governance identity/security decisions include optional MFA, minimum 15-character passwords, high-complexity password policy, and a 30-minute inactivity timeout. Still to specify in downstream policy: concurrent session/device policy, account recovery process, tenant deletion operational procedure, and support identity verification procedure.

## 4. Tenant Architecture

The current target architecture is shared public-table multi-tenancy. `organization_id` is the hard tenant boundary on tenant-owned business tables. `brand_id` and `location_id` enforce sub-tenant access. RLS/RBAC is the database security boundary, backed by helper functions and membership tables. Financial workflow mutations are intended to happen through tenant-safe server-side RPCs.

Architecture docs state schema-per-tenant is deprecated and retained only for audit/back-migration until removal. New tenant-owned tables must include `organization_id`; derived reporting tables are rebuildable and should not become source of truth.

## 5. Data Inventory

Personal data: name, email, phone, user ID, role, organization/brand/location IDs, login/session metadata from Supabase Auth, MFA factors, password credentials handled by Supabase, invite tokens, audit actor IDs, notification preferences, and profile metadata.

Business data: organization, brand, location, vendors, supplier contacts, products, inventory, recipes, invoice headers, invoice line items, payment/accounting records, purchase orders, approvals, GL mappings, labor schedules/time clocks, POS/order data, CRM/customers/loyalty/campaign data, commissary/receiving data, food safety/IoT temperature logs, reports, budgets, and dashboard workflow data.

Uploaded/generated files: invoice PDFs/images, vendor documents, contracts/document vault content, Excel/CSV imports, OCR/raw text output, Docling markdown, AI normalized invoice JSON, AI insights, validation results, error/debug logs, audit logs, webhook logs, and generated reports.

Sensitive financial/vendor data: vendor tax information, vendor banking details, bank accounts, provider links, payment provider events, payment terms acceptances, onboarding bank accounts, and payment authorizations. Migrations indicate Supabase Vault use for secrets and decrypt audit logging.

### Sensitive Information Deep Dive

Communication data:

- User and vendor email addresses are used for account login, invitations, password reset, vendor onboarding OTPs, vendor magic links, due-date reminders, demo/request notifications, and platform notifications.
- Vendor OTP uses email as the current channel. OTPs are six-digit codes, stored as SHA-256 hashes in `vendor_otp_challenges`, expire after 10 minutes, and track attempts with a max-attempt status path.
- Transactional vendor/onboarding email is sent through Resend from the shared Edge Function helper. Browser-side EmailJS has been disabled/removed for production and should not be listed as an active subprocessor.
- Sensitive email content may include onboarding links, OTPs, vendor names/contact names, reminder context, and support/admin notifications. Needs policy: never include EIN/SSN, full bank account numbers, or W-9 contents in email.

Business verification and EIN/SSN data:

- Business onboarding collects legal business name, business type, business email, phone, website, and tax identifier type (`ein` or `ssn`).
- The full EIN/SSN is stored encrypted in Supabase Vault through `store_tax_identifier_secret`; normal tables store last four only plus provider/status metadata.
- Platform/admin review surfaces should see last four only. `reveal_my_tax_identifier()` is self-only and intentionally has no admin-facing reveal path.
- Current code marks provider behavior as simulated/provider-ready until live provider keys are configured. Provider labels include `global_database_kyb` for EIN and `searchbug_ssn` for SSN, but legal docs should not promise actual EIN/SSN verification unless that provider integration is active in production.
- Needs policy: purpose limitation for EIN/SSN, retention period, reveal/re-entry rules, admin access prohibition, audit logging for reveal events, and what happens when verification fails or is manually reviewed.

Tenant operating bank/payment authorization data:

- Tenant onboarding collects bank name, account holder name, account type, nickname, full routing number, full account number, billing address source, and default-account choice.
- Full routing/account numbers are stored in Supabase Vault through `store_onboarding_bank_secret`; app tables store last four, status, metadata, and a Vault secret ID.
- Tenant payment authorizations collect signer full name, signer title, consent version, consent text, accepted flag, signature hash, optional signature storage path, signature payload, signed timestamp, IP address, user agent, status, and related bank/payment account IDs.
- ACH/check verification requires a saved bank account and an active accepted signature authorization.
- Needs policy: ACH authorization language, e-sign consent, NACHA-style authorization/revocation, signature retention, IP/user-agent collection disclosure, and who can view/download signed authorization records.

Payment module bank links:

- The payment module includes a provider-neutral `bank_accounts` vault. It collects owner type (`client`, `vendor`, `organization`, or `location`), owner ID, account holder name, bank name, account type, routing/account last four, fingerprint hash, verification status, provider config, and provider link references.
- Full account/routing numbers are stored through `store_bank_account_secret`, callable only by service role. `get_bank_account_secret_for_provider` decrypts bank details only for backend provider routing and logs an internal `bank_secret_retrieved_for_provider` event.
- Provider links can store provider owner, bank, and mandate references for Stripe ACH debit, Stripe Connect custom payout, Checkbook, Dwolla/legacy paths, or future adapters. The frontend should not receive decrypted bank details.
- Needs policy: provider roles, mandate/authorization text, fee disclosures, provider country rules, risk reviews, failed-payment/dispute handling, account disabling, and customer/vendor responsibilities for accurate bank data.

Vendor tax, W-9, and vendor banking:

- Vendor onboarding can send OTPs and secure magic links for tax, documents, and bank submission. Links are tokenized, expire, and are marked submitted/used.
- Vendor tax collection includes legal name, tax classification, tax identifier type, W-9 status, W-9 document reference, last four of tax ID, 1099 flag, and optional W-9 PDF stored as a vendor document.
- Full vendor tax IDs are stored in Supabase Vault through `store_vendor_tax_secret`. Service/audit retrieval goes through `get_vendor_tax_for_audit`, which logs `tax_secret_decrypted` in `vendor_onboarding_events`.
- Vendor banking collection includes bank account/routing numbers, account last four, verification state, callback status/change request metadata, effective dates, and provider links. Full numbers are stored in Supabase Vault through `store_vendor_banking_secret`.
- Service/audit retrieval for vendor banking goes through `get_vendor_banking_for_audit`, which logs `banking_secret_decrypted`.
- Staff can manually enter vendor tax or bank information when a vendor provides details by phone/email; this uses the same Vault storage path and event logging. This needs a clear internal handling policy because phone/email collection raises extra risk.
- Vendor documents storage has scoped storage RLS. W-9 documents and any contracts should be treated as confidential tax/payment records.
- Needs policy: W-9 retention, 1099/tax reporting use, vendor consent language, callback verification before paying changed bank accounts, manual-entry authorization, document access roles, and deletion/archival rules.

### Required Payment Terms And Consents

Payment provider terms that must be mentioned or accepted:

- Stripe ACH Debit: terms/consent must say ACH debits are processed through Stripe and its financial partners, the platform/customer must authorize ACH debits or credits, authorizations must comply with Nacha rules, and authorization evidence may need to be retained and provided on request. Source to review before final legal drafting: `https://stripe.com/legal/ach`.
- Stripe Connect Custom: if RestOps uses Custom connected accounts for vendors or payout recipients, the platform must ensure each connected account user accepts the Stripe Connected Account Agreement and any incorporated Stripe Services Agreement before using Stripe services. RestOps may need to collect required connected-account information and provide proof of acceptance to Stripe. Sources to review: `https://stripe.com/legal/connect-account` and `https://docs.stripe.com/connect/custom-accounts`.
- Checkbook: if Checkbook is used for digital checks or payouts, customer/vendor-facing terms must disclose that Checkbook services are governed by Checkbook terms and related policies, and that platform partner terms also apply. Source to review: `https://checkbook.io/company/terms-and-conditions/`.
- Provider-neutral policy: the UI should record which provider terms were shown, terms type, version, accepted timestamp, accepting user, IP address, user agent, owner type, owner ID, and related tenant/org/location scope. The existing `payment_terms_acceptances` table supports these records.

Phone, email, and communication consent to collect from platform users:

- Required fields should include user/customer name, business email, phone number, company/legal business name, role/title, and organization/location scope where applicable.
- Consent should cover transactional emails, onboarding emails, OTP/security codes, payment notices, vendor onboarding links, due-date reminders, failed-payment notices, support/security alerts, and administrative notifications.
- If SMS or phone callbacks are enabled later, consent should separately cover calls/SMS, message frequency, opt-out method, carrier/message fees, and whether calls may be recorded. Current code shows email OTP and callback workflow metadata, not a full SMS provider.
- Policy requirement: OTPs, magic links, and payment/security notices may be sent to the email or phone number provided; users are responsible for keeping contact details current.

Tenant/client banking signature consent:

- Tenant ACH/check onboarding must capture signer full name, signer title, consent version, full consent text, affirmative accepted flag, signature hash, optional signature image/storage path, signature payload, signed timestamp, IP address, and user agent.
- The consent should authorize RestOps and/or the selected payment processor to use the saved operating bank account for permitted platform fees, ACH debits, check/ACH payment workflows, returns, reversals, retries, and verification activity, depending on the exact payment product enabled.
- The consent should explain revocation/cancellation, effect of revocation on pending transactions, return/dispute handling, and responsibility for accurate bank account data.
- The app should keep signature/authorization records for as long as needed to prove authorization, resolve disputes, support provider audits, and satisfy tax/accounting/payment-network retention obligations. Exact retention period needs legal decision.

Vendor payment/tax consent:

- Vendor onboarding should require consent before collecting W-9/tax ID, legal/tax classification, banking details, payment recipient name, remittance/contact details, and W-9 documents.
- Vendor consent should say the information is used for onboarding, tax reporting, fraud/risk review, payment processing, payment status communications, 1099/vendor recordkeeping, and bank account verification/callback workflows.
- Vendor bank-change flows should state that a callback or manual approval may be required before a new bank account is used for payment.
- Staff manual-entry flows must require staff to confirm they were authorized by the vendor to enter tax/banking data received by phone or email.

## 6. Data Flow Mapping

Invoice flow: user uploads invoice -> private Supabase `invoices` bucket -> invoice row/job set to extracting -> Supabase `invoice-processing` Edge Function downloads with service role -> Azure Document Intelligence extracts invoice data -> Azure OpenAI maps compact extraction output to normalized invoice JSON -> Edge Function writes normalized invoice fields and status -> human review for low confidence or failure -> approval/payment/accounting workflows -> audit/events/reporting.

Vendor onboarding flow: admin/vendor link flow -> OTP/token challenge -> vendor tax/banking/documents collected -> sensitive tax/bank details stored through vault-oriented RPCs/tables -> provider links created for payout processors -> decrypt/reveal actions logged.

AI insights flow: tenant operational context is selected -> backend AI workflow uses Azure OpenAI in intended production -> response becomes extraction output, insight, suggestion, or assistant/chatbot answer -> human review and approval is required before AI-extracted invoice information becomes operational record data. Existing Gemini code references are deprecated and must be removed or disabled before production.

Public intake flow: anonymous visitor submits contact/demo/access request -> Supabase public intake table -> notification function may send internal notice -> platform admin reviews.

## 7. Third-Party Services

| Provider | Service | Data Shared | Purpose | Region | Controller/Processor |
| --- | --- | --- | --- | --- | --- |
| Supabase | Auth, Postgres, Storage, Edge Functions, Realtime | Auth/profile/business records/files/logs | Core backend | Needs confirmation | Processor |
| Vercel | Frontend hosting | App requests, telemetry/IP logs | Web app hosting | Needs confirmation | Processor |
| Google Cloud Run | Planned Docling/backend hosting | Invoice files/text if enabled later | Planned OCR/extraction service hosting | Planned / not active at launch | Planned processor |
| Google Gemini / Vertex AI | Deprecated / not intended for production | None in intended production | Remove or disable before production | Not active | Not active subprocessor |
| Azure OpenAI | AI extraction and assistant | Invoice text, structured extraction context, prompts, assistant context | AI invoice extraction and assistant/chatbot | Needs final Azure region confirmation | Active processor/subprocessor |
| Stripe | Subscription billing/payment intents/webhooks/ACH adapters | Billing/customer/payment metadata | Subscription billing and payment processing | Needs confirmation | Independent controller/processor mix |
| Dwolla | Planned ACH/payment integration | Bank/payment metadata if enabled later | Future ACH/payment option | Planned / not active at launch | Planned independent controller/processor mix |
| Checkbook | Planned payout provider | Vendor/payment metadata if enabled later | Future vendor payouts/checks | Planned / not active at launch | Planned independent controller/processor mix |
| Plaid | Planned bank-linking integration | Bank-linking data if enabled later | Future bank verification/linking | Planned / not active at launch | Planned independent controller/processor mix |
| Resend | Transactional email | Email address, message content | Vendor/onboarding/reminder emails | Needs confirmation | Processor |
| EmailJS | Removed/disabled browser-side email reference | None in intended production | Disabled; transactional mail should use Resend Edge Functions | Not active | Not active subprocessor |
| PostHog | Deprecated / not intended for production | None in intended production | Disabled and package dependency removed | Not active | Not active subprocessor |
| Sentry | Deprecated / not intended for production | None in intended production | Disabled and package dependency removed; internal error logging remains | Not active | Not active subprocessor |
| Upstash Redis | Removed unused helper | None | Removed after verification no runtime imports existed | Not active | Not active subprocessor |
| POS/accounting/delivery systems | Webhooks/sync endpoints | POS orders, menu, accounting export data | Integrations | Needs provider list | Processor/third-party connectors |

## 8. Security Controls

Found controls include Supabase Auth, TOTP MFA, password policy validation, JWT app metadata, RLS on tenant tables, RBAC role checks, organization/brand/location membership scoping, service-role edge functions, storage RLS for vendor documents, private invoice bucket flow, audit logs, error logs, webhook signature handling, API key creation, Supabase Vault patterns for bank/tax secrets, decrypt audit logging, and release checks for RLS/RBAC.

Final governance controls include RBAC, RLS, encrypted communications, optional MFA, minimum 15-character passwords, high-complexity password policy, and 30-minute inactivity timeout. Still needs production verification: encryption-at-rest statement by provider, backup/PITR tier, restore drill schedule, WAF/DDoS posture, vulnerability management process, incident response owner, security contact, employee access reviews, and SOC 2/ISO roadmap.

## 9. Business Rules

Public Terms have been expanded to cover account access, subscriptions, AutoPay/ACH authorization, payment provider terms, acceptable use, data/AI review, support targets, and remaining legal items. Landing page shows Starter, Starter + AI, and Advanced subscription tiers; some AI tiers are marked coming soon.

Resolved business terms include monthly per-Location billing, AutoPay, no refunds, three-month written cancellation notice, two-day grace period, 1% daily late charge, suspension after 10 days, termination after 30 days, read-only access during suspension, 99.9% availability target, and 24x7 support with 10-minute critical initial-response target subject to launch readiness review. Still to finalize: governing state, venue, arbitration, class-action waiver, taxes, SLA credits, API rate limits, acceptable-use detail, customer content license, feedback/license terms, beta disclaimers, AI terms, and open-source attribution approach.

## 10. Vendor Management

Implemented/visible areas include vendor list/detail, statements, receiving, reconciliation, audit trail, document vault, onboarding panel/wizard, banking/tax collection, vendor approval transitions, vendor bidding/logistics, vendor item mappings/prices, and accounting controls.

Invoice processing includes OCR/AI extraction, duplicate-related acceptance tests, line-item normalization, math/validation flows, PO/receiving/reconciliation support, approval workflows, anomaly review, and payment/export paths.

## 11. AI & OCR

Intended production AI/OCR features use Azure OpenAI for invoice extraction, AI Assistant, and optional chatbot. All AI-extracted invoice information must be reviewed and approved by an authorized user before becoming operational record data. Existing Gemini-related code paths are deprecated and must be removed or disabled before production.

Final AI training policy: customer information is never used to train public or shared AI models. Still to specify in downstream AI terms: Azure deployment/model name verification, AI data retention by provider, confidence thresholds, limitation/warranty language, and whether optional AI Assistant/chatbot features are beta/experimental.

## 12. Compliance Requirements

Potentially relevant: CCPA/CPRA, GDPR if EU/UK users or customers are in scope, SOC 2 if enterprise sales require it, ISO 27001 if pursuing certification, PCI DSS scope for payment card flows, NACHA/ACH rules for ACH, electronic records/e-signature rules, tax records retention, and state privacy laws.

Compliance roadmap: SOC 2, GDPR, CCPA/CPRA, and additional U.S. state privacy laws. The platform provides privacy rights according to applicable laws until a global privacy model is adopted; certification claims should not be made until achieved.

## 13. Customer Rights

Implemented profile UI supports JSON export of limited profile-related data and account deletion request logging/manager notification. Current Privacy Policy says users may download account history and request deletion; this needs alignment because export appears limited to profile, notifications, and audit events, not all organization data.

Final governance confirms customer export while hierarchy is active and no additional exports after hierarchy deletion begins. Still to specify in downstream privacy workflow: DSAR intake method, identity verification, response timelines, deletion exceptions, org-admin vs end-user authority, data portability format, cookie preferences, consent withdrawal, and subprocessor list publication.

## 14. Operations

Operational docs mention release gates, schema checks, Supabase lint, backend RLS/RBAC tests, service-role exposure checks, slow query/table growth monitoring, PITR/restore drill documentation, dashboard report scheduler, reminder emails, smartprep cron, pg-backup function, webhook dispatcher, and edge deployment scripts.

Final governance confirms 24x7 support, email/telephone/in-app chat channels, 10-minute critical initial response target, 99.9% availability target, immediate customer notice upon confirmed security incident affecting data, and force majeure/scheduled maintenance exclusions. Still to specify operationally: backup frequency, RPO/RTO, restore process, maintenance notice process, escalation matrix, and severity definitions.

## 15. Legal Decisions Needed

- Legal entity name and address.
- Governing law and venue.
- Arbitration/class action waiver preference.
- Limitation of liability cap.
- Warranty disclaimer wording.
- Indemnity scope.
- Subscription billing, renewal, cancellation, refund, and tax rules.
- SLA and support commitments.
- Data retention/deletion schedule.
- Approved subprocessors and regions.
- AI data-use/training policy.
- Whether GDPR/CCPA/CPRA rights are offered globally or by region.
- Whether vendors are direct users, customer-managed data subjects, or both.
- Open-source/license notice process.

## 16. Document Mapping

| Legal Document | Platform Information Required | Status |
| --- | --- | --- |
| Terms & Conditions | Accounts, subscription tiers, billing, acceptable use, AI/OCR disclaimers, liability, support, termination | Updated engineering draft; final legal review required |
| Privacy Policy | Data inventory, processors, purposes, rights, retention, AI/OCR, security | Updated engineering draft; final legal review required |
| Cookie Policy | Supabase auth storage, local preferences, analytics posture, consent | Corrected to remove Plausible claim and state analytics are disabled |
| Acceptable Use Policy | Prohibited conduct, security restrictions, API misuse, uploads, vendor/payment fraud | Needs draft |
| Security Policy | RLS/RBAC, MFA, encryption, backups, incident response, vulnerability management | Needs draft |
| DPA | Controller/processor roles, subprocessors, SCCs/regions, audit, deletion | Needs draft if B2B customers require it |
| SLA | Availability, support hours, maintenance, credits | Needs business decision |

## 17. Review Checklist

- [ ] Confirm final platform/legal entity name.
- [x] Confirm launch geographies and privacy regimes: United States only at launch; rights by applicable law.
- [ ] Confirm role names and permissions for legal wording.
- [x] Confirm subscription/billing/cancellation/refund rules.
- [x] Confirm data retention/deletion schedule: hierarchy lifecycle, 30-day archive, permanent deletion, with legal/payment/tax exceptions.
- [x] Confirm AI provider data-use/training terms: Azure OpenAI, no customer data training of public/shared models.
- [ ] Confirm final subprocessor regions. Deprecated Gemini/PostHog/Sentry runtime references have been removed or disabled.
- [ ] Confirm security controls with production provider settings.
- [x] Correct public Cookie Policy analytics statement.
- [x] Align public Privacy Policy wording with current profile export/deletion behavior. Full DSAR workflow still needs finalization.
- [ ] Decide whether to publish DPA, Security Policy, AUP, and SLA.










