// @ts-nocheck
import { Inngest } from "npm:inngest";

// Define the shape of your events for type safety
type Events = {
  "invoice.processed": {
    data: {
      invoiceId: string;
      vendorName: string;
      amount: number;
    };
  };
  "demo.requested": {
    data: {
      email: string;
      fullName: string;
      companyName?: string;
      requestId: string;
    };
  };
};

// Create a new Inngest client
export const inngest = new Inngest<Events>({
  id: "mevs-platform",
  eventKey: Deno.env.get("INNGEST_EVENT_KEY") || "local",
});
