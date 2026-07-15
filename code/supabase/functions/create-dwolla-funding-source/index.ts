import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { corsHeaders } from '../_shared/cors.ts'
import { ensureDwollaCustomerAndFundingSource } from '../_shared/dwolla.ts'

// Creates a real Dwolla funding source for either side of an ACH payout:
// - target_type 'organization': the org's OWN bank account (the money SOURCE), wired from
//   PaymentAccountsSettings.jsx when a user adds real routing/account numbers to a checking
//   account. Raw numbers arrive here over HTTPS and are immediately vaulted, never stored
//   in a plain column (mirrors how vendor banking is vaulted).
// - target_type 'vendor': the vendor's bank account (the money DESTINATION). Never trusts
//   client-supplied numbers for this side -- reads them server-side from the vault via
//   get_vendor_banking_for_audit, using numbers the vendor already submitted during onboarding.
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 405 })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )
    const serviceSupabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role, organization_id, full_name, email')
      .eq('id', user.id)
      .single()

    if (!profile || !['org_manager', 'tenant_super_admin', 'branch_manager', 'platform_admin'].includes(profile.role)) {
      return new Response(JSON.stringify({ error: 'Only org managers or branch managers can configure ACH funding sources.' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 })
    }

    const body = await req.json()
    const { target_type } = body

    if (target_type === 'organization') {
      const { payment_account_id, routing_number, account_number, bank_account_type = 'checking' } = body
      if (!payment_account_id || !routing_number || !account_number) {
        return new Response(JSON.stringify({ error: 'payment_account_id, routing_number, and account_number are required' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 })
      }

      const { data: account, error: accountError } = await serviceSupabase
        .from('payment_accounts')
        .select('id, organization_id, name')
        .eq('id', payment_account_id)
        .maybeSingle()

      if (accountError || !account || account.organization_id !== profile.organization_id) {
        return new Response(JSON.stringify({ error: 'Payment account not found' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 })
      }

      const { data: org } = await serviceSupabase
        .from('organizations')
        .select('id, name, dwolla_customer_url')
        .eq('id', profile.organization_id)
        .single()

      const holderName = profile.full_name || profile.email || 'RestOps Org'
      const [firstName, ...lastNameParts] = holderName.split(/\s+/)

      const { customerUrl, fundingSourceUrl } = await ensureDwollaCustomerAndFundingSource({
        existingCustomerUrl: org?.dwolla_customer_url,
        firstName: firstName || 'RestOps',
        lastName: lastNameParts.join(' ') || 'Org',
        email: profile.email || user.email,
        businessName: org?.name,
        routingNumber: routing_number,
        accountNumber: account_number,
        bankAccountType: bank_account_type,
        fundingSourceName: account.name,
      })

      if (!org?.dwolla_customer_url) {
        await serviceSupabase.from('organizations').update({ dwolla_customer_url: customerUrl }).eq('id', profile.organization_id)
      }

      await serviceSupabase.from('payment_accounts').update({ dwolla_funding_source_url: fundingSourceUrl }).eq('id', payment_account_id)
      await serviceSupabase.rpc('store_payment_account_banking_secret', {
        p_account_id: payment_account_id,
        p_account: account_number,
        p_routing: routing_number,
      })

      return new Response(JSON.stringify({ success: true, fundingSourceUrl }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })
    }

    if (target_type === 'vendor') {
      const { vendor_id, banking_row_id } = body
      if (!vendor_id || !banking_row_id) {
        return new Response(JSON.stringify({ error: 'vendor_id and banking_row_id are required' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 })
      }

      const { data: vendor, error: vendorError } = await serviceSupabase
        .from('vendors')
        .select('id, organization_id, name, contact_name, email, dwolla_customer_url')
        .eq('id', vendor_id)
        .maybeSingle()

      if (vendorError || !vendor || vendor.organization_id !== profile.organization_id) {
        return new Response(JSON.stringify({ error: 'Vendor not found' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 })
      }

      const { data: banking, error: bankingError } = await serviceSupabase.rpc('get_vendor_banking_for_audit', {
        p_banking_row_id: banking_row_id,
      })
      if (bankingError || !banking?.account || !banking?.routing) {
        return new Response(JSON.stringify({ error: 'Vendor banking details not found' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 })
      }

      const holderName = vendor.contact_name || vendor.name
      const [firstName, ...lastNameParts] = holderName.split(/\s+/)

      const { customerUrl, fundingSourceUrl } = await ensureDwollaCustomerAndFundingSource({
        existingCustomerUrl: vendor.dwolla_customer_url,
        firstName: firstName || 'Vendor',
        lastName: lastNameParts.join(' ') || vendor.name,
        email: vendor.email,
        businessName: vendor.name,
        routingNumber: banking.routing,
        accountNumber: banking.account,
        bankAccountType: 'checking',
        fundingSourceName: vendor.name,
      })

      if (!vendor.dwolla_customer_url) {
        await serviceSupabase.from('vendors').update({ dwolla_customer_url: customerUrl, dwolla_onboarding_status: 'unverified' }).eq('id', vendor_id)
      }

      await serviceSupabase.from('vendor_payment_provider_links').upsert({
        vendor_id,
        organization_id: vendor.organization_id,
        provider: 'dwolla',
        provider_customer_ref: customerUrl,
        provider_funding_ref: fundingSourceUrl,
        provider_status: 'unverified',
        is_active: true,
      }, { onConflict: 'vendor_id,provider' })

      return new Response(JSON.stringify({ success: true, fundingSourceUrl }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })
    }

    return new Response(JSON.stringify({ error: 'target_type must be "organization" or "vendor"' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 })
  } catch (error) {
    console.error('create-dwolla-funding-source error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
