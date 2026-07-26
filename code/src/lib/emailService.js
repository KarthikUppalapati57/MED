/**
 * Production-safe email facade.
 *
 * Client-side EmailJS is not an approved production technology. Transactional mail goes
 * through the `send-transactional-email` Supabase Edge Function, which is backed by Resend.
 */
import { supabase } from '@/lib/supabaseClient';

/**
 * Sends an email via the send-transactional-email Edge Function (Resend-backed).
 * @param {Object} params
 * @param {string} params.to_email   - Recipient email
 * @param {string} params.to_name    - Recipient name
 * @param {string} params.subject    - Email subject line
 * @param {string} params.message    - Email body (plain text or HTML)
 * @param {string} [params.from_name] - Sender name (defaults to "Restops Platform")
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function sendEmail({ to_email, to_name, subject, message, from_name = 'Restops Platform' }) {
  try {
    const { data, error } = await supabase.functions.invoke('send-transactional-email', {
      body: { to_email, to_name, subject, message, from_name },
    });
    if (error) {
      console.warn('[EmailService] send-transactional-email invoke failed:', error.message);
      return { success: false, error: error.message };
    }
    if (!data?.success) {
      console.warn('[EmailService] send-transactional-email reported failure:', data?.error);
      return { success: false, error: data?.error || 'Email delivery failed' };
    }
    return { success: true };
  } catch (err) {
    console.warn('[EmailService] Exception invoking send-transactional-email:', err);
    return { success: false, error: err.message };
  }
}

// Pre-built email templates 

/**
 * Send an invitation email to a new team member.
 */
export async function sendInvitationEmail({ to_email, to_name, role, org_name, invite_link, coupon_code = null, coupon_trial_months = null }) {
  return sendEmail({
    to_email,
    to_name,
    subject: `You've been invited to join ${org_name || 'Restops'} as ${role || 'team member'}`,
    message: `
Hi ${to_name || 'there'},

You've been invited to join ${org_name || 'the organization'} on the Restops platform as a ${role || 'team member'}.

${invite_link ? `Click the link below to accept your invitation and set up your account:
<${invite_link}>` : 'Please log in to accept your invitation.'}

${coupon_code ? `Your onboarding coupon is included with this invite:
Code: ${coupon_code}
Trial: ${coupon_trial_months || 1} month${Number(coupon_trial_months || 1) === 1 ? '' : 's'}
Use this code on the Plan & Payment step. It is locked to this email address.` : ''}

This invitation will expire in 7 days.

— Restops Platform
    `.trim(),
  });
}

/**
 * Send an email confirming a demo booking request has been received.
 */
export async function sendDemoConfirmationEmail({ to_email, to_name }) {
  return sendEmail({
    to_email,
    to_name,
    subject: `Your Restops System Demo Request is Received!`,
    message: `
Hi ${to_name || 'Valued Guest'},

Thank you for your interest in the Restops (Multi-tenant Enterprise Valuation & Stock-control) platform!

We have successfully received your request for a live system walkthrough demo. Our administrative team is currently preparing a secure, personalized demo environment space for your company.

An administrator will contact you shortly and send your personalized demo login link to this email address.

If you have any questions or additional business requirements in the meantime, feel free to reply directly to this email.

Best regards,
The Restops Onboarding Team
    `.trim(),
  });
}

/**
 * Send the secure demo environment access link.
 */
export async function sendDemoAccessEmail({ to_email, to_name, invite_link }) {
  return sendEmail({
    to_email,
    to_name,
    subject: `Your Restops Live Demo Environment is Ready!`,
    message: `
Hi ${to_name || 'Valued Guest'},

We are thrilled to let you know that your private demo environment space is fully prepared!

You can now explore our modern invoice scanning, automated inventory tracking, and real-time analytical reporting tools.

Please click the secure link below to access your demo workspace and create your administrator credentials:

👉 ${invite_link}

Note: For security reasons, this personalized demo link is only active for 7 days.

We look forward to hearing your feedback!

Warmly,
The Restops Administrative Team
    `.trim(),
  });
}

/**
 * Notify managers that a ground staff member uploaded a new invoice.
 */
export async function sendInvoiceUploadNotification({ to_email, to_name, uploader_name, invoice_number, vendor_name, total_amount }) {
  return sendEmail({
    to_email,
    to_name,
    subject: `New Invoice Uploaded – ${invoice_number || 'Pending Review'}`,
    message: `
Hi ${to_name || 'Manager'},

${uploader_name || 'A team member'} has uploaded a new invoice that requires your review.

Invoice Details:
• Invoice #: ${invoice_number || 'N/A'}
• Vendor: ${vendor_name || 'N/A'}
• Total Amount: $${total_amount ? Number(total_amount).toFixed(2) : '0.00'}

Please log in to the Restops platform to review and approve this invoice.

— Restops Platform
    `.trim(),
  });
}

/**
 * Notify staff that their invoice has been approved or rejected.
 */
export async function sendInvoiceStatusEmail({ to_email, to_name, invoice_number, status, reviewer_name }) {
  const action = status === 'approved' ? 'Approved' : 'Rejected';
  return sendEmail({
    to_email,
    to_name,
    subject: `Invoice ${invoice_number || ''} ${action}`,
    message: `
Hi ${to_name || 'there'},

Your invoice ${invoice_number || ''} has been ${action.toLowerCase()} by ${reviewer_name || 'a manager'}.

${status === 'approved'
  ? 'The items from this invoice have been staged for review and will be added to inventory within 24 hours.'
  : 'Please review the invoice and make any necessary corrections before resubmitting.'}

— Restops Platform
    `.trim(),
  });
}

/**
 * Notify a tenant of a business verification review decision (approve/reject/more_info).
 */
export async function sendBusinessVerificationDecisionEmail({ to_email, to_name, decision, reason }) {
  const subject = decision === 'approved'
    ? 'Your Restops business verification was approved'
    : decision === 'more_info'
    ? 'Restops needs more information to verify your business'
    : decision === 'rejected'
    ? 'Your Restops business verification was rejected'
    : 'Your Restops business verification needs changes';

  const body = decision === 'approved'
    ? `Your business verification has been approved. Log in to continue setting up your organization.`
    : decision === 'more_info'
    ? `A platform admin needs more information before your business can be verified:\n\n"${reason || 'Please review your submission.'}"\n\nLog in and update your business verification to resubmit.`
    : decision === 'rejected'
    ? `Your business verification was not approved:\n\n"${reason || 'Please review the details you submitted.'}"\n\nThis decision is final and this application cannot be resubmitted.`
    : `Your business verification could not be approved:\n\n"${reason || 'Please review your submission.'}"\n\nLog in and update your business verification to resubmit.`;

  return sendEmail({
    to_email,
    to_name,
    subject,
    message: `
Hi ${to_name || 'there'},

${body}

— Restops Platform
    `.trim(),
  });
}

/**
 * Notify platform admin of a new access/demo request.
 */
export async function sendRequestNotification({ to_email, to_name, requester_name, requester_email, request_type }) {
  return sendEmail({
    to_email,
    to_name,
    subject: `New ${request_type || 'Access'} Request from ${requester_name || requester_email}`,
    message: `
Hi ${to_name || 'Admin'},

A new ${request_type || 'access'} request has been submitted:

• Name: ${requester_name || 'N/A'}
• Email: ${requester_email || 'N/A'}
• Type: ${request_type || 'General'}

Please log in to the Restops admin panel to review this request.

— Restops Platform
    `.trim(),
  });
}
