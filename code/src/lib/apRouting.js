export const AP_ROUTING_OPTIONS = [
  {
    value: 'payments',
    label: 'Send to Payments',
    shortLabel: 'Payments',
    description: 'Approved unpaid invoices appear in Bill Pay.',
  },
  {
    value: 'storage',
    label: 'Do not send to Payments',
    shortLabel: 'Storage Only',
    description: 'Approved invoices are stored and excluded from Bill Pay.',
  },
  {
    value: 'accounting',
    label: 'Accounting export only',
    shortLabel: 'Accounting',
    description: 'Approved invoices are routed for accounting/export, not Bill Pay.',
  },
  {
    value: 'manual_paid_only',
    label: 'Paid invoices only',
    shortLabel: 'Paid History Only',
    description: 'Only already-paid uploads create payment history records.',
  },
];

export const AP_ROUTING_LABELS = AP_ROUTING_OPTIONS.reduce((acc, option) => {
  acc[option.value] = option.shortLabel;
  return acc;
}, {});

export function normalizeApRouting(value) {
  return AP_ROUTING_OPTIONS.some((option) => option.value === value) ? value : 'payments';
}

export function isPaymentQueueRouted(invoice) {
  return normalizeApRouting(invoice?.ap_routing_destination) === 'payments';
}

export function getApRoutingLabel(value) {
  return AP_ROUTING_LABELS[normalizeApRouting(value)] || AP_ROUTING_LABELS.payments;
}
