# Consent Management Requirements

Status: Recommended after launch; required sooner if legal/customer commitments require immutable policy acceptance records.

## Consents to Track

- Terms & Conditions.
- Privacy Policy acknowledgement where required.
- ACH Authorization.
- Electronic Signature Agreements.
- Cookie Consent if optional cookies/analytics are enabled.
- Provider terms such as Stripe Services Agreement and Stripe Connect terms.
- Future policy versions.

## Required Acceptance Fields

- User ID.
- Tenant ID.
- Organization ID.
- Brand ID, if applicable.
- Location ID, if applicable.
- IP address.
- User agent.
- Timestamp.
- Policy/terms type.
- Policy/terms version.
- Full consent text or immutable reference to text shown.
- Acceptance method.

## Storage Rule

Acceptance records should be immutable. Corrections should be append-only rather than updating historical acceptance rows.

## Existing Foundation

`payment_terms_acceptances` supports provider/payment terms acceptance records. A broader policy acceptance table may be needed for Terms, Privacy, e-sign, cookies, and future policy versions.
