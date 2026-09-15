-- Phase 2 integration checks. Every fixture is created inside one transaction
-- and rolled back; this file must never leave production demo data behind.
begin;

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data
) values (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'phase2-virtual-tour-test@example.invalid',
  '',
  now(),
  now(),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb
);

insert into public.tenants (id, name, slug) values
  ('00000000-0000-4000-8000-00000000a001', 'Phase 2 tenant A', 'phase2-vt-test-a'),
  ('00000000-0000-4000-8000-00000000a002', 'Phase 2 tenant B', 'phase2-vt-test-b');

insert into public.tenant_members (tenant_id, user_id, role) values
  ('00000000-0000-4000-8000-00000000a001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'owner');

insert into public.projects (id, tenant_id, slug, name, lat, lng, is_public) values
  ('00000000-0000-4000-8000-00000000b001', '00000000-0000-4000-8000-00000000a001', 'phase2-vt-project-a', 'Phase 2 project A', 25, 55, true),
  ('00000000-0000-4000-8000-00000000b002', '00000000-0000-4000-8000-00000000a002', 'phase2-vt-project-b', 'Phase 2 project B', 25, 55, false);

insert into public.project_unit_types (id, tenant_id, project_id, label) values
  ('00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-00000000a001', '00000000-0000-4000-8000-00000000b001', 'Test unit');

insert into public.virtual_tours (
  id, tenant_id, project_id, unit_id, name, is_published, updated_at
) values
  ('00000000-0000-4000-8000-00000000d001', '00000000-0000-4000-8000-00000000a001', '00000000-0000-4000-8000-00000000b001', '00000000-0000-4000-8000-00000000c001', 'Published tour A', true, now() - interval '1 minute'),
  ('00000000-0000-4000-8000-00000000d002', '00000000-0000-4000-8000-00000000a001', '00000000-0000-4000-8000-00000000b001', null, 'Unpublished tour A', false, now() - interval '1 minute'),
  ('00000000-0000-4000-8000-00000000d003', '00000000-0000-4000-8000-00000000a002', '00000000-0000-4000-8000-00000000b002', null, 'Private tenant B tour', true, now() - interval '1 minute');

insert into public.tour_floors (id, tour_id, name) values
  ('00000000-0000-4000-8000-00000000e001', '00000000-0000-4000-8000-00000000d001', 'Ground'),
  ('00000000-0000-4000-8000-00000000e002', '00000000-0000-4000-8000-00000000d003', 'Private');

insert into public.tour_scenes (
  id, tour_id, floor_id, name, panorama_url, floor_plan_x, floor_plan_y, is_published
) values
  ('00000000-0000-4000-8000-00000000f001', '00000000-0000-4000-8000-00000000d001', '00000000-0000-4000-8000-00000000e001', 'Entrance', 'entrance.jpg', 0.2, 0.3, true),
  ('00000000-0000-4000-8000-00000000f002', '00000000-0000-4000-8000-00000000d001', '00000000-0000-4000-8000-00000000e001', 'Lobby', 'lobby.jpg', 0.5, 0.5, true),
  ('00000000-0000-4000-8000-00000000f003', '00000000-0000-4000-8000-00000000d001', '00000000-0000-4000-8000-00000000e001', 'Draft', 'draft.jpg', null, null, false),
  ('00000000-0000-4000-8000-00000000f004', '00000000-0000-4000-8000-00000000d003', '00000000-0000-4000-8000-00000000e002', 'Private', 'private.jpg', null, null, true);

insert into public.tour_hotspots (
  id, scene_id, target_scene_id, type, label, yaw, pitch
) values (
  '10000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-00000000f001',
  '00000000-0000-4000-8000-00000000f002',
  'navigation',
  'Lobby',
  45,
  0
);

-- Public visibility: only the published tour beneath the public project and
-- its published descendants are readable.
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$
begin
  if (select count(*) from public.virtual_tours) <> 1 then
    raise exception 'anonymous tour visibility check failed';
  end if;
  if (select count(*) from public.tour_floors) <> 1 then
    raise exception 'anonymous floor visibility check failed';
  end if;
  if (select count(*) from public.tour_scenes) <> 2 then
    raise exception 'anonymous scene publication check failed';
  end if;
  if (select count(*) from public.tour_hotspots) <> 1 then
    raise exception 'anonymous hotspot visibility check failed';
  end if;
  if not public.virtual_tour_storage_object_can_read(
    'tour-panoramas',
    '00000000-0000-4000-8000-00000000a001/projects/00000000-0000-4000-8000-00000000b001/tours/00000000-0000-4000-8000-00000000d001/scenes/00000000-0000-4000-8000-00000000f001/panorama.jpg'
  ) then
    raise exception 'anonymous published panorama access check failed';
  end if;
  if public.virtual_tour_storage_object_can_read(
    'tour-panoramas',
    '00000000-0000-4000-8000-00000000a001/projects/00000000-0000-4000-8000-00000000b001/tours/00000000-0000-4000-8000-00000000d001/scenes/00000000-0000-4000-8000-00000000f003/panorama.jpg'
  ) then
    raise exception 'anonymous unpublished panorama access check failed';
  end if;
end;
$$;
reset role;

-- A tenant owner can create in tenant A but cannot write or manage tenant B.
select set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',
  true
);
set local role authenticated;
insert into public.virtual_tours (id, tenant_id, project_id, name)
values (
  '00000000-0000-4000-8000-00000000d004',
  '00000000-0000-4000-8000-00000000a001',
  '00000000-0000-4000-8000-00000000b001',
  'Admin-created tour'
);
do $$
declare
  cross_tenant_write_succeeded boolean := false;
