begin;

create or replace function public.save_bar_item_release1(
  p_recipe jsonb, p_yields jsonb, p_visibility jsonb, p_equipment_names jsonb,
  p_steps jsonb, p_location_prices jsonb
) returns public.recipes language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_org uuid := nullif(p_recipe->>'organization_id','')::uuid;
  v_id uuid := nullif(p_recipe->>'id','')::uuid;
  v_recipe public.recipes; v_row jsonb; v_equipment_id uuid; v_child uuid; v_type uuid := nullif(p_recipe->>'recipe_type_id','')::uuid;
begin
  if auth.uid() is null or v_org is null or v_org <> public.get_my_org() or not public.is_manager_or_above() then raise exception 'Not authorized to save Bar Items'; end if;
  if coalesce(trim(p_recipe->>'name'),'')='' then raise exception 'Name is required'; end if;
  if jsonb_typeof(p_yields)<>'array' or jsonb_array_length(p_yields)=0 then raise exception 'At least one yield is required'; end if;
  if (select count(*) from jsonb_array_elements(p_yields) x where coalesce((x->>'is_primary')::boolean,false) and coalesce((x->>'quantity')::numeric,0)>0) <> 1 then raise exception 'Exactly one positive primary yield is required'; end if;
  if v_type is not null and not exists(select 1 from public.recipe_types where id=v_type and organization_id=v_org and kind='beverage') then raise exception 'Bar Item type must be a beverage Recipe type'; end if;
  for v_row in select value from jsonb_array_elements(coalesce(p_recipe->'ingredients','[]'::jsonb)) loop
    v_child := nullif(v_row->>'sub_recipe_id','')::uuid;
    if coalesce((v_row->>'missing_conversion')::boolean,false) then raise exception 'A required unit conversion is missing'; end if;
    if v_child is not null and v_id is not null and public.recipe_dependency_would_cycle(v_id,v_child) then raise exception 'Circular Recipe dependency detected'; end if;
  end loop;

  if v_id is null then
    insert into public.recipes(organization_id,brand_id,location_id,name,description,category,status,recipe_type_id,yield_quantity,yield_unit,yield_percentage,ingredients,instructions,selling_price,target_margin_percent,margin_alert_enabled,total_ingredient_cost,total_cost,cost_per_serving,is_batch,shelf_life_quantity,shelf_life_unit,created_by)
    values(v_org,nullif(p_recipe->>'brand_id','')::uuid,nullif(p_recipe->>'location_id','')::uuid,trim(p_recipe->>'name'),nullif(p_recipe->>'description',''),'beverage',coalesce(nullif(p_recipe->>'status',''),'active'),v_type,
      (select (x->>'quantity')::numeric from jsonb_array_elements(p_yields) x where coalesce((x->>'is_primary')::boolean,false) limit 1),(select x->>'unit' from jsonb_array_elements(p_yields) x where coalesce((x->>'is_primary')::boolean,false) limit 1),100,coalesce(p_recipe->'ingredients','[]'::jsonb),coalesce(p_recipe->>'instructions',''),coalesce(nullif(p_recipe->>'selling_price','')::numeric,0),coalesce(nullif(p_recipe->>'target_margin_percent','')::numeric,70),coalesce((p_recipe->>'margin_alert_enabled')::boolean,true),0,0,0,false,nullif(p_recipe->>'shelf_life_quantity','')::numeric,nullif(p_recipe->>'shelf_life_unit',''),auth.uid()) returning * into v_recipe;
    v_id := v_recipe.id;
  else
    update public.recipes set name=trim(p_recipe->>'name'),description=nullif(p_recipe->>'description',''),category='beverage',status=coalesce(nullif(p_recipe->>'status',''),'active'),recipe_type_id=v_type,
      ingredients=coalesce(p_recipe->'ingredients','[]'::jsonb),instructions=coalesce(p_recipe->>'instructions',''),selling_price=coalesce(nullif(p_recipe->>'selling_price','')::numeric,0),target_margin_percent=coalesce(nullif(p_recipe->>'target_margin_percent','')::numeric,70),margin_alert_enabled=coalesce((p_recipe->>'margin_alert_enabled')::boolean,true),is_batch=false,shelf_life_quantity=nullif(p_recipe->>'shelf_life_quantity','')::numeric,shelf_life_unit=nullif(p_recipe->>'shelf_life_unit',''),updated_at=now()
      where id=v_id and organization_id=v_org and category='beverage' and not coalesce(is_batch,false) returning * into v_recipe;
    if v_recipe.id is null then raise exception 'Bar Item not found'; end if;
  end if;

  delete from public.recipe_yields where recipe_id=v_id;
  for v_row in select value from jsonb_array_elements(p_yields) loop insert into public.recipe_yields(organization_id,recipe_id,quantity,unit,is_primary,cost_per_unit) values(v_org,v_id,(v_row->>'quantity')::numeric,trim(v_row->>'unit'),coalesce((v_row->>'is_primary')::boolean,false),nullif(v_row->>'cost_per_unit','')::numeric); end loop;
  delete from public.recipe_location_visibility where recipe_id=v_id;
  if coalesce(p_visibility->>'mode','all')='selected' then for v_row in select value from jsonb_array_elements(coalesce(p_visibility->'location_ids','[]'::jsonb)) loop insert into public.recipe_location_visibility(organization_id,recipe_id,location_id,is_visible) select v_org,v_id,trim(both '"' from v_row::text)::uuid,true from public.locations l where l.id=trim(both '"' from v_row::text)::uuid and l.organization_id=v_org; end loop; end if;
  delete from public.recipe_equipment_assignments where recipe_id=v_id;
  for v_row in select value from jsonb_array_elements(coalesce(p_equipment_names,'[]'::jsonb)) loop insert into public.recipe_equipment_catalog(organization_id,name) values(v_org,trim(both '"' from v_row::text)) on conflict(organization_id,lower(name)) do update set is_active=true,updated_at=now() returning id into v_equipment_id; insert into public.recipe_equipment_assignments(organization_id,recipe_id,equipment_id) values(v_org,v_id,v_equipment_id) on conflict do nothing; end loop;
  delete from public.recipe_preparation_steps where recipe_id=v_id;
  for v_row in select value from jsonb_array_elements(coalesce(p_steps,'[]'::jsonb)) loop insert into public.recipe_preparation_steps(organization_id,recipe_id,step_number,instruction,notes) values(v_org,v_id,(v_row->>'step_number')::integer,trim(v_row->>'instruction'),nullif(v_row->>'notes','')); end loop;
  delete from public.recipe_location_prices where recipe_id=v_id;
  for v_row in select value from jsonb_array_elements(coalesce(p_location_prices,'[]'::jsonb)) loop insert into public.recipe_location_prices(organization_id,recipe_id,location_id,price) select v_org,v_id,(v_row->>'location_id')::uuid,(v_row->>'price')::numeric from public.locations l where l.id=(v_row->>'location_id')::uuid and l.organization_id=v_org; end loop;
  perform public.recalculate_recipe_cost_tree(v_id);
  select * into v_recipe from public.recipes where id=v_id;
  return v_recipe;
