-- Persist the Menu Items cost-alert lifecycle while preserving the legacy boolean.
alter table public.recipes
  add column if not exists margin_alert_status text;

update public.recipes
set margin_alert_status = case
  when coalesce(margin_alert_enabled, false) then 'active'
  else 'none'
end
where margin_alert_status is null;

alter table public.recipes
  alter column margin_alert_status drop default,
  alter column margin_alert_status set not null;

alter table public.recipes
  drop constraint if exists recipes_margin_alert_status_check;

alter table public.recipes
  add constraint recipes_margin_alert_status_check
  check (margin_alert_status in ('active', 'paused', 'none'));

create or replace function public.sync_recipe_margin_alert_lifecycle()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.margin_alert_status is distinct from old.margin_alert_status then
    new.margin_alert_enabled := new.margin_alert_status = 'active';
  elsif tg_op = 'UPDATE' and new.margin_alert_enabled is distinct from old.margin_alert_enabled then
    new.margin_alert_status := case when new.margin_alert_enabled then 'active' else 'none' end;
  else
    new.margin_alert_status := coalesce(
      new.margin_alert_status,
      case when coalesce(new.margin_alert_enabled, false) then 'active' else 'none' end
    );
    new.margin_alert_enabled := new.margin_alert_status = 'active';
  end if;
  return new;
end;
$$;

drop trigger if exists recipes_sync_margin_alert_lifecycle on public.recipes;
create trigger recipes_sync_margin_alert_lifecycle
before insert or update of margin_alert_status, margin_alert_enabled
on public.recipes
for each row
execute function public.sync_recipe_margin_alert_lifecycle();

comment on column public.recipes.margin_alert_status is
  'Cost monitoring lifecycle: active, paused, or none. Kept compatible with margin_alert_enabled.';
