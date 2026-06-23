import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function testLogin() {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: 'nonexistent@example.com',
    password: 'wrongpassword'
  });
  console.log('Login attempt result:');
  console.log(error ? error.message : 'Success');
}

testLogin();