end; $$;

create or replace function public.set_bar_item_status(p_recipe_id uuid,p_status text) returns public.recipes language plpgsql security definer set search_path=public,pg_temp as $$ declare v_recipe public.recipes; begin
  if not public.is_manager_or_above() or p_status not in ('active','inactive') then raise exception 'Not authorized or invalid status'; end if;
  update public.recipes set status=p_status,updated_at=now() where id=p_recipe_id and organization_id=public.get_my_org() and category='beverage' and not coalesce(is_batch,false) returning * into v_recipe; return v_recipe;
end; $$;

create or replace function public.delete_bar_item(p_recipe_id uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$ begin
  if not public.is_manager_or_above() then raise exception 'Not authorized'; end if;
  if exists(select 1 from public.recipe_ingredients where sub_recipe_id=p_recipe_id and organization_id=public.get_my_org()) then raise exception 'Bar Item is in use and cannot be deleted'; end if;
  delete from public.recipes where id=p_recipe_id and organization_id=public.get_my_org() and category='beverage' and not coalesce(is_batch,false);
end; $$;

revoke all on function public.save_bar_item_release1(jsonb,jsonb,jsonb,jsonb,jsonb,jsonb) from public,anon;
revoke all on function public.set_bar_item_status(uuid,text) from public,anon;
revoke all on function public.delete_bar_item(uuid) from public,anon;
grant execute on function public.save_bar_item_release1(jsonb,jsonb,jsonb,jsonb,jsonb,jsonb) to authenticated,service_role;
grant execute on function public.set_bar_item_status(uuid,text) to authenticated,service_role;
grant execute on function public.delete_bar_item(uuid) to authenticated,service_role;

comment on function public.save_bar_item_release1(jsonb,jsonb,jsonb,jsonb,jsonb,jsonb) is 'Atomically saves tenant-scoped beverage Recipes and shared Recipe child records.';
commit;
