# Vendor Portal Terms

**Last updated:** July 24, 2026
**Source of truth:** [code/src/modules/public/pages/VendorPortalTerms.jsx](../../src/modules/public/pages/VendorPortalTerms.jsx) (route `/vendor-terms`) — update both if either changes.

## 1. Scope

These Vendor Portal Terms apply to a supplier or payee ("Vendor," "you") invited by a Restops customer organization ("Customer") to submit contact, tax, or banking information through the Restops vendor onboarding portal, typically via a one-time passcode (OTP) or secure link. They are separate from, and do not replace, the [Terms of Service](terms_of_service.md) that govern the Customer's own account.

## 2. Your Relationship to Restops

Restops operates the vendor portal on behalf of the Customer that invited you. Restops is not your customer, does not decide what or when you are paid, and does not control the business relationship between you and the Customer. Restops's role is to provide a secure channel for submitting and storing the information the Customer's workflow requires.

## 3. Information You Provide

Depending on what the Customer's workflow requests, you may be asked for your legal business name, tax classification, tax identifier (EIN or SSN), W-9 details, banking routing/account numbers, and contact information. You are responsible for the accuracy of what you submit. Access to the portal is verified using a one-time passcode or a tokenized link that expires after a limited window.

## 4. How Your Information Is Used

Information you submit is used for vendor onboarding, tax reporting (including W-9/1099 recordkeeping), fraud and risk review, payment processing, payment-status communications, and bank account verification, including callback or manual-approval steps before a changed payout account is used.

## 5. Manual Entry by Customer Staff

If a Customer's staff member enters your tax or banking information on your behalf (for example, information you provided by phone or email), the platform requires that staff member to confirm you authorized the entry, and records that confirmation along with audit metadata. If you did not authorize an entry made on your behalf, contact the Customer directly and [PRIVACY CONTACT EMAIL].

## 6. Security

Full tax identifiers and bank account/routing numbers are stored encrypted in a dedicated secrets vault; standard records and staff-facing screens show only the last four digits. See the [Security Policy](security_policy.md) for more detail.

## 7. Bank Account Changes

A request to change your payout bank account may require additional verification, such as a callback or manual approval, before the new account is used for payment. This is a fraud-prevention control and may add delay to a payout change.

## 8. Retention

Vendor tax, banking, and payment-authorization records follow the same retention lifecycle as other sensitive platform data: active use, then a 30-day archive, then permanent deletion, unless a longer period is required for legal, tax, or regulatory recordkeeping, in which case only the minimum necessary information is retained.

## 9. Your Rights and Requests

To ask what information a Customer has submitted about you, request a correction, or ask about deletion, contact the Customer directly or [PRIVACY CONTACT EMAIL]. Because the Customer controls the underlying vendor relationship, some requests may need to be handled through them.

## 10. Changes

We may update these Vendor Portal Terms from time to time. Material changes will be reflected here with an updated "Last updated" date.

## 11. Contact

Questions about the vendor portal can be sent to `support@restops-360.com`. Privacy-specific questions can be sent to `contact@mindfultechsol.com`.
