// @ts-nocheck
import { inngest } from "../../_shared/inngest.ts";

export const subscriptionCreated = inngest.createFunction(
  { id: "billing-subscription-created", name: "Billing: Subscription Created" },
  { event: "billing.subscription.created" },
  async ({ event, step }) => {
    await step.run("provision-features", async () => {
      console.log(`Provisioning premium features for Org ${event.data.orgId} (Plan: ${event.data.planId})`);
      return { provisioned: true };
    });

    await step.run("send-welcome-email", async () => {
      console.log(`Sending premium welcome email to Customer ${event.data.customerId}`);
      return { emailSent: true };
    });

    return { message: "Subscription setup complete" };
  }
);

export const subscriptionUpdated = inngest.createFunction(
  { id: "billing-subscription-updated", name: "Billing: Subscription Updated" },
  { event: "billing.subscription.updated" },
  async ({ event, step }) => {
    await step.run("adjust-quotas", async () => {
      console.log(`Adjusting platform quotas for Customer ${event.data.customerId} to status ${event.data.status}`);
      return { quotasUpdated: true };
    });
    return { message: "Subscription quotas adjusted" };
  }
);

export const subscriptionCanceled = inngest.createFunction(
  { id: "billing-subscription-canceled", name: "Billing: Subscription Canceled" },
  { event: "billing.subscription.canceled" },
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

export const paymentFailed = inngest.createFunction(
  { id: "billing-payment-failed", name: "Billing: Payment Failed Dunning Sequence" },
  { event: "billing.payment.failed" },
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
