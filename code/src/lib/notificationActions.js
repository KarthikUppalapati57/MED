export function getNotificationAction(notif) {
  const metadata = notif?.metadata || {};
  const title = String(notif?.title || '').toLowerCase();
  const message = String(notif?.message || notif?.body || '').toLowerCase();

  const isBusinessVerificationReview =
    metadata.action === 'business_verification_review' ||
    metadata.review_type === 'business_verification' ||
    title.includes('business verification pending review') ||
    message.includes('requires onboarding follow-up') ||
    message.includes('pending platform admin review');

  if (isBusinessVerificationReview) {
    return {
      label: 'Review Business',
      path: '/PlatformOrganizations?review=business',
    };
  }

  const invoiceId = metadata.invoice_id || notif?.reference_id;
  if (invoiceId && (notif?.type === 'invoice' || notif?.type === 'approval' || notif?.type === 'invoice_approved')) {
    return {
      label: 'Review Invoice',
      path: '/Invoices?invoice=' + invoiceId,
    };
  }

  if (notif?.type === 'payment' || notif?.type === 'payment_failed') {
    return {
      label: 'Open Payments',
      path: '/Payments?tab=invoices',
    };
  }

  if (notif?.type === 'inventory' || notif?.type === 'low_inventory') {
    return {
      label: 'Open Inventory',
      path: '/Inventory',
    };
  }

  return null;
}
