create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type in ('login', 'project_created')),
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_email text,
  tenant_id uuid references public.tenants(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  session_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.audit_logs is
  'Immutable audit trail for successful sign-ins and project creation. Actor identity is derived server-side.';

create unique index audit_logs_one_login_per_session
  on public.audit_logs (session_id)
  where event_type = 'login' and session_id is not null;

create index audit_logs_created_at_idx on public.audit_logs (created_at desc);
create index audit_logs_tenant_created_at_idx on public.audit_logs (tenant_id, created_at desc);

alter table public.audit_logs enable row level security;

revoke all on table public.audit_logs from public, anon, authenticated;
grant select on table public.audit_logs to authenticated;

create policy "Platform owner or tenant admins read audit logs"
on public.audit_logs
for select
to authenticated
using (
  public.current_user_is_platform_owner()
  or (
    tenant_id is not null
    and public.is_tenant_member(tenant_id, 'admin')
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
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
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

create or replace function public.audit_project_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_session_id uuid;
  v_email text;
begin
  if v_user_id is null then
    return new;
  end if;

  begin
    v_session_id := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  exception when invalid_text_representation then
    v_session_id := null;
  end;

  select coalesce(auth.jwt() ->> 'email', u.email)
    into v_email
  from auth.users u
  where u.id = v_user_id;

  insert into public.audit_logs (
    event_type,
    actor_user_id,
    actor_email,
    tenant_id,
    project_id,
    session_id,
    metadata
  )
  values (
    'project_created',
    v_user_id,
    v_email,
    new.tenant_id,
    new.id,
    v_session_id,
    jsonb_build_object('project_name', new.name, 'project_slug', new.slug)
  );

  return new;
end;
$$;

revoke all on function public.audit_project_created() from public, anon, authenticated;

create trigger projects_audit_created
after insert on public.projects
for each row execute function public.audit_project_created();
