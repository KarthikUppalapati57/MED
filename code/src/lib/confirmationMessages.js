// Centralized confirmation messages for consistency and i18n support

export const confirmationMessages = {
  // Logout
  logout: () => ({
    title: 'Log out?',
    description: 'Are you sure you want to log out?',
    confirmText: 'Log Out',
    cancelText: 'Cancel',
    variant: 'warning',
    severity: 'high',
  }),

  // Shift deletion
  deleteShift: (shiftInfo = '') => ({
    title: 'Delete shift?',
    description: `This action cannot be undone. The shift record will be permanently deleted.${shiftInfo ? ` (${shiftInfo})` : ''}`,
    confirmText: 'Delete Shift',
    cancelText: 'Cancel',
    variant: 'destructive',
    severity: 'critical',
  }),

  // Delete organization
  deleteOrganization: (orgName) => ({
    title: `Delete ${orgName}?`,
    description:
      'This action cannot be undone. This will permanently delete the organization, along with all of its brands, locations, settings, and remove user access to it.',
    confirmText: 'Delete Organization',
    cancelText: 'Cancel',
    variant: 'destructive',
    severity: 'critical',
  }),

  // Delete brand
  deleteBrand: (brandName) => ({
    title: `Delete brand ${brandName}?`,
    description: 'This action cannot be undone. All locations under this brand will also be deleted.',
    confirmText: 'Delete Brand',
    cancelText: 'Cancel',
    variant: 'destructive',
    severity: 'critical',
  }),

  // Delete location
  deleteLocation: (locationName) => ({
    title: `Delete location ${locationName}?`,
    description: 'This action cannot be undone. The location and all its data will be permanently removed.',
    confirmText: 'Delete Location',
    cancelText: 'Cancel',
    variant: 'destructive',
    severity: 'critical',
  }),

  // Delete user
  deleteUser: (email) => ({
    title: `Delete user ${email}?`,
    description: 'This will permanently remove the user account and all associated data. This action cannot be undone.',
    confirmText: 'Delete User',
    cancelText: 'Cancel',
    variant: 'destructive',
    severity: 'critical',
  }),

  // Delete role
  deleteRole: (roleName) => ({
    title: `Delete the "${roleName}" role?`,
    description: 'Users assigned to this role will lose their access. This action cannot be undone.',
    confirmText: 'Delete Role',
    cancelText: 'Cancel',
    variant: 'destructive',
    severity: 'critical',
  }),

  // Delete invitation
  deleteInvitation: (email) => ({
    title: `Delete invitation for ${email}?`,
    description: 'The invitation will be removed. You can send a new invitation anytime.',
    confirmText: 'Delete Invitation',
    cancelText: 'Cancel',
    variant: 'info',
    severity: 'medium',
  }),

  // Delete invoice
  deleteInvoice: (invoiceNumber) => ({
    title: `Delete invoice ${invoiceNumber}?`,
    description: 'This action cannot be undone. The invoice will be permanently removed from the system.',
    confirmText: 'Delete Invoice',
    cancelText: 'Cancel',
    variant: 'destructive',
    severity: 'critical',
  }),

  // Delete inventory item
  deleteInventoryItem: (itemName) => ({
    title: 'Delete Inventory Item?',
    description: `"${itemName || 'This item'}" will be permanently deleted from inventory. This cannot be undone.`,
    confirmText: 'Delete Item',
    cancelText: 'Cancel',
    variant: 'destructive',
    severity: 'critical',
  }),

  // Bulk delete inventory items
  bulkDeleteInventoryItems: (count) => ({
    title: `Delete ${count} Inventory Item${count === 1 ? '' : 's'}?`,
    description: 'This action cannot be undone. The selected inventory items will be permanently deleted.',
    confirmText: 'Delete Items',
    cancelText: 'Cancel',
    variant: 'destructive',
    severity: 'critical',
  }),

  // Add inventory item
  addInventoryItem: (itemName) => ({
    title: 'Add Inventory Item?',
    description: `This will add "${itemName || 'the new item'}" to your inventory. You can edit or remove it later.`,
    confirmText: 'Add Item',
    cancelText: 'Cancel',
    variant: 'info',
    severity: 'medium',
  }),

  // Approve & deplete inventory (EOD POS sync / theoretical usage)
  approveDepleteInventory: (count) => ({
    title: 'Approve Inventory?',
    description: count
      ? `Inventory quantities for ${count} item${count === 1 ? '' : 's'} will be deducted from stock based on POS usage. This cannot be undone.`
      : 'Inventory quantities will be deducted from stock. This cannot be undone.',
    confirmText: 'Approve & Deplete',
    cancelText: 'Cancel',
    variant: 'warning',
    severity: 'high',
  }),

  // Process POS CSV theoretical depletion
  processInventoryDepletion: (count) => ({
    title: 'Approve Inventory?',
    description: count
      ? `Inventory quantities will be deducted from stock for ${count} ingredient${count === 1 ? '' : 's'}. This cannot be undone.`
      : 'Inventory quantities will be deducted from stock. This cannot be undone.',
    confirmText: 'Process Depletion',
    cancelText: 'Cancel',
    variant: 'warning',
    severity: 'high',
  }),

  // Dispatch inter-store transfer
  dispatchInventoryTransfer: (count, destinationName) => ({
    title: 'Dispatch Transfer?',
    description: `Inventory will be transferred to ${destinationName || 'the selected location'}${count ? ` (${count} item${count === 1 ? '' : 's'})` : ''}. Stock levels will update at both locations.`,
    confirmText: 'Dispatch Transfer',
    cancelText: 'Cancel',
    variant: 'warning',
    severity: 'high',
  }),

  // Receive inventory against a purchase order
  receiveInventory: (orderLabel) => ({
    title: 'Receive Inventory?',
    description: orderLabel
      ? `Received quantities will be added to stock for order ${orderLabel}. Shortages may trigger credit requests.`
      : 'Received quantities will be added to stock. Shortages may trigger credit requests.',
    confirmText: 'Receive Inventory',
    cancelText: 'Cancel',
    variant: 'warning',
    severity: 'high',
  }),

  // Discard unsaved inventory form changes
  discardInventoryChanges: () => ({
    title: 'Discard Changes?',
    description: 'Your unsaved inventory changes will be lost.',
    confirmText: 'Discard',
    cancelText: 'Keep Editing',
    variant: 'warning',
    severity: 'medium',
  }),

  // Log wastage (reduces on-hand qty)
  logInventoryWastage: (itemName, quantity, unit) => ({
    title: 'Log Wastage?',
    description: `This will record wastage for "${itemName || 'this item'}"${quantity != null ? ` (${quantity} ${unit || 'units'})` : ''} and reduce on-hand inventory.`,
    confirmText: 'Log Wastage',
    cancelText: 'Cancel',
    variant: 'warning',
    severity: 'high',
  }),

  // Complete physical count session
  completeInventoryCount: () => ({
    title: 'Complete Count Session?',
    description: 'Counted quantities will update on-hand inventory and may generate variance GL entries. This cannot be undone.',
    confirmText: 'Complete Count',
    cancelText: 'Cancel',
    variant: 'warning',
    severity: 'high',
  }),

  // Delete product
  deleteProduct: (count, productName) => ({
    title:
      productName && Number(count) === 1
        ? `Delete product "${productName}"?`
        : `Delete ${count} product${count === 1 ? '' : 's'}?`,
    description: 'This action cannot be undone. The product(s) will be permanently deleted.',
    confirmText: `Delete Product${count === 1 ? '' : 's'}`,
    cancelText: 'Cancel',
    variant: 'destructive',
    severity: 'critical',
  }),

  saveTargetMarginSettings: (targetCogs) => ({
    title: 'Save Target Margin Settings?',
    description:
      targetCogs != null && targetCogs !== ''
        ? `Target Food COGS will be updated to ${targetCogs}% for AI margin warnings.`
        : 'These changes will update the global target used by AI margin alerts.',
    confirmText: 'Save Settings',
    cancelText: 'Cancel',
    variant: 'info',
    severity: 'medium',
  }),

  discardProductChanges: () => ({
    title: 'Discard Changes?',
    description: 'Your unsaved product changes will be lost.',
    confirmText: 'Discard Changes',
    cancelText: 'Cancel',
    variant: 'warning',
    severity: 'medium',
  }),

  discardTargetMarginChanges: () => ({
    title: 'Discard Changes?',
    description: 'Your unsaved target margin settings will be lost.',
    confirmText: 'Discard Changes',
    cancelText: 'Cancel',
    variant: 'warning',
    severity: 'medium',
  }),

  aiAutoFillOverwrite: () => ({
    title: 'Overwrite with AI values?',
    description: 'AI-generated values will replace existing fields you already entered.',
    confirmText: 'Overwrite',
    cancelText: 'Cancel',
    variant: 'warning',
    severity: 'high',
  }),

  // Disable MFA / Remove 2FA
  disableMFA: () => ({
    title: 'Remove Two-Factor Authentication?',
    description: 'Removing two-factor authentication will reduce security for this account.',
    confirmText: 'Remove 2FA',
    cancelText: 'Cancel',
    variant: 'warning',
    severity: 'high',
  }),

  removeTwoFactorAuth: () => ({
    title: 'Remove Two-Factor Authentication?',
    description: 'Removing two-factor authentication will reduce security for this account.',
    confirmText: 'Remove 2FA',
    cancelText: 'Cancel',
    variant: 'warning',
    severity: 'high',
  }),

  // Send dispute email
  sendDisputeEmail: (vendor) => ({
    title: 'Send dispute email?',
    description: `This will send a dispute notification to ${vendor}. This action cannot be undone but is non-destructive.`,
    confirmText: 'Send Email',
    cancelText: 'Cancel',
    variant: 'info',
    severity: 'medium',
  }),

  // Remove cost split
  removeInvoiceSplit: () => ({
    title: 'Remove cost split?',
    description: 'This will remove this cost allocation. You can add it back anytime.',
    confirmText: 'Remove Split',
    cancelText: 'Cancel',
    variant: 'info',
    severity: 'medium',
  }),

  // Approve invoice
  approveInvoice: (invoiceNumber, amount) => ({
    title: `Approve invoice ${invoiceNumber} for payment?`,
    description: `This invoice will be approved and queued for payment. Amount: ${amount}. This action cannot be undone.`,
    confirmText: 'Approve & Pay',
    cancelText: 'Cancel',
    variant: 'success',
    severity: 'high',
  }),

  // Apply smart par levels
  applySmartPar: (count) => ({
    title: `Apply AI suggested Par Levels to ${count} item${count === 1 ? '' : 's'}?`,
    description: 'This will update the par levels for the selected items based on recent sales trends. This is reversible.',
    confirmText: 'Apply Smart Par',
    cancelText: 'Cancel',
    variant: 'info',
    severity: 'medium',
  }),

  // ========================================
  // WAVE 1: INVOICES
  // ========================================

  // Approve invoice (updated for Wave 1)
  approveInvoiceWave1: (invoice) => ({
    title: `Approve invoice ${invoice.invoice_number}?`,
    description: `Approve invoice from ${invoice.vendor_name} for $${Number(invoice.total_amount || 0).toFixed(2)}. This will sync products to inventory and trigger payment workflows.`,
    confirmText: 'Approve',
    cancelText: 'Review More',
    variant: 'warning',
    severity: 'high',
  }),

  // Reject invoice
  rejectInvoice: (invoice) => ({
    title: `Reject invoice ${invoice.invoice_number}?`,
    description: `Reject invoice from ${invoice.vendor_name}. The uploader will be notified and can resubmit corrections.`,
    confirmText: 'Reject',
    cancelText: 'Cancel',
    variant: 'warning',
    severity: 'high',
  }),

  // Request credit for invoice
  requestCredit: (invoice) => ({
    title: `Request credit for invoice ${invoice.invoice_number}?`,
    description: `Create a credit request for $${Number(invoice.total_amount || 0).toFixed(2)} from ${invoice.vendor_name}. A dialog will open to specify the credit reason and amount.`,
    confirmText: 'Request Credit',
    cancelText: 'Cancel',
    variant: 'info',
    severity: 'medium',
  }),

  // Delete invoice (updated for Wave 1)
  deleteInvoiceWave1: (invoice) => ({
    title: `Delete invoice ${invoice.invoice_number}?`,
    description: `This action cannot be undone. Invoice from ${invoice.vendor_name} ($${Number(invoice.total_amount || 0).toFixed(2)}) will be permanently removed. All associated records will be deleted.`,
    confirmText: 'Delete',
    cancelText: 'Cancel',
    variant: 'destructive',
    severity: 'critical',
  }),

  // Batch approve invoices
  batchApproveInvoices: (count, total, vendorName) => ({
    title: `Approve ${count} invoice${count === 1 ? '' : 's'}?`,
    description: `Approve ${count} invoice${count === 1 ? '' : 's'} from ${vendorName} (Total: $${Number(total || 0).toFixed(2)}). Products will be synced to inventory and payment workflows will be triggered.`,
    confirmText: 'Approve All',
    cancelText: 'Cancel',
    variant: 'warning',
    severity: 'high',
  }),

  // Batch reject invoices
  batchRejectInvoices: (count, vendorName) => ({
    title: `Reject ${count} invoice${count === 1 ? '' : 's'}?`,
    description: `Reject ${count} invoice${count === 1 ? '' : 's'} from ${vendorName}. Uploaders will be notified.`,
    confirmText: 'Reject All',
    cancelText: 'Cancel',
    variant: 'warning',
    severity: 'high',
  }),

  // Batch delete invoices
  batchDeleteInvoices: (count, vendorName) => ({
    title: `Delete ${count} invoice${count === 1 ? '' : 's'}?`,
    description: `This action cannot be undone. ${count} invoice${count === 1 ? '' : 's'} from ${vendorName} will be permanently deleted.`,
    confirmText: 'Delete All',
    cancelText: 'Cancel',
    variant: 'destructive',
    severity: 'critical',
  }),

  // ========================================
  // WAVE 1: PAYMENTS
  // ========================================

  // Approve invoice from payable queue
  approvePayableInvoice: (invoice) => ({
    title: invoice?.invoice_number
      ? `Approve invoice ${invoice.invoice_number}?`
      : 'Approve invoice?',
    description: `Approve invoice from ${invoice?.vendor_name || 'this vendor'} for $${Number(invoice?.total_amount || 0).toFixed(2)}. This will add it to the payment queue.`,
    confirmText: 'Approve',
    cancelText: 'Cancel',
    variant: 'warning',
    severity: 'high',
  }),

  // Reject invoice from payable queue
  rejectPayableInvoice: (invoice) => ({
    title: invoice?.invoice_number
      ? `Reject invoice ${invoice.invoice_number}?`
      : 'Reject invoice?',
    description: `Reject invoice from ${invoice?.vendor_name || 'this vendor'}. It will be removed from the payable queue.`,
    confirmText: 'Reject',
    cancelText: 'Cancel',
    variant: 'warning',
    severity: 'high',
  }),

  // Pay now (immediate payment)
  payNow: (invoice, paymentMethod) => ({
    title: `Process payment for invoice ${invoice.invoice_number}?`,
    description: `Process immediate payment of $${Number(invoice.total_amount || 0).toFixed(2)} to ${invoice.vendor_name} via ${paymentMethod || 'selected method'}. This transaction will be recorded immediately.`,
    confirmText: 'Pay Now',
    cancelText: 'Cancel',
    variant: 'warning',
    severity: 'high',
  }),

  // Schedule payment
  schedulePayment: (invoice, scheduledDate, paymentAccount) => ({
    title: `Schedule payment for invoice ${invoice.invoice_number}?`,
    description: `Schedule $${Number(invoice.total_amount || 0).toFixed(2)} payment to ${invoice.vendor_name} for ${scheduledDate}. The payment will be processed on the scheduled date.`,
    confirmText: 'Schedule Payment',
    cancelText: 'Cancel',
    variant: 'info',
    severity: 'medium',
  }),

  // Record manual payment
  recordManualPayment: (invoice, amount, method) => ({
    title: `Record manual payment for invoice ${invoice.invoice_number}?`,
    description: `Record $${Number(amount || 0).toFixed(2)} manual payment to ${invoice.vendor_name} via ${method || 'manual entry'}. This will create a payment record in the ledger.`,
    confirmText: 'Record Payment',
    cancelText: 'Cancel',
    variant: 'info',
    severity: 'medium',
  }),

  // Confirm bank transfer
  confirmBankTransfer: (payment) => ({
    title: `Confirm bank transfer?`,
    description: `Mark the bank transfer of $${Number(payment.amount || 0).toFixed(2)} to ${payment.vendor_name || 'vendor'} (Ref: ${payment.reference || 'N/A'}) as confirmed. This updates the payment status.`,
    confirmText: 'Confirm Transfer',
    cancelText: 'Cancel',
    variant: 'info',
    severity: 'medium',
  }),

  // Confirm bank transfer initiated (Process Payment modal)
  confirmBankTransferInitiated: (payment) => ({
    title: 'Confirm bank transfer?',
    description: `Are you sure you want to confirm this transfer of $${Number(payment?.amount || 0).toFixed(2)} to ${payment?.vendor_name || 'the vendor'}? The payment will be marked pending until receipt is verified.`,
    confirmText: 'Confirm Transfer',
    cancelText: 'Cancel',
    variant: 'warning',
    severity: 'high',
  }),

  // Record payment from Process Payment manual tab
  recordGatewayManualPayment: (payment) => ({
    title: 'Record payment?',
    description: `Are you sure you want to record this payment of $${Number(payment?.amount || 0).toFixed(2)} to ${payment?.vendor_name || 'the vendor'}? This will mark the invoice as paid.`,
    confirmText: 'Record Payment',
    cancelText: 'Cancel',
    variant: 'warning',
    severity: 'high',
  }),

  // Discard Process Payment modal edits
  discardProcessPaymentChanges: () => ({
    title: 'Discard changes?',
    description: 'Are you sure you want to cancel? Unsaved changes will be lost.',
    confirmText: 'Discard',
    cancelText: 'Keep Editing',
    variant: 'warning',
    severity: 'medium',
  }),

  // Bulk schedule payment
  bulkSchedulePayment: (count, total, scheduledDate) => ({
    title: `Schedule ${count} payment${count === 1 ? '' : 's'} for ${scheduledDate}?`,
    description: `Schedule ${count} payment${count === 1 ? '' : 's'} totaling $${Number(total || 0).toFixed(2)} for ${scheduledDate}. All selected payments will be processed on the scheduled date.`,
    confirmText: 'Schedule All',
    cancelText: 'Cancel',
    variant: 'warning',
    severity: 'high',
  }),

  // Confirm multiple transfers
  confirmMultipleTransfers: (count, total) => ({
    title: `Confirm ${count} transfer${count === 1 ? '' : 's'}?`,
    description: `Confirm ${count} bank transfer${count === 1 ? '' : 's'} totaling $${Number(total || 0).toFixed(2)}. These transfers will be marked as confirmed.`,
    confirmText: 'Confirm All',
    cancelText: 'Cancel',
    variant: 'info',
    severity: 'medium',
  }),

  // ========================================
  // REMAINING CONFIRMATIONS (Wave 2+)
  // ========================================

  // Submit commissary order
  submitCommissaryOrder: (itemCount, total) => ({
    title: `Submit order for ${itemCount} item${itemCount === 1 ? '' : 's'}?`,
    description: `Submit commissary order totaling $${Number(total || 0).toFixed(2)}. This order will be sent to the commissary location.`,
    confirmText: 'Submit Order',
    cancelText: 'Cancel',
    variant: 'info',
    severity: 'medium',
  }),

  // Send campaign
  sendCampaign: () => ({
    title: 'Send promotional campaign?',
    description: 'This will dispatch the campaign message to all targeted customers via email and SMS. This action cannot be undone.',
    confirmText: 'Send Campaign',
    cancelText: 'Cancel',
    variant: 'warning',
    severity: 'high',
  }),

  // Create recipe
  createRecipe: (recipeName) => ({
    title: `Create recipe "${recipeName}"?`,
    description: 'This will add the new recipe to your recipe database. You can edit or delete it anytime.',
    confirmText: 'Create Recipe',
    cancelText: 'Cancel',
    variant: 'info',
    severity: 'medium',
  }),

  // Create product
  createProduct: (productName) => ({
    title: `Create product "${productName}"?`,
    description: 'This will add the new product to your product catalog. You can edit or delete it anytime.',
    confirmText: 'Create Product',
    cancelText: 'Cancel',
    variant: 'info',
    severity: 'medium',
  }),

  // Save schedule
  saveSchedule: () => ({
    title: 'Save schedule preferences?',
    description: 'This will update your dashboard report scheduling preferences.',
    confirmText: 'Save Schedule',
    cancelText: 'Cancel',
    variant: 'info',
    severity: 'medium',
  }),

  // Download executive report
  downloadExecutiveReport: () => ({
    title: 'Download report?',
    description: 'Are you sure you want to download?',
    confirmText: 'Download',
    cancelText: 'Cancel',
    variant: 'info',
    severity: 'low',
  }),

  // Download daily handoff
  downloadDailyHandoff: () => ({
    title: 'Download handoff?',
    description: 'Are you sure you want to download?',
    confirmText: 'Download',
    cancelText: 'Cancel',
    variant: 'info',
    severity: 'low',
  }),

  // Refresh report delivery log
  refreshReportDeliveryLog: () => ({
    title: 'Refresh delivery log?',
    description: 'Are you sure you want to refresh?',
    confirmText: 'Refresh',
    cancelText: 'Cancel',
    variant: 'info',
    severity: 'low',
  }),

  // Save custom report
  saveCustomReport: () => ({
    title: 'Save report?',
    description: 'Are you sure you want to save?',
    confirmText: 'Save',
    cancelText: 'Cancel',
    variant: 'info',
    severity: 'low',
  }),

  // Save email ingestion config
  saveEmailIngestionConfig: () => ({
    title: 'Save email settings?',
    description: 'Are you sure you want to save?',
    confirmText: 'Save Config',
    cancelText: 'Keep Editing',
    variant: 'info',
    severity: 'medium',
  }),

  // Discard email ingestion config changes
  discardEmailIngestionConfig: () => ({
    title: 'Discard changes?',
    description: 'Are you sure you want to cancel? Unsaved changes will be lost.',
    confirmText: 'Discard',
    cancelText: 'Keep Editing',
    variant: 'warning',
    severity: 'medium',
  }),

  // Save rules
  saveRules: () => ({
    title: 'Save dashboard rules?',
    description: 'This will update your dashboard alert rules and notifications.',
    confirmText: 'Save Rules',
    cancelText: 'Cancel',
    variant: 'info',
    severity: 'medium',
  }),

  // Reset daily action plan
  resetDailyActionPlan: () => ({
    title: 'Reset daily action plan?',
    description: 'This will clear all current actions and recommendations. You can generate a new plan anytime.',
    confirmText: 'Reset Plan',
    cancelText: 'Cancel',
    variant: 'warning',
    severity: 'high',
  }),

  sendDailyReport: () => ({
    title: 'Send Daily Report Now?',
    description: 'The daily operational report will be sent immediately to the configured recipients.',
    confirmText: 'Send Daily Report',
    cancelText: 'Cancel',
    variant: 'info',
    severity: 'medium',
  }),

  sendWeeklyReport: () => ({
    title: 'Send Weekly Report Now?',
    description: 'The weekly executive report will be sent immediately to the configured recipients.',
    confirmText: 'Send Weekly Report',
    cancelText: 'Cancel',
    variant: 'info',
    severity: 'medium',
  }),

  saveReview: () => ({
    title: 'Save Review?',
    description: 'This manager review snapshot will be saved.',
    confirmText: 'Save Review',
    cancelText: 'Cancel',
    variant: 'warning',
    severity: 'medium',
  }),

  discardManagerNoteChanges: () => ({
    title: 'Discard Manager Note Changes?',
    description: 'Your unsaved manager note changes will be lost.',
    confirmText: 'Discard Changes',
    cancelText: 'Cancel',
    variant: 'warning',
    severity: 'medium',
  }),

  // Establish external connection
  establishExternalConnection: (platform) => ({
    title: `Connect ${platform}?`,
    description: `This will establish a secure connection to ${platform}. You will be redirected to authorize the connection.`,
    confirmText: 'Connect',
    cancelText: 'Cancel',
    variant: 'warning',
    severity: 'high',
  }),

  // Save budget target
  saveBudgetTarget: () => ({
    title: 'Save budget target?',
    description: 'This will update your performance budget targets and trigger any applicable alerts.',
    confirmText: 'Save Budget',
    cancelText: 'Cancel',
    variant: 'info',
    severity: 'medium',
  }),

  resolveCriticalAlert: (alertTitle) => ({
    title: 'Resolve Critical Alert?',
    description: alertTitle
      ? `“${alertTitle}” will be marked as resolved and removed from the active action list.`
      : 'This critical alert will be marked as resolved and removed from the active action list.',
    confirmText: 'Resolve',
    cancelText: 'Cancel',
    variant: 'warning',
    severity: 'high',
  }),

  snoozeHighSeverityAction: (alertTitle) => ({
    title: 'Snooze Action?',
    description: alertTitle
      ? `“${alertTitle}” will be snoozed for 24 hours.`
      : 'This high-severity action will be snoozed for 24 hours.',
    confirmText: 'Snooze',
    cancelText: 'Cancel',
    variant: 'warning',
    severity: 'medium',
  }),

  discardBudgetChanges: () => ({
    title: 'Discard Budget Changes?',
    description: 'Your unsaved budget target edits will be lost.',
    confirmText: 'Discard Changes',
    cancelText: 'Cancel',
    variant: 'warning',
    severity: 'medium',
  }),

  sendCutNotification: () => ({
    title: 'Send Cut Notification?',
    description: 'A labor cut instruction will be sent to the floor manager.',
    confirmText: 'Send Notification',
    cancelText: 'Cancel',
    variant: 'warning',
    severity: 'high',
  }),

  uploadAndProcessInvoice: (fileName) => ({
    title: 'Upload & Process Invoice?',
    description: fileName
      ? `“${fileName}” will be uploaded and processed to create invoice records.`
      : 'This document will be uploaded and processed to create invoice records.',
    confirmText: 'Upload & Process',
    cancelText: 'Cancel',
    variant: 'info',
    severity: 'medium',
  }),

  discardInvoiceChanges: () => ({
    title: 'Discard Changes?',
    description: 'Your unsaved invoice edit or upload changes will be lost.',
    confirmText: 'Discard Changes',
    cancelText: 'Cancel',
    variant: 'warning',
    severity: 'medium',
  }),

  discardTransferChanges: () => ({
    title: 'Discard Changes?',
    description: 'Your unsaved transfer form changes will be lost.',
    confirmText: 'Discard Changes',
    cancelText: 'Cancel',
    variant: 'warning',
    severity: 'medium',
  }),

  discardReceiveOrderChanges: () => ({
    title: 'Discard Changes?',
    description: 'Your unsaved receiving form changes will be lost.',
    confirmText: 'Discard Changes',
    cancelText: 'Cancel',
    variant: 'warning',
    severity: 'medium',
  }),

  discardCommissaryOrderChanges: () => ({
    title: 'Discard Changes?',
    description: 'Your unsaved commissary order draft will be lost.',
    confirmText: 'Discard Changes',
    cancelText: 'Cancel',
    variant: 'warning',
    severity: 'medium',
  }),

  discardRecipeChanges: () => ({
    title: 'Discard Changes?',
    description: 'Your unsaved recipe changes will be lost.',
    confirmText: 'Discard Changes',
    cancelText: 'Cancel',
    variant: 'warning',
    severity: 'medium',
  }),

  // ========================================
  // ORDERS / AUTO-ORDERING
  // ========================================

  generatePurchaseOrder: (itemCount) => ({
    title: 'Generate Purchase Order?',
    description: itemCount
      ? `A purchase order will be created for ${itemCount} low-stock item${itemCount === 1 ? '' : 's'} using suggested quantities.`
      : 'A purchase order will be created using the selected items and quantities.',
    confirmText: 'Generate',
    cancelText: 'Cancel',
    variant: 'info',
    severity: 'medium',
  }),

  approvePurchaseOrder: (orderNumber, vendorName) => ({
    title: 'Approve Order?',
    description: `Order ${orderNumber || ''}${vendorName ? ` for ${vendorName}` : ''} will move to the next stage of the purchasing workflow.`.replace(/\s+/g, ' ').trim(),
    confirmText: 'Approve',
    cancelText: 'Cancel',
    variant: 'warning',
    severity: 'high',
  }),

  rejectPurchaseOrder: (orderNumber, vendorName) => ({
    title: 'Reject Order?',
    description: `Order ${orderNumber || ''}${vendorName ? ` for ${vendorName}` : ''} will be rejected and will not continue for processing.`.replace(/\s+/g, ' ').trim(),
    confirmText: 'Reject',
    cancelText: 'Cancel',
    variant: 'warning',
    severity: 'high',
  }),

  sendPurchaseOrder: (orderNumber, vendorName) => ({
    title: 'Send Order?',
    description: `Order ${orderNumber || ''}${vendorName ? ` will be sent to ${vendorName}` : ' will be sent to the selected vendor'}.`.replace(/\s+/g, ' ').trim(),
    confirmText: 'Send Order',
    cancelText: 'Cancel',
    variant: 'warning',
    severity: 'high',
  }),

  confirmOrderReceipt: (orderNumber, vendorName) => ({
    title: 'Confirm Receipt?',
    description: orderNumber
      ? `Received quantities for order ${orderNumber}${vendorName ? ` (${vendorName})` : ''} will be added to inventory.`
      : 'Received quantities will be added to inventory.',
    confirmText: 'Confirm Receipt',
    cancelText: 'Cancel',
    variant: 'warning',
    severity: 'high',
  }),

  approveOrderInvoice: (invoiceNumber, vendorName) => ({
    title: 'Approve Invoice?',
    description: invoiceNumber
      ? `Invoice ${invoiceNumber}${vendorName ? ` from ${vendorName}` : ''} will move to the next approval stage.`
      : 'This invoice will move to the next approval stage.',
    confirmText: 'Approve',
    cancelText: 'Cancel',
    variant: 'warning',
    severity: 'high',
  }),

  createInternalTransfer: (itemName, quantity, destinationName) => ({
    title: 'Create Transfer?',
    description: `Transfer ${quantity != null ? `${quantity} of ` : ''}${itemName || 'selected inventory'} to ${destinationName || 'the destination location'}? A pending transfer record will be created.`,
    confirmText: 'Create Transfer',
    cancelText: 'Cancel',
    variant: 'warning',
    severity: 'high',
  }),

  completeInternalTransfer: (destinationName, itemCount) => ({
    title: 'Complete Transfer?',
    description: itemCount
      ? `The selected inventory (${itemCount} item${itemCount === 1 ? '' : 's'}) will be transferred to ${destinationName || 'the destination location'}.`
      : `The selected inventory will be transferred to ${destinationName || 'the destination location'}.`,
    confirmText: 'Complete Transfer',
    cancelText: 'Cancel',
    variant: 'warning',
    severity: 'high',
  }),

  saveOrderingSettings: () => ({
    title: 'Save Ordering Settings?',
    description: 'These changes will update ordering, approval, recurring-order, or automatic-order behavior.',
    confirmText: 'Save',
    cancelText: 'Cancel',
    variant: 'info',
    severity: 'medium',
  }),

  // ========================================
  // VENDORS
  // ========================================

  createVendor: (vendorName) => ({
    title: 'Create Vendor?',
    description: vendorName
      ? `"${vendorName}" will be added to your purchasing and accounts payable workflows.`
      : 'This vendor will be added to your purchasing and accounts payable workflows.',
    confirmText: 'Create Vendor',
    cancelText: 'Cancel',
    variant: 'info',
    severity: 'medium',
  }),

  uploadReconcileStatement: (vendorName) => ({
    title: 'Upload and Reconcile Statement?',
    description: vendorName
      ? `The uploaded statement for ${vendorName} will be processed and matched against vendor invoices.`
      : 'The uploaded statement will be processed and matched against vendor invoices.',
    confirmText: 'Upload & Reconcile',
    cancelText: 'Cancel',
    variant: 'warning',
    severity: 'high',
  }),

  evaluateVendorBids: () => ({
    title: 'Evaluate Bids?',
    description: 'The selected vendor bids will be evaluated and recommendations may be updated.',
    confirmText: 'Evaluate Bids',
    cancelText: 'Cancel',
    variant: 'warning',
    severity: 'high',
  }),

  buildVendorManifest: () => ({
    title: 'Build Manifest?',
    description: 'A logistics manifest will be created using the selected vendor and shipment details.',
    confirmText: 'Build Manifest',
    cancelText: 'Cancel',
    variant: 'info',
    severity: 'medium',
  }),

  discardVendorChanges: () => ({
    title: 'Discard Changes?',
    description: 'Your unsaved vendor changes will be lost.',
    confirmText: 'Discard Changes',
    cancelText: 'Cancel',
    variant: 'warning',
    severity: 'medium',
  }),

  deleteVendor: (vendorName) => ({
    title: 'Delete Vendor?',
    description: vendorName
      ? `"${vendorName}" will be permanently removed and may no longer be available in purchasing workflows.`
      : 'This vendor will be permanently removed and may no longer be available in purchasing workflows.',
    confirmText: 'Delete',
    cancelText: 'Cancel',
    variant: 'destructive',
    severity: 'critical',
  }),

  archiveVendor: (vendorName) => ({
    title: 'Archive Vendor?',
    description: vendorName
      ? `"${vendorName}" will be hidden from active workflows and can be restored later.`
      : 'This vendor will be hidden from active workflows and can be restored later.',
    confirmText: 'Archive',
    cancelText: 'Cancel',
    variant: 'warning',
    severity: 'high',
  }),

  autoMatchVendorStatement: (lineCount) => ({
    title: 'Auto-Match Statement?',
    description: lineCount
      ? `Attempt to match ${lineCount} statement line${lineCount === 1 ? '' : 's'} against open invoices.`
      : 'Attempt to match statement lines against open invoices.',
    confirmText: 'Auto Match',
    cancelText: 'Cancel',
    variant: 'warning',
    severity: 'high',
  }),

  // ========================================
  // PAYMENT SETUP
  // ========================================

  savePaymentSettings: (scopeLabel) => ({
    title: 'Save Payment Settings?',
    description: scopeLabel
      ? `These changes will update payment behavior for ${scopeLabel}.`
      : 'These changes will update your organization’s payment behavior.',
    confirmText: 'Save Settings',
    cancelText: 'Cancel',
    variant: 'info',
    severity: 'medium',
  }),

  enableAutoPay: (scopeLabel, beginsImmediately = false) => ({
    title: 'Enable Auto-Pay?',
    description: [
      scopeLabel
        ? `Approved invoices will be paid automatically according to your payment settings for ${scopeLabel}.`
        : 'Approved invoices will be paid automatically according to your payment settings.',
      beginsImmediately
        ? 'Auto-Pay will begin immediately.'
        : 'Auto-Pay will begin after you save payment settings.',
    ].join(' '),
    confirmText: 'Enable Auto-Pay',
    cancelText: 'Cancel',
    variant: 'warning',
    severity: 'high',
  }),

  disableAutoPay: (scopeLabel) => ({
    title: 'Disable Auto-Pay?',
    description: scopeLabel
      ? `Future approved invoices for ${scopeLabel} will require manual payment.`
      : 'Future approved invoices will require manual payment.',
    confirmText: 'Disable Auto-Pay',
    cancelText: 'Cancel',
    variant: 'warning',
    severity: 'high',
  }),

  discardPaymentSetupChanges: () => ({
    title: 'Discard Changes?',
    description: 'Your unsaved payment settings will be lost.',
    confirmText: 'Discard Changes',
    cancelText: 'Cancel',
    variant: 'warning',
    severity: 'medium',
  }),

  removePaymentAccount: (accountName) => ({
    title: 'Remove Payment Account?',
    description: accountName
      ? `"${accountName}" will no longer be available for future payments.`
      : 'This payment account will no longer be available for future payments.',
    confirmText: 'Remove',
    cancelText: 'Cancel',
    variant: 'destructive',
    severity: 'critical',
  }),

  // ========================================
  // ACCOUNTING
  // ========================================

  submitPayouts: (count, total, paymentMethod) => ({
    title: 'Submit Payouts?',
    description: [
      count
        ? `The selected vendor payout${count === 1 ? '' : 's'} (${count}) totaling $${Number(total || 0).toFixed(2)} will be submitted for processing.`
        : 'The selected vendor payouts will be submitted for processing.',
      paymentMethod ? `Method: ${paymentMethod}.` : null,
    ].filter(Boolean).join(' '),
    confirmText: 'Submit Payouts',
    cancelText: 'Cancel',
    variant: 'warning',
    severity: 'high',
  }),

  sendVendorPaymentNow: (vendorName, amount) => ({
    title: 'Send Payment Now?',
    description: vendorName
      ? `Payment of $${Number(amount || 0).toFixed(2)} will be sent immediately to ${vendorName}.`
      : `Payment of $${Number(amount || 0).toFixed(2)} will be sent immediately to the selected vendor.`,
    confirmText: 'Send Payment',
    cancelText: 'Cancel',
    variant: 'warning',
    severity: 'high',
  }),

  syncAccountingNow: () => ({
    title: 'Sync Now?',
    description: 'Accounting records will be synchronized with the connected accounting system.',
    confirmText: 'Sync Now',
    cancelText: 'Cancel',
    variant: 'warning',
    severity: 'high',
  }),

  syncAllReadyAccounting: (count) => ({
    title: 'Sync All Ready?',
    description: count
      ? `All ready records (${count}) will be synchronized with the connected accounting system.`
      : 'All ready records will be synchronized with the connected accounting system.',
    confirmText: 'Sync All',
    cancelText: 'Cancel',
    variant: 'warning',
    severity: 'high',
  }),

  discardIntegrationCredentials: () => ({
    title: 'Discard Changes?',
    description: 'Your unsaved integration changes will be lost.',
    confirmText: 'Discard Changes',
    cancelText: 'Cancel',
    variant: 'warning',
    severity: 'medium',
  }),

  disconnectIntegration: (providerName) => ({
    title: 'Disconnect Integration?',
    description: providerName
      ? `The connection to ${providerName} will be removed.`
      : 'The connection to the external accounting system will be removed.',
    confirmText: 'Disconnect',
    cancelText: 'Cancel',
    variant: 'destructive',
    severity: 'critical',
  }),

  // ========================================
  // SMARTPREP
  // ========================================

  generateMasterSheet: (locationName, prepDate, itemCount, willOverwrite = false) => ({
    title: 'Generate Master Sheet?',
    description: [
      'A kitchen prep master sheet will be generated using the current plan, forecasts, and inventory data.',
      locationName ? `Location: ${locationName}.` : null,
      prepDate ? `Date: ${prepDate}.` : null,
      itemCount != null ? `Current prep items: ${itemCount}.` : null,
      willOverwrite ? 'Existing generated prep values may be replaced.' : null,
    ].filter(Boolean).join(' '),
    confirmText: 'Generate Master Sheet',
    cancelText: 'Cancel',
    variant: 'warning',
    severity: 'high',
  }),

  createSmartPrepPlan: (planName, prepDate, locationName) => ({
    title: 'Create SmartPrep Plan?',
    description: [
      planName
        ? `A new prep plan for “${planName}” will be created.`
        : 'A new prep plan will be created for the selected date and location.',
      prepDate ? `Date: ${prepDate}.` : null,
      locationName ? `Location: ${locationName}.` : null,
    ].filter(Boolean).join(' '),
    confirmText: 'Create Plan',
    cancelText: 'Cancel',
    variant: 'info',
    severity: 'medium',
  }),

  discardSmartPrepChanges: () => ({
    title: 'Discard Changes?',
    description: 'Your unsaved SmartPrep plan changes will be lost.',
    confirmText: 'Discard Changes',
    cancelText: 'Cancel',
    variant: 'warning',
    severity: 'medium',
  }),

  deleteSmartPrepPlan: (planName) => ({
    title: 'Delete SmartPrep Plan?',
    description: planName
      ? `“${planName}” will be permanently removed.`
      : 'This prep plan will be permanently removed.',
    confirmText: 'Delete Plan',
    cancelText: 'Cancel',
    variant: 'destructive',
    severity: 'critical',
  }),

  regenerateSmartPrepPlan: (locationName, prepDate) => ({
    title: 'Regenerate Plan?',
    description: [
      'The current generated prep values may be replaced.',
      locationName ? `Location: ${locationName}.` : null,
      prepDate ? `Date: ${prepDate}.` : null,
    ].filter(Boolean).join(' '),
    confirmText: 'Regenerate',
    cancelText: 'Cancel',
    variant: 'warning',
    severity: 'high',
  }),

  // ========================================
  // ORGANIZATION MANAGEMENT
  // ========================================

  saveApprovalRule: (ruleLabel) => ({
    title: 'Save Approval Rule?',
    description: ruleLabel
      ? `This rule (${ruleLabel}) will update how invoices or payments are approved.`
      : 'This rule will update how invoices or payments are approved.',
    confirmText: 'Save Rule',
    cancelText: 'Cancel',
    variant: 'info',
    severity: 'medium',
  }),

  deleteApprovalRule: (ruleLabel) => ({
    title: 'Delete Approval Rule?',
    description: ruleLabel
      ? `The approval rule “${ruleLabel}” will be permanently removed.`
      : 'This approval rule will be permanently removed.',
    confirmText: 'Delete Rule',
    cancelText: 'Cancel',
    variant: 'destructive',
    severity: 'critical',
  }),

  discardApprovalRuleChanges: () => ({
    title: 'Discard Changes?',
    description: 'Your unsaved approval-rule changes will be lost.',
    confirmText: 'Discard Changes',
    cancelText: 'Cancel',
    variant: 'warning',
    severity: 'medium',
  }),

  removeMember: (userLabel, scopeLabel) => ({
    title: 'Remove Member?',
    description: userLabel
      ? scopeLabel
        ? `${userLabel} will lose access to ${scopeLabel}.`
        : `${userLabel} will lose access to the selected organization or location.`
      : 'This user will lose access to the selected organization or location.',
    confirmText: 'Remove Member',
    cancelText: 'Cancel',
    variant: 'destructive',
    severity: 'critical',
  }),

  changeRole: (userLabel, roleLabel) => ({
    title: 'Change Role?',
    description: userLabel
      ? roleLabel
        ? `${userLabel}’s permissions and access will be updated to ${roleLabel}.`
        : `${userLabel}’s permissions and access will be updated.`
      : 'This user’s permissions and access will be updated.',
    confirmText: 'Change Role',
    cancelText: 'Cancel',
    variant: 'warning',
    severity: 'high',
  }),

  discardMemberChanges: () => ({
    title: 'Discard Changes?',
    description: 'Your unsaved member changes will be lost.',
    confirmText: 'Discard Changes',
    cancelText: 'Cancel',
    variant: 'warning',
    severity: 'medium',
  }),

  // ========================================
  // TENANT ONBOARDING
  // ========================================

  submitOnboardingBusinessVerification: (legalName, identifierType, maskedTaxId, taxVerificationEnabled) => ({
    title: 'Submit business verification?',
    description: taxVerificationEnabled
      ? `Submit "${legalName}" for verification using ${identifierType.toUpperCase()} ending in ${maskedTaxId}. Your full ${identifierType.toUpperCase()} is encrypted and never shown to platform staff.`
      : `Submit "${legalName}" for verification. Tax ID verification is currently disabled by your platform admin.`,
    confirmText: 'Submit for Verification',
    cancelText: 'Review Again',
    variant: 'warning',
    severity: 'high',
  }),

  applyOnboardingCoupon: (code) => ({
    title: `Apply coupon "${code}"?`,
    description: 'This coupon or trial code will be applied to your subscription.',
    confirmText: 'Apply Coupon',
    cancelText: 'Cancel',
    variant: 'info',
    severity: 'low',
  }),

  completeOnboardingPayment: (planName, priceLabel, paymentMethodLabel, hierarchySummary) => ({
    title: 'Complete setup and submit payment?',
    description: `You're subscribing to ${planName} (${priceLabel}) via ${paymentMethodLabel}, and submitting ${hierarchySummary} for platform review. This charges your payment method now and cannot be undone from here.`,
    confirmText: 'Confirm & Pay',
    cancelText: 'Go Back',
    variant: 'warning',
    severity: 'critical',
  }),

  saveOnboardingBankAccount: (bankName, last4, assignmentLabel) => ({
    title: 'Save bank account?',
    description: `Add ${bankName} ending in ${last4}${assignmentLabel ? ` for ${assignmentLabel}` : ''}. You'll still need to add an authorization signature before it can be used for payments.`,
    confirmText: 'Save Bank Account',
    cancelText: 'Cancel',
    variant: 'warning',
    severity: 'high',
  }),

  captureOnboardingBankSignature: (last4, signerName) => ({
    title: 'Capture authorization signature?',
    description: `${signerName} will electronically sign the payment authorization for the account ending in ${last4}. This creates a legally binding, audit-logged consent record.`,
    confirmText: 'Sign & Authorize',
    cancelText: 'Cancel',
    variant: 'warning',
    severity: 'critical',
  }),
};

/**
 * Helper to get a confirmation message template
 * @param {string} key - Message key
 * @param {...any} args - Arguments to pass to message function
 * @returns {Object} Configuration object for useConfirmation
 */
export const getConfirmationMessage = (key, ...args) => {
  if (!confirmationMessages[key]) {
    throw new Error(`Unknown confirmation message key: ${key}`);
  }

  const messageFn = confirmationMessages[key];
  return messageFn(...args);
};