begin
  if not exists (
    select 1 from public.virtual_tours
     where id = '00000000-0000-4000-8000-00000000d004'
       and created_by = (select auth.uid())
  ) then
    raise exception 'tenant admin create or created_by derivation failed';
  end if;

  begin
    insert into public.virtual_tours (tenant_id, project_id, name)
    values (
      '00000000-0000-4000-8000-00000000a002',
      '00000000-0000-4000-8000-00000000b002',
      'Forbidden cross-tenant tour'
    );
    cross_tenant_write_succeeded := true;
  exception when others then
    cross_tenant_write_succeeded := false;
  end;
  if cross_tenant_write_succeeded then
    raise exception 'tenant A wrote a tenant B tour';
  end if;

  if not public.virtual_tour_storage_object_can_manage(
    'tour-panoramas',
    '00000000-0000-4000-8000-00000000a001/projects/00000000-0000-4000-8000-00000000b001/tours/00000000-0000-4000-8000-00000000d001/scenes/00000000-0000-4000-8000-00000000f001/panorama.jpg'
  ) then
    raise exception 'tenant A storage management check failed';
  end if;
  if public.virtual_tour_storage_object_can_manage(
    'tour-panoramas',
    '00000000-0000-4000-8000-00000000a002/projects/00000000-0000-4000-8000-00000000b002/tours/00000000-0000-4000-8000-00000000d003/scenes/00000000-0000-4000-8000-00000000f004/panorama.jpg'
  ) then
    raise exception 'tenant A can manage tenant B storage';
  end if;
end;
$$;
reset role;

-- Database integrity checks run as the migration owner so failures prove the
-- constraints / triggers themselves, independently of RLS.
do $$
declare
  invalid_write_succeeded boolean;
