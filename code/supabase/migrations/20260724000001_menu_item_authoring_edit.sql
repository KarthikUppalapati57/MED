begin;

create or replace function public.save_menu_item_phase1(
  p_recipe jsonb,
  p_yields jsonb,
  p_visibility jsonb,
  p_equipment_names jsonb,
  p_steps jsonb,
  p_location_prices jsonb
)
returns public.recipes
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org uuid := nullif(p_recipe->>'organization_id', '')::uuid;
  v_id uuid := nullif(p_recipe->>'id', '')::uuid;
  v_recipe public.recipes;
  v_row jsonb;
  v_equipment_id uuid;
begin
  if auth.uid() is null or v_org is null or v_org <> public.get_my_org() or not public.is_manager_or_above() then
    raise exception 'Not authorized to save menu items';
  end if;
  if coalesce(trim(p_recipe->>'name'), '') = '' then raise exception 'Name is required'; end if;
  if jsonb_typeof(p_yields) <> 'array' or jsonb_array_length(p_yields) = 0 then raise exception 'At least one yield is required'; end if;

  if v_id is null then
    insert into public.recipes (
      organization_id, brand_id, location_id, name, description, category, status,
      recipe_type_id, yield_quantity, yield_unit, yield_percentage, ingredients,
      instructions, selling_price, target_margin_percent, margin_alert_enabled,
      total_ingredient_cost, total_packaging_cost, labor_cost, total_cost,
      cost_per_serving, is_batch, shelf_life_quantity, shelf_life_unit, created_by
    ) values (
      v_org, nullif(p_recipe->>'brand_id', '')::uuid, nullif(p_recipe->>'location_id', '')::uuid,
      trim(p_recipe->>'name'), nullif(p_recipe->>'description', ''), coalesce(nullif(p_recipe->>'category', ''), 'other'),
      coalesce(nullif(p_recipe->>'status', ''), 'active'), nullif(p_recipe->>'recipe_type_id', '')::uuid,
      (p_yields->0->>'quantity')::numeric, p_yields->0->>'unit', 100,
      coalesce(p_recipe->'ingredients', '[]'::jsonb), coalesce(p_recipe->>'instructions', ''),
      coalesce(nullif(p_recipe->>'selling_price', '')::numeric, 0),
      coalesce(nullif(p_recipe->>'target_margin_percent', '')::numeric, 70),
      coalesce((p_recipe->>'margin_alert_enabled')::boolean, true),
      coalesce(nullif(p_recipe->>'total_ingredient_cost', '')::numeric, 0), 0, 0,
      coalesce(nullif(p_recipe->>'total_cost', '')::numeric, 0),
      coalesce(nullif(p_recipe->>'cost_per_serving', '')::numeric, 0), false,
      nullif(p_recipe->>'shelf_life_quantity', '')::numeric, nullif(p_recipe->>'shelf_life_unit', ''), auth.uid()
    ) returning * into v_recipe;
    v_id := v_recipe.id;
  else
    update public.recipes
    set
      brand_id = nullif(p_recipe->>'brand_id', '')::uuid,
      location_id = nullif(p_recipe->>'location_id', '')::uuid,
      name = trim(p_recipe->>'name'),
      description = nullif(p_recipe->>'description', ''),
      category = coalesce(nullif(p_recipe->>'category', ''), 'other'),
      status = coalesce(nullif(p_recipe->>'status', ''), 'active'),
      recipe_type_id = nullif(p_recipe->>'recipe_type_id', '')::uuid,
      yield_quantity = (p_yields->0->>'quantity')::numeric,
      yield_unit = p_yields->0->>'unit',
      yield_percentage = 100,
      ingredients = coalesce(p_recipe->'ingredients', '[]'::jsonb),
      instructions = coalesce(p_recipe->>'instructions', ''),
      selling_price = coalesce(nullif(p_recipe->>'selling_price', '')::numeric, 0),
      target_margin_percent = coalesce(nullif(p_recipe->>'target_margin_percent', '')::numeric, 70),
      margin_alert_enabled = coalesce((p_recipe->>'margin_alert_enabled')::boolean, true),
      total_ingredient_cost = coalesce(nullif(p_recipe->>'total_ingredient_cost', '')::numeric, 0),
      total_cost = coalesce(nullif(p_recipe->>'total_cost', '')::numeric, 0),
      cost_per_serving = coalesce(nullif(p_recipe->>'cost_per_serving', '')::numeric, 0),
      is_batch = false,
      shelf_life_quantity = nullif(p_recipe->>'shelf_life_quantity', '')::numeric,
      shelf_life_unit = nullif(p_recipe->>'shelf_life_unit', ''),
      updated_at = now()
    where id = v_id
      and organization_id = v_org
      and not coalesce(is_batch, false)
    returning * into v_recipe;

    if v_recipe.id is null then
      raise exception 'Menu Item not found';
    end if;
  end if;

  delete from public.recipe_yields where recipe_id = v_id;
  for v_row in select value from jsonb_array_elements(p_yields)
  loop
    insert into public.recipe_yields (organization_id, recipe_id, quantity, unit, is_primary, cost_per_unit)
    values (v_org, v_id, (v_row->>'quantity')::numeric, trim(v_row->>'unit'), coalesce((v_row->>'is_primary')::boolean, false), nullif(v_row->>'cost_per_unit', '')::numeric);
  end loop;

  delete from public.recipe_location_visibility where recipe_id = v_id;
  if coalesce(p_visibility->>'mode', 'all') = 'selected' then
    for v_row in select value from jsonb_array_elements(coalesce(p_visibility->'location_ids', '[]'::jsonb))
    loop
      insert into public.recipe_location_visibility (organization_id, recipe_id, location_id, is_visible)
      select v_org, v_id, trim(both '"' from v_row::text)::uuid, true
      from public.locations l
      where l.id = trim(both '"' from v_row::text)::uuid and l.organization_id = v_org;
    end loop;
  end if;

  delete from public.recipe_equipment_assignments where recipe_id = v_id;
  for v_row in select value from jsonb_array_elements(coalesce(p_equipment_names, '[]'::jsonb))
  loop
    insert into public.recipe_equipment_catalog (organization_id, name)
    values (v_org, trim(both '"' from v_row::text))
    on conflict (organization_id, lower(name)) do update set is_active = true, updated_at = now()
    returning id into v_equipment_id;
    insert into public.recipe_equipment_assignments (organization_id, recipe_id, equipment_id)
    values (v_org, v_id, v_equipment_id) on conflict do nothing;
  end loop;

  delete from public.recipe_preparation_steps where recipe_id = v_id;
  for v_row in select value from jsonb_array_elements(coalesce(p_steps, '[]'::jsonb))
  loop
    insert into public.recipe_preparation_steps (organization_id, recipe_id, step_number, instruction, notes)
    values (v_org, v_id, (v_row->>'step_number')::integer, trim(v_row->>'instruction'), nullif(v_row->>'notes', ''));
  end loop;

  delete from public.recipe_location_prices where recipe_id = v_id;
  for v_row in select value from jsonb_array_elements(coalesce(p_location_prices, '[]'::jsonb))
  loop
    insert into public.recipe_location_prices (organization_id, recipe_id, location_id, price)
    select v_org, v_id, (v_row->>'location_id')::uuid, (v_row->>'price')::numeric
    from public.locations l
    where l.id = (v_row->>'location_id')::uuid and l.organization_id = v_org;
  end loop;

  return v_recipe;
end;
$$;

revoke all on function public.save_menu_item_phase1(jsonb, jsonb, jsonb, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.save_menu_item_phase1(jsonb, jsonb, jsonb, jsonb, jsonb, jsonb) to authenticated, service_role;

comment on function public.save_menu_item_phase1(jsonb, jsonb, jsonb, jsonb, jsonb, jsonb) is
  'Atomically creates or updates a tenant-scoped Menu Item and its Recipe-owned child records.';

commit;
