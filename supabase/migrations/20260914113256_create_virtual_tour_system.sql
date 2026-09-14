-- Additive 360 virtual-tour data layer. This migration intentionally leaves
-- projects.tour_360_url in place as the legacy external-tour fallback.

create table public.virtual_tours (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  unit_id uuid references public.project_unit_types(id) on delete set null,
  name text not null,
  description text,
  thumbnail_url text,
  is_published boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint virtual_tours_name_not_blank check (length(btrim(name)) > 0)
);

create table public.tour_floors (
  id uuid primary key default gen_random_uuid(),
  tour_id uuid not null references public.virtual_tours(id) on delete cascade,
  name text not null,
  floor_number integer,
  floor_plan_url text,
  width integer,
  height integer,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tour_floors_name_not_blank check (length(btrim(name)) > 0),
  constraint tour_floors_width_positive check (width is null or width > 0),
  constraint tour_floors_height_positive check (height is null or height > 0),
  constraint tour_floors_sort_order_nonnegative check (sort_order >= 0)
);

create table public.tour_scenes (
  id uuid primary key default gen_random_uuid(),
  tour_id uuid not null references public.virtual_tours(id) on delete cascade,
  floor_id uuid references public.tour_floors(id) on delete set null,
  name text not null,
  description text,
  panorama_url text not null,
  thumbnail_url text,
  initial_yaw double precision not null default 0,
  initial_pitch double precision not null default 0,
  initial_hfov double precision,
  floor_plan_x double precision,
  floor_plan_y double precision,
  panorama_type text not null default 'equirectangular',
  multires_config jsonb,
  sort_order integer not null default 0,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tour_scenes_name_not_blank check (length(btrim(name)) > 0),
  constraint tour_scenes_panorama_url_not_blank check (length(btrim(panorama_url)) > 0),
  constraint tour_scenes_initial_yaw_range check (initial_yaw between -360 and 360),
  constraint tour_scenes_initial_pitch_range check (initial_pitch between -90 and 90),
  constraint tour_scenes_initial_hfov_range check (
    initial_hfov is null or initial_hfov between 1 and 180
  ),
  constraint tour_scenes_floor_plan_x_normalized check (
    floor_plan_x is null or floor_plan_x between 0 and 1
  ),
  constraint tour_scenes_floor_plan_y_normalized check (
    floor_plan_y is null or floor_plan_y between 0 and 1
  ),
  constraint tour_scenes_floor_plan_coordinates_pair check (
    (floor_plan_x is null) = (floor_plan_y is null)
  ),
  constraint tour_scenes_panorama_type check (
    panorama_type in ('equirectangular', 'multires')
  ),
  constraint tour_scenes_multires_config_object check (
    multires_config is null or jsonb_typeof(multires_config) = 'object'
  ),
  constraint tour_scenes_sort_order_nonnegative check (sort_order >= 0)
);

create table public.tour_hotspots (
  id uuid primary key default gen_random_uuid(),
  scene_id uuid not null references public.tour_scenes(id) on delete cascade,
  target_scene_id uuid references public.tour_scenes(id) on delete set null,
  type text not null,
  label text,
  yaw double precision not null,
  pitch double precision not null,
  icon text,
  metadata jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tour_hotspots_type check (
    type in ('navigation', 'information', 'unit', 'amenity', 'external_link')
  ),
  -- Pannellum reports yaw in degrees around the horizon and pitch from -90 to
  -- 90. A wrapped yaw range is retained so editors can preserve one full turn.
  constraint tour_hotspots_yaw_range check (yaw between -360 and 360),
  constraint tour_hotspots_pitch_range check (pitch between -90 and 90),
  constraint tour_hotspots_metadata_object check (jsonb_typeof(metadata) = 'object'),
  constraint tour_hotspots_sort_order_nonnegative check (sort_order >= 0)
);

comment on table public.virtual_tours is
  'Project or unit virtual tours. Legacy projects.tour_360_url remains supported separately.';
comment on column public.tour_scenes.floor_plan_x is
  'Normalized horizontal floor-plan coordinate from 0 through 1.';
comment on column public.tour_scenes.floor_plan_y is
  'Normalized vertical floor-plan coordinate from 0 through 1.';
comment on column public.tour_hotspots.yaw is
  'Pannellum-compatible horizontal angle in degrees; accepted range -360 through 360.';
