import express from 'express';
import { serve } from 'inngest/express';
import { Inngest } from 'inngest';

// 1. Create a new Inngest client
const inngest = new Inngest({ id: "mevs-platform" });

// 2. Define the workflows
const demoRequestedWorkflow = inngest.createFunction(
  { id: "demo-requested-workflow", triggers: [{ event: "demo.requested" }] },
  async ({ event, step }) => {
    await step.run("log-request", () => {
      console.log(`New demo request from ${event.data.fullName} (${event.data.email})`);
      return { success: true };
    });

    await step.sleep("wait-before-welcome", "5s");

    await step.run("send-confirmation-email", async () => {
      console.log(`Sending confirmation email to ${event.data.email}`);
      return { emailSent: true };
    });

    const isEnterprise = await step.run("check-enterprise-status", () => {
      const company = event.data.companyName?.toLowerCase() || "";
      return company.includes("inc") || company.includes("corp") || company.includes("llc");
    });

    if (isEnterprise) {
      await step.run("notify-sales-team", async () => {
        console.log(`URGENT: Enterprise demo requested by ${event.data.companyName}`);
        return { notified: true };
      });
    }

    return { message: "Workflow completed", isEnterprise };
  }
);

const invoiceProcessedWorkflow = inngest.createFunction(
  { id: "invoice-processed-workflow", triggers: [{ event: "invoice.processed" }] },
  async ({ event, step }) => {
    await step.run("log-invoice-processing", () => {
      console.log(`Starting post-processing for Invoice ${event.data.invoiceId} (${event.data.vendorName})`);
      return { success: true };
    });

    await step.sleep("wait-for-accounting-sync", "10s");

    const syncResult = await step.run("sync-to-accounting", async () => {
      console.log(`Syncing $${event.data.amount} to General Ledger...`);
      return { synced: true, ledgerId: `GL-${Math.floor(Math.random() * 10000)}` };
    });

    if (event.data.amount > 1000) {
      await step.run("send-large-invoice-alert", async () => {
        console.log(`Sending alert: Large invoice of $${event.data.amount} processed for ${event.data.vendorName}`);
        return { alerted: true };
      });
    }

    return { message: "Invoice successfully processed and synced", syncResult };
  }
);

// 3. Mount on Express
const app = express();
app.use(express.json());

// We mount it on the exact same endpoint the Inngest dev server is polling
app.use(
  "/functions/v1/inngest",
  serve({
    client: inngest,
    functions: [demoRequestedWorkflow, invoiceProcessedWorkflow],
  })
);

app.listen(54321, () => {
  console.log("Local Inngest Server running on http://localhost:54321/functions/v1/inngest");
});
