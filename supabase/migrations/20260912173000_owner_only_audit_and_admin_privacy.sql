drop policy if exists "Platform owner or tenant admins read audit logs" on public.audit_logs;
create policy "Platform owner reads audit logs"
on public.audit_logs
for select
to authenticated
using (
  coalesce((select auth.jwt() ->> 'is_anonymous')::boolean, false) = false
  and (select public.current_user_is_platform_owner())
);

create or replace function public.platform_list_users()
returns table (
  user_id uuid,
  email text,
  created_at timestamptz,
  is_platform_admin boolean,
  orgs text,
  org_roles text,
  blocked boolean,
  can_block_platform_admins boolean,
  subscription_status text,
  current_period_end timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_is_owner boolean;
begin
  if v_caller is null
     or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
     or not public.has_role(v_caller, 'admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  v_is_owner := public.current_user_is_platform_owner();

  return query
  select
    u.id,
    u.email::text,
    u.created_at,
    exists (
      select 1
      from public.user_roles r
      where r.user_id = u.id and r.role = 'admin'
    ) as is_platform_admin,
    (
      select string_agg(t.name, ', ' order by t.name)
      from public.tenant_members m
      join public.tenants t on t.id = m.tenant_id
      where m.user_id = u.id
    )::text as orgs,
    (
      select string_agg(distinct m.role::text, ', ')
      from public.tenant_members m
      where m.user_id = u.id
    )::text as org_roles,
    exists (
      select 1 from public.user_blocks b where b.user_id = u.id
    ) as blocked,
    public.is_suspend_override(v_caller) as can_block_platform_admins,
    best.subscription_status::text,
    best.current_period_end
  from auth.users u
  left join lateral (
    select t.subscription_status, t.current_period_end
    from public.tenant_members m
    join public.tenants t on t.id = m.tenant_id
    where m.user_id = u.id
      and not t.suspended
    order by
      (t.subscription_status in ('active', 'past_due')) desc,
      (t.current_period_end is null) desc,
      t.current_period_end desc
    limit 1
  ) best on true
  where
    v_is_owner
    or u.id = v_caller
    or not exists (
      select 1
      from public.user_roles hidden_role
      where hidden_role.user_id = u.id
        and hidden_role.role = 'admin'
    )
  order by u.created_at;
end;
$$;

revoke all on function public.platform_list_users() from public, anon;
grant execute on function public.platform_list_users() to authenticated;