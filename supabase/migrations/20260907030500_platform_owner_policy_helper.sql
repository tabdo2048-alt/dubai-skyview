-- RLS expressions run as the API role and need an executable no-argument
-- helper. Keep the UUID variant private so callers cannot probe other users.
create or replace function public.current_user_is_platform_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$ select public.is_platform_owner(auth.uid()); $$;

revoke execute on function public.current_user_is_platform_owner() from public, anon;
grant execute on function public.current_user_is_platform_owner() to authenticated;

drop policy if exists "Platform owner writes hospitals" on public.hospitals;
create policy "Platform owner writes hospitals" on public.hospitals for all to authenticated
using (public.current_user_is_platform_owner()) with check (public.current_user_is_platform_owner());
drop policy if exists "Platform owner writes schools" on public.schools;
create policy "Platform owner writes schools" on public.schools for all to authenticated
using (public.current_user_is_platform_owner()) with check (public.current_user_is_platform_owner());
drop policy if exists "Platform owner writes tourism" on public.tourism;
create policy "Platform owner writes tourism" on public.tourism for all to authenticated
using (public.current_user_is_platform_owner()) with check (public.current_user_is_platform_owner());
drop policy if exists "Write projects" on public.projects;
create policy "Write projects" on public.projects for all to authenticated
using (public.current_user_is_platform_owner() or public.is_tenant_member(tenant_id, 'admin'))
with check (public.current_user_is_platform_owner() or public.is_tenant_member(tenant_id, 'admin'));
drop policy if exists "Update tenants" on public.tenants;
create policy "Update tenants" on public.tenants for update to authenticated
using (public.current_user_is_platform_owner() or public.is_tenant_member(id, 'admin'))
with check (public.current_user_is_platform_owner() or public.is_tenant_member(id, 'admin'));
drop policy if exists "Platform owner manages roles" on public.user_roles;
create policy "Platform owner manages roles" on public.user_roles for all to authenticated
using (public.current_user_is_platform_owner()) with check (public.current_user_is_platform_owner());