begin
  invalid_write_succeeded := false;
  begin
    insert into public.tour_scenes (tour_id, floor_id, name, panorama_url)
    values ('00000000-0000-4000-8000-00000000d001', '00000000-0000-4000-8000-00000000e002', 'Cross-tour floor', 'invalid.jpg');
    invalid_write_succeeded := true;
  exception when others then null;
  end;
  if invalid_write_succeeded then raise exception 'cross-tour floor was accepted'; end if;

  invalid_write_succeeded := false;
  begin
    insert into public.tour_hotspots (scene_id, target_scene_id, type, yaw, pitch)
    values ('00000000-0000-4000-8000-00000000f001', '00000000-0000-4000-8000-00000000f004', 'navigation', 0, 0);
    invalid_write_succeeded := true;
  exception when others then null;
  end;
  if invalid_write_succeeded then raise exception 'cross-tour hotspot was accepted'; end if;

  invalid_write_succeeded := false;
  begin
    insert into public.tour_scenes (tour_id, name, panorama_url, floor_plan_x, floor_plan_y)
    values ('00000000-0000-4000-8000-00000000d001', 'Bad coordinates', 'invalid.jpg', 1.1, 0.5);
    invalid_write_succeeded := true;
  exception when others then null;
  end;
  if invalid_write_succeeded then raise exception 'out-of-range floor coordinates were accepted'; end if;

  invalid_write_succeeded := false;
  begin
    insert into public.tour_hotspots (scene_id, type, yaw, pitch)
    values ('00000000-0000-4000-8000-00000000f001', 'script', 0, 0);
    invalid_write_succeeded := true;
  exception when others then null;
  end;
  if invalid_write_succeeded then raise exception 'invalid hotspot type was accepted'; end if;
end;
$$;

do $$
declare
  previous_updated_at timestamptz;
  next_updated_at timestamptz;
begin
  select updated_at into previous_updated_at
    from public.virtual_tours
   where id = '00000000-0000-4000-8000-00000000d001';
  perform pg_sleep(0.01);
  update public.virtual_tours
     set description = 'updated_at trigger check'
   where id = '00000000-0000-4000-8000-00000000d001';
  select updated_at into next_updated_at
    from public.virtual_tours
   where id = '00000000-0000-4000-8000-00000000d001';
  if next_updated_at <= previous_updated_at then
    raise exception 'updated_at trigger check failed';
  end if;
end;
$$;

-- ON DELETE SET NULL keeps a source hotspot row valid when its target scene is
-- removed, while deleting an entire tour cascades through all descendants.
delete from public.tour_scenes where id = '00000000-0000-4000-8000-00000000f002';
do $$
begin
  if not exists (
    select 1 from public.tour_hotspots
     where id = '10000000-0000-4000-8000-000000000001'
       and target_scene_id is null
  ) then
    raise exception 'target-scene ON DELETE SET NULL check failed';
  end if;
end;
$$;

insert into public.virtual_tours (id, tenant_id, project_id, name)
values ('00000000-0000-4000-8000-00000000d005', '00000000-0000-4000-8000-00000000a001', '00000000-0000-4000-8000-00000000b001', 'Cascade tour');
insert into public.tour_floors (id, tour_id, name)
values ('00000000-0000-4000-8000-00000000e005', '00000000-0000-4000-8000-00000000d005', 'Cascade floor');
insert into public.tour_scenes (id, tour_id, floor_id, name, panorama_url)
values ('00000000-0000-4000-8000-00000000f005', '00000000-0000-4000-8000-00000000d005', '00000000-0000-4000-8000-00000000e005', 'Cascade scene', 'cascade.jpg');
insert into public.tour_hotspots (id, scene_id, type, yaw, pitch)
values ('10000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-00000000f005', 'information', 0, 0);
delete from public.virtual_tours where id = '00000000-0000-4000-8000-00000000d005';

do $$
begin
  if exists (select 1 from public.tour_floors where id = '00000000-0000-4000-8000-00000000e005')
     or exists (select 1 from public.tour_scenes where id = '00000000-0000-4000-8000-00000000f005')
     or exists (select 1 from public.tour_hotspots where id = '10000000-0000-4000-8000-000000000005')
  then
    raise exception 'tour descendant cascade check failed';
  end if;
end;
$$;

rollback;
