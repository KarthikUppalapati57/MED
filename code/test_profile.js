import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function testFetchProfile() {
  console.log('Fetching profiles...');
  const { data, error } = await supabase
    .from('profiles')
    .select(`
      *,
      organization:organizations(*),
      brand:brands(*),
      location:locations(*)
    `)
    .limit(1);

  if (error) {
    console.error('Error fetching profile:', error);
  } else {
    console.log('Successfully fetched profile:', data);
  }
}

testFetchProfile();
