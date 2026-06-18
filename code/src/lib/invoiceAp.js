const CLOSED_AP_STATUSES = new Set(['paid', 'closed', 'rejected']);

export const AP_STATUS_LABELS = {
  processing: 'Processing',
  action_required: 'Action Required',
  pending_approval: 'Pending Approval',
  approved: 'Approved',
  scheduled: 'Scheduled',
  paid: 'Paid',
  closed: 'Closed',
  rejected: 'Rejected',
};

export const ACTION_REASON_LABELS = {
  possible_duplicate: 'Possible duplicate',
  validation_flag: 'Validation flag',
  missing_vendor: 'Missing vendor',
  missing_purchase_order: 'Missing purchase order',
  missing_receipt: 'Missing receipt',
  reconciliation_variance: 'Reconciliation variance',
  missing_payment_account: 'Missing payment account',
  other: 'Other',
};

export function deriveApStatus(invoice) {
  if (invoice?.ap_status) return invoice.ap_status;
  if (invoice?.status === 'rejected') return 'rejected';
  if (invoice?.status === 'paid' || invoice?.payment_status === 'paid') return 'paid';
  if (invoice?.status === 'approved') return 'approved';
  if (
    ['flagged', 'duplicate', 'pending_match_approval'].includes(invoice?.status) ||
    ['needs_review', 'variance', 'missing_receipt', 'unmatched'].includes(invoice?.match_status)
  ) return 'action_required';
  if (invoice?.status === 'validated') return 'pending_approval';
  return 'processing';
}

export function deriveActionReason(invoice) {
  if (invoice?.action_required_reason) return invoice.action_required_reason;
  if (invoice?.status === 'duplicate') return 'possible_duplicate';
  if (invoice?.status === 'flagged') return 'validation_flag';
  if (invoice?.status === 'pending_match_approval') return 'reconciliation_variance';
  if (invoice?.match_status === 'missing_receipt') return 'missing_receipt';
  if (invoice?.match_status === 'unmatched') return 'missing_purchase_order';
  if (['needs_review', 'variance'].includes(invoice?.match_status)) return 'reconciliation_variance';
  return null;
}

export function getInvoiceAging(invoice, now = new Date()) {
  if (!invoice?.due_date || CLOSED_AP_STATUSES.has(deriveApStatus(invoice))) {
    return { days: null, bucket: 'Not due', overdue: false };
  }

  const dueDate = new Date(`${invoice.due_date}T00:00:00`);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.floor((today - dueDate) / 86400000);

  if (days <= 0) return { days, bucket: 'Current', overdue: false };
  if (days <= 30) return { days, bucket: '1-30 days', overdue: true };
  if (days <= 60) return { days, bucket: '31-60 days', overdue: true };
  if (days <= 90) return { days, bucket: '61-90 days', overdue: true };
  return { days, bucket: '90+ days', overdue: true };
}

function csvCell(value) {
  const text = value == null ? '' : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export function invoicesToCsv(invoices, paymentAccounts = []) {
  const accountNames = new Map(paymentAccounts.map((account) => [account.id, account.name]));
  const headers = [
    'Invoice Number', 'Vendor', 'Invoice Date', 'Due Date', 'AP Status', 'Action Required Reason',
    'Match Status', 'Payment Status', 'Payment Account', 'Total', 'Source', 'PO Reference',
  ];
  const rows = invoices.map((invoice) => [
    invoice.invoice_number,
    invoice.vendor_name,
    invoice.invoice_date,
    invoice.due_date,
    AP_STATUS_LABELS[deriveApStatus(invoice)] || deriveApStatus(invoice),
    ACTION_REASON_LABELS[deriveActionReason(invoice)] || deriveActionReason(invoice),
    invoice.match_status,
    invoice.payment_status,
    accountNames.get(invoice.payment_account_id) || '',
    Number(invoice.total_amount || 0).toFixed(2),
    invoice.source,
    invoice.po_number || invoice.purchase_order_id || invoice.matched_order_id || '',
  ]);
  return [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
}