comment on column public.tour_hotspots.pitch is
  'Pannellum-compatible vertical angle in degrees; accepted range -90 through 90.';

create index virtual_tours_project_id_idx on public.virtual_tours(project_id);
create index virtual_tours_unit_id_idx on public.virtual_tours(unit_id) where unit_id is not null;
create index virtual_tours_tenant_id_idx on public.virtual_tours(tenant_id);
create index virtual_tours_created_by_idx on public.virtual_tours(created_by) where created_by is not null;
create index virtual_tours_is_published_idx on public.virtual_tours(is_published);
create index virtual_tours_published_project_idx
  on public.virtual_tours(project_id, id) where is_published;

create index tour_floors_tour_sort_idx on public.tour_floors(tour_id, sort_order);

create index tour_scenes_tour_sort_idx on public.tour_scenes(tour_id, sort_order);
create index tour_scenes_floor_id_idx on public.tour_scenes(floor_id) where floor_id is not null;
create index tour_scenes_is_published_idx on public.tour_scenes(is_published);
create index tour_scenes_published_tour_idx
  on public.tour_scenes(tour_id, sort_order) where is_published;

create index tour_hotspots_scene_sort_idx on public.tour_hotspots(scene_id, sort_order);
create index tour_hotspots_target_scene_id_idx
  on public.tour_hotspots(target_scene_id) where target_scene_id is not null;

-- Derive and validate tour ownership from the canonical project row. A caller
-- may omit tenant_id, but cannot move a project or unit across tenants.
create function public.validate_virtual_tour_ownership()
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
    raise exception 'virtual tour project does not exist or is not accessible';
  end if;

  if new.tenant_id is null then
    new.tenant_id := project_tenant_id;
  elsif new.tenant_id <> project_tenant_id then
    raise exception 'virtual tour tenant must match project tenant';
  end if;

  if new.unit_id is not null and not exists (
    select 1
      from public.project_unit_types u
     where u.id = new.unit_id
       and u.project_id = new.project_id
       and u.tenant_id = project_tenant_id
  ) then
    raise exception 'virtual tour unit must belong to the selected project and tenant';
  end if;

  if tg_op = 'INSERT' and auth.uid() is not null then
    new.created_by := auth.uid();
  elsif tg_op = 'UPDATE' then
    new.created_by := old.created_by;
  end if;

  return new;
end;
$$;

create function public.validate_tour_scene_floor()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.floor_id is not null and not exists (
    select 1
      from public.tour_floors f
     where f.id = new.floor_id
       and f.tour_id = new.tour_id
  ) then
    raise exception 'scene floor must belong to the same tour';
  end if;
  return new;
end;
$$;

create function public.validate_tour_hotspot_target()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  source_tour_id uuid;
  target_tour_id uuid;
begin
  select s.tour_id into source_tour_id
    from public.tour_scenes s
   where s.id = new.scene_id;

  if source_tour_id is null then
    raise exception 'hotspot source scene does not exist or is not accessible';
  end if;

  if new.target_scene_id is not null then
    select s.tour_id into target_tour_id
      from public.tour_scenes s
     where s.id = new.target_scene_id;

    if target_tour_id is null or target_tour_id <> source_tour_id then
      raise exception 'hotspot target scene must belong to the same tour';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.validate_virtual_tour_ownership() from public, anon, authenticated;
revoke all on function public.validate_tour_scene_floor() from public, anon, authenticated;
revoke all on function public.validate_tour_hotspot_target() from public, anon, authenticated;

create trigger trg_virtual_tours_validate_ownership
  before insert or update of tenant_id, project_id, unit_id, created_by
  on public.virtual_tours
  for each row execute function public.validate_virtual_tour_ownership();

create trigger trg_tour_scenes_validate_floor
  before insert or update of tour_id, floor_id
  on public.tour_scenes
  for each row execute function public.validate_tour_scene_floor();

create trigger trg_tour_hotspots_validate_target
  before insert or update of scene_id, target_scene_id
  on public.tour_hotspots
  for each row execute function public.validate_tour_hotspot_target();

create trigger trg_virtual_tours_updated
  before update on public.virtual_tours
  for each row execute function public.update_updated_at_column();
create trigger trg_tour_floors_updated
  before update on public.tour_floors
  for each row execute function public.update_updated_at_column();
create trigger trg_tour_scenes_updated
  before update on public.tour_scenes
  for each row execute function public.update_updated_at_column();
