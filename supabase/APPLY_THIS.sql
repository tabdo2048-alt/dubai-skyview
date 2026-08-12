-- ###########################################################################
-- RUN THIS ONCE in Supabase → SQL Editor to turn on the multi-tenant SaaS.
-- It bundles all three migrations in ONE transaction (all-or-nothing).
-- Safe to run on the live DB. After it succeeds, /signup + /admin work.
-- ###########################################################################

BEGIN;

-- ========================= 1) MULTI-TENANT FOUNDATION =====================
CREATE TABLE public.tenants (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  plan TEXT,
  subscription_status TEXT NOT NULL DEFAULT 'incomplete'
    CHECK (subscription_status IN ('incomplete','active','past_due','canceled')),
  current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.tenants TO authenticated;
GRANT ALL ON public.tenants TO service_role;
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

CREATE TYPE public.tenant_role AS ENUM ('owner','admin','member');

CREATE TABLE public.tenant_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.tenant_role NOT NULL DEFAULT 'member',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id)
);
GRANT SELECT ON public.tenant_members TO authenticated;
GRANT ALL ON public.tenant_members TO service_role;
ALTER TABLE public.tenant_members ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_tenant_members_user ON public.tenant_members(user_id);
CREATE INDEX idx_tenant_members_tenant ON public.tenant_members(tenant_id);

CREATE OR REPLACE FUNCTION public.current_tenant_ids()
RETURNS SETOF UUID
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.is_tenant_member(_tid UUID, _min public.tenant_role)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tenant_members m
    WHERE m.tenant_id = _tid
      AND m.user_id = auth.uid()
      AND (CASE m.role WHEN 'owner' THEN 3 WHEN 'admin' THEN 2 ELSE 1 END)
          >= (CASE _min   WHEN 'owner' THEN 3 WHEN 'admin' THEN 2 ELSE 1 END)
  )
$$;

REVOKE EXECUTE ON FUNCTION public.current_tenant_ids() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_tenant_member(UUID, public.tenant_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_tenant_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_tenant_member(UUID, public.tenant_role) TO authenticated;

CREATE POLICY "Members read own tenants" ON public.tenants
  FOR SELECT TO authenticated USING (public.is_tenant_member(id, 'member'));
CREATE POLICY "Admins update own tenant" ON public.tenants
  FOR UPDATE TO authenticated
  USING (public.is_tenant_member(id, 'admin'))
  WITH CHECK (public.is_tenant_member(id, 'admin'));

CREATE POLICY "Members read own rosters" ON public.tenant_members
  FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT public.current_tenant_ids()));

-- Default org; every existing admin becomes a member (first = owner).
DO $$
DECLARE
  v_tenant UUID;
  v_admin  UUID;
BEGIN
  INSERT INTO public.tenants (name, slug, subscription_status)
  VALUES ('Default Organization', 'default', 'active')
  RETURNING id INTO v_tenant;

  SELECT user_id INTO v_admin
  FROM public.user_roles WHERE role = 'admin'
  ORDER BY created_at LIMIT 1;

  INSERT INTO public.tenant_members (tenant_id, user_id, role)
  SELECT v_tenant, u.user_id,
         CASE WHEN u.user_id = v_admin THEN 'owner'::public.tenant_role
              ELSE 'admin'::public.tenant_role END
  FROM (SELECT DISTINCT user_id FROM public.user_roles WHERE role = 'admin') u;

  PERFORM set_config('app.default_tenant', v_tenant::text, true);
END $$;

DO $$
DECLARE
  t TEXT;
  v_tenant UUID := current_setting('app.default_tenant')::uuid;
BEGIN
  FOREACH t IN ARRAY ARRAY['projects','project_images','project_amenities','developers','communities','zones']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN tenant_id UUID', t);
    EXECUTE format('UPDATE public.%I SET tenant_id = %L', t, v_tenant);
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN tenant_id SET NOT NULL', t);
    EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE', t, t || '_tenant_fk');
    EXECUTE format('CREATE INDEX %I ON public.%I(tenant_id)', 'idx_' || t || '_tenant', t);
  END LOOP;
END $$;

ALTER TABLE public.projects ADD COLUMN is_public BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX idx_projects_is_public ON public.projects(is_public) WHERE is_public;

DROP POLICY IF EXISTS "Public read projects" ON public.projects;
DROP POLICY IF EXISTS "Admin write projects" ON public.projects;
CREATE POLICY "Tenant or public read projects" ON public.projects
  FOR SELECT TO anon, authenticated
  USING (is_public OR tenant_id IN (SELECT public.current_tenant_ids()));
CREATE POLICY "Tenant admins write projects" ON public.projects
  FOR ALL TO authenticated
  USING (public.is_tenant_member(tenant_id, 'admin'))
  WITH CHECK (public.is_tenant_member(tenant_id, 'admin'));

