// @ts-nocheck
import { inngest } from "../../_shared/inngest.ts";

export const invoiceUploadedWorkflow = inngest.createFunction(
  { id: "invoice-uploaded-workflow", name: "Invoice Uploaded Processing" },
  { event: "invoice.uploaded" },
  async ({ event, step }) => {
    await step.run("trigger-ocr-parsing", async () => {
      console.log(`Triggering OCR extraction for Invoice ${event.data.invoiceId}`);
      return { ocrStarted: true };
    });

    await step.sleep("simulate-ocr-delay", "15s");

    await step.run("auto-fill-line-items", async () => {
      console.log(`Auto-filling line items into database for Invoice ${event.data.invoiceId}`);
      return { itemsExtracted: true };
    });

    return { message: "Invoice parsed and ready for review" };
  }
);

export const invoiceProcessedWorkflow = inngest.createFunction(
  { id: "invoice-processed-workflow", name: "Invoice Processed Workflow" },
  { event: "invoice.processed" },
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

export const invoiceRejectedWorkflow = inngest.createFunction(
  { id: "invoice-rejected-workflow", name: "Invoice Rejected Workflow" },
  { event: "invoice.rejected" },
  async ({ event, step }) => {
    await step.run("notify-uploader", async () => {
      console.log(`Notifying uploader about rejection of Invoice ${event.data.invoiceId}. Reason: ${event.data.reason}`);
      return { notified: true };
    });
    return { message: "Invoice rejection handled" };
  }
);