create trigger trg_tour_hotspots_updated
  before update on public.tour_hotspots
  for each row execute function public.update_updated_at_column();

alter table public.virtual_tours enable row level security;
alter table public.tour_floors enable row level security;
alter table public.tour_scenes enable row level security;
alter table public.tour_hotspots enable row level security;

grant select on public.virtual_tours, public.tour_floors, public.tour_scenes, public.tour_hotspots
  to anon, authenticated;
grant insert, update, delete on public.virtual_tours, public.tour_floors, public.tour_scenes, public.tour_hotspots
  to authenticated;
grant all on public.virtual_tours, public.tour_floors, public.tour_scenes, public.tour_hotspots
  to service_role;

create policy "Public reads published virtual tours"
  on public.virtual_tours for select to anon
  using (
    is_published
    and exists (
      select 1 from public.projects p
       where p.id = virtual_tours.project_id and p.is_public
    )
  );

create policy "Tenant members read virtual tours"
  on public.virtual_tours for select to authenticated
  using (
    (select public.has_role((select auth.uid()), 'admin'))
    or tenant_id in (select public.current_tenant_ids())
  );

create policy "Tour admins insert virtual tours"
  on public.virtual_tours for insert to authenticated
  with check (
    (select public.current_user_is_platform_owner())
    or public.is_tenant_member(tenant_id, 'admin')
  );
create policy "Tour admins update virtual tours"
  on public.virtual_tours for update to authenticated
  using (
    (select public.current_user_is_platform_owner())
    or public.is_tenant_member(tenant_id, 'admin')
  )
  with check (
    (select public.current_user_is_platform_owner())
    or public.is_tenant_member(tenant_id, 'admin')
  );
create policy "Tour admins delete virtual tours"
  on public.virtual_tours for delete to authenticated
  using (
    (select public.current_user_is_platform_owner())
    or public.is_tenant_member(tenant_id, 'admin')
  );

create function public.can_manage_virtual_tour(_tour_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1
      from public.virtual_tours vt
     where vt.id = _tour_id
       and (
         (select public.current_user_is_platform_owner())
         or public.is_tenant_member(vt.tenant_id, 'admin')
       )
  );
$$;

create function public.can_manage_virtual_tour_scene(_scene_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1
      from public.tour_scenes s
     where s.id = _scene_id
       and public.can_manage_virtual_tour(s.tour_id)
  );
$$;

revoke all on function public.can_manage_virtual_tour(uuid) from public, anon;
revoke all on function public.can_manage_virtual_tour_scene(uuid) from public, anon;
grant execute on function public.can_manage_virtual_tour(uuid) to authenticated;
grant execute on function public.can_manage_virtual_tour_scene(uuid) to authenticated;

create policy "Public reads floors of published tours"
  on public.tour_floors for select to anon
  using (
    exists (
      select 1
        from public.virtual_tours vt
        join public.projects p on p.id = vt.project_id
       where vt.id = tour_floors.tour_id
         and vt.is_published
         and p.is_public
    )
  );
create policy "Tenant members read tour floors"
  on public.tour_floors for select to authenticated
  using (
    exists (
      select 1
        from public.virtual_tours vt
       where vt.id = tour_floors.tour_id
         and (
           (select public.has_role((select auth.uid()), 'admin'))
           or vt.tenant_id in (select public.current_tenant_ids())
         )
    )
  );
create policy "Tour admins insert floors"
  on public.tour_floors for insert to authenticated
  with check (public.can_manage_virtual_tour(tour_id));
create policy "Tour admins update floors"
  on public.tour_floors for update to authenticated
  using (public.can_manage_virtual_tour(tour_id))
  with check (public.can_manage_virtual_tour(tour_id));
create policy "Tour admins delete floors"
  on public.tour_floors for delete to authenticated
  using (public.can_manage_virtual_tour(tour_id));

create policy "Public reads published tour scenes"
  on public.tour_scenes for select to anon
  using (
    is_published
    and exists (
      select 1
        from public.virtual_tours vt
        join public.projects p on p.id = vt.project_id
       where vt.id = tour_scenes.tour_id
         and vt.is_published
         and p.is_public
    )
  );
