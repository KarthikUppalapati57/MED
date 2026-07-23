import { notConfiguredAdapter } from './notConfigured.ts'
import type { PaymentProviderAdapter, ProviderUse } from './types.ts'

const ADAPTERS: Record<string, PaymentProviderAdapter> = {
  'not_configured:collection': notConfiguredAdapter('collection'),
  'not_configured:payout': notConfiguredAdapter('payout'),
  'not_configured:check': notConfiguredAdapter('check'),
}

export function getPaymentProviderAdapter(provider: string | null | undefined, providerUse: ProviderUse) {
  const key = `${provider || 'not_configured'}:${providerUse}`
  const adapter = ADAPTERS[key]
  if (!adapter) {
    throw new Error(`Payment provider adapter ${key} is not installed`)
  }
  return adapter
}

export function installedPaymentProviderAdapters() {
  return Object.keys(ADAPTERS).sort()
}
