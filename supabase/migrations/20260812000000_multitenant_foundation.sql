-- ============================================================================
-- Phase 1 — Multi-tenant SaaS foundation.
--
-- Introduces organizations ("tenants") that OWN the content, membership with
-- roles, and rewrites RLS so members see/write only their org's rows, while the
-- public still sees projects explicitly published (is_public).
--
-- Per-tenant tables: projects, project_images, project_amenities, developers,
-- communities, zones. Global/shared (unchanged): hospitals, schools, tourism,
-- and all baked map layers (roads/metro/water/landmarks).
--
-- Storage (project-media) policy migration to a tenant_id/ key prefix is handled
-- in a follow-up migration so existing objects aren't orphaned.
--
-- NOTE: not yet applied (Supabase MCP disconnected; config.toml ref is stale —
-- live project ref is fdqbdqsmaguxdnaftxbq). Apply with `supabase db push`.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Tenants (organizations) + billing state
-- ---------------------------------------------------------------------------
CREATE TABLE public.tenants (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  -- Billing (Stripe); source of truth is the Stripe webhook (Phase 2).
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  plan TEXT,                                   -- e.g. 'monthly' | 'yearly'
  subscription_status TEXT NOT NULL DEFAULT 'incomplete'
    CHECK (subscription_status IN ('incomplete','active','past_due','canceled')),
  current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.tenants TO authenticated;   -- reads gated further by RLS
GRANT ALL ON public.tenants TO service_role;
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Membership + roles
-- ---------------------------------------------------------------------------
CREATE TYPE public.tenant_role AS ENUM ('owner','admin','member');

CREATE TABLE public.tenant_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.tenant_role NOT NULL DEFAULT 'member',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id)
);

-- Deliberately NO insert/update/delete grant to `authenticated`: membership is
-- mutated only through SECURITY DEFINER RPCs (onboarding / invites), so a user
-- cannot self-join an org or escalate their role by writing this table.
GRANT SELECT ON public.tenant_members TO authenticated;
GRANT ALL ON public.tenant_members TO service_role;
ALTER TABLE public.tenant_members ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_tenant_members_user ON public.tenant_members(user_id);
CREATE INDEX idx_tenant_members_tenant ON public.tenant_members(tenant_id);

-- ---------------------------------------------------------------------------
-- Helper functions (SECURITY DEFINER, search_path pinned — same hardening as
-- the existing has_role()). Used inside RLS policies.
-- ---------------------------------------------------------------------------

-- Every tenant the current user belongs to.
CREATE OR REPLACE FUNCTION public.current_tenant_ids()
RETURNS SETOF UUID
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()
$$;

-- True if the current user is a member of `_tid` with at least `_min` rank
-- (owner > admin > member).
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

-- Tenants RLS: a user reads/updates only orgs they belong to (admins+ can
-- update org settings). Inserts happen via service_role/onboarding RPC only.
CREATE POLICY "Members read own tenants" ON public.tenants
  FOR SELECT TO authenticated USING (public.is_tenant_member(id, 'member'));
CREATE POLICY "Admins update own tenant" ON public.tenants
  FOR UPDATE TO authenticated
  USING (public.is_tenant_member(id, 'admin'))
  WITH CHECK (public.is_tenant_member(id, 'admin'));

-- tenant_members RLS: a user sees the rosters of orgs they belong to.
CREATE POLICY "Members read own rosters" ON public.tenant_members
  FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT public.current_tenant_ids()));

-- ---------------------------------------------------------------------------
-- Backfill: move existing single-tenant data into one default org owned by the
-- current global admin (from the legacy user_roles table).
-- ---------------------------------------------------------------------------
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

  -- Make EVERY existing admin a member of the default org (first = owner) so no
  -- current admin is locked out by the new tenant-scoped RLS.
  INSERT INTO public.tenant_members (tenant_id, user_id, role)
  SELECT v_tenant, u.user_id,
         CASE WHEN u.user_id = v_admin THEN 'owner'::public.tenant_role
              ELSE 'admin'::public.tenant_role END
  FROM (SELECT DISTINCT user_id FROM public.user_roles WHERE role = 'admin') u;

  -- Stash the default tenant id for the column backfills below.
  PERFORM set_config('app.default_tenant', v_tenant::text, true);
END $$;

-- ---------------------------------------------------------------------------
-- Add tenant_id to every per-tenant table + is_public to projects, backfill to
-- the default tenant, enforce NOT NULL, index, and FK.
-- ---------------------------------------------------------------------------
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

-- Public-showcase flag on projects (default private).
ALTER TABLE public.projects ADD COLUMN is_public BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX idx_projects_is_public ON public.projects(is_public) WHERE is_public;

-- ---------------------------------------------------------------------------
-- Rewrite RLS: drop the old public-read / admin-write policies and replace with
-- tenant-scoped ones. Projects also allow anon to read is_public rows.
-- ---------------------------------------------------------------------------

-- projects
DROP POLICY IF EXISTS "Public read projects" ON public.projects;
DROP POLICY IF EXISTS "Admin write projects" ON public.projects;
CREATE POLICY "Tenant or public read projects" ON public.projects
  FOR SELECT TO anon, authenticated
  USING (is_public OR tenant_id IN (SELECT public.current_tenant_ids()));
CREATE POLICY "Tenant admins write projects" ON public.projects
  FOR ALL TO authenticated
  USING (public.is_tenant_member(tenant_id, 'admin'))
  WITH CHECK (public.is_tenant_member(tenant_id, 'admin'));

-- project_images: readable when the parent project is (member OR public);
-- writable by tenant admins.
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

-- project_amenities: same shape as images.
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

-- developers + communities: member-read + admin-write (lookups scoped per org).
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

-- zones: member-read + admin-write (per org).
DROP POLICY IF EXISTS "Public read zones" ON public.zones;
DROP POLICY IF EXISTS "Admin write zones" ON public.zones;
CREATE POLICY "Tenant read zones" ON public.zones
  FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT public.current_tenant_ids()));
CREATE POLICY "Tenant admins write zones" ON public.zones
  FOR ALL TO authenticated
  USING (public.is_tenant_member(tenant_id, 'admin'))
  WITH CHECK (public.is_tenant_member(tenant_id, 'admin'));

-- Anon no longer reads developers/communities/zones (they were only public for
-- the single-tenant map); revoke the leftover table grant.
REVOKE SELECT ON public.developers FROM anon;
REVOKE SELECT ON public.communities FROM anon;
REVOKE SELECT ON public.zones FROM anon;

-- hospitals / schools / tourism stay GLOBAL shared reference data — unchanged.

-- ---------------------------------------------------------------------------
-- Retire the first-signup-becomes-admin bootstrap: access is now org-membership
-- based, and signup is a paid onboarding flow (Phase 3). Keep user_roles table
-- for now (unused by RLS) to avoid breaking the admin UI until Phase 4 lands.
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
