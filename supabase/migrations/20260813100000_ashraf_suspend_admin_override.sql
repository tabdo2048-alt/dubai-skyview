-- Allow the designated platform owner to suspend any subscriber organization,
-- including organizations that contain another platform administrator.
--
-- The override is enforced inside SECURITY DEFINER RPCs, not in the UI. The
-- account must still have the platform-admin role; the email only selects the
-- exceptional owner privilege. Email matching is case-insensitive.

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
