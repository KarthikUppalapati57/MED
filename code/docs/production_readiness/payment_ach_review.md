# Payment and ACH Legal Review Checklist

Status: Drafted for legal/payment review.

## Items Requiring Legal Review

- ACH authorization language.
- Stripe ACH Debit terms and Nacha compliance language.
- Stripe Connect Custom connected account terms.
- Recurring debit authorization.
- Retry authorization after failed payment.
- Returned ACH item handling and fees.
- Payment reversals and disputes.
- Late payment charges and applicable state law limits.
- Customer revocation procedure and effect on outstanding obligations.
- E-sign consent and signature record retention.

## Current Governance Decisions

- AutoPay is required.
- ACH authorization covers monthly subscription charges, approved recurring platform fees, late payment charges, returned payment fees, gateway processing fees where applicable, retries after failed transactions, and returned ACH item processing.
- Customers may revoke ACH authorization by written notice, but revocation does not remove outstanding obligations.
- Late payment policy is a two-calendar-day grace period, then 1% late charge per calendar day, subject to legal review.

## Evidence to Retain

- Consent type and version.
- Full consent text shown.
- User ID/signing user.
- Tenant/organization/brand/location scope.
- IP address.
- User agent.
- Timestamp.
- Acceptance method.
- Related payment account/provider references.

## Do Not Publish Until Reviewed

Do not publish final ACH/legal payment language until counsel approves the text and jurisdictions.
