-- ###########################################################################
-- Platform-admin + private-workspace update.
-- Run once in Supabase → SQL Editor. Safe on live. One transaction.
--   * Logged-in users see ONLY their own projects (public ones hide when
--     signed in). Anonymous visitors still see published (is_public) projects.
--   * Platform admins (has_role 'admin') see + manage EVERY org's projects,
--     and can suspend a subscriber.
-- ###########################################################################

BEGIN;

-- Suspend flag (platform admin can turn a subscriber off regardless of Stripe).
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS suspended BOOLEAN NOT NULL DEFAULT false;

-- projects SELECT: platform admin (all) OR own org OR (anon + published).
DROP POLICY IF EXISTS "Tenant or public read projects" ON public.projects;
DROP POLICY IF EXISTS "Read projects" ON public.projects;
CREATE POLICY "Read projects" ON public.projects
  FOR SELECT TO anon, authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR tenant_id IN (SELECT public.current_tenant_ids())
    OR (is_public AND auth.uid() IS NULL)
  );

-- projects write: platform admin OR the org's own admins.
DROP POLICY IF EXISTS "Tenant admins write projects" ON public.projects;
DROP POLICY IF EXISTS "Write projects" ON public.projects;
CREATE POLICY "Write projects" ON public.projects
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.is_tenant_member(tenant_id, 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.is_tenant_member(tenant_id, 'admin'));

-- tenants read/update: platform admin sees + edits all; members their own.
DROP POLICY IF EXISTS "Members read own tenants" ON public.tenants;
DROP POLICY IF EXISTS "Read tenants" ON public.tenants;
CREATE POLICY "Read tenants" ON public.tenants
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.is_tenant_member(id, 'member'));

DROP POLICY IF EXISTS "Admins update own tenant" ON public.tenants;
DROP POLICY IF EXISTS "Update tenants" ON public.tenants;
CREATE POLICY "Update tenants" ON public.tenants
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.is_tenant_member(id, 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.is_tenant_member(id, 'admin'));

-- Platform admin: list every subscriber org with owner email + project count.
CREATE OR REPLACE FUNCTION public.platform_list_tenants()
RETURNS TABLE (
  id UUID, name TEXT, slug TEXT, subscription_status TEXT, plan TEXT,
  suspended BOOLEAN, current_period_end TIMESTAMPTZ, created_at TIMESTAMPTZ,
  owner_email TEXT, project_count BIGINT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
  SELECT t.id, t.name::text, t.slug::text, t.subscription_status::text, t.plan::text, t.suspended,
         t.current_period_end, t.created_at,
         (SELECT u.email::text FROM public.tenant_members m
            JOIN auth.users u ON u.id = m.user_id
           WHERE m.tenant_id = t.id AND m.role = 'owner' LIMIT 1) AS owner_email,
         (SELECT count(*) FROM public.projects p WHERE p.tenant_id = t.id) AS project_count
  FROM public.tenants t
  ORDER BY t.created_at;
END $$;
REVOKE EXECUTE ON FUNCTION public.platform_list_tenants() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_list_tenants() TO authenticated;

-- Platform admin: suspend / unsuspend a subscriber.
CREATE OR REPLACE FUNCTION public.platform_set_suspended(_tenant UUID, _suspended BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  UPDATE public.tenants SET suspended = _suspended WHERE id = _tenant;
END $$;
REVOKE EXECUTE ON FUNCTION public.platform_set_suspended(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_set_suspended(UUID, BOOLEAN) TO authenticated;

-- Platform admin: every user account with its org membership.
CREATE OR REPLACE FUNCTION public.platform_list_users()
RETURNS TABLE (user_id UUID, email TEXT, created_at TIMESTAMPTZ, is_platform_admin BOOLEAN, orgs TEXT, org_roles TEXT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
  SELECT u.id, u.email::text, u.created_at,
    public.has_role(u.id, 'admin') AS is_platform_admin,
    (SELECT string_agg(t.name, ', ' ORDER BY t.name)
       FROM public.tenant_members m JOIN public.tenants t ON t.id = m.tenant_id
      WHERE m.user_id = u.id)::text AS orgs,
    (SELECT string_agg(DISTINCT m.role::text, ', ')
       FROM public.tenant_members m WHERE m.user_id = u.id)::text AS org_roles
  FROM auth.users u
  ORDER BY u.created_at;
END $$;
REVOKE EXECUTE ON FUNCTION public.platform_list_users() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_list_users() TO authenticated;

-- The projects/images/amenities SELECT policies call these helpers, so anon must
-- be able to EXECUTE them or the public showcase read errors out. They return
-- empty/false for anon (auth.uid() is null), so this leaks nothing.
GRANT EXECUTE ON FUNCTION public.current_tenant_ids() TO anon;
GRANT EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) TO anon;

COMMIT;
