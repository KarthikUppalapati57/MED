import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const payload = await req.json()
    // Expected generic payload: { organization_id, location_id, sensor_id, sensor_name, temperature, unit }
    
    const { org_id, organization_id, location_id, sensor_id, sensor_name, temperature, unit } = payload;
    const targetOrganizationId = organization_id || org_id;

    if (!targetOrganizationId || !sensor_id || temperature === undefined) {
      throw new Error("Missing required payload fields");
    }

    // Determine if temperature is in danger zone
    // Generic logic: Fridge should be < 40F (4.4C)
    let isAlert = false;
    if (unit === 'F' && temperature > 41) isAlert = true;
    if (unit === 'C' && temperature > 5) isAlert = true;

    const { error } = await supabaseClient.from('temperature_logs').insert({
      organization_id: targetOrganizationId,
      location_id: location_id,
      sensor_id: sensor_id,
      sensor_name: sensor_name || 'Unknown Sensor',
      temperature: temperature,
      unit: unit || 'F',
      is_alert: isAlert
    });

    if (error) throw error;

    if (isAlert) {
      // Create a notification for managers
      await supabaseClient.from('notifications').insert({
        organization_id: targetOrganizationId,
        type: 'alert',
        title: 'Temperature Danger Zone',
        message: `${sensor_name} reported ${temperature}°${unit}`,
      });
    }

    return new Response(JSON.stringify({ success: true, alert_triggered: isAlert }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    console.error("IoT Webhook error:", error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
