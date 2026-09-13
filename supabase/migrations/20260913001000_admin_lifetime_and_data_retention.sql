-- Platform administrators are licensed at account level; customer data is
-- retained for 10 days after the paid period ends.
alter table public.tenants
  add column if not exists data_purged_at timestamptz;

comment on column public.tenants.data_purged_at is
  'When this tenant projects and uploaded media were purged after the 10-day retention period.';

create or replace function public.current_user_has_lifetime_access()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.role = 'admin'
  );
$$;

revoke all on function public.current_user_has_lifetime_access() from public, anon;
grant execute on function public.current_user_has_lifetime_access() to authenticated;

create or replace function public.retention_tenants_due_for_purge(_limit integer default 10)
returns table (tenant_id uuid)
language sql
security definer
set search_path = public
as $$
  select t.id
  from public.tenants t
  where t.current_period_end is not null
    and t.current_period_end <= now() - interval '10 days'
    and t.data_purged_at is null
    and not exists (
      select 1
      from public.tenant_members tm
      join public.user_roles ur
        on ur.user_id = tm.user_id
       and ur.role = 'admin'
      where tm.tenant_id = t.id
    )
  order by t.current_period_end asc
  limit greatest(1, least(coalesce(_limit, 10), 25));
$$;

revoke all on function public.retention_tenants_due_for_purge(integer) from public, anon, authenticated;
grant execute on function public.retention_tenants_due_for_purge(integer) to service_role;

create or replace function public.mark_tenant_data_purged(_tenant uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.tenants
  set data_purged_at = now()
  where id = _tenant
    and current_period_end is not null
    and current_period_end <= now() - interval '10 days'
    and data_purged_at is null
    and not exists (
      select 1
      from public.tenant_members tm
      join public.user_roles ur
        on ur.user_id = tm.user_id
       and ur.role = 'admin'
      where tm.tenant_id = tenants.id
    );
end;
$$;

revoke all on function public.mark_tenant_data_purged(uuid) from public, anon, authenticated;
grant execute on function public.mark_tenant_data_purged(uuid) to service_role;

create or replace function public.reset_tenant_purge_marker_on_renewal()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.subscription_status in ('active', 'past_due')
     and new.current_period_end is not null
     and new.current_period_end > now() then
    new.data_purged_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists reset_tenant_purge_marker_on_renewal on public.tenants;
create trigger reset_tenant_purge_marker_on_renewal
before update of subscription_status, current_period_end on public.tenants
for each row execute function public.reset_tenant_purge_marker_on_renewal();
