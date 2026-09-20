-- Optional tower/building hierarchy for projects that contain multiple
-- buildings. Existing projects, units and tours remain valid with NULL
-- building_id values.

create table public.project_buildings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  description text,
  floors_count integer,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_buildings_name_not_blank check (length(btrim(name)) > 0),
  constraint project_buildings_floors_count_positive check (
    floors_count is null or floors_count > 0
  ),
  constraint project_buildings_sort_order_nonnegative check (sort_order >= 0),
  constraint project_buildings_project_name_unique unique (project_id, name)
);

comment on table public.project_buildings is
  'Optional physical buildings/towers inside a real-estate project.';

create index project_buildings_project_sort_idx
  on public.project_buildings(project_id, sort_order, name);
create index project_buildings_tenant_id_idx
  on public.project_buildings(tenant_id);

alter table public.project_unit_types
  add column building_id uuid references public.project_buildings(id) on delete set null;

alter table public.virtual_tours
  add column building_id uuid references public.project_buildings(id) on delete restrict;

create index project_unit_types_building_id_idx
  on public.project_unit_types(building_id) where building_id is not null;
create index virtual_tours_building_id_idx
  on public.virtual_tours(building_id) where building_id is not null;
create index virtual_tours_published_project_scope_idx
  on public.virtual_tours(project_id, created_at)
  where is_published and building_id is null and unit_id is null;
create index virtual_tours_published_unit_idx
  on public.virtual_tours(unit_id, created_at)
  where is_published and unit_id is not null;

create function public.validate_project_building_ownership()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  project_tenant_id uuid;
begin
  select p.tenant_id
    into project_tenant_id
    from public.projects p
   where p.id = new.project_id;

  if project_tenant_id is null then
    raise exception 'building project does not exist or is not accessible';
  end if;

  if new.tenant_id is null then
    new.tenant_id := project_tenant_id;
  elsif new.tenant_id <> project_tenant_id then
    raise exception 'building tenant must match project tenant';
  end if;

  return new;
end;
$$;

create function public.validate_unit_building_ownership()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.building_id is not null and not exists (
    select 1
      from public.project_buildings b
     where b.id = new.building_id
       and b.project_id = new.project_id
       and b.tenant_id = new.tenant_id
  ) then
    raise exception 'unit building must belong to the selected project and tenant';
  end if;

  return new;
end;
$$;

create function public.sync_unit_tour_building()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.building_id is distinct from old.building_id then
    update public.virtual_tours
       set building_id = new.building_id
     where unit_id = new.id;
  end if;
  return new;
end;
$$;

-- Extend the Phase 2 ownership trigger so building and unit scope cannot be
-- mixed across projects or tenants. A unit tour inherits its unit's building
-- when the unit has one and the caller leaves building_id empty.
create or replace function public.validate_virtual_tour_ownership()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  project_tenant_id uuid;
  unit_building_id uuid;
begin
  select p.tenant_id
    into project_tenant_id
    from public.projects p
   where p.id = new.project_id;

  if project_tenant_id is null then
    raise exception 'virtual tour project does not exist or is not accessible';
  end if;

  if new.tenant_id is null then
    new.tenant_id := project_tenant_id;
  elsif new.tenant_id <> project_tenant_id then
    raise exception 'virtual tour tenant must match project tenant';
  end if;

  if new.building_id is not null and not exists (
    select 1
      from public.project_buildings b
     where b.id = new.building_id
       and b.project_id = new.project_id
       and b.tenant_id = project_tenant_id
  ) then
    raise exception 'virtual tour building must belong to the selected project and tenant';
  end if;

  if new.unit_id is not null then
    select u.building_id
      into unit_building_id
      from public.project_unit_types u
     where u.id = new.unit_id
       and u.project_id = new.project_id
       and u.tenant_id = project_tenant_id;

    if not found then
      raise exception 'virtual tour unit must belong to the selected project and tenant';
    end if;

    if unit_building_id is not null and new.building_id is null then
      new.building_id := unit_building_id;
    elsif unit_building_id is not null and new.building_id <> unit_building_id then
      raise exception 'virtual tour building must match the unit building';
    end if;
  end if;

  if tg_op = 'INSERT' and auth.uid() is not null then
    new.created_by := auth.uid();
  elsif tg_op = 'UPDATE' then
    new.created_by := old.created_by;
  end if;

  return new;
end;
$$;

revoke all on function public.validate_project_building_ownership()
  from public, anon, authenticated;
revoke all on function public.validate_unit_building_ownership()
  from public, anon, authenticated;
revoke all on function public.sync_unit_tour_building()
  from public, anon, authenticated;

create trigger trg_project_buildings_validate_ownership
  before insert or update of tenant_id, project_id
  on public.project_buildings
  for each row execute function public.validate_project_building_ownership();

create trigger trg_project_buildings_updated
  before update on public.project_buildings
  for each row execute function public.update_updated_at_column();

create trigger trg_project_unit_types_validate_building
  before insert or update of tenant_id, project_id, building_id
  on public.project_unit_types
  for each row execute function public.validate_unit_building_ownership();

create trigger trg_project_unit_types_sync_tour_building
  after update of building_id
  on public.project_unit_types
  for each row execute function public.sync_unit_tour_building();

drop trigger if exists trg_virtual_tours_validate_ownership on public.virtual_tours;
create trigger trg_virtual_tours_validate_ownership
  before insert or update of tenant_id, project_id, building_id, unit_id, created_by
  on public.virtual_tours
  for each row execute function public.validate_virtual_tour_ownership();

alter table public.project_buildings enable row level security;

grant select on public.project_buildings to anon, authenticated;
grant insert, update, delete on public.project_buildings to authenticated;
grant all on public.project_buildings to service_role;

create policy "Public reads buildings of public projects"
  on public.project_buildings for select to anon
  using (
    exists (
      select 1
        from public.projects p
       where p.id = project_buildings.project_id
         and p.is_public
    )
  );

create policy "Authenticated users read visible project buildings"
  on public.project_buildings for select to authenticated
  using (
    (select public.current_user_is_platform_owner())
    or tenant_id in (select public.current_tenant_ids())
    or exists (
      select 1
        from public.projects p
       where p.id = project_buildings.project_id
         and p.is_public
    )
  );

create policy "Project admins insert buildings"
  on public.project_buildings for insert to authenticated
  with check (
    (select public.current_user_is_platform_owner())
    or public.is_tenant_member(tenant_id, 'admin')
  );

create policy "Project admins update buildings"
  on public.project_buildings for update to authenticated
  using (
    (select public.current_user_is_platform_owner())
    or public.is_tenant_member(tenant_id, 'admin')
  )
  with check (
    (select public.current_user_is_platform_owner())
    or public.is_tenant_member(tenant_id, 'admin')
  );

create policy "Project admins delete buildings"
  on public.project_buildings for delete to authenticated
  using (
    (select public.current_user_is_platform_owner())
    or public.is_tenant_member(tenant_id, 'admin')
  );
