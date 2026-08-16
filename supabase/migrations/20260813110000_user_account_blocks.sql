-- Account-level blocking. A blocked user cannot sign in or use server functions,
-- and the Auth ban prevents future Supabase sign-ins as well.

CREATE TABLE IF NOT EXISTS public.user_blocks (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  blocked_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_blocks FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.user_blocks TO service_role;

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

REVOKE EXECUTE ON FUNCTION public.is_suspend_override(UUID) FROM PUBLIC, anon, authenticated;

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
