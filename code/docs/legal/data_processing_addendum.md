# Data Processing Addendum

**Last updated:** July 24, 2026
**Source of truth:** [code/src/modules/public/pages/DataProcessingAddendum.jsx](../../src/modules/public/pages/DataProcessingAddendum.jsx) (route `/dpa`) — update both if either changes.

## 1. Introduction

This Data Processing Addendum ("DPA") forms part of the Terms of Service (the "Agreement") between [LEGAL ENTITY NAME] ("Restops") and the customer entity agreeing to the Agreement ("Customer"), and applies where Restops processes Customer Personal Data on Customer's behalf. Capitalized terms not defined here have the meaning given in the Agreement.

## 2. Definitions

- **"Customer Personal Data"** means personal data submitted to the Platform by or on behalf of Customer, including data about Customer's personnel and vendor contacts, described in Annex 1.
- **"Data Protection Laws"** means applicable laws governing the processing of personal data, including U.S. state privacy laws and, if and when applicable, the EU/UK GDPR.
- **"Sub-processor"** means a third party engaged by Restops to process Customer Personal Data, listed in Annex 2.
- **"Security Incident"** means a confirmed breach of security leading to accidental or unlawful destruction, loss, alteration, unauthorized disclosure of, or access to, Customer Personal Data.

## 3. Roles of the Parties

As between the parties, Customer is the controller (or processor acting on behalf of a controller) of Customer Personal Data, and Restops is a processor acting on Customer's documented instructions, as set out in the Agreement, this DPA, and Customer's configuration and use of the Platform.

## 4. Processing Instructions

Restops will process Customer Personal Data only to provide, secure, and support the Platform in accordance with the Agreement and Customer's instructions given through use of the Platform, unless otherwise required by law, in which case Restops will inform Customer before processing unless prohibited from doing so.

## 5. Confidentiality

Restops ensures that personnel authorized to process Customer Personal Data are subject to confidentiality obligations and access data only as needed to perform their role.

## 6. Security Measures

Restops implements the measures described in its [Security Policy](security_policy.md), including role- and location-scoped access control, database-level row security, encrypted storage of sensitive tax and banking data, audit logging, and incident response procedures.

## 7. Sub-processors

Customer provides general authorization for Restops to engage the Sub-processors listed in Annex 2. Restops imposes data protection obligations on Sub-processors materially consistent with this DPA, and will give notice before adding a new Sub-processor (for example, by updating Annex 2 and the Privacy Policy Subprocessor List). Customer may object on reasonable data-protection grounds by contacting [LEGAL CONTACT EMAIL].

## 8. Assistance with Data Subject Requests

Taking into account the nature of processing, Restops will provide reasonable assistance to Customer in responding to verified requests from individuals to exercise their rights under applicable Data Protection Laws, including through Platform features that let Customer's administrators access, export, or delete data directly.

## 9. Security Incident Notification

Restops will notify Customer without undue delay after confirming a Security Incident affecting Customer Personal Data, and will provide information reasonably available to help Customer meet its own notification obligations. Notification is not an acknowledgment of fault or liability.

## 10. Deletion or Return of Data

On termination of the Agreement, Restops will make Customer Personal Data available for export for a reasonable period and will then delete it per the retention lifecycle in the Privacy Policy (active use, then a 30-day archive, then permanent deletion), except where a longer period is legally required, in which case only the minimum necessary data is retained.

## 11. Audits

Restops will make available information reasonably necessary to demonstrate compliance with this DPA and will allow audits as reasonably requested by Customer or a supervisory authority, subject to reasonable confidentiality, scheduling, and scope limitations, and no more than once annually absent a Security Incident or legal requirement.

## 12. International Transfers

The Platform currently serves customers in the United States, processed by the Sub-processors listed in Annex 2. If Customer's use involves personal data originating outside the United States, an appropriate transfer mechanism (such as Standard Contractual Clauses) will be incorporated here before that use begins.

## 13. Liability and Term

Each party's liability arising under this DPA is subject to the limitations of liability set out in the Agreement. This DPA remains in effect for as long as Restops processes Customer Personal Data under the Agreement.

## Annex 1 — Details of Processing

- **Subject matter:** provision of the Restops restaurant/hospitality operations platform.
- **Duration:** the term of the Agreement, plus the retention period described in Section 10.
- **Nature and purpose:** hosting, storage, and processing of Customer Personal Data to operate account access, vendor and invoice workflows, payments, AI-assisted extraction/assistance, and related support.
- **Categories of data subjects:** Customer's personnel and vendor contacts onboarded by Customer.
- **Categories of personal data:** name, email, phone, role/organization assignment, login metadata, and, where applicable, tax identifiers, W-9 information, and bank account details (encrypted, last-four visible in application tables).

## Annex 2 — Sub-processors

| Sub-processor | Purpose | Status |
| --- | --- | --- |
| Supabase | Auth, database, storage, backend functions | Active |
| Vercel | Application hosting | Active |
| Azure OpenAI | AI extraction and assistant/chatbot | Active |
| Stripe (ACH Debit & Connect Custom) | Billing and payment processing | Active |
| Resend | Transactional email | Active |
| Checkbook | Vendor payouts (planned) | Planned |
| Dwolla | ACH/payment option (planned) | Planned |
| Plaid | Bank-linking/verification (planned) | Planned |
| Google Cloud Run | Document extraction hosting (planned) | Planned |

Planned Sub-processors are not authorized under this DPA until added to this Annex and the Privacy Policy Subprocessor List, with notice given per Section 7.
