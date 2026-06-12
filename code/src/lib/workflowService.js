import { api } from '@/lib/apiClient';
import { supabase } from '@/lib/supabaseClient';

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

export async function emitWorkflowEvent(eventName, entityType, entityId, payload = {}) {
  try {
    await supabase.rpc('log_frontend_event', {
      p_event_name: eventName,
      p_entity_type: entityType,
      p_entity_id: entityId || null,
      p_payload: payload,
    });
  } catch (error) {
    console.warn('Workflow event logging skipped:', error);
  }
}

export async function sendOrderWorkflow({ order, sendMethod = 'email', userId }) {
  if (!order?.id) throw new Error('Select an order to send.');

  const sentAt = new Date().toISOString();
  const payload = {
    status: 'sent',
    sent_via: sendMethod,
    sent_at: sentAt,
    delivery_status: 'queued',
    last_workflow_step: 'sent_to_vendor',
  };

  const updatedOrder = await api.entities.AutoOrder.update(order.id, payload);

  await Promise.allSettled([
    api.entities.ProcessingJob.create({
      organization_id: order.organization_id,
      job_type: 'send_purchase_order',
      status: 'pending',
      source_type: 'auto_order',
      source_id: order.id,
      payload: {
        order_number: order.order_number,
        vendor_name: order.vendor_name,
        send_method: sendMethod,
        total_amount: order.total_amount,
      },
      created_by: userId || null,
    }),
    api.entities.Notification.create({
      organization_id: order.organization_id,
      user_id: userId || null,
      title: 'Purchase order sent',
      message: `${order.order_number || 'Order'} was queued for ${order.vendor_name || 'the vendor'} via ${sendMethod}.`,
      body: `${order.order_number || 'Order'} was queued for ${order.vendor_name || 'the vendor'} via ${sendMethod}.`,
      type: 'order',
      metadata: { order_id: order.id, send_method: sendMethod },
      is_read: false,
      read: false,
    }),
    emitWorkflowEvent('order.sent', 'auto_order', order.id, {
      order_number: order.order_number,
      vendor_name: order.vendor_name,
      send_method: sendMethod,
    }),
  ]);

  return updatedOrder;
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
    received_at: new Date().toISOString(),
    last_workflow_step: hasDiscrepancy ? 'receiving_discrepancy' : 'received',
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

  await Promise.allSettled([
    api.entities.Notification.create({
      organization_id: orgId,
      user_id: userId || null,
      title: hasDiscrepancy ? 'Receiving discrepancy' : 'Order received',
      message: `${order.order_number || 'Order'} was ${hasDiscrepancy ? 'received with discrepancies' : 'received and inventory was updated'}.`,
      body: `${order.order_number || 'Order'} was ${hasDiscrepancy ? 'received with discrepancies' : 'received and inventory was updated'}.`,
      type: 'inventory',
      metadata: { order_id: order.id, receiving_id: receiving.id, has_discrepancy: hasDiscrepancy },
      is_read: false,
      read: false,
    }),
    emitWorkflowEvent(hasDiscrepancy ? 'order.receiving_discrepancy' : 'order.received', 'receiving', receiving.id, {
      order_id: order.id,
      order_number: order.order_number,
      has_discrepancy: hasDiscrepancy,
    }),
  ]);

  return { receiving, orderStatus, receivingStatus, hasDiscrepancy };
}

export async function createTransferWorkflow({
  organizationId,
  fromLocationId,
  toLocationId,
  inventoryItem,
  quantity,
  userId,
}) {
  if (!organizationId) throw new Error('Organization is required.');
  if (!inventoryItem?.id) throw new Error('Select an inventory item.');
  if (!toLocationId) throw new Error('Select a destination location.');
  const transferQuantity = Number(quantity || 0);
  if (transferQuantity <= 0) throw new Error('Transfer quantity must be greater than zero.');
  if (Number(inventoryItem.current_quantity || 0) < transferQuantity) {
    throw new Error('Transfer quantity exceeds available stock.');
  }

  const transfer = await api.entities.Transfer.create({
    organization_id: organizationId,
    from_location_id: fromLocationId || inventoryItem.location_id || null,
    to_location_id: toLocationId,
    status: 'pending',
    items: [{
      inventory_id: inventoryItem.id,
      product_id: inventoryItem.product_id || null,
      product_name: inventoryItem.product_name,
      quantity: transferQuantity,
      unit: inventoryItem.current_unit || 'ea',
      unit_cost: Number(inventoryItem.unit_cost || 0),
    }],
    created_by: userId || null,
  });

  await emitWorkflowEvent('transfer.created', 'transfer', transfer.id, {
    from_location_id: fromLocationId || inventoryItem.location_id || null,
    to_location_id: toLocationId,
    items: transfer.items,
  });

  return transfer;
}

