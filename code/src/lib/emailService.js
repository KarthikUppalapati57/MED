/**
 * EmailJS Service – Reusable email utility for the MEVS platform.
 *
 * Sends transactional emails via EmailJS (client-side, no backend needed).
 * Used for: invitations, invoice notifications, approval alerts, and requests.
 *
 * Env vars required (already configured in .env):
 *   VITE_EMAILJS_SERVICE_ID
 *   VITE_EMAILJS_TEMPLATE_ID
 *   VITE_EMAILJS_PUBLIC_KEY
 */
import emailjs from 'emailjs-com';

const SERVICE_ID = import.meta.env.VITE_EMAILJS_SERVICE_ID;
const TEMPLATE_ID = import.meta.env.VITE_EMAILJS_TEMPLATE_ID;
const PUBLIC_KEY = import.meta.env.VITE_EMAILJS_PUBLIC_KEY;

/**
 * Sends an email via EmailJS.
 * @param {Object} params
 * @param {string} params.to_email   - Recipient email
 * @param {string} params.to_name    - Recipient name
 * @param {string} params.subject    - Email subject line
 * @param {string} params.message    - Email body (plain text or HTML)
 * @param {string} [params.from_name] - Sender name (defaults to "MEVS Platform")
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function sendEmail({ to_email, to_name, subject, message, from_name = 'MEVS Platform' }) {
  if (!SERVICE_ID || !TEMPLATE_ID || !PUBLIC_KEY) {
    console.warn('[EmailService] EmailJS is not configured. Skipping email.');
    return { success: false, error: 'EmailJS not configured' };
  }

  try {
    const result = await emailjs.send(
      SERVICE_ID,
      TEMPLATE_ID,
      {
        to_email,
        to_name: to_name || to_email,
        from_name,
        subject,
        message,
      },
      PUBLIC_KEY
    );
    console.log('[EmailService] Email sent:', result.status, result.text);
    return { success: true };
  } catch (err) {
    console.error('[EmailService] Failed to send email:', err);
    return { success: false, error: err?.text || err?.message || 'Unknown error' };
  }
}

// ── Pre-built email templates ────────────────────────────────────────────────

/**
 * Send an invitation email to a new team member.
 */
export async function sendInvitationEmail({ to_email, to_name, role, org_name, invite_link }) {
  return sendEmail({
    to_email,
    to_name,
    subject: `You've been invited to join ${org_name || 'MEVS'} as ${role || 'team member'}`,
    message: `
Hi ${to_name || 'there'},

You've been invited to join ${org_name || 'the organization'} on the MEVS platform as a ${role || 'team member'}.

${invite_link ? `Click the link below to accept your invitation and set up your account:\n<${invite_link}>` : 'Please log in to accept your invitation.'}

This invitation will expire in 7 days.

— MEVS Platform
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
    subject: `Your MEVS System Demo Request is Received!`,
    message: `
Hi ${to_name || 'Valued Guest'},

Thank you for your interest in the MEVS (Multi-tenant Enterprise Valuation & Stock-control) platform!

We have successfully received your request for a live system walkthrough demo. Our administrative team is currently preparing a secure, personalized demo environment space for your company.

An administrator will contact you shortly and send your personalized demo login link to this email address.

If you have any questions or additional business requirements in the meantime, feel free to reply directly to this email.

Best regards,
The MEVS Onboarding Team
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
    subject: `Your MEVS Live Demo Environment is Ready!`,
    message: `
Hi ${to_name || 'Valued Guest'},

We are thrilled to let you know that your private demo environment space is fully prepared!

You can now explore our modern invoice scanning, automated inventory tracking, and real-time analytical reporting tools.

Please click the secure link below to access your demo workspace and create your administrator credentials:

👉 ${invite_link}

Note: For security reasons, this personalized demo link is only active for 7 days.

We look forward to hearing your feedback!

Warmly,
The MEVS Administrative Team
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

Please log in to the MEVS platform to review and approve this invoice.

— MEVS Platform
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

— MEVS Platform
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

Please log in to the MEVS admin panel to review this request.

— MEVS Platform
    `.trim(),
  });
}
