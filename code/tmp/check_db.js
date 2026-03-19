
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://gsupqfmwlsmwoybphimx.supabase.co';
const supabaseAnonKey = 'sb_publishable_dJ9li9n-pwirxncFFVf9lQ_NozRI3n5';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function check() {
  console.log('Checking database status...');
  
  // 1. Check current profile for the user
  const { data: profile, error: pError } = await supabase
    .from('profiles')
    .select('*')
    .ilike('email', '%uppalapati%')
    .maybeSingle();

  if (pError) console.error('Profile check error:', pError);
  else console.log('Profile found:', profile ? { id: profile.id, role: profile.role, org: profile.organization_id } : 'Not found');

  // 2. Check for invoices
  const { data: invoices, error: iError } = await supabase
    .from('invoices')
    .select('id, invoice_number, total_amount, created_at')
    .order('created_at', { ascending: false })
    .limit(5);

  if (iError) console.error('Invoice check error:', iError);
  else console.log('Recent invoices:', invoices);

  // 3. Check invitations table structure (verify my fix applied)
  const { data: invites, error: inError } = await supabase
    .from('invitations')
    .select('*')
    .limit(1);
    
  if (inError) console.error('Invitations table error:', inError);
  else console.log('Invitations table is accessible.');
}

check();
