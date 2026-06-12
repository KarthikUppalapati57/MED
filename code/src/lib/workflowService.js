import { api } from '@/lib/apiClient';

const itemKey = (item) => (
  item.product_id ||
  item.inventory_id ||
  item.product_name ||
  item.description ||
  item.item_name ||
  ''
);

const itemName = (item) => (
  item.product_name ||
  item.description ||
  item.item_name ||
  'Unknown item'
);

const itemQuantity = (item) => Number(
  item.received_quantity ??
  item.approved_quantity ??
  item.suggested_quantity ??
  item.quantity ??
  0
);

const itemUnitPrice = (item) => Number(
  item.unit_price ??
  item.price ??
  item.unit_cost ??
  0
);

export async function ensureLedgerBill(invoice, { status = 'pending' } = {}) {
  if (!invoice?.id) throw new Error('Invoice is required to create a bill.');

  const existing = await api.entities.LedgerBill.filter({ invoice_id: invoice.id });
  const payload = {
    organization_id: invoice.organization_id,
    vendor_id: invoice.vendor_id || null,
    invoice_id: invoice.id,
    subtotal: Number(invoice.subtotal || 0),
    tax: Number(invoice.tax_amount || 0),
    total: Number(invoice.total_amount || 0),
    due_date: invoice.due_date || null,
    status,
  };

  if (existing?.length) {
    return api.entities.LedgerBill.update(existing[0].id, {
      ...payload,
      status: existing[0].status === 'paid' ? 'paid' : status,
    });
  }

  return api.entities.LedgerBill.create(payload);
}

export async function recordPaymentLedger({ invoice, paymentRecord, userId }) {
  if (!invoice || !paymentRecord || paymentRecord.status !== 'completed') return null;

  const bill = await ensureLedgerBill(invoice, { status: 'paid' });
  const existing = await api.entities.LedgerPayment.filter({ source_payment_id: paymentRecord.id });
  if (existing?.length) return existing[0];

  const amount = Number(paymentRecord.amount || invoice.total_amount || 0);
  const ledgerPayment = await api.entities.LedgerPayment.create({
    organization_id: invoice.organization_id || paymentRecord.organization_id,
    bill_id: bill.id,
    source_payment_id: paymentRecord.id,
    payment_method: paymentRecord.payment_method,
    amount,
    payment_date: paymentRecord.payment_date || new Date().toISOString(),
    status: 'completed',
    created_by: userId || null,
  });

  await Promise.allSettled([
    api.entities.LedgerEntry.create({
      organization_id: invoice.organization_id || paymentRecord.organization_id,
      account_code: '2000',
      debit: amount,
      credit: 0,
      reference_type: 'payment',
      reference_id: paymentRecord.id,
    }),
    api.entities.LedgerEntry.create({
      organization_id: invoice.organization_id || paymentRecord.organization_id,
      account_code: '1000',
      debit: 0,
      credit: amount,
      reference_type: 'payment',
      reference_id: paymentRecord.id,
    }),
  ]);

  return ledgerPayment;
}

export async function receiveOrderWorkflow({
  order,
  receivedQuantities = {},
  organizationId,
  locationId,
  userId,
}) {
  if (!order?.id) throw new Error('Select an order to receive.');

  const expectedItems = order.items || [];
  const receivingItems = expectedItems.map((item) => {
    const key = itemKey(item);
    const expected = Number(item.approved_quantity ?? item.suggested_quantity ?? item.quantity ?? 0);
    const received = Number(receivedQuantities[key] ?? expected);
    return {
      ...item,
      received_quantity: received,
      discrepancy: expected - received,
      receiving_status: received === expected ? 'matched' : received > expected ? 'over' : 'short',
    };
  });

  const hasDiscrepancy = receivingItems.some((item) => Number(item.discrepancy || 0) !== 0);
  const hasShort = receivingItems.some((item) => Number(item.discrepancy || 0) > 0);
  const orderStatus = hasShort ? 'partially_received' : 'received';
  const receivingStatus = hasDiscrepancy ? 'discrepancy' : 'received';
  const orgId = organizationId || order.organization_id;

  const receiving = await api.entities.Receiving.create({
    organization_id: orgId,
    order_id: order.id,
    vendor_id: order.vendor_id || null,
    status: receivingStatus,
    items: receivingItems,
    received_by: userId || null,
  });

  await api.entities.AutoOrder.update(order.id, {
    status: orderStatus,
  });

  const inventory = await api.entities.Inventory.list();
  const inventoryByProduct = new Map();
  const inventoryByName = new Map();
  inventory.forEach((record) => {
    if (record.product_id) inventoryByProduct.set(record.product_id, record);
    if (record.product_name) inventoryByName.set(record.product_name.toLowerCase(), record);
  });

  await Promise.allSettled(receivingItems.map(async (item) => {
    const received = Number(item.received_quantity || 0);
    if (received <= 0) return;

    const name = itemName(item);
    const productId = item.product_id || null;
    const unit = item.unit || item.current_unit || 'ea';
    const unitCost = itemUnitPrice(item);
    const existing = (productId && inventoryByProduct.get(productId)) || inventoryByName.get(name.toLowerCase());

    if (existing) {
      const previousQuantity = Number(existing.current_quantity || 0);
      const newQuantity = previousQuantity + received;
      await api.entities.Inventory.update(existing.id, {
        current_quantity: newQuantity,
        current_unit: existing.current_unit || unit,
        unit_cost: unitCost || existing.unit_cost || 0,
        current_value: newQuantity * (unitCost || existing.unit_cost || 0),
        previous_quantity: previousQuantity,
        previous_value: existing.current_value || 0,
        last_counted_date: new Date().toISOString().split('T')[0],
      });
      await api.entities.InventoryMovement.create({
        organization_id: orgId,
        location_id: locationId || order.location_id || existing.location_id || null,
        inventory_id: existing.id,
        movement_type: 'purchase_order',
        quantity: received,
        source_type: 'receiving',
        source_id: receiving.id,
        previous_quantity: previousQuantity,
        new_quantity: newQuantity,
        created_by: userId || null,
      });
      return;
    }

    const created = await api.entities.Inventory.create({
      organization_id: orgId,
      location_id: locationId || order.location_id || null,
      product_id: productId || `PRD-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      product_name: name,
      current_quantity: received,
      current_unit: unit,
      unit_cost: unitCost,
      current_value: received * unitCost,
      accounting_category: 'food',
      par_level: 0,
      reorder_point: 0,
      previous_quantity: 0,
      previous_value: 0,
      location: order.location || '',
    });

    await api.entities.InventoryMovement.create({
      organization_id: orgId,
      location_id: locationId || order.location_id || null,
      inventory_id: created.id,
      movement_type: 'purchase_order',
      quantity: received,
      source_type: 'receiving',
      source_id: receiving.id,
      previous_quantity: 0,
      new_quantity: received,
      created_by: userId || null,
    });
  }));

  return { receiving, orderStatus, receivingStatus, hasDiscrepancy };
}
