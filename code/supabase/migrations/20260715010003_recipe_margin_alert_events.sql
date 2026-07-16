begin;

create table if not exists public.recipe_margin_alert_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  event_type text not null,
  message text not null,
  previous_value jsonb,
  current_value jsonb,
  plate_cost_percent numeric,
  target_plate_cost_percent numeric,
  actor_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint recipe_margin_alert_events_type_check check (event_type in (
    'cost_changed', 'price_changed', 'target_changed', 'monitoring_changed',
    'threshold_exceeded', 'threshold_recovered'
  ))
);

create index if not exists idx_recipe_margin_alert_events_recipe_created
  on public.recipe_margin_alert_events (recipe_id, created_at desc);
create index if not exists idx_recipe_margin_alert_events_org_created
  on public.recipe_margin_alert_events (organization_id, created_at desc);

alter table public.recipe_margin_alert_events enable row level security;

drop policy if exists recipe_margin_alert_events_select on public.recipe_margin_alert_events;
create policy recipe_margin_alert_events_select on public.recipe_margin_alert_events for select
  using (organization_id = public.get_my_org());

create or replace function public.record_recipe_margin_alert_events()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  old_cost numeric := coalesce(old.cost_per_serving, 0);
  new_cost numeric := coalesce(new.cost_per_serving, 0);
  old_price numeric := coalesce(old.selling_price, 0);
  new_price numeric := coalesce(new.selling_price, 0);
  old_target numeric := 100 - coalesce(old.target_margin_percent, 70);
  new_target numeric := 100 - coalesce(new.target_margin_percent, 70);
  old_plate numeric := case when old_price > 0 then old_cost / old_price * 100 else null end;
  new_plate numeric := case when new_price > 0 then new_cost / new_price * 100 else null end;
  old_alert text := coalesce(old.margin_alert_status, case when coalesce(old.margin_alert_enabled, false) then 'active' else 'none' end);
  new_alert text := coalesce(new.margin_alert_status, case when coalesce(new.margin_alert_enabled, false) then 'active' else 'none' end);
  actor uuid := auth.uid();
begin
  if new_cost is distinct from old_cost then
    insert into public.recipe_margin_alert_events (organization_id, recipe_id, event_type, message, previous_value, current_value, plate_cost_percent, target_plate_cost_percent, actor_user_id)
    values (new.organization_id, new.id, 'cost_changed', 'Unit cost changed', jsonb_build_object('cost', old_cost), jsonb_build_object('cost', new_cost), new_plate, new_target, actor);
  end if;

  if new_price is distinct from old_price then
    insert into public.recipe_margin_alert_events (organization_id, recipe_id, event_type, message, previous_value, current_value, plate_cost_percent, target_plate_cost_percent, actor_user_id)
    values (new.organization_id, new.id, 'price_changed', 'Menu price changed', jsonb_build_object('price', old_price), jsonb_build_object('price', new_price), new_plate, new_target, actor);
  end if;

  if new_target is distinct from old_target then
    insert into public.recipe_margin_alert_events (organization_id, recipe_id, event_type, message, previous_value, current_value, plate_cost_percent, target_plate_cost_percent, actor_user_id)
    values (new.organization_id, new.id, 'target_changed', 'Plate-cost target changed', jsonb_build_object('target_percent', old_target), jsonb_build_object('target_percent', new_target), new_plate, new_target, actor);
  end if;

  if new_alert is distinct from old_alert then
    insert into public.recipe_margin_alert_events (organization_id, recipe_id, event_type, message, previous_value, current_value, plate_cost_percent, target_plate_cost_percent, actor_user_id)
    values (new.organization_id, new.id, 'monitoring_changed', 'Cost monitoring changed', jsonb_build_object('status', old_alert), jsonb_build_object('status', new_alert), new_plate, new_target, actor);
  end if;

  if new_alert = 'active' and new_plate is not null then
    if (old_alert <> 'active' or old_plate is null or old_plate <= old_target) and new_plate > new_target then
      insert into public.recipe_margin_alert_events (organization_id, recipe_id, event_type, message, previous_value, current_value, plate_cost_percent, target_plate_cost_percent, actor_user_id)
      values (new.organization_id, new.id, 'threshold_exceeded', 'Plate cost exceeded its configured target', jsonb_build_object('plate_cost_percent', old_plate, 'target_percent', old_target), jsonb_build_object('plate_cost_percent', new_plate, 'target_percent', new_target), new_plate, new_target, actor);
    elsif old_alert = 'active' and old_plate > old_target and new_plate <= new_target then
      insert into public.recipe_margin_alert_events (organization_id, recipe_id, event_type, message, previous_value, current_value, plate_cost_percent, target_plate_cost_percent, actor_user_id)
      values (new.organization_id, new.id, 'threshold_recovered', 'Plate cost returned within its configured target', jsonb_build_object('plate_cost_percent', old_plate, 'target_percent', old_target), jsonb_build_object('plate_cost_percent', new_plate, 'target_percent', new_target), new_plate, new_target, actor);
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists recipes_record_margin_alert_events on public.recipes;
create trigger recipes_record_margin_alert_events
after update of cost_per_serving, selling_price, target_margin_percent, margin_alert_status, margin_alert_enabled
on public.recipes
for each row
execute function public.record_recipe_margin_alert_events();

comment on table public.recipe_margin_alert_events is
  'Immutable Recipe-owned history of cost, price, target, monitoring, and threshold-crossing changes.';

commit;
