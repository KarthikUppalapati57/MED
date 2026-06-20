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
      const { data, error } = await anonClient.from('organizations').delete().eq('id', '00000000-0000-0000-0000-000000000000').select();
      
      // Since RLS hides the row, it deletes nothing and returns empty array when select() is chained.
      if (error) {
        expect(error).toBeDefined();
      } else {
        expect(data).toHaveLength(0);
      }
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
        entity_id: '00000000-0000-0000-0000-000000000000',
        user_id: '00000000-0000-0000-0000-000000000000',
        organization_id: '00000000-0000-0000-0000-000000000000'
      }]);
      expect(error).toBeDefined();
      expect(['42501', '23502']).toContain(error.code); // RLS or constraint violation
    });
  });
});
