-- Platform administrators may inspect platform data, but only the designated
-- owner may mutate platform-wide state. Tenant admins keep control of rows
-- belonging to their own organization.

create or replace function public.is_platform_owner(_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_role(_user, 'admin') and exists (
    select 1 from auth.users u
    where u.id = _user
      and lower(trim(coalesce(u.email, ''))) = 'ashraf@admin.com'
  );
$$;

revoke execute on function public.is_platform_owner(uuid) from public, anon, authenticated;

-- Keep the old helper as a compatibility alias for list RPC return columns.
create or replace function public.is_suspend_override(_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$ select public.is_platform_owner(_user); $$;

revoke execute on function public.is_suspend_override(uuid) from public, anon, authenticated;

create or replace function public.platform_set_suspended(_tenant uuid, _suspended boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_owner(auth.uid()) then raise exception 'forbidden: platform owner only'; end if;
  if not exists (select 1 from public.tenants where id = _tenant) then raise exception 'organization not found'; end if;
  update public.tenants set suspended = _suspended where id = _tenant;
end;
$$;

revoke execute on function public.platform_set_suspended(uuid, boolean) from public, anon;
grant execute on function public.platform_set_suspended(uuid, boolean) to authenticated;

create or replace function public.platform_set_user_blocked(_uid uuid, _blocked boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_owner(auth.uid()) then raise exception 'forbidden: platform owner only'; end if;
  if _uid = auth.uid() then raise exception 'cannot block yourself'; end if;
  if not exists (select 1 from auth.users where id = _uid) then raise exception 'user not found'; end if;
  if _blocked then
    insert into public.user_blocks (user_id, blocked_by) values (_uid, auth.uid())
    on conflict (user_id) do update set blocked_at = now(), blocked_by = excluded.blocked_by;
  else
    delete from public.user_blocks where user_id = _uid;
  end if;
end;
$$;

revoke execute on function public.platform_set_user_blocked(uuid, boolean) from public, anon;
grant execute on function public.platform_set_user_blocked(uuid, boolean) to authenticated;

create or replace function public.platform_delete_user(_uid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_owner(auth.uid()) then raise exception 'forbidden: platform owner only'; end if;
  if _uid = auth.uid() then raise exception 'cannot delete yourself'; end if;
  if public.has_role(_uid, 'admin') then raise exception 'cannot delete a platform admin'; end if;
  delete from public.tenants t where exists (
    select 1 from public.tenant_members m
    where m.tenant_id = t.id and m.user_id = _uid and m.role = 'owner'
  );
  delete from auth.users where id = _uid;
end;
$$;

revoke execute on function public.platform_delete_user(uuid) from public, anon;
grant execute on function public.platform_delete_user(uuid) to authenticated;

create or replace function public.platform_only_publication()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null
     and not public.is_platform_owner(auth.uid())
     and ((tg_op = 'INSERT' and new.is_public is true)
       or (tg_op = 'UPDATE' and new.is_public is distinct from old.is_public)) then
    raise exception 'Only the platform owner can change publication';
  end if;
  return new;
end;
$$;

revoke execute on function public.platform_only_publication() from public, anon, authenticated;

drop policy if exists "Admin write hospitals" on public.hospitals;
create policy "Platform owner writes hospitals" on public.hospitals for all to authenticated
using (public.is_platform_owner(auth.uid())) with check (public.is_platform_owner(auth.uid()));
drop policy if exists "Admin write schools" on public.schools;
create policy "Platform owner writes schools" on public.schools for all to authenticated
using (public.is_platform_owner(auth.uid())) with check (public.is_platform_owner(auth.uid()));
drop policy if exists "Admin write tourism" on public.tourism;
create policy "Platform owner writes tourism" on public.tourism for all to authenticated
using (public.is_platform_owner(auth.uid())) with check (public.is_platform_owner(auth.uid()));

drop policy if exists "Write projects" on public.projects;
create policy "Write projects" on public.projects for all to authenticated
using (public.is_platform_owner(auth.uid()) or public.is_tenant_member(tenant_id, 'admin'))
with check (public.is_platform_owner(auth.uid()) or public.is_tenant_member(tenant_id, 'admin'));

drop policy if exists "Update tenants" on public.tenants;
create policy "Update tenants" on public.tenants for update to authenticated
using (public.is_platform_owner(auth.uid()) or public.is_tenant_member(id, 'admin'))
with check (public.is_platform_owner(auth.uid()) or public.is_tenant_member(id, 'admin'));

drop policy if exists "Admins manage roles" on public.user_roles;
create policy "Platform owner manages roles" on public.user_roles for all to authenticated
using (public.is_platform_owner(auth.uid())) with check (public.is_platform_owner(auth.uid()));
