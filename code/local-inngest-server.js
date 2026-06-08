import express from 'express';
import { serve } from 'inngest/express';
import { Inngest } from 'inngest';

const inngest = new Inngest({ id: "mevs-platform" });

// ============================================
// 1. BILLING & SUBSCRIPTIONS
// ============================================
const subscriptionCreated = inngest.createFunction(
  { id: "billing-subscription-created", triggers: [{ event: "billing.subscription.created" }] },
  async ({ event, step }) => {
    await step.run("provision-features", async () => {
      console.log(`Provisioning premium features for Org ${event.data.orgId}`);
      return { provisioned: true };
    });
    await step.run("send-welcome-email", async () => {
      console.log(`Sending premium welcome email to Customer ${event.data.customerId}`);
      return { emailSent: true };
    });
    return { message: "Subscription setup complete" };
  }
);

const subscriptionUpdated = inngest.createFunction(
  { id: "billing-subscription-updated", triggers: [{ event: "billing.subscription.updated" }] },
  async ({ event, step }) => {
    await step.run("adjust-quotas", async () => {
      console.log(`Adjusting platform quotas for Customer ${event.data.customerId} to status ${event.data.status}`);
      return { quotasUpdated: true };
    });
    return { message: "Subscription quotas adjusted" };
  }
);

const subscriptionCanceled = inngest.createFunction(
  { id: "billing-subscription-canceled", triggers: [{ event: "billing.subscription.canceled" }] },
  async ({ event, step }) => {
    await step.run("disable-premium-features", async () => {
      console.log(`Disabling premium features for Customer ${event.data.customerId}`);
      return { featuresDisabled: true };
    });
    await step.run("schedule-data-archive", async () => {
      console.log(`Scheduling data archive job for Customer ${event.data.customerId}`);
      return { archived: true };
    });
    return { message: "Subscription canceled and cleanup scheduled" };
  }
);

const paymentFailed = inngest.createFunction(
  { id: "billing-payment-failed", triggers: [{ event: "billing.payment.failed" }] },
  async ({ event, step }) => {
    await step.run("send-dunning-email-1", async () => {
      console.log(`Sending Dunning Email 1 for Invoice ${event.data.invoiceId}`);
      return { emailSent: true };
    });
    await step.sleep("wait-for-retry", "3d");
    await step.run("suspend-account-warning", async () => {
      console.log(`Sending suspension warning for Customer ${event.data.customerId}`);
      return { warned: true };
    });
    return { message: "Dunning sequence executed" };
  }
);

// ============================================
// 2. PLATFORM ADMIN & ONBOARDING
// ============================================
const demoRequestedWorkflow = inngest.createFunction(
  { id: "demo-requested-workflow", triggers: [{ event: "demo.requested" }] },
  async ({ event, step }) => {
    await step.run("log-request", () => {
      console.log(`New demo request from ${event.data.fullName}`);
      return { success: true };
    });
    await step.sleep("wait-before-welcome", "5s");
    await step.run("send-confirmation-email", async () => {
      console.log(`Sending confirmation email to ${event.data.email}`);
      return { emailSent: true };
    });
    const company = event.data.companyName?.toLowerCase() || "";
    const isEnterprise = company.includes("inc") || company.includes("corp");
    if (isEnterprise) {
      await step.run("notify-sales-team", async () => {
        console.log(`URGENT: Enterprise demo requested by ${event.data.companyName}`);
        return { notified: true };
      });
    }
    return { message: "Workflow completed" };
  }
);

const demoApprovedWorkflow = inngest.createFunction(
  { id: "demo-approved-workflow", triggers: [{ event: "demo.approved" }] },
  async ({ event, step }) => {
    const token = await step.run("generate-secure-token", async () => {
      console.log(`Generating secure onboarding token for Request ${event.data.requestId}`);
      return `tok_${Math.random().toString(36).substring(7)}`;
    });
    await step.run("send-onboarding-link", async () => {
      console.log(`Sending onboarding link with token ${token} to ${event.data.email}`);
      return { emailSent: true };
    });
    return { message: "Demo approved", token };
  }
);

const demoRejectedWorkflow = inngest.createFunction(
  { id: "demo-rejected-workflow", triggers: [{ event: "demo.rejected" }] },
  async ({ event, step }) => {
    await step.run("send-rejection-email", async () => {
      console.log(`Sending decline email to ${event.data.email}`);
      return { emailSent: true };
    });
    return { message: "Demo rejected" };
  }
);

