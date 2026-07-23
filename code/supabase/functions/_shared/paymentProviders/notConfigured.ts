import type {
  PaymentProviderAdapter,
  ProviderBankPayload,
  ProviderDebitRequest,
  ProviderLinkResult,
  ProviderPayoutRequest,
  ProviderUse,
} from './types.ts'

function fail(providerUse: ProviderUse): never {
  throw new Error(`Payment provider is not configured for ${providerUse}`)
}

export function notConfiguredAdapter(providerUse: ProviderUse): PaymentProviderAdapter {
  return {
    provider: 'not_configured',
    providerUse,
    attachBankAccount(_payload: ProviderBankPayload): Promise<ProviderLinkResult> {
      fail(providerUse)
    },
    createDebit(_request: ProviderDebitRequest, _payload: ProviderBankPayload): Promise<ProviderLinkResult> {
      fail(providerUse)
    },
    createPayout(
      _request: ProviderPayoutRequest,
      _sourcePayload: ProviderBankPayload,
      _destinationPayload: ProviderBankPayload,
    ): Promise<ProviderLinkResult> {
      fail(providerUse)
    },
  }
}
