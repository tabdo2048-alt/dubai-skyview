create index audit_logs_actor_user_id_idx on public.audit_logs (actor_user_id);
create index audit_logs_project_id_idx on public.audit_logs (project_id);

drop policy if exists "Platform owner or tenant admins read audit logs" on public.audit_logs;
create policy "Platform owner or tenant admins read audit logs"
on public.audit_logs
for select
to authenticated
using (
  coalesce((select auth.jwt() ->> 'is_anonymous')::boolean, false) = false
  and (
    public.current_user_is_platform_owner()
    or (
      tenant_id is not null
      and public.is_tenant_member(tenant_id, 'admin')
    )
  )
);

create or replace function public.record_login_success()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_session_id uuid;
  v_tenant_id uuid;
  v_email text;
begin
  if v_user_id is null
     or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'Authenticated non-anonymous user required' using errcode = '42501';
  end if;

  begin
    v_session_id := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  exception when invalid_text_representation then
    v_session_id := null;
  end;

  select m.tenant_id
    into v_tenant_id
  from public.tenant_members m
  where m.user_id = v_user_id
  order by m.created_at asc
  limit 1;

  select coalesce(auth.jwt() ->> 'email', u.email)
    into v_email
  from auth.users u
  where u.id = v_user_id;

  insert into public.audit_logs (
    event_type,
    actor_user_id,
    actor_email,
    tenant_id,
    session_id,
    metadata
  )
  values (
    'login',
    v_user_id,
    v_email,
    v_tenant_id,
    v_session_id,
    jsonb_build_object('method', 'password')
  )
  on conflict (session_id) where event_type = 'login' and session_id is not null
  do nothing;
end;
$$;

revoke all on function public.record_login_success() from public, anon;
grant execute on function public.record_login_success() to authenticated;