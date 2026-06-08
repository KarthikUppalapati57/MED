import { inngest } from "../../_shared/inngest.ts";

export const invoiceProcessedWorkflow = inngest.createFunction(
  { id: "invoice-processed-workflow", name: "Invoice Processed Workflow" },
  { event: "invoice.processed" },
  async ({ event, step }) => {
    // 1. Initial log
    await step.run("log-invoice-processing", () => {
      console.log(`Starting post-processing for Invoice ${event.data.invoiceId} (${event.data.vendorName})`);
      return { success: true };
    });

    // 2. Wait until the next day to sync with accounting software (simulated)
    // For demo purposes, we will just wait 10 seconds.
    await step.sleep("wait-for-accounting-sync", "10s");

    // 3. Sync to external accounting system
    const syncResult = await step.run("sync-to-accounting", async () => {
      console.log(`Syncing $${event.data.amount} to General Ledger...`);
      // Simulate API call to QuickBooks / Xero
      return { synced: true, ledgerId: `GL-${Math.floor(Math.random() * 10000)}` };
    });

    // 4. Send summary report if it's a large invoice
    if (event.data.amount > 1000) {
      await step.run("send-large-invoice-alert", async () => {
        console.log(`Sending alert: Large invoice of $${event.data.amount} processed for ${event.data.vendorName}`);
        return { alerted: true };
      });
    }

    return {
      message: "Invoice successfully processed and synced",
      syncResult,
    };
  }
);
