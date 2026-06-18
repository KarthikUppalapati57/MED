import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
const password = process.env.ROLE_QA_PASSWORD;
const runId = `core-smoke-${Date.now()}`;

if (!supabaseUrl || !anonKey || !serviceRoleKey) {
  console.error('Missing Supabase URL, anon key, or service role key.');
  process.exit(1);
}

if (!password) {
  console.error('Missing ROLE_QA_PASSWORD.');
  process.exit(1);
}

function makeClient(key) {
  return createClient(supabaseUrl, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

const userClient = makeClient(anonKey);
const adminClient = makeClient(serviceRoleKey);
const created = {
  auto_orders: [],
  inventory_movements: [],
  inventory: [],
  invoices: [],
  payment_accounts: [],
  payments: [],
  products: [],
  receivings: [],
  vendors: [],
};

function expectNoError(label, error) {
  if (error) throw new Error(`${label}: ${error.message}`);
}

async function insertOne(table, payload, select = 'id') {
  const result = await userClient.from(table).insert(payload).select(select).single();
  expectNoError(`${table} insert`, result.error);
  if (created[table]) created[table].push(result.data.id);
  return result.data;
}

async function cleanup() {
  const order = [
    'payments',
    'ledger_entries',
    'ledger_payments',
    'ledger_bills',
    'receivings',
    'auto_orders',
    'inventory_movements',
    'inventory',
    'invoices',
    'payment_accounts',
    'products',
    'vendors',
  ];

  for (const table of order) {
    const ids = created[table] || [];
    if (!ids.length) continue;
    await adminClient.from(table).delete().in('id', ids);
  }
}

async function main() {
  const login = await userClient.auth.signInWithPassword({
    email: 'qa.owner.bistro@restops.test',
    password,
  });
  expectNoError('owner login', login.error);

  const profileResult = await userClient
    .from('profiles')
    .select('id,organization_id')
    .eq('id', login.data.user.id)
    .single();
  expectNoError('profile read', profileResult.error);
  const profile = profileResult.data;

  const brandResult = await userClient
    .from('brands')
    .select('brand_id,name')
    .eq('organization_id', profile.organization_id)
    .limit(1)
    .single();
  expectNoError('brand read', brandResult.error);
  const brandId = brandResult.data.brand_id;

  const locationResult = await userClient
    .from('locations')
    .select('id,name')
    .eq('organization_id', profile.organization_id)
    .eq('brand_id', brandId)
    .limit(1)
    .single();
  expectNoError('location read', locationResult.error);
  const locationId = locationResult.data.id;

  const vendor = await insertOne('vendors', {
    brand_id: brandId,
    email: `${runId}@vendor.test`,
    location_id: locationId,
    name: `QA Vendor ${runId}`,
    organization_id: profile.organization_id,
    status: 'active',
  }, 'id,name');

  const product = await insertOne('products', {
    accounting_category: 'food',
    base_unit: 'case',
    brand_id: brandId,
    category: 'food',
    is_inventoried: true,
    latest_price: 42,
    location_id: locationId,
    name: `QA Product ${runId}`,
    organization_id: profile.organization_id,
    product_id: `QA-PROD-${Date.now()}`,
    report_by_unit: 'case',
    status: 'active',
  }, 'id,product_id,name');

  const inventory = await insertOne('inventory', {
    accounting_category: 'food',
    brand_id: brandId,
    current_quantity: 10,
    current_unit: 'case',
    current_value: 420,
    location_id: locationId,
    organization_id: profile.organization_id,
    product_id: product.product_id,
    product_name: product.name,
    reorder_point: 3,
    unit_cost: 42,
  });

  const paymentAccount = await insertOne('payment_accounts', {
    account_type: 'checking',
    brand_id: brandId,
    created_by: profile.id,
    is_active: true,
    is_default: false,
    last_four: '2026',
    location_id: locationId,
    name: `QA Payment Account ${runId}`,
    organization_id: profile.organization_id,
    payment_method: 'bank_transfer',
    provider: 'manual',
  });

  const order = await insertOne('auto_orders', {
    brand_id: brandId,
    created_by: profile.id,
    items: [{
      product_id: product.product_id,
      product_name: product.name,
      quantity: 2,
      unit: 'case',
      unit_price: 42,
      total_price: 84,
    }],
    location_id: locationId,
    order_number: `QA-ORD-${Date.now()}`,
    organization_id: profile.organization_id,
    status: 'pending_approval',
    total_amount: 84,
    vendor_id: vendor.id,
    vendor_name: vendor.name,
  });

  const sent = await userClient
    .from('auto_orders')
    .update({
      delivery_status: 'queued',
      last_workflow_step: 'sent_to_vendor',
      sent_at: new Date().toISOString(),
      sent_via: 'email',
      status: 'sent',
    })
    .eq('id', order.id)
    .select('id,status,last_workflow_step')
    .single();
  expectNoError('auto_order send update', sent.error);
  if (sent.data.status !== 'sent') throw new Error('auto_order status did not update to sent');

  const receiving = await insertOne('receivings', {
    items: order.items,
    order_id: order.id,
    organization_id: profile.organization_id,
    received_by: profile.id,
    status: 'received',
    vendor_id: vendor.id,
  });

  const movement = await insertOne('inventory_movements', {
    created_by: profile.id,
    inventory_id: inventory.id,
    location_id: locationId,
    movement_type: 'purchase_order',
    new_quantity: 12,
    organization_id: profile.organization_id,
    previous_quantity: 10,
    quantity: 2,
    source_id: receiving.id,
    source_type: 'receiving',
  });

  const invoice = await insertOne('invoices', {
    ap_status: 'approved',
    approved_by: profile.id,
    approved_date: new Date().toISOString(),
    brand_id: brandId,
    created_by: profile.id,
    due_date: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
    invoice_date: new Date().toISOString().slice(0, 10),
    invoice_number: `QA-INV-${Date.now()}`,
    line_items: order.items,
    location_id: locationId,
    match_status: 'matched',
    organization_id: profile.organization_id,
    paid_amount: 0,
    payment_status: 'unpaid',
    purchase_order_id: order.id,
    status: 'approved',
    subtotal: 84,
    tax_amount: 0,
    total_amount: 84,
    vendor_id: vendor.id,
    vendor_name: vendor.name,
  });

  const scheduled = await userClient.rpc('schedule_invoice_payment', {
    p_invoice_id: invoice.id,
    p_payment_account_id: paymentAccount.id,
    p_date: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
  });
  expectNoError('schedule_invoice_payment', scheduled.error);

  const payment = await userClient.rpc('record_invoice_payment', {
    p_invoice_id: invoice.id,
    p_amount: 84,
    p_reference: `QA-PAY-${Date.now()}`,
    p_payment_method: 'bank_transfer',
  });
  expectNoError('record_invoice_payment', payment.error);
  if (payment.data?.payment_id) created.payments.push(payment.data.payment_id);

  const paidInvoice = await userClient
    .from('invoices')
    .select('id,status,payment_status,paid_amount,payment_account_id')
    .eq('id', invoice.id)
    .single();
  expectNoError('paid invoice readback', paidInvoice.error);
  if (paidInvoice.data.payment_status !== 'paid' || Number(paidInvoice.data.paid_amount) !== 84) {
    throw new Error(`invoice payment did not round-trip: ${JSON.stringify(paidInvoice.data)}`);
  }

  return {
    account: 'qa.owner.bistro@restops.test',
    organization_id: profile.organization_id,
    brand_id: brandId,
    location_id: locationId,
    checks: {
      vendor: vendor.id,
      product: product.id,
      inventory: inventory.id,
      order: sent.data.status,
      receiving: receiving.id,
      inventoryMovement: movement.id,
      scheduleRpc: scheduled.data,
      paymentRpc: payment.data,
      paidInvoice: paidInvoice.data,
    },
  };
}

let result;
let errorMessage = null;
try {
  result = await main();
} catch (error) {
  errorMessage = error.message;
} finally {
  await cleanup();
  await userClient.auth.signOut();
}

const summary = {
  testedAt: new Date().toISOString(),
  runId,
  ok: !errorMessage,
  result,
  error: errorMessage,
};

console.log(JSON.stringify(summary, null, 2));
if (errorMessage) process.exit(1);
