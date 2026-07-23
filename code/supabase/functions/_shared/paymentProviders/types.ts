export type ProviderUse = 'collection' | 'payout' | 'check'

export type OwnerType = 'client' | 'vendor' | 'organization' | 'location'

export type BankAccountType = 'checking' | 'savings'

export interface ProviderConfig {
  tenant_id?: string | null
  organization_id?: string | null
  brand_id?: string | null
  location_id?: string | null
  collection_provider: string
  payout_provider: string
  check_provider: string
  enabled: boolean
  settings?: Record<string, unknown>
}

export interface ProviderBankPayload {
  tenantId?: string | null
  organizationId?: string | null
  brandId?: string | null
  locationId?: string | null
  paymentAccountId?: string | null
  bankAccountId: string
  ownerType: OwnerType
  ownerId: string
  accountHolderName?: string | null
  accountType: BankAccountType
  routingNumber: string
  accountNumber: string
  routingLast4: string
  accountLast4: string
}

export interface ProviderLinkResult {
  providerOwnerRef?: string | null
  providerBankRef?: string | null
  providerMandateRef?: string | null
  providerStatus: string
  requirementsDue?: Record<string, unknown>
  payoutsEnabled?: boolean | null
  chargesEnabled?: boolean | null
  metadata?: Record<string, unknown>
}

export interface ProviderDebitRequest {
  bankAccountId: string
  baseAmountCents: number
  feeAmountCents: number
  currency: string
  invoiceId?: string | null
  paymentId?: string | null
  metadata?: Record<string, unknown>
}

export interface ProviderPayoutRequest {
  sourceBankAccountId: string
  destinationBankAccountId: string
  amountCents: number
  currency: string
  invoiceId?: string | null
  paymentId?: string | null
  metadata?: Record<string, unknown>
}

export interface PaymentProviderAdapter {
  provider: string
  providerUse: ProviderUse
  attachBankAccount(payload: ProviderBankPayload): Promise<ProviderLinkResult>
  createDebit?(request: ProviderDebitRequest, payload: ProviderBankPayload): Promise<ProviderLinkResult>
  createPayout?(
    request: ProviderPayoutRequest,
    sourcePayload: ProviderBankPayload,
    destinationPayload: ProviderBankPayload,
  ): Promise<ProviderLinkResult>
  syncStatus?(providerOwnerRef: string): Promise<ProviderLinkResult>
}
