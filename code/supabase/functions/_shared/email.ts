// Shared Resend email helper. Factored out of vendor-onboarding/index.ts (the only caller
// before this), which had its own private copy of this exact function.
export async function sendTransactionalEmail({ to, subject, text }: { to: string; subject: string; text: string }) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("VENDOR_ONBOARDING_FROM_EMAIL") || Deno.env.get("VENDOR_ONBOARDING_EMAIL_FROM") || Deno.env.get("RESEND_FROM_EMAIL") || "Restops <onboarding@restops.app>";

  if (!apiKey) {
    console.log(`[EMAIL SKIPPED] ${subject} -> ${to}\n${text}`);
    return { sent: false, skipped: true };
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
