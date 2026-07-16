begin;

create table if not exists public.recipe_location_visibility (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  location_id uuid references public.locations(id) on delete cascade,
  is_visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((location_id is not null and is_visible) or (location_id is null and not is_visible))
);

create unique index if not exists uq_recipe_location_visibility_location
  on public.recipe_location_visibility (recipe_id, location_id)
  where location_id is not null;
create unique index if not exists uq_recipe_location_visibility_hidden
  on public.recipe_location_visibility (recipe_id)
  where location_id is null;
create index if not exists idx_recipe_location_visibility_org
  on public.recipe_location_visibility (organization_id);

alter table public.recipe_location_visibility enable row level security;

drop policy if exists recipe_location_visibility_select on public.recipe_location_visibility;
create policy recipe_location_visibility_select on public.recipe_location_visibility for select
  using (organization_id = public.get_my_org());
drop policy if exists recipe_location_visibility_manage on public.recipe_location_visibility;
create policy recipe_location_visibility_manage on public.recipe_location_visibility for all
  using (organization_id = public.get_my_org() and public.is_manager_or_above())
  with check (organization_id = public.get_my_org() and public.is_manager_or_above());

comment on table public.recipe_location_visibility is
  'No rows means all locations; a null-location false row means hidden; visible location rows mean selected locations.';

commit;
