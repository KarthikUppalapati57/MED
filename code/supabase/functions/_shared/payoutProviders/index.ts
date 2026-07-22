// Registry mapping a payout_method string to the adapter that knows how to move money for it.
// Adding or swapping a rail is: write a module shaped like dwolla.ts/checkbook.ts, add it here.
// Nothing that calls getPayoutProvider needs to change.

import * as dwolla from './dwolla.ts'
import * as checkbook from './checkbook.ts'

export interface PayoutProvider {
  refColumn: string
  preflight(ctx: any): Promise<any>
  initiate(ctx: any, state: any): Promise<{ providerRef: string }>
}

const PROVIDERS: Record<string, PayoutProvider> = {
  dwolla_ach: dwolla,
  checkbook_digital: checkbook,
  checkbook_physical: checkbook,
}

export function getPayoutProvider(payoutMethod: string): PayoutProvider {
  const provider = PROVIDERS[payoutMethod]
  if (!provider) {
    throw new Error(`Unsupported payout method: ${payoutMethod}`)
  }
  return provider
}
