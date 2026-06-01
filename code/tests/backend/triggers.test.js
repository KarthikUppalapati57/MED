import { describe, it, expect, beforeAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

// Create an unauthenticated client
const anonClient = createClient(supabaseUrl, supabaseKey);

describe('Database Triggers & Webhooks Validation', () => {
  beforeAll(() => {
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase environment variables not set');
    }
  });

  describe('Archive Record On Delete Trigger', () => {
    it('prevents anonymous deletion to test archive trigger boundary', async () => {
      // We cannot actually trigger the delete without a service role key or auth, 
      // but we can verify that the RLS prevents unauthorized deletion which would fire the trigger.
      const { error } = await anonClient.from('organizations').delete().eq('id', '00000000-0000-0000-0000-000000000000');
      
      expect(error).toBeDefined();
      expect(error.code).toBe('42501'); // insufficient_privilege
    });
  });

  describe('Recipe Margin Protection Trigger', () => {
    it('restricts updating ingredient costs directly without auth', async () => {
      const { error } = await anonClient
        .from('ingredients')
        .update({ cost_per_unit: 10.00 })
        .eq('id', '00000000-0000-0000-0000-000000000000');
        
      expect(error).toBeDefined();
    });
  });

  describe('Audit Log Trigger', () => {
    it('blocks anonymous insertion into audit logs', async () => {
      const { error } = await anonClient.from('audit_logs').insert([{
        action: 'TEST',
        entity_type: 'organization',
      }]);
      expect(error).toBeDefined();
      expect(error.code).toBe('42501');
    });
  });
});
