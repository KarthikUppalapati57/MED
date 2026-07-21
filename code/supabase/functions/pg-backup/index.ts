import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const BACKUP_BUCKET = Deno.env.get('BACKUP_STORAGE_BUCKET') || 'db-backups'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (authHeader !== `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`) {
      throw new Error('Unauthorized')
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } },
    )

    const timestamp = new Date().toISOString()
    const exportTables = [
      'organizations',
      'brands',
      'locations',
      'profiles',
      'inventory',
      'inventory_movements',
      'products',
      'recipes',
      'invoices',
      'invoice_line_items',
      'vendors',
      'pos_orders',
      'pos_order_items',
      'smart_prep_plans',
      'custom_reports',
    ]

    const data: Record<string, unknown[]> = {}
    const metrics: Record<string, number> = {}

    for (const table of exportTables) {
      const { data: rows, error } = await supabaseClient.from(table).select('*')
      if (error) throw new Error(`Backup export failed for ${table}: ${error.message}`)
      data[table] = rows || []
      metrics[`${table}_count`] = rows?.length || 0
    }

    const backupData = {
      timestamp,
      version: '2.0',
      source: 'pg-backup-edge-function',
      tables: exportTables,
      data,
    }

    const backupString = JSON.stringify(backupData)
    const backupSizeKB = Number((new TextEncoder().encode(backupString).length / 1024).toFixed(2))
    const objectPath = `${timestamp.slice(0, 10)}/restops-backup-${timestamp.replace(/[:.]/g, '-')}.json`

    const { error: uploadError } = await supabaseClient.storage
      .from(BACKUP_BUCKET)
      .upload(objectPath, new Blob([backupString], { type: 'application/json' }), {
        contentType: 'application/json',
        upsert: false,
      })

    if (uploadError) {
      throw new Error(`Backup storage upload failed for bucket ${BACKUP_BUCKET}: ${uploadError.message}`)
    }

    return new Response(JSON.stringify({
      success: true,
      message: 'Backup sequence completed and stored',
      bucket: BACKUP_BUCKET,
      path: objectPath,
      metrics: {
        size_kb: backupSizeKB,
        ...metrics,
      },
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    console.error('Backup error:', error)
    const message = error instanceof Error ? error.message : String(error)
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: message === 'Unauthorized' ? 401 : 500,
    })
  }
})
