import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

// Helper for Base64URL encoding strings
function base64UrlEncode(str: string): string {
  const bytes = new TextEncoder().encode(str);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// Helper for Base64URL encoding ArrayBuffers
function arrayBufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64UrlDecode(value: string): string {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(base64.length + (4 - base64.length % 4) % 4, '=');
  return atob(padded);
}

function getJwtSecret(): string | null {
  const explicitSecret = Deno.env.get('SUPABASE_JWT_SECRET')
    || Deno.env.get('SUPABASE_INTERNAL_JWT_SECRET');
  if (explicitSecret) return explicitSecret;

  const jwks = Deno.env.get('SUPABASE_JWKS');
  if (!jwks) return null;

  try {
    const parsed = JSON.parse(jwks);
    const octKey = parsed?.keys?.find((key: { kty?: string; k?: string }) => key?.kty === 'oct' && key?.k);
    return octKey?.k ? base64UrlDecode(octKey.k) : null;
  } catch {
    return null;
  }
}

// Generate a valid platform_admin JWT using the deployed or local Supabase JWT secret.
async function generateSystemJWT(): Promise<string> {
  const jwtSecret = getJwtSecret();
  if (!jwtSecret) {
    throw new Error("SUPABASE_JWT_SECRET, SUPABASE_INTERNAL_JWT_SECRET, or SUPABASE_JWKS environment variable is missing");
  }

  const header = { alg: "HS256", typ: "JWT" };
  const nowInSeconds = Math.floor(Date.now() / 1000);
  const payload = {
    aud: "authenticated",
    exp: nowInSeconds + 3600, // Valid for 1 hour
    sub: "99999999-9999-9999-9999-999999999999", // system.worker@restops.test UUID
    email: "system.worker@restops.test",
    app_metadata: {
      provider: "email",
      providers: ["email"],
      role: "platform_admin"
    },
    user_metadata: {
      role: "platform_admin",
      full_name: "System Worker"
    },
    role: "authenticated"
  };

  const headerStr = base64UrlEncode(JSON.stringify(header));
  const payloadStr = base64UrlEncode(JSON.stringify(payload));
  const dataToSign = `${headerStr}.${payloadStr}`;

  const encoder = new TextEncoder();
  const keyData = encoder.encode(jwtSecret);
  const dataData = encoder.encode(dataToSign);

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signatureBuffer = await crypto.subtle.sign('HMAC', cryptoKey, dataData);
  const signatureStr = arrayBufferToBase64Url(signatureBuffer);

  return `${dataToSign}.${signatureStr}`;
}

// Client for user-scoped requests (respects RLS based on caller's JWT)
export const getSupabaseClient = (authHeader: string | null) => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: { Authorization: authHeader || '' }
    }
  });
};

// Client for background/system-scoped requests (respects RLS, authenticates as System Worker platform_admin)
export const getSupabaseSystemClient = async () => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const systemJWT = await generateSystemJWT();

  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: { Authorization: `Bearer ${systemJWT}` }
    }
  });
};

// Client strictly for administrative Auth actions (inviting users, resetting MFA)
// This uses the service_role key as required by GoTrue admin APIs.
export const getSupabaseAuthAdminClient = () => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
};
// Client for trusted server-side data operations that must bypass RLS.
export const getSupabaseServiceRoleClient = () => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
};
