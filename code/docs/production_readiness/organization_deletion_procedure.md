# Organization Deletion Procedure

Status: Drafted for legal/operations review.

## Authorized Roles

Deletion may be requested by a verified tenant super admin or another legally authorized customer representative. Execution should require platform admin approval and audit logging.

## Lifecycle

1. **Request**: verified authorized requester submits deletion request.
2. **Pre-check**: platform reviews unpaid balances, open disputes, tax/payment retention obligations, and pending operational workflows.
3. **Archive Start**: hierarchy enters archive state for 30 days. Normal users lose write access and, where appropriate, receive read-only/export access.
4. **Restoration Window**: authorized requester may request restoration during the 30-day archive period.
5. **Permanent Deletion**: after archive expiry and final checks, tenant hierarchy data is permanently deleted except legally retained minimum records.
6. **Completion Notice**: completion is recorded and, if appropriate, confirmed to customer.

## Restoration

Restoration during archive requires authorized requester validation and platform admin approval. Restoration should preserve audit history.

## Legal Retention Exceptions

Retain only the minimum necessary data for:

- Tax and accounting obligations.
- ACH/e-sign authorization proof.
- Payment disputes, reversals, returns, or chargebacks.
- Security, fraud, and abuse investigations.
- Contract/legal claims.

## Audit Logging

Log request, validation, archive start, restoration, permanent deletion, retained exceptions, executor, timestamps, and final status.
