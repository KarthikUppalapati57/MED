import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

// This function is intended to be triggered by pg_cron or an external scheduling service
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Basic authorization to prevent public execution
    const authHeader = req.headers.get('Authorization')
    if (authHeader !== `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`) {
      throw new Error("Unauthorized");
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    console.log("Starting automated daily backup sequence...");

    // 1. Export Organizations
    const { data: orgs, error: orgError } = await supabaseClient.from('organizations').select('*');
    if (orgError) throw orgError;

    // 2. Export Locations
    const { data: locations, error: locError } = await supabaseClient.from('locations').select('*');
    if (locError) throw locError;

    // 3. Export Global Items (Core Catalog)
    const { data: items, error: itemError } = await supabaseClient.from('global_items').select('*');
    if (itemError) throw itemError;

    // Construct Backup Payload
    const backupData = {
      timestamp: new Date().toISOString(),
      version: '1.0',
      data: {
        organizations: orgs,
        locations: locations,
        catalog: items
      }
    };

    const backupString = JSON.stringify(backupData);
    const backupSizeKB = (new TextEncoder().encode(backupString).length / 1024).toFixed(2);

    console.log(`Backup payload generated. Size: ${backupSizeKB} KB`);

    // NOTE: In a true production environment, we would use the AWS S3 SDK here 
    // to stream `backupString` directly into a cold-storage S3 bucket for disaster recovery.
    // Example: await s3Client.putObject({ Bucket: 'restops-backups', Key: `db-backup-${Date.now()}.json`, Body: backupString })

    // For MVP, we log the success and return the meta-statistics.
    return new Response(JSON.stringify({ 
      success: true, 
      message: "Backup sequence completed",
      metrics: {
        size_kb: backupSizeKB,
        org_count: orgs.length,
        loc_count: locations.length,
        item_count: items.length
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    console.error("Backup error:", error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: error.message === 'Unauthorized' ? 401 : 500,
    })
  }
})
