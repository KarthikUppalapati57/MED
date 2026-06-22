import { describe, it, expect, beforeAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

describe('Database RPC: Inventory & POS Engine', () => {
  let orgId;
  let locationId;

  beforeAll(async () => {
    // Fetch a test organization
    const { data: orgs } = await supabase.from('organizations').select('id').limit(1);
    if (orgs && orgs.length > 0) {
      orgId = orgs[0].id;
    }
  });

  it('generate_daily_theoretical_usage should calculate usage correctly', async () => {
    if (!orgId) {
      console.warn('Skipping test: No organization found');
      return;
    }

    const today = new Date().toISOString().split('T')[0];
    
    // Call the RPC
    const { data, error } = await supabase.rpc('generate_daily_theoretical_usage', {
      p_org_id: orgId,
      p_date: today
    });

    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
    
    // Check structure
    if (data.length > 0) {
      const item = data[0];
      expect(item).toHaveProperty('ingredient_id');
      expect(item).toHaveProperty('ingredient_name');
      expect(item).toHaveProperty('theoretical_usage');
      expect(item).toHaveProperty('unit');
      expect(item).toHaveProperty('cost_value');
    }
  });

  it('get_dashboard_metrics should return valid aggregate data', async () => {
    if (!orgId) {
      console.warn('Skipping test: No organization found');
      return;
    }

    const { data, error } = await supabase.rpc('get_dashboard_metrics', {
      p_org_id: orgId
    });

    expect(error).toBeNull();
    expect(data).toHaveProperty('total_inventory_value');
    expect(data).toHaveProperty('active_vendors');
    expect(data).toHaveProperty('pending_orders');
    expect(data).toHaveProperty('recent_alerts');
  });
});