create policy "Tenant members read tour scenes"
  on public.tour_scenes for select to authenticated
  using (
    exists (
      select 1
        from public.virtual_tours vt
       where vt.id = tour_scenes.tour_id
         and (
           (select public.has_role((select auth.uid()), 'admin'))
           or vt.tenant_id in (select public.current_tenant_ids())
         )
    )
  );
create policy "Tour admins insert scenes"
  on public.tour_scenes for insert to authenticated
  with check (public.can_manage_virtual_tour(tour_id));
create policy "Tour admins update scenes"
  on public.tour_scenes for update to authenticated
  using (public.can_manage_virtual_tour(tour_id))
  with check (public.can_manage_virtual_tour(tour_id));
create policy "Tour admins delete scenes"
  on public.tour_scenes for delete to authenticated
  using (public.can_manage_virtual_tour(tour_id));

create policy "Public reads hotspots of published scenes"
  on public.tour_hotspots for select to anon
  using (
    exists (
      select 1
        from public.tour_scenes source_scene
        join public.virtual_tours vt on vt.id = source_scene.tour_id
        join public.projects p on p.id = vt.project_id
       where source_scene.id = tour_hotspots.scene_id
         and source_scene.is_published
         and vt.is_published
         and p.is_public
    )
    and (
      type <> 'navigation'
      or (
        target_scene_id is not null
        and exists (
          select 1 from public.tour_scenes target_scene
           where target_scene.id = tour_hotspots.target_scene_id
             and target_scene.is_published
        )
      )
    )
  );
create policy "Tenant members read tour hotspots"
  on public.tour_hotspots for select to authenticated
  using (
    exists (
      select 1
        from public.tour_scenes s
        join public.virtual_tours vt on vt.id = s.tour_id
       where s.id = tour_hotspots.scene_id
         and (
           (select public.has_role((select auth.uid()), 'admin'))
           or vt.tenant_id in (select public.current_tenant_ids())
         )
    )
  );
create policy "Tour admins insert hotspots"
  on public.tour_hotspots for insert to authenticated
  with check (public.can_manage_virtual_tour_scene(scene_id));
create policy "Tour admins update hotspots"
  on public.tour_hotspots for update to authenticated
  using (public.can_manage_virtual_tour_scene(scene_id))
  with check (public.can_manage_virtual_tour_scene(scene_id));
create policy "Tour admins delete hotspots"
  on public.tour_hotspots for delete to authenticated
  using (public.can_manage_virtual_tour_scene(scene_id));

