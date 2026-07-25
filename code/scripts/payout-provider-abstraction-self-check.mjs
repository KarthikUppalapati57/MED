import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const retiredProvider = String.fromCharCode(100, 119, 111, 108, 108, 97);
const retiredAchMethod = `${retiredProvider}_ach`;
const retiredResourceHelper = `create${retiredProvider[0].toUpperCase()}${retiredProvider.slice(1)}Resource`;
const retiredSetupFunction = `create-${retiredProvider}-funding-source`;

assert(!existsSync('code/supabase/functions/process-checkbook-payout'), 'process-checkbook-payout must be removed -- its logic now lives in _shared/payoutProviders/checkbook.ts');

const stripeConnectAdapter = read('code/supabase/functions/_shared/payoutProviders/stripeConnect.ts');
const checkbookAdapter = read('code/supabase/functions/_shared/payoutProviders/checkbook.ts');
const registry = read('code/supabase/functions/_shared/payoutProviders/index.ts');
const payout = read('code/supabase/functions/process-payout/index.ts');
const checkbookWebhook = read('code/supabase/functions/checkbook-webhook/index.ts');
const notify = read('code/supabase/functions/_shared/notifyPaymentFailure.ts');

for (const [name, source] of [
  ['stripe connect adapter', stripeConnectAdapter],
  ['checkbook adapter', checkbookAdapter],
]) {
  assert(source.includes('export const refColumn'), `${name} must export refColumn`);
  assert(source.includes('export async function preflight'), `${name} must export preflight`);
  assert(source.includes('export async function initiate'), `${name} must export initiate`);
}

assert(registry.includes('getPayoutProvider'), 'payoutProviders/index.ts must export getPayoutProvider');
assert(registry.includes('stripe_connect_custom: stripeConnect'), 'registry must map stripe_connect_custom to the Stripe Connect adapter');
assert(registry.includes('checkbook_digital') && registry.includes('checkbook_physical'), 'registry must map both checkbook payout methods to the checkbook adapter');
assert(!registry.includes(retiredAchMethod), 'registry must not expose the retired ACH rail');

assert(payout.includes("from '../_shared/payoutProviders/index.ts'"), 'process-payout must dispatch through the payoutProviders registry');
assert(payout.includes("payout_method = 'stripe_connect_custom'"), 'process-payout must default ACH payouts to Stripe Connect');
assert(payout.includes('getPayoutProvider('), 'process-payout must call getPayoutProvider instead of branching on provider name');
assert(!payout.includes('process-checkbook-payout'), 'process-payout must not reference the retired process-checkbook-payout function');
assert(!payout.includes(retiredResourceHelper), 'process-payout must not call the retired ACH provider directly');

assert(stripeConnectAdapter.includes("stripePost('/transfers'"), 'Stripe Connect adapter must create Stripe transfers');
assert(stripeConnectAdapter.includes("provider', 'stripe_connect_custom'"), 'Stripe Connect adapter must resolve stripe_connect_custom provider links');
assert(stripeConnectAdapter.includes('payouts_enabled !== true'), 'Stripe Connect adapter must fail closed until payouts are enabled');
assert(stripeConnectAdapter.includes("export const refColumn = 'stripe_transfer_id'"), 'Stripe Connect adapter must store transfer ids on payments.stripe_transfer_id');

assert(notify.includes('export async function applyPayoutOutcome'), '_shared/notifyPaymentFailure.ts must export applyPayoutOutcome');
assert(checkbookWebhook.includes('applyPayoutOutcome('), 'checkbook-webhook must call the shared applyPayoutOutcome instead of duplicating updates');

for (const path of [
  'code/src/modules/invoices/components/BillPayWidget.jsx',
  'code/src/modules/accounting/components/StripePayPalPayouts.jsx',
  'code/src/modules/payments/pages/Payments.jsx',
]) {
  const source = read(path);
  assert(!source.includes(retiredAchMethod), `${path} must not expose the retired ACH payout method`);
  assert(!source.includes(retiredSetupFunction), `${path} must not invoke the retired ACH setup function`);
  assert(!source.includes('process-checkbook-payout'), `${path} must not reference the retired process-checkbook-payout function`);
}

console.log('Payout provider abstraction self-check passed');