export async function completeTransferWorkflow({ transfer, inventoryRecords = [], userId }) {
  if (!transfer?.id) throw new Error('Select a transfer to complete.');
  if (!['pending', 'in_transit'].includes(transfer.status)) return transfer;

  const items = transfer.items || [];
  await Promise.all(items.map(async (item) => {
    const source = inventoryRecords.find((record) => record.id === item.inventory_id);
    if (!source) return;

    const quantity = Number(item.quantity || 0);
    const previousSourceQty = Number(source.current_quantity || 0);
    const newSourceQty = Math.max(0, previousSourceQty - quantity);

    await api.entities.Inventory.update(source.id, {
      current_quantity: newSourceQty,
      current_value: newSourceQty * Number(source.unit_cost || item.unit_cost || 0),
      previous_quantity: previousSourceQty,
      previous_value: source.current_value || 0,
    });

    await api.entities.InventoryMovement.create({
      organization_id: transfer.organization_id,
      location_id: transfer.from_location_id || source.location_id || null,
      inventory_id: source.id,
      movement_type: 'transfer_out',
      quantity: -quantity,
      source_type: 'transfer',
      source_id: transfer.id,
      previous_quantity: previousSourceQty,
      new_quantity: newSourceQty,
      created_by: userId || null,
    });

    const destination = inventoryRecords.find((record) =>
      record.location_id === transfer.to_location_id &&
      ((record.product_id && record.product_id === source.product_id) ||
       record.product_name?.toLowerCase() === source.product_name?.toLowerCase())
    );

    if (destination) {
      const previousDestinationQty = Number(destination.current_quantity || 0);
      const newDestinationQty = previousDestinationQty + quantity;
      await api.entities.Inventory.update(destination.id, {
        current_quantity: newDestinationQty,
        current_unit: destination.current_unit || source.current_unit || item.unit || 'ea',
        unit_cost: Number(source.unit_cost || item.unit_cost || destination.unit_cost || 0),
        current_value: newDestinationQty * Number(source.unit_cost || item.unit_cost || destination.unit_cost || 0),
        previous_quantity: previousDestinationQty,
        previous_value: destination.current_value || 0,
      });
      await api.entities.InventoryMovement.create({
        organization_id: transfer.organization_id,
        location_id: transfer.to_location_id,
        inventory_id: destination.id,
        movement_type: 'transfer_in',
        quantity,
        source_type: 'transfer',
        source_id: transfer.id,
        previous_quantity: previousDestinationQty,
        new_quantity: newDestinationQty,
        created_by: userId || null,
      });
      return;
    }

    const created = await api.entities.Inventory.create({
      organization_id: transfer.organization_id,
      location_id: transfer.to_location_id,
      product_id: source.product_id || item.product_id || `PRD-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      product_name: source.product_name || item.product_name,
      current_quantity: quantity,
      current_unit: source.current_unit || item.unit || 'ea',
      unit_cost: Number(source.unit_cost || item.unit_cost || 0),
      current_value: quantity * Number(source.unit_cost || item.unit_cost || 0),
      accounting_category: source.accounting_category || 'food',
      par_level: source.par_level || 0,
      reorder_point: source.reorder_point || 0,
      previous_quantity: 0,
      previous_value: 0,
      location: '',
    });

    await api.entities.InventoryMovement.create({
      organization_id: transfer.organization_id,
      location_id: transfer.to_location_id,
      inventory_id: created.id,
      movement_type: 'transfer_in',
      quantity,
      source_type: 'transfer',
      source_id: transfer.id,
      previous_quantity: 0,
      new_quantity: quantity,
      created_by: userId || null,
    });
  }));

  const updatedTransfer = await api.entities.Transfer.update(transfer.id, {
    status: 'completed',
    completed_at: new Date().toISOString(),
    completed_by: userId || null,
  });

  await emitWorkflowEvent('transfer.completed', 'transfer', transfer.id, {
    from_location_id: transfer.from_location_id,
    to_location_id: transfer.to_location_id,
    items,
  });

  return updatedTransfer;
}

export async function approveInvoiceWorkflow({ invoice, order, userId }) {
  if (!invoice?.id) throw new Error('Select an invoice to approve.');
  const approvedInvoice = await api.entities.Invoice.update(invoice.id, {
    status: 'approved',
    approved_by: userId || null,
    approved_date: new Date().toISOString(),
    purchase_order_id: order?.id || invoice.purchase_order_id || null,
    matched_order_id: order?.id || invoice.matched_order_id || null,
    match_status: order ? 'matched' : invoice.match_status || 'manual_approval',
  });

  await ensureLedgerBill(approvedInvoice, { status: 'pending' });

  await Promise.allSettled([
    order?.id ? api.entities.AutoOrder.update(order.id, {
      invoice_status: 'approved',
      last_workflow_step: 'invoice_approved',
    }) : Promise.resolve(),
    emitWorkflowEvent('invoice.approved', 'invoice', invoice.id, {
      invoice_number: invoice.invoice_number,
      order_id: order?.id || null,
      match_status: order ? 'matched' : 'manual_approval',
    }),
  ]);

  return approvedInvoice;
}
