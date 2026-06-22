import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const payload = await req.json();
    const { mac_address, temperature_f, humidity_percent } = payload;

    if (!mac_address || temperature_f === undefined) {
      throw new Error('Missing required fields: mac_address, temperature_f');
    }

    // Lookup sensor
    const { data: sensor, error: sensorError } = await supabaseClient
      .from('iot_sensors')
      .select('id, organization_id')
      .eq('mac_address', mac_address)
      .single();

    if (sensorError || !sensor) {
      throw new Error('Sensor not found or unregistered');
    }

    // Update last ping
    await supabaseClient
      .from('iot_sensors')
      .update({ last_ping_at: new Date().toISOString() })
      .eq('id', sensor.id);

    // Is it an alert? (e.g. > 41°F for a fridge)
    // In production, thresholds would be configurable per sensor
    const is_alert = temperature_f > 41.0;

    // Log the temperature
    const { error: logError } = await supabaseClient
      .from('temperature_logs')
      .insert({
        sensor_id: sensor.id,
        temperature_f,
        humidity_percent,
        is_alert
      });

    if (logError) throw logError;

    // If alert, we would trigger an SMS or email here via Resend/Twilio

    return new Response(JSON.stringify({ success: true, alert_triggered: is_alert }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