DROP POLICY IF EXISTS "Public read project_images" ON public.project_images;
DROP POLICY IF EXISTS "Admin write project_images" ON public.project_images;
CREATE POLICY "Tenant or public read project_images" ON public.project_images
  FOR SELECT TO anon, authenticated
  USING (
    tenant_id IN (SELECT public.current_tenant_ids())
    OR EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.is_public)
  );
CREATE POLICY "Tenant admins write project_images" ON public.project_images
  FOR ALL TO authenticated
  USING (public.is_tenant_member(tenant_id, 'admin'))
  WITH CHECK (public.is_tenant_member(tenant_id, 'admin'));

DROP POLICY IF EXISTS "Public read project_amenities" ON public.project_amenities;
DROP POLICY IF EXISTS "Admin write project_amenities" ON public.project_amenities;
CREATE POLICY "Tenant or public read project_amenities" ON public.project_amenities
  FOR SELECT TO anon, authenticated
  USING (
    tenant_id IN (SELECT public.current_tenant_ids())
    OR EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.is_public)
  );
CREATE POLICY "Tenant admins write project_amenities" ON public.project_amenities
  FOR ALL TO authenticated
  USING (public.is_tenant_member(tenant_id, 'admin'))
  WITH CHECK (public.is_tenant_member(tenant_id, 'admin'));

DROP POLICY IF EXISTS "Public read developers" ON public.developers;
DROP POLICY IF EXISTS "Admin write developers" ON public.developers;
CREATE POLICY "Tenant read developers" ON public.developers
  FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT public.current_tenant_ids()));
CREATE POLICY "Tenant admins write developers" ON public.developers
  FOR ALL TO authenticated
  USING (public.is_tenant_member(tenant_id, 'admin'))
  WITH CHECK (public.is_tenant_member(tenant_id, 'admin'));

DROP POLICY IF EXISTS "Public read communities" ON public.communities;
DROP POLICY IF EXISTS "Admin write communities" ON public.communities;
CREATE POLICY "Tenant read communities" ON public.communities
  FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT public.current_tenant_ids()));
CREATE POLICY "Tenant admins write communities" ON public.communities
  FOR ALL TO authenticated
  USING (public.is_tenant_member(tenant_id, 'admin'))
  WITH CHECK (public.is_tenant_member(tenant_id, 'admin'));

DROP POLICY IF EXISTS "Public read zones" ON public.zones;
DROP POLICY IF EXISTS "Admin write zones" ON public.zones;
CREATE POLICY "Tenant read zones" ON public.zones
  FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT public.current_tenant_ids()));
CREATE POLICY "Tenant admins write zones" ON public.zones
  FOR ALL TO authenticated
  USING (public.is_tenant_member(tenant_id, 'admin'))
  WITH CHECK (public.is_tenant_member(tenant_id, 'admin'));

REVOKE SELECT ON public.developers FROM anon;
REVOKE SELECT ON public.communities FROM anon;
REVOKE SELECT ON public.zones FROM anon;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- ========================= 2) ONBOARDING RPC ==============================
CREATE OR REPLACE FUNCTION public.create_tenant_for_owner(_name TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id   UUID;
  v_slug TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  v_slug := regexp_replace(lower(coalesce(nullif(_name, ''), 'org')), '[^a-z0-9]+', '-', 'g')
            || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
  INSERT INTO public.tenants (name, slug, subscription_status)
  VALUES (coalesce(nullif(_name, ''), 'My Organization'), v_slug, 'incomplete')
  RETURNING id INTO v_id;
  INSERT INTO public.tenant_members (tenant_id, user_id, role)
  VALUES (v_id, auth.uid(), 'owner');
  RETURN v_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.create_tenant_for_owner(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_tenant_for_owner(TEXT) TO authenticated;

-- ========================= 3) STORAGE POLICIES ============================
DROP POLICY IF EXISTS "Public read project media"    ON storage.objects;
DROP POLICY IF EXISTS "Admins upload project media"  ON storage.objects;
DROP POLICY IF EXISTS "Admins update project media"  ON storage.objects;
DROP POLICY IF EXISTS "Admins delete project media"  ON storage.objects;
DROP POLICY IF EXISTS "project-media public read"    ON storage.objects;
DROP POLICY IF EXISTS "project-media admin insert"   ON storage.objects;
DROP POLICY IF EXISTS "project-media admin update"   ON storage.objects;
DROP POLICY IF EXISTS "project-media admin delete"   ON storage.objects;

CREATE POLICY "project-media public read"
  ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'project-media');
CREATE POLICY "project-media tenant insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'project-media' AND public.is_tenant_member(((storage.foldername(name))[1])::uuid, 'admin'));
CREATE POLICY "project-media tenant update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'project-media' AND public.is_tenant_member(((storage.foldername(name))[1])::uuid, 'admin'))
  WITH CHECK (bucket_id = 'project-media' AND public.is_tenant_member(((storage.foldername(name))[1])::uuid, 'admin'));
CREATE POLICY "project-media tenant delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'project-media' AND public.is_tenant_member(((storage.foldername(name))[1])::uuid, 'admin'));

COMMIT;
