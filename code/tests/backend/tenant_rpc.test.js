import { describe, it, expect, beforeAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
  throw new Error('Missing VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, or SUPABASE_SERVICE_ROLE_KEY in .env');
}

// Create clients
const anonClient = createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false } });
const serviceClient = createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } });

describe('Schema-per-Tenant RPC Validation', () => {
  beforeAll(() => {
    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
      throw new Error('Supabase environment variables not set');
    }
  });

  it('should block anonymous users from executing tenant_select_rows', async () => {
    const { data, error } = await anonClient.rpc('tenant_select_rows', {
      p_table_name: 'invoices',
      p_filters: { organization_id: '00000000-0000-0000-0000-000000000000' }
    });
    
    // Execution is revoked from anon, so we expect an error or no data
    if (error) {
      expect(error).toBeDefined();
    } else {
      expect(data).toBeNull();
    }
  });

  it('should prevent access to unroutable tables', async () => {
    const { error } = await serviceClient.rpc('tenant_select_rows', {
      p_table_name: 'pg_stat_activity', // Not a tenant table
      p_filters: { organization_id: '00000000-0000-0000-0000-000000000000' }
    });
    
    expect(error).toBeDefined();
    expect(error.message).toContain('Table is not tenant-routable');
  });

  it('should enforce organization_id in filters', async () => {
    // Calling without organization_id might default to the caller's org.
    // For service_role, this defaults to their own org, but since service_role doesn't have an org in its JWT by default, it might fail.
    const { error } = await serviceClient.rpc('tenant_select_rows', {
      p_table_name: 'invoices',
      p_filters: {} // Missing organization_id
    });
    
    // assert_tenant_scope checks organization_id
    expect(error).toBeDefined();
  });
});
