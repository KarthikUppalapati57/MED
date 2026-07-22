// Shared Resend email helper for Edge Functions.
export async function sendTransactionalEmail({ to, subject, text }: { to: string; subject: string; text: string }) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("VENDOR_ONBOARDING_FROM_EMAIL") || Deno.env.get("VENDOR_ONBOARDING_EMAIL_FROM") || Deno.env.get("RESEND_FROM_EMAIL") || "Restops <onboarding@restops.app>";

  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not configured for transactional email delivery");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to, subject, text }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Email delivery failed: ${body}`);
  }

  return { sent: true, skipped: false };
}