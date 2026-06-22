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
      type: 'order',
      metadata: { order_id: order.id, send_method: sendMethod },
      is_read: false,
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
  
  const orgId = invoice.organization_id || paymentRecord.organization_id;
  const amount = Number(paymentRecord.amount || invoice.total_amount || 0);
  const paymentDate = paymentRecord.payment_date || new Date().toISOString();

  const result = await api.metrics.recordPaymentLedger(
    orgId,
    bill.id,
    paymentRecord.id,
    paymentRecord.payment_method,
    amount,
    paymentDate,
    userId || null
  );

  return result;
}

export async function receiveOrderWorkflow({
  order,
  receivedQuantities = {},
  organizationId,
  locationId,
  userId,
}) {
  if (!order?.id) throw new Error('Select an order to receive.');

  const orgId = organizationId || order.organization_id;

  const result = await api.metrics.receivePurchaseOrder(
    orgId,
    locationId || order.location_id || null,
    order.id,
    receivedQuantities,
    userId || null
  );

  await Promise.allSettled([
    api.entities.Notification.create({
      organization_id: orgId,
      user_id: userId || null,
      title: result.has_discrepancy ? 'Receiving discrepancy' : 'Order received',
      message: `${order.order_number || 'Order'} was ${result.has_discrepancy ? 'received with discrepancies' : 'received and inventory was updated'}.`,
      type: 'inventory',
      metadata: { order_id: order.id, receiving_id: result.receiving_id, has_discrepancy: result.has_discrepancy },
      is_read: false,
    }),
    emitWorkflowEvent(result.has_discrepancy ? 'order.receiving_discrepancy' : 'order.received', 'receiving', result.receiving_id, {
      order_id: order.id,
      order_number: order.order_number,
      has_discrepancy: result.has_discrepancy,
    }),
  ]);

  return { 
    receiving: { id: result.receiving_id }, 
    orderStatus: result.order_status, 
    receivingStatus: result.receiving_status, 
    hasDiscrepancy: result.has_discrepancy 
  };
}

export async function createTransferWorkflow({
  organizationId,
  fromLocationId,
  toLocationId,
  items = [], // Array of { inventoryItem, quantity }
  userId,
}) {
  if (!organizationId) throw new Error('Organization is required.');
  if (!toLocationId) throw new Error('Select a destination location.');
  if (!items || items.length === 0) throw new Error('Add items to transfer.');

  const transferItems = items.map(({ inventoryItem, quantity }) => {
    const transferQuantity = Number(quantity || 0);
    if (transferQuantity <= 0) throw new Error(`Transfer quantity for ${inventoryItem.product_name} must be greater than zero.`);
    if (Number(inventoryItem.current_quantity || 0) < transferQuantity) {
      throw new Error(`Transfer quantity for ${inventoryItem.product_name} exceeds available stock.`);
    }
    return {
      inventory_id: inventoryItem.id,
      product_id: inventoryItem.product_id || null,
      product_name: inventoryItem.product_name,
      quantity: transferQuantity,
      unit: inventoryItem.current_unit || 'ea',
      unit_cost: Number(inventoryItem.unit_cost || 0),
      location_id: inventoryItem.location_id
    };
  });

  const transfer = await api.entities.Transfer.create({
    organization_id: organizationId,
    from_location_id: fromLocationId || transferItems[0]?.location_id || null,
    to_location_id: toLocationId,
    status: 'pending',
    items: transferItems,
    created_by: userId || null,
  });

  await emitWorkflowEvent('transfer.created', 'transfer', transfer.id, {
    from_location_id: transfer.from_location_id,
    to_location_id: toLocationId,
    items: transfer.items,
  });

  return transfer;
}


export async function completeTransferWorkflow({ transfer, inventoryRecords = [], userId }) {
  if (!transfer?.id) throw new Error('Select a transfer to complete.');
  if (!['pending', 'in_transit'].includes(transfer.status)) return transfer;

  await api.metrics.completeInventoryTransfer(
    transfer.organization_id,
    transfer.id,
    userId || null
  );

  const updatedTransfer = {
    ...transfer,
    status: 'completed',
    completed_at: new Date().toISOString(),
    completed_by: userId || null,
  };

  await emitWorkflowEvent('transfer.completed', 'transfer', transfer.id, {
    from_location_id: transfer.from_location_id,
    to_location_id: transfer.to_location_id,
    items: transfer.items,
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
