# Data Subject Rights (DSAR) Workflow

Status: Drafted for legal/operations review.

## Intake Channels

Approved launch intake channels:

- In-app profile privacy controls for authenticated users.
- Privacy contact email once finalized in `platform_identity_values.md`.
- Written request submitted by an authorized customer admin.

## Request Types

Supported request categories:

- Access / copy of personal data.
- Correction request.
- Deletion request.
- Consent withdrawal.
- Organization-level export request from an authorized customer admin.
- Objection or restriction request where required by applicable law.

## Identity Verification

1. Authenticated in-app requests rely on active session authentication plus user profile context.
2. Email requests require verification through the email address on file or a separate identity verification process approved by operations.
3. Organization-level requests require confirmation that the requester is an authorized tenant super admin, org manager, or other role approved by legal/operations.
4. Vendor requests require verification of vendor identity and authorization before tax, W-9, or bank-related data is disclosed or modified.

## Response Timelines

Final response timelines must be approved by legal based on applicable jurisdiction. Until finalized, do not publish a fixed response timeline beyond "as required by applicable law."

## Export Process

Current implementation exports limited profile-related JSON from profile controls. Full organization-level export is recommended after launch unless required before production by legal/customer commitments.

Minimum export record should include:

- Request ID.
- Requester identity and role.
- Organization/brand/location scope.
- Request type.
- Verification method.
- Export generated timestamp.
- Delivery method.
- Completion status.

## Deletion Process

Deletion requests must be reviewed for legal exceptions before execution. Exceptions may include:

- Tax records.
- Payment/ACH authorization evidence.
- Accounting records.
- Security/audit logs.
- Fraud prevention records.
- Contractual dispute records.

## Consent Withdrawal

Consent withdrawal must be recorded with timestamp, requester, scope, consent type, and effect of withdrawal. ACH authorization revocation does not remove outstanding payment obligations.

## Audit Logging

Every DSAR action should be audit logged, including intake, verification, approval, export, deletion decision, legal exception, and completion.
