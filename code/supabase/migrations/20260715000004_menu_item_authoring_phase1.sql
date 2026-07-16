begin;

alter table public.recipes
  add column if not exists shelf_life_quantity numeric(10,2),
  add column if not exists shelf_life_unit text;

alter table public.recipes
  drop constraint if exists recipes_shelf_life_quantity_check,
  drop constraint if exists recipes_shelf_life_unit_check;

alter table public.recipes
  add constraint recipes_shelf_life_quantity_check
    check (shelf_life_quantity is null or shelf_life_quantity > 0),
  add constraint recipes_shelf_life_unit_check
    check (shelf_life_unit is null or shelf_life_unit in ('hours', 'days', 'weeks'));

create table if not exists public.recipe_equipment_catalog (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_recipe_equipment_catalog_org_name
  on public.recipe_equipment_catalog (organization_id, lower(name));

create table if not exists public.recipe_equipment_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  equipment_id uuid not null references public.recipe_equipment_catalog(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (recipe_id, equipment_id)
);

create index if not exists idx_recipe_equipment_assignments_recipe
  on public.recipe_equipment_assignments (recipe_id);

create table if not exists public.recipe_preparation_steps (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  step_number integer not null check (step_number > 0),
  instruction text not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (recipe_id, step_number)
);

create index if not exists idx_recipe_preparation_steps_recipe
  on public.recipe_preparation_steps (recipe_id, step_number);

create table if not exists public.recipe_location_prices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  price numeric(12,2) not null check (price >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (recipe_id, location_id)
);

create index if not exists idx_recipe_location_prices_recipe
  on public.recipe_location_prices (recipe_id);

alter table public.recipe_equipment_catalog enable row level security;
alter table public.recipe_equipment_assignments enable row level security;
alter table public.recipe_preparation_steps enable row level security;
alter table public.recipe_location_prices enable row level security;

drop policy if exists recipe_equipment_catalog_select on public.recipe_equipment_catalog;
create policy recipe_equipment_catalog_select on public.recipe_equipment_catalog for select
  using (organization_id = public.get_my_org());
drop policy if exists recipe_equipment_catalog_manage on public.recipe_equipment_catalog;
create policy recipe_equipment_catalog_manage on public.recipe_equipment_catalog for all
  using (organization_id = public.get_my_org() and public.is_manager_or_above())
  with check (organization_id = public.get_my_org() and public.is_manager_or_above());

drop policy if exists recipe_equipment_assignments_select on public.recipe_equipment_assignments;
create policy recipe_equipment_assignments_select on public.recipe_equipment_assignments for select
  using (organization_id = public.get_my_org());
drop policy if exists recipe_equipment_assignments_manage on public.recipe_equipment_assignments;
create policy recipe_equipment_assignments_manage on public.recipe_equipment_assignments for all
  using (organization_id = public.get_my_org() and public.is_manager_or_above())
  with check (organization_id = public.get_my_org() and public.is_manager_or_above());

drop policy if exists recipe_preparation_steps_select on public.recipe_preparation_steps;
create policy recipe_preparation_steps_select on public.recipe_preparation_steps for select
  using (organization_id = public.get_my_org());
drop policy if exists recipe_preparation_steps_manage on public.recipe_preparation_steps;
create policy recipe_preparation_steps_manage on public.recipe_preparation_steps for all
  using (organization_id = public.get_my_org() and public.is_manager_or_above())
  with check (organization_id = public.get_my_org() and public.is_manager_or_above());

drop policy if exists recipe_location_prices_select on public.recipe_location_prices;
create policy recipe_location_prices_select on public.recipe_location_prices for select
  using (organization_id = public.get_my_org());
drop policy if exists recipe_location_prices_manage on public.recipe_location_prices;
create policy recipe_location_prices_manage on public.recipe_location_prices for all
  using (organization_id = public.get_my_org() and public.is_manager_or_above())
  with check (organization_id = public.get_my_org() and public.is_manager_or_above());

create or replace function public.sync_recipe_ingredients_from_jsonb()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  ing record;
  v_product_id uuid;
  v_sub_recipe_id uuid;
begin
  delete from public.recipe_ingredients where recipe_id = new.id;
  if new.ingredients is not null and jsonb_typeof(new.ingredients) = 'array' then
    for ing in select value, ordinality from jsonb_array_elements(new.ingredients) with ordinality
    loop
      v_product_id := nullif(ing.value->>'product_id', '')::uuid;
      v_sub_recipe_id := nullif(ing.value->>'sub_recipe_id', '')::uuid;
      if v_product_id is not null or v_sub_recipe_id is not null then
        insert into public.recipe_ingredients (
          organization_id, recipe_id, product_id, sub_recipe_id, quantity, unit,
          yield_percentage, cost_unit, unit_cost_snapshot, notes, sort_order
        ) values (
          new.organization_id, new.id, v_product_id, v_sub_recipe_id,
          coalesce(nullif(ing.value->>'quantity', '')::numeric, 0), ing.value->>'unit',
          coalesce(nullif(ing.value->>'yield_percentage', '')::numeric, 100),
          ing.value->>'cost_unit', coalesce(nullif(ing.value->>'unit_cost', '')::numeric, 0),
          nullif(ing.value->>'notes', ''), ing.ordinality - 1
        );
      end if;
    end loop;
  end if;
  return new;
end;
$$;

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
  v_recipe public.recipes;
  v_row jsonb;
  v_equipment_id uuid;
begin
  if auth.uid() is null or v_org is null or v_org <> public.get_my_org() or not public.is_manager_or_above() then
    raise exception 'Not authorized to save menu items';
  end if;
  if coalesce(trim(p_recipe->>'name'), '') = '' then raise exception 'Name is required'; end if;
  if jsonb_typeof(p_yields) <> 'array' or jsonb_array_length(p_yields) = 0 then raise exception 'At least one yield is required'; end if;

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

  delete from public.recipe_yields where recipe_id = v_recipe.id;
  for v_row in select value from jsonb_array_elements(p_yields)
  loop
    insert into public.recipe_yields (organization_id, recipe_id, quantity, unit, is_primary, cost_per_unit)
    values (v_org, v_recipe.id, (v_row->>'quantity')::numeric, trim(v_row->>'unit'), coalesce((v_row->>'is_primary')::boolean, false), nullif(v_row->>'cost_per_unit', '')::numeric);
  end loop;

  if coalesce(p_visibility->>'mode', 'all') = 'selected' then
    for v_row in select value from jsonb_array_elements(coalesce(p_visibility->'location_ids', '[]'::jsonb))
    loop
      insert into public.recipe_location_visibility (organization_id, recipe_id, location_id, is_visible)
      select v_org, v_recipe.id, trim(both '"' from v_row::text)::uuid, true
      from public.locations l
      where l.id = trim(both '"' from v_row::text)::uuid and l.organization_id = v_org;
    end loop;
  end if;

  for v_row in select value from jsonb_array_elements(coalesce(p_equipment_names, '[]'::jsonb))
  loop
    insert into public.recipe_equipment_catalog (organization_id, name)
    values (v_org, trim(both '"' from v_row::text))
    on conflict (organization_id, lower(name)) do update set is_active = true, updated_at = now()
    returning id into v_equipment_id;
    insert into public.recipe_equipment_assignments (organization_id, recipe_id, equipment_id)
    values (v_org, v_recipe.id, v_equipment_id) on conflict do nothing;
  end loop;

  for v_row in select value from jsonb_array_elements(coalesce(p_steps, '[]'::jsonb))
  loop
    insert into public.recipe_preparation_steps (organization_id, recipe_id, step_number, instruction, notes)
    values (v_org, v_recipe.id, (v_row->>'step_number')::integer, trim(v_row->>'instruction'), nullif(v_row->>'notes', ''));
  end loop;

  for v_row in select value from jsonb_array_elements(coalesce(p_location_prices, '[]'::jsonb))
  loop
    insert into public.recipe_location_prices (organization_id, recipe_id, location_id, price)
    select v_org, v_recipe.id, (v_row->>'location_id')::uuid, (v_row->>'price')::numeric
    from public.locations l
    where l.id = (v_row->>'location_id')::uuid and l.organization_id = v_org;
  end loop;

  return v_recipe;
end;
$$;

revoke all on function public.save_menu_item_phase1(jsonb, jsonb, jsonb, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.save_menu_item_phase1(jsonb, jsonb, jsonb, jsonb, jsonb, jsonb) to authenticated, service_role;

comment on function public.save_menu_item_phase1(jsonb, jsonb, jsonb, jsonb, jsonb, jsonb) is
  'Atomically creates a tenant-scoped Menu Item and its Phase 1 Recipe-owned child records.';

commit;
