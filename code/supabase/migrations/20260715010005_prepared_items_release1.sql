begin;

create table if not exists public.recipe_cost_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  costing_version integer not null,
  total_cost numeric(14,4) not null default 0,
  primary_yield_quantity numeric(14,4) not null,
  primary_yield_unit text not null,
  cost_per_yield_unit numeric(14,4) not null default 0,
  ingredient_snapshot jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique (recipe_id, costing_version)
);

create index if not exists idx_recipe_cost_snapshots_recipe
  on public.recipe_cost_snapshots (recipe_id, costing_version desc);
alter table public.recipe_cost_snapshots enable row level security;
drop policy if exists recipe_cost_snapshots_select on public.recipe_cost_snapshots;
create policy recipe_cost_snapshots_select on public.recipe_cost_snapshots for select
  using (organization_id = public.get_my_org());
drop policy if exists recipe_cost_snapshots_manage on public.recipe_cost_snapshots;
create policy recipe_cost_snapshots_manage on public.recipe_cost_snapshots for all
  using (organization_id = public.get_my_org() and public.is_manager_or_above())
  with check (organization_id = public.get_my_org() and public.is_manager_or_above());

create or replace function public.recipe_dependency_would_cycle(p_recipe_id uuid, p_candidate_child_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  with recursive descendants(id) as (
    select p_candidate_child_id
    union
    select ri.sub_recipe_id
    from public.recipe_ingredients ri join descendants d on ri.recipe_id = d.id
    where ri.sub_recipe_id is not null
      and ri.organization_id = public.get_my_org()
  )
  select p_recipe_id = p_candidate_child_id or exists(select 1 from descendants where id = p_recipe_id);
$$;

create or replace function public.get_prepared_item_dependencies(p_recipe_id uuid)
returns table (
  recipe_id uuid, recipe_name text, recipe_status text, quantity numeric, unit text,
  yield_percentage numeric, cost_contribution numeric, is_prepared_item boolean
) language sql stable security invoker set search_path = public, pg_temp as $$
  select r.id, r.name, r.status, ri.quantity, ri.unit, ri.yield_percentage,
         coalesce(ri.quantity * ri.unit_cost_snapshot / nullif(ri.yield_percentage / 100.0, 0), 0),
         coalesce(r.is_batch, false)
  from public.recipe_ingredients ri
  join public.recipes r on r.id = ri.recipe_id and r.organization_id = ri.organization_id
  where ri.sub_recipe_id = p_recipe_id
    and ri.organization_id = public.get_my_org()
  order by r.name;
$$;

create or replace function public.recalculate_recipe_cost_tree(p_recipe_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_org uuid;
  v_total numeric := 0;
  v_yield numeric := 1;
  v_unit text := 'each';
  v_version integer;
  v_parent record;
begin
  select organization_id into v_org from public.recipes where id = p_recipe_id;
  if v_org is null or v_org <> public.get_my_org() then raise exception 'Recipe is outside the active organization'; end if;

  select coalesce(sum(coalesce(unit_cost_snapshot,0) * quantity / nullif(yield_percentage / 100.0,0)),0)
    into v_total from public.recipe_ingredients where recipe_id = p_recipe_id;
  select quantity, unit into v_yield, v_unit from public.recipe_yields
    where recipe_id = p_recipe_id and is_primary order by created_at limit 1;
  v_yield := coalesce(nullif(v_yield,0),1);

  update public.recipes set total_ingredient_cost=v_total, total_cost=v_total,
    cost_per_serving=v_total/v_yield, costing_version=costing_version+1, last_costed_at=now(), updated_at=now()
    where id=p_recipe_id returning costing_version into v_version;
  update public.recipe_yields set cost_per_unit=v_total/nullif(quantity,0), updated_at=now()
    where recipe_id=p_recipe_id;
  insert into public.recipe_cost_snapshots(organization_id,recipe_id,costing_version,total_cost,primary_yield_quantity,primary_yield_unit,cost_per_yield_unit,ingredient_snapshot)
    select v_org,p_recipe_id,v_version,v_total,v_yield,v_unit,v_total/v_yield,
      coalesce((select jsonb_agg(to_jsonb(ri) order by sort_order) from public.recipe_ingredients ri where ri.recipe_id=p_recipe_id),'[]'::jsonb);

  for v_parent in select distinct recipe_id from public.recipe_ingredients where sub_recipe_id=p_recipe_id loop
    update public.recipe_ingredients ri set unit_cost_snapshot=r.cost_per_serving, updated_at=now()
      from public.recipes r where ri.recipe_id=v_parent.recipe_id and ri.sub_recipe_id=r.id;
    perform public.recalculate_recipe_cost_tree(v_parent.recipe_id);
  end loop;
end;
$$;

create or replace function public.save_prepared_item_release1(
  p_recipe jsonb, p_yields jsonb, p_visibility jsonb, p_equipment_names jsonb,
  p_steps jsonb, p_ingredients jsonb
) returns public.recipes language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := nullif(p_recipe->>'organization_id','')::uuid;
  v_id uuid := nullif(p_recipe->>'id','')::uuid;
  v_recipe public.recipes;
  v_row jsonb;
  v_equipment_id uuid;
  v_child uuid;
begin
  if auth.uid() is null or v_org is null or v_org <> public.get_my_org() or not public.is_manager_or_above() then
    raise exception 'Not authorized to save Prepared Items';
  end if;
  if coalesce(trim(p_recipe->>'name'),'')='' then raise exception 'Name is required'; end if;
  if jsonb_typeof(p_yields)<>'array' or jsonb_array_length(p_yields)=0 then raise exception 'At least one yield is required'; end if;
  if not exists(select 1 from jsonb_array_elements(p_yields) x where coalesce((x->>'is_primary')::boolean,false)) then raise exception 'A primary yield is required'; end if;

  for v_row in select value from jsonb_array_elements(coalesce(p_ingredients,'[]'::jsonb)) loop
    v_child := nullif(v_row->>'sub_recipe_id','')::uuid;
    if v_child is not null and v_id is not null and public.recipe_dependency_would_cycle(v_id,v_child) then
      raise exception 'Circular Prepared Item dependency detected';
    end if;
    if coalesce((v_row->>'missing_conversion')::boolean,false) then raise exception 'A required unit conversion is missing'; end if;
  end loop;

  if v_id is null then
    insert into public.recipes(organization_id,brand_id,location_id,name,description,category,status,recipe_type_id,
      yield_quantity,yield_unit,yield_percentage,ingredients,instructions,total_ingredient_cost,total_cost,cost_per_serving,is_batch,shelf_life_quantity,shelf_life_unit,created_by)
    values(v_org,nullif(p_recipe->>'brand_id','')::uuid,nullif(p_recipe->>'location_id','')::uuid,trim(p_recipe->>'name'),nullif(p_recipe->>'description',''),
      'other',coalesce(nullif(p_recipe->>'status',''),'active'),nullif(p_recipe->>'recipe_type_id','')::uuid,
      (select (x->>'quantity')::numeric from jsonb_array_elements(p_yields) x where coalesce((x->>'is_primary')::boolean,false) limit 1),
      (select x->>'unit' from jsonb_array_elements(p_yields) x where coalesce((x->>'is_primary')::boolean,false) limit 1),100,p_ingredients,
      coalesce(p_recipe->>'instructions',''),0,0,0,true,nullif(p_recipe->>'shelf_life_quantity','')::numeric,nullif(p_recipe->>'shelf_life_unit',''),auth.uid()) returning * into v_recipe;
    v_id := v_recipe.id;
  else
    update public.recipes set name=trim(p_recipe->>'name'),description=nullif(p_recipe->>'description',''),status=coalesce(nullif(p_recipe->>'status',''),'active'),
      recipe_type_id=nullif(p_recipe->>'recipe_type_id','')::uuid,ingredients=p_ingredients,instructions=coalesce(p_recipe->>'instructions',''),is_batch=true,
      shelf_life_quantity=nullif(p_recipe->>'shelf_life_quantity','')::numeric,shelf_life_unit=nullif(p_recipe->>'shelf_life_unit',''),updated_at=now()
      where id=v_id and organization_id=v_org returning * into v_recipe;
    if v_recipe.id is null then raise exception 'Prepared Item not found'; end if;
  end if;

  for v_row in select value from jsonb_array_elements(coalesce(p_ingredients,'[]'::jsonb)) loop
    v_child := nullif(v_row->>'sub_recipe_id','')::uuid;
    if v_child is not null and public.recipe_dependency_would_cycle(v_id,v_child) then raise exception 'Circular Prepared Item dependency detected'; end if;
  end loop;

  delete from public.recipe_yields where recipe_id=v_id;
  for v_row in select value from jsonb_array_elements(p_yields) loop
    insert into public.recipe_yields(organization_id,recipe_id,quantity,unit,is_primary,cost_per_unit)
    values(v_org,v_id,(v_row->>'quantity')::numeric,trim(v_row->>'unit'),coalesce((v_row->>'is_primary')::boolean,false),null);
  end loop;
  delete from public.recipe_location_visibility where recipe_id=v_id;
  if coalesce(p_visibility->>'mode','all')='selected' then
    for v_row in select value from jsonb_array_elements(coalesce(p_visibility->'location_ids','[]'::jsonb)) loop
      insert into public.recipe_location_visibility(organization_id,recipe_id,location_id,is_visible)
      select v_org,v_id,trim(both '"' from v_row::text)::uuid,true from public.locations l
      where l.id=trim(both '"' from v_row::text)::uuid and l.organization_id=v_org;
    end loop;
  end if;
  delete from public.recipe_equipment_assignments where recipe_id=v_id;
  for v_row in select value from jsonb_array_elements(coalesce(p_equipment_names,'[]'::jsonb)) loop
    insert into public.recipe_equipment_catalog(organization_id,name) values(v_org,trim(both '"' from v_row::text))
      on conflict(organization_id,lower(name)) do update set is_active=true,updated_at=now() returning id into v_equipment_id;
    insert into public.recipe_equipment_assignments(organization_id,recipe_id,equipment_id) values(v_org,v_id,v_equipment_id) on conflict do nothing;
  end loop;
  delete from public.recipe_preparation_steps where recipe_id=v_id;
  for v_row in select value from jsonb_array_elements(coalesce(p_steps,'[]'::jsonb)) loop
    insert into public.recipe_preparation_steps(organization_id,recipe_id,step_number,instruction,notes)
    values(v_org,v_id,(v_row->>'step_number')::integer,trim(v_row->>'instruction'),nullif(v_row->>'notes',''));
  end loop;

  perform public.recalculate_recipe_cost_tree(v_id);
  select * into v_recipe from public.recipes where id=v_id;
  return v_recipe;
end;
$$;

create or replace function public.deactivate_prepared_item(p_recipe_id uuid)
returns public.recipes language plpgsql security definer set search_path=public,pg_temp as $$
declare v_recipe public.recipes; begin
  if not public.is_manager_or_above() then raise exception 'Not authorized'; end if;
  update public.recipes set status='inactive',updated_at=now() where id=p_recipe_id and organization_id=public.get_my_org() and is_batch=true returning * into v_recipe;
  return v_recipe;
end; $$;

create or replace function public.delete_prepared_item(p_recipe_id uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not public.is_manager_or_above() then raise exception 'Not authorized'; end if;
  if exists(select 1 from public.recipe_ingredients where sub_recipe_id=p_recipe_id and organization_id=public.get_my_org()) then
    raise exception 'Prepared Item is in use and cannot be deleted';
  end if;
  delete from public.recipes where id=p_recipe_id and organization_id=public.get_my_org() and is_batch=true;
end; $$;

revoke all on function public.save_prepared_item_release1(jsonb,jsonb,jsonb,jsonb,jsonb,jsonb) from public,anon;
revoke all on function public.deactivate_prepared_item(uuid) from public,anon;
revoke all on function public.delete_prepared_item(uuid) from public,anon;
grant execute on function public.save_prepared_item_release1(jsonb,jsonb,jsonb,jsonb,jsonb,jsonb) to authenticated,service_role;
grant execute on function public.deactivate_prepared_item(uuid) to authenticated,service_role;
grant execute on function public.delete_prepared_item(uuid) to authenticated,service_role;
grant execute on function public.get_prepared_item_dependencies(uuid) to authenticated,service_role;
grant execute on function public.recipe_dependency_would_cycle(uuid,uuid) to authenticated,service_role;

comment on table public.recipe_cost_snapshots is 'Immutable Recipe cost versions used for reliable downstream Prepared Item and Menu Item costing.';
comment on function public.delete_prepared_item(uuid) is 'Deletes only unused tenant-scoped Prepared Items; referenced components are blocked.';

commit;
