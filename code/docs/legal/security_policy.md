# Security Policy

**Last updated:** July 24, 2026
**Source of truth:** [code/src/modules/public/pages/SecurityPolicy.jsx](../../src/modules/public/pages/SecurityPolicy.jsx) (route `/security`) — update both if either changes.

## 1. Overview

This Security Policy summarizes the technical and organizational measures Restops uses to protect customer content on the Restops platform (the "Platform"). Items still pending production verification are noted as such rather than asserted as complete.

## 2. Access Control

Access is governed by role-based access control combined with database-level row security, scoped to your organization, brand, and location hierarchy, enforced at the database layer, not only in the application. Financial workflow changes such as invoice approval are enforced server-side. Account controls include a minimum 15-character, high-complexity password policy, optional multi-factor authentication (TOTP), and a 30-minute inactivity session timeout.

## 3. Sensitive Data Protection

Full tax identifiers (EIN/SSN), W-9 details, and bank routing/account numbers are stored encrypted in a dedicated secrets vault separate from standard application tables. Standard tables and staff-facing screens display only the last four digits. Decryption is limited to narrow, service-role-only backend paths, and reveal/decrypt events are logged. There is no admin-facing "reveal full tax ID" path.

## 4. Encryption

Data in transit is encrypted using TLS. Data at rest relies on the storage and database encryption provided by our infrastructure providers (Supabase and Azure). Provider-specific encryption-at-rest statements will be confirmed and cited here before production launch.

## 5. Audit Logging and Monitoring

Security-relevant actions are recorded in audit logs, including invoice/payment approval events, vendor tax and banking data access, and administrative changes, supporting internal review, customer support, and incident investigation.

## 6. Vendor and Subprocessor Security

We rely on established infrastructure and payment providers, including Supabase, Vercel, Azure OpenAI, Stripe, and Resend, that maintain their own security programs. We evaluate subprocessors before onboarding and require contractual security and confidentiality commitments. See the [Privacy Policy](privacy_policy.md) for the current subprocessor list.

## 7. Incident Response

We maintain a process to detect, investigate, and respond to security incidents. If we confirm a security incident affecting your data, we will provide notice without undue delay, consistent with applicable law. Detailed severity definitions, escalation matrix, and RPO/RTO targets are being finalized for the production launch checklist.

## 8. Vulnerability Management and Responsible Disclosure

We track and remediate vulnerabilities in our own code and monitor advisories for third-party dependencies and subprocessors. To report a suspected vulnerability, contact [SECURITY CONTACT EMAIL] rather than testing it against live customer data; please allow reasonable time to investigate before public disclosure.

## 9. Business Continuity

We maintain backup and point-in-time recovery capability for production data. Backup frequency, retention, and restore-drill schedule are being finalized for the production launch checklist.

## 10. Compliance Roadmap

We are working toward alignment with common industry frameworks, including SOC 2, as part of our compliance roadmap, and do not claim any certification until formally achieved and verified.

## 11. Contact

Security questions or reports can be sent to [SECURITY CONTACT EMAIL].
