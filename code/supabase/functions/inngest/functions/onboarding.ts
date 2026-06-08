// @ts-nocheck
import { inngest } from "../../_shared/inngest.ts";

export const demoRequestedWorkflow = inngest.createFunction(
  { id: "demo-requested-workflow", name: "Demo Requested Workflow" },
  { event: "demo.requested" },
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

export const demoApprovedWorkflow = inngest.createFunction(
  { id: "demo-approved-workflow", name: "Demo Approved Workflow" },
  { event: "demo.approved" },
  async ({ event, step }) => {
    const token = await step.run("generate-secure-token", async () => {
      console.log(`Generating secure onboarding token for Request ${event.data.requestId}`);
      return `tok_${Math.random().toString(36).substring(7)}`;
    });

    await step.run("send-onboarding-link", async () => {
      console.log(`Sending onboarding link with token ${token} to ${event.data.email}`);
      return { emailSent: true };
    });

    return { message: "Demo approved and onboarding sent", token };
  }
);

export const demoRejectedWorkflow = inngest.createFunction(
  { id: "demo-rejected-workflow", name: "Demo Rejected Workflow" },
  { event: "demo.rejected" },
  async ({ event, step }) => {
    await step.run("send-rejection-email", async () => {
      console.log(`Sending decline email to ${event.data.email}`);
      return { emailSent: true };
    });
    return { message: "Demo rejected" };
  }
);

export const orgDeletedWorkflow = inngest.createFunction(
  { id: "org-deleted-workflow", name: "Organization Deleted Cleanup" },
  { event: "org.deleted" },
  async ({ event, step }) => {
    await step.run("archive-org-data", async () => {
      console.log(`Archiving data for Org ${event.data.orgId} (${event.data.orgName})`);
      return { archived: true };
    });

    await step.run("revoke-active-sessions", async () => {
      console.log(`Revoking user sessions for Org ${event.data.orgId}`);
      return { sessionsRevoked: true };
    });

    return { message: "Organization cleanup complete" };
  }
);
