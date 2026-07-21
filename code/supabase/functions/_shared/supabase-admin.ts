import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { stripe } from './stripe.ts';

type CustomerInput = {
  email?: string;
  uuid: string;
};

const getAdminClient = () => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing Supabase admin configuration');
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
};

export async function createOrRetrieveCustomer({ email, uuid }: CustomerInput): Promise<string> {
  const supabaseAdmin = getAdminClient();

  const { data: organization, error: orgError } = await supabaseAdmin
    .from('organizations')
    .select('name, stripe_customer_id')
    .eq('id', uuid)
    .single();

  if (orgError || !organization) {
    throw new Error('Organization not found');
  }

  if (organization.stripe_customer_id) {
    return organization.stripe_customer_id;
  }

  const customer = await stripe.customers.create({
    email: email || undefined,
    name: organization.name || undefined,
    metadata: {
      organization_id: uuid,
    },
  });

  const { error: updateError } = await supabaseAdmin
    .from('organizations')
    .update({ stripe_customer_id: customer.id })
    .eq('id', uuid);

  if (updateError) {
    throw new Error(`Failed to save Stripe customer ID: ${updateError.message}`);
  }

  return customer.id;
}