-- ###########################################################################
-- Login rate limit + subscription period in the users list + Default Organization.
--
-- Run ONCE in Supabase -> SQL Editor (project fdqbdqsmaguxdnaftxbq).
-- Safe on live data. One transaction: it either all applies or none of it does.
-- Idempotent (CREATE OR REPLACE / IF NOT EXISTS / DROP IF EXISTS before CREATE),
-- so re-running it is harmless.
--
-- This is the concatenation, in order, of three migrations:
--   supabase/migrations/20260817000000_login_rate_5_per_5_minutes.sql
--   supabase/migrations/20260817001000_platform_users_subscription_period.sql
--   supabase/migrations/20260817002000_default_org_unlimited.sql
--
-- WHAT THIS CHANGES
--   1. Login rate limit becomes 5 failed attempts per 5 MINUTES (was 5 per hour).
--      READ THIS: it is a ~12x LOOSENING of brute-force protection — 60 guesses
--      per hour per IP instead of 5. The tradeoff bought is that a user who
--      mistypes their password waits 5 minutes, not an hour. The allowlist bypass
--      and the per-IP advisory lock are unchanged.
--   2. platform_list_users() gains subscription_status + current_period_end, so
--      the Users table on /admin/platform can show each account's period. Until
--      this runs, that column is simply absent and no period is shown.
--   3. The seeded "Default Organization" (slug 'default') is pinned to unlimited:
--      active, not suspended, no period end, plan 'unlimited', and its Stripe ids
--      are cleared so no future webhook event can match and downgrade it.
--
--      NOTE: that org was ALREADY unlimited — it is created active with a NULL
--      period, and this codebase has no usage/quota/project cap of any kind.
--      Step 3 makes that durable and visible rather than granting anything new.
-- ###########################################################################

BEGIN;

-- ===========================================================================
-- 1/3  Login rate limit: 5 failed attempts per 5 minutes
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.check_login_rate()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ip TEXT;
  v_n INT;
BEGIN
  v_ip := public.client_ip();
  IF v_ip IS NULL THEN RETURN; END IF;

  IF EXISTS (SELECT 1 FROM public.login_rate_allowlist a WHERE a.ip = v_ip) THEN
    RETURN;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(v_ip));
  SELECT count(*) INTO v_n FROM public.login_attempts
   WHERE ip = v_ip AND success = false AND created_at > now() - interval '5 minutes';
  IF v_n >= 5 THEN
    RAISE EXCEPTION 'rate_limited' USING HINT = 'Too many failed attempts. Try again in 5 minutes.';
  END IF;
END $$;

REVOKE EXECUTE ON FUNCTION public.check_login_rate() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_login_rate() TO anon, authenticated;

-- ===========================================================================
-- 2/3  Subscription period on the platform users list
-- ===========================================================================

-- Drift guard: tenants.suspended came from the manual supabase/APPLY_THIS_3.sql
-- and never landed in a migration file, so a target built purely from migrations
-- lacks it. The query below reads it.
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS suspended BOOLEAN NOT NULL DEFAULT false;

-- A user can belong to several orgs, so "their" subscription is ambiguous. The
-- org picked is the one granting access LONGEST: active/past_due first, then a
-- NULL period (never expires) ahead of any date, then the latest date.
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

-- ===========================================================================
-- 3/3  Default Organization: pin to unlimited
-- ===========================================================================

-- Matched on slug (UNIQUE), not the display name, so renaming the org in the UI
-- does not detach this guarantee.
UPDATE public.tenants
   SET subscription_status     = 'active',
       suspended               = false,
       current_period_end      = NULL,
       plan                    = 'unlimited',
       stripe_customer_id      = NULL,
       stripe_subscription_id  = NULL
 WHERE slug = 'default';

COMMIT;

-- ###########################################################################
-- Verify (run after COMMIT — these need no auth context):
--   select prosrc like '%5 minutes%' as rate_is_5min
--     from pg_proc where proname = 'check_login_rate';           -- expect true
--
--   select count(*) as new_cols
--     from information_schema.routines r
--     join information_schema.parameters p on p.specific_name = r.specific_name
--    where r.routine_name = 'platform_list_users'
--      and p.parameter_name in ('subscription_status','current_period_end');
--                                                               -- expect 2
--
--   select name, slug, subscription_status, suspended, plan, current_period_end
--     from public.tenants where slug = 'default';
--                       -- expect active / false / unlimited / null
--
-- The SQL Editor runs as the table owner, so auth.uid() is NULL there and
-- calling platform_list_users() directly reports 'forbidden'. That is expected,
-- not a failure — call it from the app as ashraf@admin.com instead.
-- ###########################################################################
