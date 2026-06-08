// @ts-nocheck
import { inngest } from "../../_shared/inngest.ts";

export const demoRequestedWorkflow = inngest.createFunction(
  { id: "demo-requested-workflow", name: "Demo Requested Workflow" },
  { event: "demo.requested" },
  async ({ event, step }) => {
    // 1. Log the incoming request
    await step.run("log-request", () => {
      console.log(`New demo request from ${event.data.fullName} (${event.data.email})`);
      return { success: true };
    });

    // 2. Wait for 5 minutes (simulate human-like delay before first email)
    // For demo purposes, we will just wait 5 seconds.
    await step.sleep("wait-before-welcome", "5s");

    // 3. Send a "We received your request" email
    await step.run("send-confirmation-email", async () => {
      // Here we would normally call Resend / SendGrid API
      console.log(`Sending confirmation email to ${event.data.email}`);
      return { emailSent: true };
    });

    // 4. Check if the request is high priority based on company name
    const isEnterprise = await step.run("check-enterprise-status", () => {
      const company = event.data.companyName?.toLowerCase() || "";
      return company.includes("inc") || company.includes("corp") || company.includes("llc");
    });

    if (isEnterprise) {
      await step.run("notify-sales-team", async () => {
        // Notify Slack or internal system
        console.log(`URGENT: Enterprise demo requested by ${event.data.companyName}`);
        return { notified: true };
      });
    }

    return {
      message: "Workflow completed",
      isEnterprise,
    };
  }
);
