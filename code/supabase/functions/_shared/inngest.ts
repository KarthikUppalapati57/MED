// @ts-nocheck
import { Inngest } from "npm:inngest";

// Define the shape of your events for type safety
type Events = {
  // 1. Billing & Subscriptions
  "billing.subscription.created": {
    data: {
      orgId: string;
      customerId: string;
      subscriptionId: string;
      planId?: string;
    };
  };
  "billing.subscription.updated": {
    data: {
      customerId: string;
      subscriptionId: string;
      status: string;
      planId?: string;
    };
  };
  "billing.subscription.canceled": {
    data: {
      customerId: string;
      subscriptionId: string;
    };
  };
  "billing.payment.failed": {
    data: {
      customerId: string;
      invoiceId: string;
      amountDue: number;
    };
  };

  // 2. Platform Administration & Onboarding
  "demo.requested": {
    data: {
      email: string;
      fullName: string;
      companyName?: string;
      requestId: string;
    };
  };
  "demo.approved": {
    data: {
      requestId: string;
      email: string;
      fullName: string;
    };
  };
  "demo.rejected": {
    data: {
      requestId: string;
      email: string;
      fullName: string;
    };
  };
  "org.deleted": {
    data: {
      orgId: string;
      orgName?: string;
      deletedBy?: string;
    };
  };

  // 3. File Processing & Invoices
  "invoice.uploaded": {
    data: {
      invoiceId: string;
      fileUrl: string;
      orgId: string;
    };
  };
  "invoice.processed": {
    data: {
      invoiceId: string;
      vendorName: string;
      amount: number;
    };
  };
  "invoice.rejected": {
    data: {
      invoiceId: string;
      reason: string;
      uploaderEmail?: string;
    };
  };

  // 4. Team & Integration Management
  "team.member.invited": {
    data: {
      email: string;
      orgId: string;
      role: string;
      invitedBy: string;
    };
  };
  "integration.enabled": {
    data: {
      orgId: string;
      integrationId: string;
      integrationType: string;
    };
  };
};

// Create a new Inngest client
export const inngest = new Inngest<Events>({
  id: "mevs-platform",
  eventKey: Deno.env.get("INNGEST_EVENT_KEY") || "local",
});
