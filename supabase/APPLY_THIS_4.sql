-- ###########################################################################
-- Account blocking + the ashraf@admin.com owner override.
--
-- Run ONCE in Supabase -> SQL Editor (project fdqbdqsmaguxdnaftxbq).
-- Safe on live data. One transaction: it either all applies or none of it does.
-- Idempotent (CREATE OR REPLACE / IF NOT EXISTS / DROP IF EXISTS before CREATE),
-- so re-running it is harmless.
--
-- This is the concatenation, in order, of the three parked migrations:
--   supabase/parked/20260813100000_ashraf_suspend_admin_override.sql
--   supabase/parked/20260813110000_user_account_blocks.sql
--   supabase/parked/20260813120000_image_loading_indexes.sql
-- After it succeeds, move those three files back into supabase/migrations/ so
-- the directory stays an honest record of what the database contains.
--
-- WHAT THIS CHANGES
--   * New table public.user_blocks (service-role only, RLS enabled).
--   * has_role(), current_tenant_ids() and is_tenant_member() are REWRITTEN to
--     deny a blocked user. A blocked account's existing access token stops
--     reading and writing rows immediately, not just at next sign-in.
--   * Only ashraf@admin.com may block another platform administrator, or suspend
--     an organization that contains one. Enforced inside SECURITY DEFINER RPCs,
--     not in the UI, so it cannot be bypassed from the browser. Nobody can block
--     themselves.
--   * platform_list_users() / platform_list_tenants() gain the blocked,
--     can_block_platform_admins and can_suspend_platform_admins columns the
--     admin UI reads. The Block button enables itself once these exist.
--   * Two indexes for the project-image and project-list queries.
-- ###########################################################################

BEGIN;

-- ===========================================================================
-- 1/3  ashraf@admin.com suspend/block override + subscriber listing
-- ===========================================================================

-- The override selects one exceptional account by email. It does NOT grant the
-- platform-admin role by itself: every caller below is still checked with
-- has_role(auth.uid(), 'admin') first. Email match is case- and whitespace-
-- insensitive.
CREATE OR REPLACE FUNCTION public.is_suspend_override(_user UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM auth.users u
    WHERE u.id = _user
      AND lower(trim(coalesce(u.email, ''))) = 'ashraf@admin.com'
  );
$$;

