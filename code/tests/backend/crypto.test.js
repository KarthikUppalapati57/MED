import { describe, it, expect } from 'vitest';

// 1. API Key Hash implementation (from create-api-key edge function)
async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

// 2. Webhook HMAC Signature implementation (from webhook-dispatcher edge function)
async function generateHmacSha256(secret, payload) {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const data = encoder.encode(payload);

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signatureBuffer = await crypto.subtle.sign('HMAC', cryptoKey, data);
  const signatureArray = Array.from(new Uint8Array(signatureBuffer));
  return signatureArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

describe('Platform Cryptography & Hashing', () => {

  describe('API Key Hashing (SHA-256)', () => {
    it('should generate a deterministic 64-character hex string', async () => {
      const rawKey = 'sk_live_1234567890abcdef1234567890abcdef';
      
      const hash1 = await sha256(rawKey);
      const hash2 = await sha256(rawKey);

      // Verify determinism (must match exactly)
      expect(hash1).toBe(hash2);
      
      // Verify structure (SHA-256 is 32 bytes = 64 hex chars)
      expect(hash1).toHaveLength(64);
      expect(/^[0-9a-f]{64}$/.test(hash1)).toBe(true);
    });

    it('should be completely distinct from the input', async () => {
      const rawKey = 'sk_live_1234567890abcdef1234567890abcdef';
      const hash = await sha256(rawKey);

      expect(hash).not.toContain('sk_live');
      expect(hash).not.toBe(rawKey);
    });
  });

  describe('Webhook Signatures (HMAC-SHA256)', () => {
    it('should generate a deterministic signature for the same payload and secret', async () => {
      const secret = 'whsec_my_super_secret_webhook_key';
      const payload = JSON.stringify({ event: 'invoice.created', id: 123 });

      const signature1 = await generateHmacSha256(secret, payload);
      const signature2 = await generateHmacSha256(secret, payload);

      // Same payload and secret must produce identical HMAC
      expect(signature1).toBe(signature2);
      expect(signature1).toHaveLength(64);
    });

    it('should be highly tamper resistant', async () => {
      const secret = 'whsec_my_super_secret_webhook_key';
      const payloadOriginal = JSON.stringify({ amount: 100.00 });
      const payloadTampered = JSON.stringify({ amount: 1000.00 }); // Tampered amount!

      const signatureOriginal = await generateHmacSha256(secret, payloadOriginal);
      const signatureTampered = await generateHmacSha256(secret, payloadTampered);

      // Changing even one character must completely alter the hash
      expect(signatureOriginal).not.toBe(signatureTampered);
    });

    it('should reject same payload with different secret', async () => {
      const payload = JSON.stringify({ event: 'ping' });
      const secret1 = 'secret_A';
      const secret2 = 'secret_B';

      const sig1 = await generateHmacSha256(secret1, payload);
      const sig2 = await generateHmacSha256(secret2, payload);

      // Different organizations (secrets) must produce different hashes for the same payload
      expect(sig1).not.toBe(sig2);
    });
  });
});
