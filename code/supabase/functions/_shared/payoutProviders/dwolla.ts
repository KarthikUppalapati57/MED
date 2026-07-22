// Payout-initiation adapter for the Dwolla rail. Connecting a vendor/org to Dwolla (customer +
// funding-source vaulting) is a separate concern handled by _shared/dwolla.ts,
// vendor-onboarding/index.ts, and create-dwolla-funding-source/index.ts -- this only moves money
// for a vendor that's already linked.

import { getDwollaAccessToken, createDwollaResource } from '../dwolla.ts'

export const refColumn = 'dwolla_transfer_url'

// Runs before release_invoice_funds mutates payment state, so a missing/suspended destination
// fails closed with nothing to revert yet.
export async function preflight(ctx: any) {
  const { data: paymentAccount, error: accountError } = await ctx.serviceSupabase
    .from('payment_accounts')
    .select('dwolla_funding_source_url')
    .eq('id', ctx.paymentAccountId)
    .maybeSingle()

  if (accountError) {
    console.error('Payment account lookup error:', accountError)
    throw new Error('Unable to resolve Dwolla source funding information.')
  }
  if (!paymentAccount?.dwolla_funding_source_url) {
    throw new Error('Missing Dwolla source funding information.')
  }

  const { data: dwollaLink, error: linkError } = await ctx.serviceSupabase
    .rpc('get_vendor_provider_link', { p_vendor_id: ctx.vendorId, p_provider: 'dwolla' })
    .maybeSingle()

  if (linkError) {
    console.error('Dwolla provider link lookup error:', linkError)
    throw new Error('Unable to resolve Dwolla vendor routing information.')
  }
  if (!dwollaLink?.provider_funding_ref) {
    throw new Error('Missing Dwolla vendor funding source. Vendor must submit bank details first.')
  }
  // 'unverified' funding sources can still receive real transfers at Dwolla's own (lower)
  // transaction limits -- Dwolla's API enforces that ceiling itself. Only block statuses that
  // mean the link is unusable.
  if (dwollaLink.provider_status === 'suspended') {
    throw new Error('Vendor Dwolla account is suspended.')
  }

  return { sourceUrl: paymentAccount.dwolla_funding_source_url, destinationUrl: dwollaLink.provider_funding_ref }
}

export async function initiate(ctx: any, state: any) {
  const accessToken = await getDwollaAccessToken()
  const transferUrl = await createDwollaResource('/transfers', {
    _links: {
      source: { href: state.sourceUrl },
      destination: { href: state.destinationUrl },
    },
    amount: { currency: 'USD', value: ctx.transferAmount.toFixed(2) },
    metadata: { invoiceId: ctx.invoiceId },
  }, accessToken)

  return { providerRef: transferUrl }
}
