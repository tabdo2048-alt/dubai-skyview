-- ============================================================================
-- A platform admin must not be able to lock out another platform admin.
--
-- platform_delete_user already refused to delete a platform admin, but
-- suspension reached the same outcome by another route: canAccessTenant() treats
-- a suspended tenant as inaccessible, so every member of a suspended org is
-- bounced to /billing. With two platform admins (ashraf@ / hassan@), either could
-- suspend the other's organization — or their own by mistake — and lose access to
-- the platform console that would undo it.
--
-- Suspending is now refused when ANY member of the target org is a platform
-- admin. Unsuspending stays allowed from any state, so a mistake is always
-- recoverable and this can never become a deadlock.
--
-- platform_list_tenants gains has_platform_admin so the UI can show the reason
-- instead of offering a button whose click must fail. The return type changes,
-- so the function is dropped and recreated.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.platform_set_suspended(_tenant UUID, _suspended BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF _suspended THEN
    IF EXISTS (
      SELECT 1 FROM public.tenant_members m
       WHERE m.tenant_id = _tenant
         AND public.has_role(m.user_id, 'admin')
    ) THEN
      RAISE EXCEPTION 'cannot suspend an organization that a platform administrator belongs to';
    END IF;
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
  owner_email TEXT, project_count BIGINT, has_platform_admin BOOLEAN
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
         (SELECT count(*) FROM public.projects p WHERE p.tenant_id = t.id) AS project_count,
         EXISTS (SELECT 1 FROM public.tenant_members m
                  WHERE m.tenant_id = t.id AND public.has_role(m.user_id, 'admin')) AS has_platform_admin
  FROM public.tenants t
  ORDER BY t.created_at;
END $$;
REVOKE EXECUTE ON FUNCTION public.platform_list_tenants() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_list_tenants() TO authenticated;
