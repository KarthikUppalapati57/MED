import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { inngest } from '../_shared/inngest.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { full_name, email, company_name, phone, plan } = await req.json()

    // In a real app, you would integrate SendGrid or Resend here to notify admins.
    // We now use Inngest to handle this reliably in the background
    console.log(`New Demo Request: ${full_name} (${company_name}) - ${email}`);

    await inngest.send({
      name: "demo.requested",
      data: {
        email,
        fullName: full_name,
        companyName: company_name,
        requestId: `req_${Date.now()}`
      }
    });

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
