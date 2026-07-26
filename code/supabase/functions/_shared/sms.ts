// Shared Azure Communication Services SMS helper for Edge Functions. There's no ACS SDK for
// Deno, so this signs requests by hand using ACS's HMAC-SHA256 REST auth scheme (the same
// request-signing family Azure's REST APIs have used since the original Storage service) --
// mirrors the crypto.subtle usage already in _shared/supabase.ts and webhook-dispatcher's
// generateHmacSha256, just applied to ACS's specific string-to-sign shape.
//
// Needs a smoke test against a real ACS resource once AZURE_COMMUNICATION_CONNECTION_STRING is
// actually configured -- nothing in this repo talks to ACS yet to verify the signing against.

const API_VERSION = "2021-03-07";

function parseConnectionString(connectionString: string) {
  const parts: Record<string, string> = {};
  for (const segment of connectionString.split(";")) {
    if (!segment.trim()) continue;
    const idx = segment.indexOf("=");
    if (idx === -1) continue;
    parts[segment.slice(0, idx).trim().toLowerCase()] = segment.slice(idx + 1).trim();
  }
  if (!parts.endpoint || !parts.accesskey) {
    throw new Error('AZURE_COMMUNICATION_CONNECTION_STRING is malformed (expected "endpoint=...;accesskey=...")');
  }
  return { endpoint: parts.endpoint.replace(/\/+$/, ""), accessKey: parts.accesskey };
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(base64: string) {
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

async function sha256Base64(text: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return bytesToBase64(new Uint8Array(digest));
}

async function hmacSha256Base64(keyBytes: Uint8Array, text: string) {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(text));
  return bytesToBase64(new Uint8Array(signature));
}

/**
 * Sends an SMS via Azure Communication Services.
 * @param {Object} params
 * @param {string|string[]} params.to - Recipient phone number(s), E.164 format
 * @param {string} params.message - Message body
 */
export async function sendSms({ to, message }: { to: string | string[]; message: string }) {
  const connectionString = Deno.env.get("AZURE_COMMUNICATION_CONNECTION_STRING");
  const fromNumber = Deno.env.get("AZURE_COMMUNICATION_SMS_FROM_NUMBER");

  if (!connectionString || !fromNumber) {
    throw new Error("AZURE_COMMUNICATION_CONNECTION_STRING / AZURE_COMMUNICATION_SMS_FROM_NUMBER are not configured for SMS delivery");
  }

  const { endpoint, accessKey } = parseConnectionString(connectionString);
  const host = new URL(endpoint).host;
  const pathAndQuery = `/sms?api-version=${API_VERSION}`;
  const url = `${endpoint}${pathAndQuery}`;

  const body = JSON.stringify({
    from: fromNumber,
    to: Array.isArray(to) ? to : [to],
    message,
    smsSendOptions: { enableDeliveryReport: false },
  });

  const date = new Date().toUTCString();
  const contentHash = await sha256Base64(body);
  const stringToSign = `POST\n${pathAndQuery}\n${date};${host};${contentHash}`;
  const signature = await hmacSha256Base64(base64ToBytes(accessKey), stringToSign);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-ms-date": date,
      "x-ms-content-sha256": contentHash,
      "Authorization": `HMAC-SHA256 SignedHeaders=x-ms-date;host;x-ms-content-sha256&Signature=${signature}`,
    },
    body,
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`SMS delivery failed: ${errorBody}`);
  }

  return { sent: true };
}
