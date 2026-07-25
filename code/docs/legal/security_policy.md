# Security Overview

**Effective date:** July 24, 2026  
**Last updated:** July 24, 2026

This Security Overview describes safeguards that Mindful Tech Solutions Inc., doing business as RestOps-360 (“RestOps-360,” “we,” “us,” or “our”), uses or is designed to use to protect customer information.

This public overview is not a certification, warranty, or guarantee that every threat will be prevented. Contractual security commitments are stated in the applicable agreement and Data Processing Addendum.

## 1. Security Program

Our security program is designed around risk-based administrative, technical, and organizational controls for a multi-tenant restaurant-operations platform.

Security responsibilities include:

- protecting confidentiality, integrity, and availability;
- limiting access according to business need;
- isolating customer tenants and authorized hierarchy scopes;
- securing sensitive tax, banking, payment, and authentication information;
- monitoring security-relevant events;
- managing vulnerabilities and changes;
- preparing for incidents and recovery; and
- evaluating critical service providers.

## 2. Identity and Access Management

Controls are designed to include:

- Supabase-based authentication for supported production workflows;
- role-based access control;
- organization, brand, and restaurant-location scoping;
- database-level row security for supported data paths;
- server-side enforcement for sensitive approvals and administrative actions;
- least-privilege access for personnel and service accounts;
- optional time-based one-time-password multi-factor authentication;
- strong password requirements;
- inactivity and session controls; and
- prompt removal or adjustment of access when no longer required.

Customers are responsible for maintaining accurate authorized-user lists, assigning minimum necessary privileges, and protecting credentials and authentication devices.

## 3. Tenant Isolation

The platform is designed to enforce tenant and hierarchy boundaries at multiple layers, including application authorization and database controls.

Customer users should have access only to the organizations, brands, locations, functions, and records assigned to them. We test and review sensitive access paths as part of development and release activities.

## 4. Sensitive Data Protection

For supported workflows, full tax identifiers, W-9 information, bank routing numbers, and bank-account numbers are designed to be stored through restricted encrypted secret-storage patterns rather than ordinary application tables.

Standard application views should display only limited references, such as status information or the last four digits. Decryption or reveal operations, where required, are restricted to narrowly authorized backend functions and should be logged.

Customers must not place full sensitive values into free-text fields, chat messages, support emails, or other locations not designed for that data.

## 5. Encryption and Secrets

- Data in transit is protected using TLS.
- Data at rest relies on encryption controls provided by the applicable cloud, database, storage, and payment providers.
- Application secrets and service credentials are restricted and should not be embedded in source code or client-side applications.
- Access to production credentials is limited according to role and operational need.

Provider-specific encryption, region, key-management, and retention configurations are validated as part of production readiness and vendor management.

## 6. Application and Infrastructure Security

Our development and operations practices are designed to include:

- source control and controlled deployment;
- code review for material changes;
- separation of development and production access;
- dependency and vulnerability review;
- security testing of authentication, authorization, tenant isolation, and sensitive workflows;
- secure configuration of cloud services;
- logging and error handling that avoid unnecessary sensitive-data exposure;
- rate limiting and abuse prevention where appropriate; and
- remediation based on severity, exploitability, exposure, and business impact.

## 7. Logging and Monitoring

Security-relevant events may include:

- authentication and access events;
- administrative and role changes;
- invoice and payment approvals;
- access to supported tax or banking data;
- vendor bank-account changes;
- integration and API activity;
- SMS authentication requests, delivery status, and opt-out events; and
- suspected fraud, abuse, or policy violations.

Logs are used for security monitoring, troubleshooting, customer support, audit, fraud prevention, and incident investigation. Access to logs is restricted based on role.

## 8. Payment Security

Payment and banking capabilities may rely on specialized providers such as Stripe. Payment providers maintain their own security and compliance programs and may collect sensitive payment information directly.

Customers must follow approval, verification, authorization, and segregation-of-duties controls. RestOps-360 should not be used to bypass payment-provider terms, ACH authorization requirements, sanctions controls, or fraud-prevention procedures.

## 9. AI Security and Data Handling

Approved production AI features may use Microsoft Azure OpenAI. We are designed not to use Customer Data to train public or shared foundation models.

AI outputs require human review before operational use. Access to AI features follows applicable account and tenant permissions, and submitted information should be limited to data appropriate for the configured use case.

## 10. Communications Security

Azure Communication Services may be used to deliver user-requested security codes.

Controls are designed to include:

- affirmative user initiation before an SMS is sent;
- time-limited one-time codes;
- rate limiting and abuse detection;
- consent, delivery, and opt-out records;
- STOP and HELP handling;
- restricted use of the program for security messages rather than marketing; and
- minimization of sensitive information in message content.

## 11. Incident Response

We maintain an incident-response process designed to identify, triage, contain, investigate, remediate, and document security events.

If we confirm a Security Incident affecting Customer Personal Data, we will notify the affected customer without undue delay and in accordance with applicable law and contractual commitments.

Customers should report suspected incidents promptly to `contact@mindfultechsol.com` with the subject **Security Incident**.

## 12. Business Continuity and Recovery

Production systems are designed to use cloud-provider backup, redundancy, and recovery capabilities appropriate to the service.

Recovery objectives, backup retention, restoration testing, and continuity procedures are reviewed as part of operational readiness. Actual recovery time may depend on incident type, provider dependencies, data volume, and customer configuration.

## 13. Service Provider Risk

We evaluate material subprocessors based on the services and data involved. Our process is designed to consider contractual confidentiality and security terms, privacy terms, incident obligations, available assurance reports, service resilience, and data-location considerations.

See the Privacy Policy and Data Processing Addendum for the active production subprocessor list.

## 14. Responsible Disclosure

Do not test vulnerabilities against live customer data or disrupt production.

Report a suspected vulnerability to `contact@mindfultechsol.com` with the subject **Security Vulnerability** and include:

- affected page, feature, or endpoint;
- steps to reproduce;
- potential impact;
- relevant logs or screenshots with sensitive data removed; and
- contact information for follow-up.

We request reasonable time to investigate and remediate before public disclosure. We do not authorize testing that violates law, accesses another customer’s data, causes disruption, or uses social engineering, denial of service, physical attacks, or malware.

## 15. Compliance Position

We may use recognized security and privacy frameworks to guide the program. We do not claim SOC 2, ISO 27001, PCI DSS, or other certification unless it has been formally achieved and is expressly stated in current written materials.

## 16. Contact

Security questions and reports: `contact@mindfultechsol.com`  
Phone: `+1 (865) 666-7690`
