import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function dateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

function priorityFor(quantity: number) {
  if (quantity >= 50) return 'urgent';
  if (quantity >= 25) return 'high';
  if (quantity >= 10) return 'normal';
  return 'low';
}

serve(async (_req) => {
  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const { data: orgs, error: orgError } = await supabaseClient
      .from('organizations')
      .select('id, name');
    if (orgError) throw orgError;

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = dateOnly(tomorrow);

    const historyStart = new Date();
    historyStart.setDate(historyStart.getDate() - 28);

    let plansCreated = 0;
    let orgsSkipped = 0;

    for (const org of orgs || []) {
      const { data: orders, error: ordersError } = await supabaseClient
        .from('pos_orders')
        .select('id, location_id')
        .eq('organization_id', org.id)
        .gte('order_date', historyStart.toISOString())
        .in('status', ['logged', 'synced']);
      if (ordersError) throw ordersError;

      const orderIds = (orders || []).map((order) => order.id);
      if (!orderIds.length) {
        orgsSkipped += 1;
        continue;
      }

      const locationByOrder = new Map((orders || []).map((order) => [order.id, order.location_id]));
      const { data: items, error: itemsError } = await supabaseClient
        .from('pos_order_items')
        .select('order_id, item_name, quantity')
        .in('order_id', orderIds);
      if (itemsError) throw itemsError;

      const rollup = new Map<string, { name: string; locationId: string | null; quantity: number }>();
      for (const item of items || []) {
        const itemName = String(item.item_name || '').trim();
        if (!itemName) continue;
        const locationId = locationByOrder.get(item.order_id) || null;
        const key = `${locationId || 'org'}:${itemName.toLowerCase()}`;
        const current = rollup.get(key) || { name: itemName, locationId, quantity: 0 };
        current.quantity += Number(item.quantity || 0);
        rollup.set(key, current);
      }

      const topItems = [...rollup.values()]
        .sort((a, b) => b.quantity - a.quantity)
        .slice(0, 5);

      if (!topItems.length) {
        orgsSkipped += 1;
        continue;
      }

      for (const item of topItems) {
        const forecastQuantity = Number((item.quantity / 4).toFixed(2));
        const prepQuantity = Number(Math.max(1, Math.ceil(forecastQuantity * 1.1)).toFixed(2));

        const planPayload = {
          organization_id: org.id,
          location_id: item.locationId,
          name: item.name,
          prep_date: tomorrowStr,
          par_quantity: forecastQuantity,
          on_hand_quantity: 0,
          forecast_quantity: forecastQuantity,
          prep_quantity: prepQuantity,
          unit: 'portion',
          priority: priorityFor(prepQuantity),
          status: 'planned',
          notes: `Generated from 28-day POS item velocity for ${org.name}.`,
        };

        const { data: existing, error: existingError } = await supabaseClient
          .from('smart_prep_plans')
          .select('id')
          .eq('organization_id', org.id)
          .eq('prep_date', tomorrowStr)
          .eq('name', item.name)
          .eq('location_id', item.locationId)
          .maybeSingle();
        if (existingError) throw existingError;

        const query = existing
          ? supabaseClient.from('smart_prep_plans').update(planPayload).eq('id', existing.id)
          : supabaseClient.from('smart_prep_plans').insert(planPayload);
        const { error: planError } = await query;
        if (planError) throw planError;
        plansCreated += 1;
      }
    }

    return new Response(JSON.stringify({ success: true, prep_date: tomorrowStr, plans_upserted: plansCreated, orgs_skipped_no_pos_history: orgsSkipped }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), {
      headers: { "Content-Type": "application/json" },
      status: 500,
    });
  }
});