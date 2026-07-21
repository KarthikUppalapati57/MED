import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { getSupabaseClient } from "../_shared/supabase.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function priorityFor(quantity: number) {
  if (quantity >= 50) return 'urgent';
  if (quantity >= 25) return 'high';
  if (quantity >= 10) return 'normal';
  return 'low';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    const supabase = getSupabaseClient(authHeader);

    const { organization_id, date, created_by, location_id = null } = await req.json();

    if (!organization_id || !date) {
      throw new Error('organization_id and date are required');
    }

    const targetDate = new Date(`${date}T00:00:00.000Z`);
    if (Number.isNaN(targetDate.getTime())) {
      throw new Error('date must be a valid ISO date');
    }

    const historyStart = new Date(targetDate);
    historyStart.setDate(historyStart.getDate() - 28);

    let ordersQuery = supabase
      .from('pos_orders')
      .select('id, location_id')
      .eq('organization_id', organization_id)
      .gte('order_date', historyStart.toISOString())
      .lt('order_date', targetDate.toISOString())
      .in('status', ['logged', 'synced']);

    if (location_id) {
      ordersQuery = ordersQuery.eq('location_id', location_id);
    }

    const { data: orders, error: ordersError } = await ordersQuery;
    if (ordersError) throw ordersError;

    const orderIds = (orders || []).map((order) => order.id);
    if (!orderIds.length) {
      return new Response(JSON.stringify({
        success: true,
        message: 'No prep sheet generated because there is no POS history for the selected period.',
        plans_upserted: 0,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    const locationByOrder = new Map((orders || []).map((order) => [order.id, order.location_id || null]));
    const { data: items, error: itemsError } = await supabase
      .from('pos_order_items')
      .select('order_id, item_name, quantity')
      .in('order_id', orderIds);
    if (itemsError) throw itemsError;

    const rollup = new Map<string, { name: string; locationId: string | null; quantity: number }>();
    for (const item of items || []) {
      const itemName = String(item.item_name || '').trim();
      const quantity = Number(item.quantity || 0);
      if (!itemName || quantity <= 0) continue;
      const itemLocationId = locationByOrder.get(item.order_id) || null;
      const key = `${itemLocationId || 'org'}:${itemName.toLowerCase()}`;
      const current = rollup.get(key) || { name: itemName, locationId: itemLocationId, quantity: 0 };
      current.quantity += quantity;
      rollup.set(key, current);
    }

    const topItems = [...rollup.values()]
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 25);

    if (!topItems.length) {
      return new Response(JSON.stringify({
        success: true,
        message: 'No prep sheet generated because POS orders had no item quantities.',
        plans_upserted: 0,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    let plansUpserted = 0;
    for (const item of topItems) {
      const forecastQuantity = Number((item.quantity / 4).toFixed(2));
      const prepQuantity = Number(Math.max(1, Math.ceil(forecastQuantity * 1.1)).toFixed(2));
      const planPayload = {
        organization_id,
        location_id: item.locationId,
        name: item.name,
        prep_date: date,
        par_quantity: forecastQuantity,
        on_hand_quantity: 0,
        forecast_quantity: forecastQuantity,
        prep_quantity: prepQuantity,
        unit: 'portion',
        priority: priorityFor(prepQuantity),
        status: 'planned',
        created_by,
        notes: 'Generated from 28-day POS item velocity.',
      };

      const { data: existing, error: existingError } = await supabase
        .from('smart_prep_plans')
        .select('id')
        .eq('organization_id', organization_id)
        .eq('prep_date', date)
        .eq('name', item.name)
        .eq('location_id', item.locationId)
        .maybeSingle();
      if (existingError) throw existingError;

      const query = existing
        ? supabase.from('smart_prep_plans').update(planPayload).eq('id', existing.id)
        : supabase.from('smart_prep_plans').insert(planPayload);
      const { error: planError } = await query;
      if (planError) throw planError;
      plansUpserted += 1;
    }

    return new Response(JSON.stringify({
      success: true,
      message: 'Master Prep Sheet generated from POS history.',
      plans_upserted: plansUpserted,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