const orgDeletedWorkflow = inngest.createFunction(
  { id: "org-deleted-workflow", triggers: [{ event: "org.deleted" }] },
  async ({ event, step }) => {
    await step.run("archive-org-data", async () => {
      console.log(`Archiving data for Org ${event.data.orgId}`);
      return { archived: true };
    });
    await step.run("revoke-active-sessions", async () => {
      console.log(`Revoking user sessions for Org ${event.data.orgId}`);
      return { sessionsRevoked: true };
    });
    return { message: "Organization cleanup complete" };
  }
);

// ============================================
// 3. FILE PROCESSING & INVOICES
// ============================================
const invoiceUploadedWorkflow = inngest.createFunction(
  { id: "invoice-uploaded-workflow", triggers: [{ event: "invoice.uploaded" }] },
  async ({ event, step }) => {
    await step.run("trigger-ocr-parsing", async () => {
      console.log(`Triggering OCR extraction for Invoice ${event.data.invoiceId}`);
      return { ocrStarted: true };
    });
    await step.sleep("simulate-ocr-delay", "15s");
    await step.run("auto-fill-line-items", async () => {
      console.log(`Auto-filling line items into database`);
      return { itemsExtracted: true };
    });
    return { message: "Invoice parsed" };
  }
);

const invoiceProcessedWorkflow = inngest.createFunction(
  { id: "invoice-processed-workflow", triggers: [{ event: "invoice.processed" }] },
  async ({ event, step }) => {
    await step.run("log-invoice-processing", () => {
      console.log(`Starting post-processing for Invoice ${event.data.invoiceId}`);
      return { success: true };
    });
    await step.sleep("wait-for-accounting-sync", "10s");
    await step.run("sync-to-accounting", async () => {
      console.log(`Syncing $${event.data.amount} to General Ledger...`);
      return { synced: true };
    });
    if (event.data.amount > 1000) {
      await step.run("send-large-invoice-alert", async () => {
        console.log(`Sending alert for large invoice`);
        return { alerted: true };
      });
    }
    return { message: "Invoice successfully processed" };
  }
);

const invoiceRejectedWorkflow = inngest.createFunction(
  { id: "invoice-rejected-workflow", triggers: [{ event: "invoice.rejected" }] },
  async ({ event, step }) => {
    await step.run("notify-uploader", async () => {
      console.log(`Notifying uploader about rejection of Invoice ${event.data.invoiceId}`);
      return { notified: true };
    });
    return { message: "Invoice rejection handled" };
  }
);

// ============================================
// 4. TEAM & INTEGRATIONS
// ============================================
const teamMemberInvitedWorkflow = inngest.createFunction(
  { id: "team-member-invited-workflow", triggers: [{ event: "team.member.invited" }] },
  async ({ event, step }) => {
    await step.run("send-invitation-email", async () => {
      console.log(`Sending invitation email to ${event.data.email}`);
      return { emailSent: true };
    });
    await step.run("track-pending-invite", async () => {
      console.log(`Logging pending invitation status`);
      return { tracked: true };
    });
    return { message: "Team member invitation processed" };
  }
);

const integrationEnabledWorkflow = inngest.createFunction(
  { id: "integration-enabled-workflow", triggers: [{ event: "integration.enabled" }] },
  async ({ event, step }) => {
    await step.run("validate-credentials", async () => {
      console.log(`Validating credentials for Integration ${event.data.integrationId}`);
      return { valid: true };
    });
    await step.run("perform-initial-data-sync", async () => {
      console.log(`Syncing initial historical data for Integration ${event.data.integrationId}`);
      return { synced: true };
    });
    return { message: "Integration successfully enabled and synced" };
  }
);

// ============================================
// MOUNT TO EXPRESS
// ============================================
const app = express();
app.use(express.json());

app.use(
  "/functions/v1/inngest",
  serve({
    client: inngest,
    functions: [
      subscriptionCreated, subscriptionUpdated, subscriptionCanceled, paymentFailed,
      demoRequestedWorkflow, demoApprovedWorkflow, demoRejectedWorkflow, orgDeletedWorkflow,
      invoiceUploadedWorkflow, invoiceProcessedWorkflow, invoiceRejectedWorkflow,
      teamMemberInvitedWorkflow, integrationEnabledWorkflow
    ],
  })
);

app.listen(54321, () => {
  console.log("Local Inngest Server running on http://localhost:54321/functions/v1/inngest");
});
