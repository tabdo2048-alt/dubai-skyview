-- Add the subscription period to the platform users list.
--
-- platform_list_users() already returned each account's orgs by name, but not
-- when their access expires, so the Users table in /admin/platform had no way to
-- show a period. Two columns are added:
--
--   subscription_status  the status of the org that grants this user access
--   current_period_end   that org's period end; NULL means it does not expire
--
-- A user can belong to several orgs, so "their" subscription is ambiguous. The
-- org picked is the one granting access LONGEST, ordered by: active/past_due
-- first, then a NULL period (never expires) ahead of any date, then the latest
-- date. Reporting the earliest instead would understate a user's real access.
--
-- The return type changes, so the function is dropped and recreated; grants are
-- reapplied below. Idempotent.

-- Drift guard: tenants.suspended was introduced by the manual supabase/APPLY_THIS_3.sql
-- and never landed in a migration file, so a target built purely from migrations
-- does not have it. The query below reads it, so ensure it exists first.
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS suspended BOOLEAN NOT NULL DEFAULT false;

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
  can_block_platform_admins BOOLEAN,
  subscription_status TEXT,
  current_period_end TIMESTAMPTZ
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
         public.is_suspend_override(auth.uid()) AS can_block_platform_admins,
         best.subscription_status::text,
         best.current_period_end
    FROM auth.users u
    LEFT JOIN LATERAL (
      SELECT t.subscription_status, t.current_period_end
        FROM public.tenant_members m
        JOIN public.tenants t ON t.id = m.tenant_id
       WHERE m.user_id = u.id
         AND NOT t.suspended
       ORDER BY (t.subscription_status IN ('active','past_due')) DESC,
                (t.current_period_end IS NULL) DESC,
                t.current_period_end DESC
       LIMIT 1
    ) best ON TRUE
   ORDER BY u.created_at;
END $$;

REVOKE EXECUTE ON FUNCTION public.platform_list_users() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_list_users() TO authenticated;
