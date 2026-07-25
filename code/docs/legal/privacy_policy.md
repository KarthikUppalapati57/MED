# Privacy Policy

**Last updated:** July 24, 2026
**Source of truth:** [code/src/modules/public/pages/PrivacyPolicy.jsx](../../src/modules/public/pages/PrivacyPolicy.jsx) (route `/privacy`) — update both if either changes.

## 1. Information We Collect

We collect account data such as name, email, phone, user ID, role, organization, brand, location, login/session metadata, MFA status, invitation records, notification preferences, and audit actor IDs.

We collect business data including organizations, locations, vendors, supplier contacts, invoices, invoice line items, approvals, payment/accounting records, products, inventory, recipes, labor, reporting data, POS/delivery integrations, webhooks, API keys, and operational logs.

Sensitive data may include EIN/SSN, W-9 documents, vendor tax details, bank account/routing details, ACH authorizations, electronic signatures, IP address, user agent, tax documents, and payment-provider references. Full bank and tax values are stored through encrypted vault patterns where implemented; normal app tables should store limited references such as last four digits and status metadata.

## 2. How We Use Information

We use information to provide the platform, authenticate users, enforce tenant boundaries, process invoices, manage vendors and payments, maintain accounting and operational records, send transactional notices, support customers, prevent fraud, audit sensitive access, and comply with contractual, financial, tax, regulatory, and legal obligations.

Transactional communications use email and in-app notifications at launch. SMS, telephone automation, and automated voice are future channels and require separate lawful consent before enablement.

## 3. AI and Customer Data

Approved production AI processing is Azure OpenAI for invoice extraction, AI Assistant, and optional chatbot features. Customer information is not used to train public or shared AI models. AI-extracted invoice information requires human review and approval before becoming operational record data.

## 4. Subprocessors

Current approved production technologies are Supabase, Vercel, Azure OpenAI, Stripe ACH Debit, Stripe Connect Custom, and Resend. Production regions for these providers must be finalized before public launch.

Google Gemini, PostHog, Sentry, and EmailJS are not approved production subprocessors. Checkbook, Dwolla, Plaid, and Google Cloud Run are planned or future technologies unless separately enabled and disclosed.

## 5. Retention and Deletion

Sensitive information follows the hierarchy lifecycle unless longer retention is legally required: active hierarchy, 30-day archive, then permanent deletion. If longer retention is legally required, only the minimum required information should be retained.

Electronic signature records are retained for the duration required by applicable contractual, financial, tax, regulatory, and legal recordkeeping requirements.

## 6. Rights and Requests

Users may export currently implemented profile-related data and submit account deletion requests from the profile privacy controls. Full DSAR intake method, identity verification, response timelines, deletion exceptions, organization-admin authority, portability format, and consent withdrawal handling must be finalized before production launch.

## 7. Security

Security controls include Supabase Auth, optional MFA, 15-character high-complexity passwords, 30-minute inactivity timeout, RBAC, RLS, tenant scoping, private storage patterns, audit logs, and encrypted vault storage for supported sensitive records. Backup, restore, incident response, vulnerability management, and provider-region statements must be finalized before public launch.
