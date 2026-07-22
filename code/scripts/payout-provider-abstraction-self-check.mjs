import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');

assert(!existsSync('code/supabase/functions/process-checkbook-payout'), 'process-checkbook-payout must be removed -- its logic now lives in _shared/payoutProviders/checkbook.ts');

const dwollaAdapter = read('code/supabase/functions/_shared/payoutProviders/dwolla.ts');
const checkbookAdapter = read('code/supabase/functions/_shared/payoutProviders/checkbook.ts');
const registry = read('code/supabase/functions/_shared/payoutProviders/index.ts');
const payout = read('code/supabase/functions/process-payout/index.ts');
const payoutWebhook = read('code/supabase/functions/payout-webhook/index.ts');
const checkbookWebhook = read('code/supabase/functions/checkbook-webhook/index.ts');
const notify = read('code/supabase/functions/_shared/notifyPaymentFailure.ts');

for (const [name, source] of [
  ['dwolla adapter', dwollaAdapter],
  ['checkbook adapter', checkbookAdapter],
]) {
  assert(source.includes('export const refColumn'), `${name} must export refColumn`);
  assert(source.includes('export async function preflight'), `${name} must export preflight`);
  assert(source.includes('export async function initiate'), `${name} must export initiate`);
}

assert(registry.includes('getPayoutProvider'), 'payoutProviders/index.ts must export getPayoutProvider');
assert(registry.includes("dwolla_ach: dwolla") || registry.includes("dwolla_ach:dwolla"), 'registry must map dwolla_ach to the dwolla adapter');
assert(registry.includes('checkbook_digital') && registry.includes('checkbook_physical'), 'registry must map both checkbook payout methods to the checkbook adapter');

assert(payout.includes("from '../_shared/payoutProviders/index.ts'"), 'process-payout must dispatch through the payoutProviders registry');
assert(payout.includes('getPayoutProvider('), 'process-payout must call getPayoutProvider instead of branching on provider name');
assert(!payout.includes('process-checkbook-payout'), 'process-payout must not reference the retired process-checkbook-payout function');
assert(!payout.includes("createDwollaResource('/transfers'"), 'process-payout must not call Dwolla directly anymore -- that belongs to the dwolla adapter');

assert(notify.includes('export async function applyPayoutOutcome'), '_shared/notifyPaymentFailure.ts must export applyPayoutOutcome');

for (const [name, source] of [
  ['payout-webhook', payoutWebhook],
  ['checkbook-webhook', checkbookWebhook],
]) {
  assert(source.includes('applyPayoutOutcome('), `${name} must call the shared applyPayoutOutcome instead of duplicating the payments/invoices update`);
  assert(!source.includes(".from('payments')\n    .update("), `${name} must not directly update payments -- that belongs to applyPayoutOutcome`);
}

// Every frontend caller picks a rail via a payout_method value passed to ONE function, not by
// branching on which function name to invoke.
const frontendFiles = {
  'BillPayWidget.jsx': 'code/src/modules/invoices/components/BillPayWidget.jsx',
  'StripePayPalPayouts.jsx': 'code/src/modules/accounting/components/StripePayPalPayouts.jsx',
  'Payments.jsx': 'code/src/modules/payments/pages/Payments.jsx',
};

for (const [name, path] of Object.entries(frontendFiles)) {
  const source = read(path);
  assert(!source.includes('process-checkbook-payout'), `${name} must not reference the retired process-checkbook-payout function`);
}

console.log('Payout provider abstraction self-check passed');
