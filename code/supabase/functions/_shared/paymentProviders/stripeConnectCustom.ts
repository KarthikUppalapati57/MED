import type { PaymentProviderAdapter, ProviderBankPayload, ProviderLinkResult, ProviderPayoutRequest } from './types.ts'

const STRIPE_API = 'https://api.stripe.com/v1'

function stripeKey() {
  return Deno.env.get('STRIPE_SECRET_KEY') || ''
}

function missingKeyResult(metadata: Record<string, unknown> = {}): ProviderLinkResult {
  return {
    providerStatus: 'configuration_missing',
    requirementsDue: { missing: ['STRIPE_SECRET_KEY'] },
    payoutsEnabled: false,
    chargesEnabled: false,
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

export const stripeConnectCustomPayoutAdapter: PaymentProviderAdapter = {
  provider: 'stripe_connect_custom',
  providerUse: 'payout',

  async attachBankAccount(payload: ProviderBankPayload): Promise<ProviderLinkResult> {
    if (!stripeKey()) {
      return missingKeyResult({ owner: ownerDescription(payload), use: 'payout' })
    }

    const accountBody = new URLSearchParams()
    accountBody.set('type', 'custom')
    accountBody.set('country', 'US')
    accountBody.set('capabilities[transfers][requested]', 'true')
    accountBody.set('business_type', 'company')
    accountBody.set('metadata[restops_owner_type]', payload.ownerType)
    accountBody.set('metadata[restops_owner_id]', payload.ownerId)
    accountBody.set('metadata[restops_bank_account_id]', payload.bankAccountId)
    const account = await stripePost('/accounts', accountBody)

    const bankBody = new URLSearchParams()
    bankBody.set('external_account[object]', 'bank_account')
    bankBody.set('external_account[country]', 'US')
    bankBody.set('external_account[currency]', 'usd')
    bankBody.set('external_account[routing_number]', payload.routingNumber)
    bankBody.set('external_account[account_number]', payload.accountNumber)
    bankBody.set('external_account[account_holder_name]', payload.accountHolderName || ownerDescription(payload))
    bankBody.set('external_account[account_holder_type]', 'company')
    const externalAccount = await stripePost(`/accounts/${account.id}/external_accounts`, bankBody)

    return {
      providerOwnerRef: account.id,
      providerBankRef: externalAccount.id,
      providerStatus: 'requirements_due',
      payoutsEnabled: Boolean(account.payouts_enabled),
      chargesEnabled: Boolean(account.charges_enabled),
      requirementsDue: {
        currently_due: account.requirements?.currently_due || [],
        past_due: account.requirements?.past_due || [],
      },
      metadata: { stripe_object: 'account', external_account_last4: payload.accountLast4 },
    }
  },
  async createPayout(request: ProviderPayoutRequest, _sourcePayload: ProviderBankPayload, destinationPayload: ProviderBankPayload): Promise<ProviderLinkResult> {
    if (!stripeKey()) {
      return missingKeyResult({ owner: ownerDescription(destinationPayload), use: 'payout', request })
    }

    return {
      providerStatus: 'ready_for_transfer',
      payoutsEnabled: true,
      chargesEnabled: false,
      metadata: {
        amount_cents: request.amountCents,
        currency: request.currency,
        transfer_creation_deferred_until_connected_account_ready: true,
      },
    }
  },
}

