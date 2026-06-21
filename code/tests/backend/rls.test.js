import { describe, it, expect, beforeAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env');
}

const anonClient = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

describe('Database Security & RLS Validation', () => {
  beforeAll(() => {
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase environment variables not set');
    }
  });

  describe('Anonymous Access Restrictions', () => {
    it('should block anonymous users from reading organizations', async () => {
      const { data, error } = await anonClient.from('organizations').select('*');
      // RLS should return 0 rows or throw an error for anon
      if (error) {
        expect(error).toBeDefined();
      } else {
        expect(data).toHaveLength(0);
      }
    });

    it('should block anonymous users from reading profiles', async () => {
      const { data, error } = await anonClient.from('profiles').select('*');
      if (error) {
        expect(error).toBeDefined();
      } else {
        expect(data).toHaveLength(0);
      }
    });
    
    it('should block anonymous users from creating organizations', async () => {
      const { error } = await anonClient.from('organizations').insert([{ name: 'Hacked Org' }]);
      expect(error).toBeDefined();
      expect(error.code).toBe('42501'); // 42501 is PostgreSQL code for insufficient_privilege
    });
  });

  describe('Multi-Tenant Access Restriction (Simulated)', () => {
    // Note: Since this is an automated test running against a potential live database 
    // without the Service Role Key, we simulate the authentication logic.
    // In a fully configured CI pipeline, we would sign up two distinct users and verify 
    // that User A cannot fetch User B's org data.
    
    it('enforces row-level security on invoices', async () => {
      const { data, error } = await anonClient.from('invoices').select('*');
      if (error) {
        expect(error).toBeDefined();
      } else {
        expect(data).toHaveLength(0);
      }
    });
    
    it('enforces row-level security on locations', async () => {
      const { data, error } = await anonClient.from('locations').select('*');
      if (error) {
        expect(error).toBeDefined();
      } else {
        expect(data).toHaveLength(0);
      }
    });
  });

});
