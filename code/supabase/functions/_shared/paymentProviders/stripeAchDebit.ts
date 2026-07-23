import type { PaymentProviderAdapter, ProviderBankPayload, ProviderDebitRequest, ProviderLinkResult } from './types.ts'

const STRIPE_API = 'https://api.stripe.com/v1'

function stripeKey() {
  return Deno.env.get('STRIPE_SECRET_KEY') || ''
}

function missingKeyResult(metadata: Record<string, unknown> = {}): ProviderLinkResult {
  return {
    providerStatus: 'configuration_missing',
    requirementsDue: { missing: ['STRIPE_SECRET_KEY'] },
    chargesEnabled: false,
    payoutsEnabled: null,
    metadata: { adapter_ready: true, live_provider_call_skipped: true, ...metadata },
  }
}

async function stripePost(path: string, body: URLSearchParams) {
  const key = stripeKey()
  if (!key) throw new Error('STRIPE_SECRET_KEY is not configured')

  const response = await fetch(`${STRIPE_API}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(payload?.error?.message || `Stripe request failed: ${response.status}`)
  }
  return payload
}

function ownerDescription(payload: ProviderBankPayload) {
  return `${payload.ownerType}:${payload.ownerId}`
}

export const stripeAchDebitAdapter: PaymentProviderAdapter = {
  provider: 'stripe_ach_debit',
  providerUse: 'collection',

  async attachBankAccount(payload: ProviderBankPayload): Promise<ProviderLinkResult> {
    if (!stripeKey()) {
      return missingKeyResult({ owner: ownerDescription(payload), use: 'collection' })
    }

    const customerBody = new URLSearchParams()
    customerBody.set('name', payload.accountHolderName || ownerDescription(payload))
    customerBody.set('metadata[restops_owner_type]', payload.ownerType)
    customerBody.set('metadata[restops_owner_id]', payload.ownerId)
    customerBody.set('metadata[restops_bank_account_id]', payload.bankAccountId)
    const customer = await stripePost('/customers', customerBody)

    const pmBody = new URLSearchParams()
    pmBody.set('type', 'us_bank_account')
    pmBody.set('us_bank_account[routing_number]', payload.routingNumber)
    pmBody.set('us_bank_account[account_number]', payload.accountNumber)
    pmBody.set('us_bank_account[account_holder_type]', payload.ownerType === 'client' ? 'individual' : 'company')
    pmBody.set('us_bank_account[account_type]', payload.accountType)
    pmBody.set('billing_details[name]', payload.accountHolderName || ownerDescription(payload))
    const paymentMethod = await stripePost('/payment_methods', pmBody)

    const attachBody = new URLSearchParams()
    attachBody.set('customer', customer.id)
    await stripePost(`/payment_methods/${paymentMethod.id}/attach`, attachBody)

    return {
      providerOwnerRef: customer.id,
      providerBankRef: paymentMethod.id,
      providerStatus: 'requires_authorization',
      chargesEnabled: false,
      payoutsEnabled: null,
      requirementsDue: { missing: ['ach_authorization_or_bank_verification'] },
      metadata: { stripe_object: 'payment_method', account_last4: payload.accountLast4 },
    }
  },

  async createDebit(request: ProviderDebitRequest, payload: ProviderBankPayload): Promise<ProviderLinkResult> {
    if (!stripeKey()) {
      return missingKeyResult({ owner: ownerDescription(payload), use: 'collection', request })
    }

    return {
      providerStatus: 'ready_for_payment_intent',
      chargesEnabled: true,
      payoutsEnabled: null,
      metadata: {
        amount_cents: request.baseAmountCents + request.feeAmountCents,
        currency: request.currency,
        payment_intent_creation_deferred_until_mandate_ready: true,
      },
    }
  },
}
