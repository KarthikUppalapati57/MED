// @ts-nocheck
import { inngest } from "../../_shared/inngest.ts";

export const teamMemberInvitedWorkflow = inngest.createFunction(
  { id: "team-member-invited-workflow", name: "Team Member Invited" },
  { event: "team.member.invited" },
  async ({ event, step }) => {
    await step.run("send-invitation-email", async () => {
      console.log(`Sending invitation email to ${event.data.email} for role ${event.data.role} in Org ${event.data.orgId}`);
      return { emailSent: true };
    });

    await step.run("track-pending-invite", async () => {
      console.log(`Logging pending invitation status`);
      return { tracked: true };
    });

    return { message: "Team member invitation processed" };
  }
);

export const integrationEnabledWorkflow = inngest.createFunction(
  { id: "integration-enabled-workflow", name: "Integration Enabled Initial Sync" },
  { event: "integration.enabled" },
  async ({ event, step }) => {
    await step.run("validate-credentials", async () => {
      console.log(`Validating credentials for Integration ${event.data.integrationId} (Type: ${event.data.integrationType})`);
      return { valid: true };
    });

    await step.run("perform-initial-data-sync", async () => {
      console.log(`Syncing initial historical data for Integration ${event.data.integrationId}`);
      return { synced: true };
    });

    return { message: "Integration successfully enabled and synced" };
  }
);
