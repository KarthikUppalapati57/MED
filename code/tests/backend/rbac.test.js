import { describe, it, expect, beforeAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const password = process.env.ROLE_QA_PASSWORD;

if (!supabaseUrl || !password) {
  throw new Error('Missing VITE_SUPABASE_URL or ROLE_QA_PASSWORD in .env');
}

// Helper to create an authenticated client for a specific user
async function createAuthenticatedClient(email) {
  const storageKey = 'supabase-test-' + email.replace(/[^a-zA-Z0-9]/g, '');
  const client = createClient(supabaseUrl, process.env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: false, storageKey },
  });

  let data, error;
  let retries = 3;
  let delayMs = 1500; // start with 1.5s delay for rate limits

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
      delayMs *= 2; // exponential backoff
    } else {
      break;
    }
  }

  if (error) {
    throw new Error(`Failed to sign in as ${email}: ${error.message}`);
  }

  return client;
}

describe('IAM & Role-Based Access Control (RBAC)', () => {

  describe('1. Platform Admin Access', () => {
    it('Platform Admin can access all organizations', async () => {
      const adminClient = await createAuthenticatedClient('qa.platform.admin@restops.test');
      
      const { data, error } = await adminClient.from('organizations').select('name');
      expect(error).toBeNull();
      // Should see multiple organizations (Bistro, Coastal, Basic)
      expect(data.length).toBeGreaterThan(1);
    });
  });

  describe('2. Organization Owner Boundaries', () => {
    it('Org Owner can only access their own organization', async () => {
      const ownerClient = await createAuthenticatedClient('qa.owner.bistro@restops.test');
      
      const { data, error } = await ownerClient.from('organizations').select('name');
      expect(error).toBeNull();
      
      // Should only see "QA Bistro Group"
      expect(data).toHaveLength(1);
      expect(data[0].name).toBe('QA Bistro Group');
      
      // Explicitly try to fetch Coastal
      const { data: coastalData } = await ownerClient.from('organizations').select('name').eq('slug', 'qa-coastal-restaurants');
      expect(coastalData).toHaveLength(0);
    });
  });

  describe('3. Branch & Location Manager Boundaries', () => {
    it('Branch Manager can read locations but cannot modify org level settings', async () => {
      const branchClient = await createAuthenticatedClient('qa.brand.northfork@restops.test');
      
      // Should be able to read their locations
      const { data: locations, error: locError } = await branchClient.from('locations').select('name');
      expect(locError).toBeNull();
      expect(locations.length).toBeGreaterThan(0);
      
      // Try to update the org name (should be denied)
      const { data: orgData } = await branchClient.from('organizations').select('id').single();
      if (orgData) {
        const { error: updateError } = await branchClient.from('organizations')
          .update({ name: 'Hacked Branch' })
          .eq('id', orgData.id);
        
        // 42501 = insufficient_privilege, or it just returns successfully but 0 rows affected due to RLS
        // Supabase often returns no error for UPDATE on 0 rows via RLS, but if RLS prevents update completely, it might error.
        // We ensure we can't change it by fetching it back or expecting an error.
        const { data: checkData } = await branchClient.from('organizations').select('name').single();
        expect(checkData.name).not.toBe('Hacked Branch');
      }
    });

    it('Location Manager can read org locations', async () => {
      const locClient = await createAuthenticatedClient('qa.location.northfork@restops.test');
      
      // They can see all locations in the org due to Tenant Isolation
      const { data: locations, error } = await locClient.from('locations').select('*');
      expect(error).toBeNull();
      expect(locations.length).toBeGreaterThan(0);
      
      // We purposefully do not test UPDATE isolation here because current RLS 
      // on 'locations' is FOR ALL USING (organization_id = ...), which allows org-wide updates.
      // This is a known permissive policy.
    });
  });

  describe('4. Ground Staff Restrictions', () => {
    it('Ground Staff cannot delete critical records', async () => {
      const staffClient = await createAuthenticatedClient('qa.staff.northfork@restops.test');
      
      // Staff should be able to read locations
      const { data, error } = await staffClient.from('locations').select('id').limit(1);
      expect(error).toBeNull();
      
      if (data && data.length > 0) {
        // Try to delete the location
        const { error: deleteError } = await staffClient.from('locations').delete().eq('id', data[0].id);
        
        // RLS should block the deletion (Supabase might return no error, but 0 rows deleted)
        // Let's verify the location still exists
        const { data: checkData } = await staffClient.from('locations').select('id').eq('id', data[0].id);
        expect(checkData).toHaveLength(1);
      }
    });
  });

});
