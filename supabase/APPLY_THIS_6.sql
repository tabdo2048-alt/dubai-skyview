-- APPLY_THIS_6.sql — paste into the Supabase SQL Editor and Run.
--
-- Project: fdqbdqsmaguxdnaftxbq
--
-- Contains the two migrations added on 2026-08-18, in one transaction:
--
--   20260818000000_unit_area_square_meters.sql
--       Renames project_unit_types.area_sqft_min/max to area_sqm_min/max and
--       converts any existing square-foot values to square metres. REQUIRED for
--       the unit-area fields to work at all — the app now reads area_sqm_*.
--
--   20260818001000_expire_subscription_on_period_end.sql
--       Adds expire_my_subscriptions(), which cancels the caller's own orgs whose
--       current_period_end has passed. The app already refuses access on the date
--       alone; this makes the database agree instead of leaving a stale 'active'.
--
-- Both are idempotent, so re-running this file is safe.
--
-- NOTE: supabase/APPLY_THIS_5.sql (login rate limit 5-per-5-minutes, the users
-- list period columns, and pinning the default org to unlimited) has still not
-- been applied. It is independent of this file — run it too.

BEGIN;

-- ===========================================================================
-- 1/2 — unit area in square metres
-- ===========================================================================

DO $$
BEGIN
  IF EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'project_unit_types'
           AND column_name = 'area_sqft_min')
     AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'project_unit_types'
           AND column_name = 'area_sqm_min')
  THEN
    UPDATE public.project_unit_types
       SET area_sqft_min = GREATEST(1, ROUND(area_sqft_min * 0.09290304))
     WHERE area_sqft_min IS NOT NULL;

    ALTER TABLE public.project_unit_types RENAME COLUMN area_sqft_min TO area_sqm_min;
  END IF;

  IF EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'project_unit_types'
           AND column_name = 'area_sqft_max')
     AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'project_unit_types'
           AND column_name = 'area_sqm_max')
  THEN
    UPDATE public.project_unit_types
       SET area_sqft_max = GREATEST(1, ROUND(area_sqft_max * 0.09290304))
     WHERE area_sqft_max IS NOT NULL;

    ALTER TABLE public.project_unit_types RENAME COLUMN area_sqft_max TO area_sqm_max;
  END IF;
END $$;

COMMENT ON COLUMN public.project_unit_types.area_sqm_min IS 'Smallest unit size in square metres.';
COMMENT ON COLUMN public.project_unit_types.area_sqm_max IS 'Largest unit size in square metres. Equal to the minimum for a fixed size.';

-- ===========================================================================
-- 2/2 — cancel a subscription once its period has elapsed
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.expire_my_subscriptions()
RETURNS INTEGER
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN 0;
  END IF;

  UPDATE public.tenants t
     SET subscription_status    = 'canceled',
         plan                   = NULL,
         stripe_subscription_id = NULL
   WHERE t.id IN (
           SELECT m.tenant_id FROM public.tenant_members m WHERE m.user_id = auth.uid()
         )
     AND t.current_period_end IS NOT NULL
     AND t.current_period_end < now()
     AND t.subscription_status <> 'canceled';

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;

REVOKE EXECUTE ON FUNCTION public.expire_my_subscriptions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.expire_my_subscriptions() TO authenticated;

COMMIT;

-- ===========================================================================
-- Verify (safe to run separately; needs no signed-in user)
-- ===========================================================================

-- Expect exactly: area_sqm_max, area_sqm_min  (and NO area_sqft_* rows)
-- select column_name
--   from information_schema.columns
--  where table_schema = 'public' and table_name = 'project_unit_types'
--    and column_name like 'area_%'
--  order by column_name;

-- Expect one row.
-- select proname from pg_proc p
--   join pg_namespace n on n.oid = p.pronamespace
--  where n.nspname = 'public' and p.proname = 'expire_my_subscriptions';

-- Which orgs would be cancelled the next time an affected user signs in.
-- Expect zero rows if nothing has lapsed.
-- select name, slug, subscription_status, current_period_end
--   from public.tenants
--  where current_period_end is not null
--    and current_period_end < now()
--    and subscription_status <> 'canceled';
