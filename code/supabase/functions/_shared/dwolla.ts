// Shared Dwolla helpers. The fetch-based token/resource pattern here is copied verbatim from
// create-checkout-session/index.ts (the one place in this repo that successfully calls Dwolla's
// customer + funding-source APIs today, for the org's own SaaS-subscription ACH setup) rather
// than re-invented — see create-dwolla-funding-source/index.ts and vendor-onboarding/index.ts
// for the two callers that redirect the result to payment_accounts / vendor_payment_provider_links
// instead of profiles.pending_payment_metadata.

const dwollaKey = Deno.env.get('DWOLLA_KEY') ?? ''
const dwollaSecret = Deno.env.get('DWOLLA_SECRET') ?? ''
const dwollaEnvironment = (Deno.env.get('DWOLLA_ENVIRONMENT') ?? 'sandbox').toLowerCase()
export const dwollaBaseUrl = dwollaEnvironment === 'production' ? 'https://api.dwolla.com' : 'https://api-sandbox.dwolla.com'

export async function getDwollaAccessToken() {
  if (!dwollaKey || !dwollaSecret) {
    throw new Error('Dwolla is not configured. ACH setup requires DWOLLA_KEY and DWOLLA_SECRET.')
  }

  const credentials = btoa(`${dwollaKey}:${dwollaSecret}`)
  const response = await fetch(`${dwollaBaseUrl}/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/vnd.dwolla.v1.hal+json',
    },
    body: 'grant_type=client_credentials',
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Dwolla authentication failed: ${body || response.statusText}`)
  }

  const data = await response.json()
  return data.access_token
}

export async function createDwollaResource(path: string, payload: Record<string, unknown>, accessToken: string) {
  const response = await fetch(`${dwollaBaseUrl}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/vnd.dwolla.v1.hal+json',
      Accept: 'application/vnd.dwolla.v1.hal+json',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Dwolla request failed: ${body || response.statusText}`)
  }

  return response.headers.get('location')
}

/**
 * Creates (or reuses) a Dwolla customer, then attaches a raw account+routing funding source.
 * Uses Dwolla's 'unverified' customer tier -- real transfers work at Dwolla's own (lower)
 * per-transaction limit until further verification (micro-deposits/IAV), which is a Dwolla
 * platform rule this code does not attempt to duplicate or bypass.
 */
export async function ensureDwollaCustomerAndFundingSource(params: {
  existingCustomerUrl?: string | null
  firstName: string
  lastName: string
  email: string
  businessName?: string
  routingNumber: string
  accountNumber: string
  bankAccountType: 'checking' | 'savings'
  fundingSourceName: string
}) {
  const routingNumber = params.routingNumber.replace(/\D/g, '')
  const accountNumber = params.accountNumber.replace(/\D/g, '')

  if (!/^\d{9}$/.test(routingNumber)) throw new Error('A valid 9-digit routing number is required')
  if (!/^\d{4,17}$/.test(accountNumber)) throw new Error('A valid bank account number is required')
  if (!['checking', 'savings'].includes(params.bankAccountType)) throw new Error('Bank account type must be checking or savings')

  const accessToken = await getDwollaAccessToken()

  let customerUrl = params.existingCustomerUrl || null
  if (!customerUrl) {
    customerUrl = await createDwollaResource('/customers', {
      firstName: params.firstName,
      lastName: params.lastName,
      email: params.email,
      type: 'unverified',
      businessName: params.businessName,
    }, accessToken)
    if (!customerUrl) throw new Error('Dwolla customer creation did not return a resource URL')
  }

  const fundingSourcePath = customerUrl.replace(dwollaBaseUrl, '') + '/funding-sources'
  const fundingSourceUrl = await createDwollaResource(fundingSourcePath, {
    routingNumber,
    accountNumber,
    bankAccountType: params.bankAccountType,
    name: params.fundingSourceName,
  }, accessToken)

  if (!fundingSourceUrl) throw new Error('Dwolla funding source creation did not return a resource URL')

  return { customerUrl, fundingSourceUrl, accountLast4: accountNumber.slice(-4) }
}