-- Private buckets keep downloads behind RLS / signed URLs. The panorama limit
-- uses the Supabase Free-plan ceiling; thumbnails and floor plans stay smaller.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('tour-panoramas', 'tour-panoramas', false, 52428800, array['image/jpeg','image/png','image/webp']),
  ('tour-thumbnails', 'tour-thumbnails', false, 5242880, array['image/jpeg','image/png','image/webp']),
  ('tour-floorplans', 'tour-floorplans', false, 10485760, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create function public.virtual_tour_storage_object_can_read(
  _bucket_id text,
  _object_name text
)
returns boolean
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  parts text[] := string_to_array(_object_name, '/');
  path_tenant_id uuid;
  path_project_id uuid;
  path_tour_id uuid;
  path_entity_id uuid;
begin
  if _bucket_id not in ('tour-panoramas', 'tour-thumbnails', 'tour-floorplans')
     or coalesce(array_length(parts, 1), 0) < 8
     or parts[2] <> 'projects'
     or parts[4] <> 'tours'
     or parts[1] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or parts[3] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or parts[5] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or parts[7] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  then
    return false;
  end if;

  path_tenant_id := parts[1]::uuid;
  path_project_id := parts[3]::uuid;
  path_tour_id := parts[5]::uuid;
  path_entity_id := parts[7]::uuid;

  if _bucket_id in ('tour-panoramas', 'tour-thumbnails') and parts[6] = 'scenes' then
    return exists (
      select 1
        from public.tour_scenes s
        join public.virtual_tours vt on vt.id = s.tour_id
        join public.projects p on p.id = vt.project_id
       where s.id = path_entity_id
         and vt.id = path_tour_id
         and vt.project_id = path_project_id
         and vt.tenant_id = path_tenant_id
         and (
           (
             (select auth.uid()) is null
             and s.is_published
             and vt.is_published
             and p.is_public
           )
           or (
             (select auth.uid()) is not null
             and (
               (select public.has_role((select auth.uid()), 'admin'))
               or vt.tenant_id in (select public.current_tenant_ids())
             )
           )
         )
    );
  elsif _bucket_id = 'tour-floorplans' and parts[6] = 'floors' then
    return exists (
      select 1
        from public.tour_floors f
        join public.virtual_tours vt on vt.id = f.tour_id
        join public.projects p on p.id = vt.project_id
       where f.id = path_entity_id
         and vt.id = path_tour_id
         and vt.project_id = path_project_id
         and vt.tenant_id = path_tenant_id
         and (
           (
             (select auth.uid()) is null
             and vt.is_published
             and p.is_public
           )
           or (
             (select auth.uid()) is not null
             and (
               (select public.has_role((select auth.uid()), 'admin'))
               or vt.tenant_id in (select public.current_tenant_ids())
             )
           )
         )
    );
  end if;

  return false;
end;
$$;

create function public.virtual_tour_storage_object_can_manage(
  _bucket_id text,
  _object_name text
)
returns boolean
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  parts text[] := string_to_array(_object_name, '/');
  path_tenant_id uuid;
  path_project_id uuid;
  path_tour_id uuid;
  path_entity_id uuid;
begin
  if coalesce(array_length(parts, 1), 0) < 8
     or parts[2] <> 'projects'
     or parts[4] <> 'tours'
     or parts[1] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or parts[3] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or parts[5] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or parts[7] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  then
    return false;
  end if;

  path_tenant_id := parts[1]::uuid;
  path_project_id := parts[3]::uuid;
  path_tour_id := parts[5]::uuid;
  path_entity_id := parts[7]::uuid;

  if _bucket_id in ('tour-panoramas', 'tour-thumbnails') and parts[6] = 'scenes' then
    return exists (
      select 1
        from public.tour_scenes s
        join public.virtual_tours vt on vt.id = s.tour_id
       where s.id = path_entity_id
         and vt.id = path_tour_id
         and vt.project_id = path_project_id
         and vt.tenant_id = path_tenant_id
         and (
           (select public.current_user_is_platform_owner())
           or public.is_tenant_member(vt.tenant_id, 'admin')
         )
    );
  elsif _bucket_id = 'tour-floorplans' and parts[6] = 'floors' then
    return exists (
      select 1
        from public.tour_floors f
        join public.virtual_tours vt on vt.id = f.tour_id
       where f.id = path_entity_id
         and vt.id = path_tour_id
         and vt.project_id = path_project_id
         and vt.tenant_id = path_tenant_id
         and (
           (select public.current_user_is_platform_owner())
           or public.is_tenant_member(vt.tenant_id, 'admin')
         )
    );
  end if;

  return false;
end;
$$;

revoke all on function public.virtual_tour_storage_object_can_read(text, text)
  from public;
revoke all on function public.virtual_tour_storage_object_can_manage(text, text)
  from public, anon;
grant execute on function public.virtual_tour_storage_object_can_read(text, text)
  to anon, authenticated;
grant execute on function public.virtual_tour_storage_object_can_manage(text, text)
  to authenticated;

-- These policies are bucket-scoped and leave all existing project-media
-- policies unchanged.
create policy "Virtual tour assets read"
  on storage.objects for select to anon, authenticated
  using (
    bucket_id in ('tour-panoramas', 'tour-thumbnails', 'tour-floorplans')
    and public.virtual_tour_storage_object_can_read(bucket_id, name)
  );

create policy "Virtual tour admins upload assets"
  on storage.objects for insert to authenticated
  with check (
    bucket_id in ('tour-panoramas', 'tour-thumbnails', 'tour-floorplans')
    and public.virtual_tour_storage_object_can_manage(bucket_id, name)
  );

create policy "Virtual tour admins update assets"
  on storage.objects for update to authenticated
  using (
    bucket_id in ('tour-panoramas', 'tour-thumbnails', 'tour-floorplans')
    and public.virtual_tour_storage_object_can_manage(bucket_id, name)
  )
  with check (
    bucket_id in ('tour-panoramas', 'tour-thumbnails', 'tour-floorplans')
    and public.virtual_tour_storage_object_can_manage(bucket_id, name)
  );

create policy "Virtual tour admins delete assets"
  on storage.objects for delete to authenticated
  using (
    bucket_id in ('tour-panoramas', 'tour-thumbnails', 'tour-floorplans')
    and public.virtual_tour_storage_object_can_manage(bucket_id, name)
  );