-- Internal helper for the RPCs below — no client role may call it directly.
REVOKE EXECUTE ON FUNCTION public.is_suspend_override(UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.platform_set_suspended(_tenant UUID, _suspended BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- The designated platform owner may suspend any organization. Other admins
  -- cannot lock out an organization containing a platform administrator.
  IF _suspended
     AND NOT public.is_suspend_override(auth.uid())
     AND EXISTS (
       SELECT 1
       FROM public.tenant_members m
       WHERE m.tenant_id = _tenant
         AND public.has_role(m.user_id, 'admin')
     ) THEN
    RAISE EXCEPTION 'cannot suspend an organization that a platform administrator belongs to';
  END IF;

  UPDATE public.tenants SET suspended = _suspended WHERE id = _tenant;
END $$;

REVOKE EXECUTE ON FUNCTION public.platform_set_suspended(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_set_suspended(UUID, BOOLEAN) TO authenticated;

DROP FUNCTION IF EXISTS public.platform_list_tenants();
CREATE FUNCTION public.platform_list_tenants()
RETURNS TABLE (
  id UUID, name TEXT, slug TEXT, subscription_status TEXT, plan TEXT,
  suspended BOOLEAN, current_period_end TIMESTAMPTZ, created_at TIMESTAMPTZ,
  owner_email TEXT, project_count BIGINT, has_platform_admin BOOLEAN,
  can_suspend_platform_admins BOOLEAN
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
         (SELECT u.email::text
            FROM public.tenant_members m
            JOIN auth.users u ON u.id = m.user_id
           WHERE m.tenant_id = t.id AND m.role = 'owner'
           LIMIT 1) AS owner_email,
         (SELECT count(*) FROM public.projects p WHERE p.tenant_id = t.id) AS project_count,
         EXISTS (
           SELECT 1
           FROM public.tenant_members m
           WHERE m.tenant_id = t.id AND public.has_role(m.user_id, 'admin')
         ) AS has_platform_admin,
         public.is_suspend_override(auth.uid()) AS can_suspend_platform_admins
  FROM public.tenants t
  ORDER BY t.created_at;
END $$;

REVOKE EXECUTE ON FUNCTION public.platform_list_tenants() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_list_tenants() TO authenticated;

-- ===========================================================================
-- 2/3  Account-level blocking
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.user_blocks (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  blocked_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- No client role touches this table directly: it is read through SECURITY
-- DEFINER functions and written only by the platform RPC / service role.
ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_blocks FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.user_blocks TO service_role;

CREATE OR REPLACE FUNCTION public.is_current_user_blocked()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_blocks WHERE user_id = auth.uid()
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_current_user_blocked() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_current_user_blocked() TO authenticated;

-- Make the block effective for legacy role checks and tenant-scoped RLS too.
-- A blocked user's existing access token must not keep reading or changing rows.
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles r
    WHERE r.user_id = _user_id
      AND r.role = _role
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.user_blocks b WHERE b.user_id = _user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.current_tenant_ids()
RETURNS SETOF UUID
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_id
  FROM public.tenant_members
  WHERE user_id = auth.uid()
    AND NOT public.is_current_user_blocked();
$$;

CREATE OR REPLACE FUNCTION public.is_tenant_member(_tid UUID, _min public.tenant_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT public.is_current_user_blocked()
    AND EXISTS (
      SELECT 1
      FROM public.tenant_members m
      WHERE m.tenant_id = _tid
        AND m.user_id = auth.uid()
        AND (CASE m.role WHEN 'owner' THEN 3 WHEN 'admin' THEN 2 ELSE 1 END)
            >= (CASE _min WHEN 'owner' THEN 3 WHEN 'admin' THEN 2 ELSE 1 END)
    );
$$;

CREATE OR REPLACE FUNCTION public.platform_set_user_blocked(_uid UUID, _blocked BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF _blocked AND _uid = auth.uid() THEN
    RAISE EXCEPTION 'cannot block yourself';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = _uid) THEN
    RAISE EXCEPTION 'user not found';
  END IF;

  -- Only the designated platform owner may block another platform admin.
  IF _blocked
     AND EXISTS (
       SELECT 1 FROM public.user_roles
       WHERE user_id = _uid AND role = 'admin'
     )
     AND NOT public.is_suspend_override(auth.uid()) THEN
    RAISE EXCEPTION 'only the platform owner can block another platform administrator';
  END IF;

  IF _blocked THEN
    INSERT INTO public.user_blocks (user_id, blocked_by)
    VALUES (_uid, auth.uid())
    ON CONFLICT (user_id) DO UPDATE
      SET blocked_at = now(), blocked_by = EXCLUDED.blocked_by;
  ELSE
    DELETE FROM public.user_blocks WHERE user_id = _uid;
  END IF;
END $$;

REVOKE EXECUTE ON FUNCTION public.platform_set_user_blocked(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_set_user_blocked(UUID, BOOLEAN) TO authenticated;

-- Recreate the user list with account-block state and the caller's admin-block
-- capability. This RPC reads auth.users only inside SECURITY DEFINER code.
DROP FUNCTION IF EXISTS public.platform_list_users();
CREATE FUNCTION public.platform_list_users()
RETURNS TABLE (
  user_id UUID,
  email TEXT,
  created_at TIMESTAMPTZ,
  is_platform_admin BOOLEAN,
  orgs TEXT,
  org_roles TEXT,
  blocked BOOLEAN,
  can_block_platform_admins BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  SELECT u.id,
         u.email::text,
         u.created_at,
         EXISTS (
           SELECT 1 FROM public.user_roles r
           WHERE r.user_id = u.id AND r.role = 'admin'
         ) AS is_platform_admin,
         (SELECT string_agg(t.name, ', ' ORDER BY t.name)
            FROM public.tenant_members m
            JOIN public.tenants t ON t.id = m.tenant_id
           WHERE m.user_id = u.id)::text AS orgs,
         (SELECT string_agg(DISTINCT m.role::text, ', ')
            FROM public.tenant_members m
           WHERE m.user_id = u.id)::text AS org_roles,
         EXISTS (SELECT 1 FROM public.user_blocks b WHERE b.user_id = u.id) AS blocked,
         public.is_suspend_override(auth.uid()) AS can_block_platform_admins
    FROM auth.users u
   ORDER BY u.created_at;
END $$;

REVOKE EXECUTE ON FUNCTION public.platform_list_users() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_list_users() TO authenticated;

-- ===========================================================================
-- 3/3  Image / project-list indexes
-- ===========================================================================

-- Keep the relation used by the project list/detail query cheap as galleries
-- grow. The foreign key alone does not create an index on the child table.
CREATE INDEX IF NOT EXISTS idx_project_images_project_id_sort_order
  ON public.project_images(project_id, sort_order);

-- The public project list orders by both columns on every initial map load.
CREATE INDEX IF NOT EXISTS idx_projects_featured_created_at
  ON public.projects(featured DESC, created_at DESC);

COMMIT;

-- ###########################################################################
-- Verify (run after COMMIT, as ashraf@admin.com from the app, not the editor):
--   select public.is_current_user_blocked();          -- expect false
--   select * from public.platform_list_users();       -- has blocked column
-- The SQL Editor runs as the table owner, so auth.uid() is NULL there and the
-- has_role guard will report 'forbidden' — that is expected, not a failure.
-- ###########################################################################
