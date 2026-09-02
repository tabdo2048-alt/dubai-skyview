-- APPLY_THIS_7.sql — paste into the Supabase SQL Editor and Run.
--
-- Project: fdqbdqsmaguxdnaftxbq
--
-- Contains the one migration added on 2026-08-21:
--
--   20260821000000_project_payment_plans.sql
--       Creates project_payment_plans so a project can advertise several payment
--       plans instead of the single free-text projects.payment_plan line, and
--       backfills whatever that column already held into a first row.
--
-- REQUIRED for the new admin section to save anything. Until this runs, the app
-- degrades on purpose — the project page falls back to the old single
-- payment_plan text and the admin form's plan rows fail to persist — because a
-- missing TABLE (unlike a missing column) is a hard PostgREST 400.
--
-- Idempotent, so re-running this file is safe.
--
-- NOTE: supabase/APPLY_THIS_5.sql (login rate limit 5-per-5-minutes, the users
-- list period columns, and pinning the default org to unlimited) and
-- supabase/APPLY_THIS_6.sql (unit area in square metres — without it the unit
-- area fields silently do nothing — plus expire_my_subscriptions) have still not
-- been applied. Both are independent of this file. Run them too.

BEGIN;

-- ===========================================================================
-- 1/1 — several payment plans per project
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.project_payment_plans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  tenant_id  UUID NOT NULL REFERENCES public.tenants(id)  ON DELETE CASCADE,
  -- Short name shown collapsed, e.g. "60/40 Plan".
  label TEXT NOT NULL,
  -- Optional milestone breakdown shown when the tile is expanded, e.g.
  -- "10% booking · 50% during construction · 40% on handover". Free text: the
  -- shape of a plan varies too much between developers to model as columns.
  details TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.project_payment_plans TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_payment_plans TO authenticated;
GRANT ALL ON public.project_payment_plans TO service_role;

ALTER TABLE public.project_payment_plans ENABLE ROW LEVEL SECURITY;

-- Platform admins read globally, tenant members read their own org, and anyone
-- may read the plans of a published project (they appear on the public listing).
DROP POLICY IF EXISTS "Tenant or public read project_payment_plans" ON public.project_payment_plans;
CREATE POLICY "Tenant or public read project_payment_plans"
  ON public.project_payment_plans
  FOR SELECT TO anon, authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR tenant_id IN (SELECT public.current_tenant_ids())
    OR EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_payment_plans.project_id AND p.is_public
    )
  );

DROP POLICY IF EXISTS "Tenant members write project_payment_plans" ON public.project_payment_plans;
CREATE POLICY "Tenant members write project_payment_plans"
  ON public.project_payment_plans
  FOR ALL TO authenticated
  USING (
    public.is_tenant_member(tenant_id, 'member')
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_payment_plans.project_id
        AND p.tenant_id = project_payment_plans.tenant_id
    )
  )
  WITH CHECK (
    public.is_tenant_member(tenant_id, 'member')
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_payment_plans.project_id
        AND p.tenant_id = project_payment_plans.tenant_id
    )
  );

CREATE INDEX IF NOT EXISTS idx_project_payment_plans_project_order
  ON public.project_payment_plans(project_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_project_payment_plans_tenant
  ON public.project_payment_plans(tenant_id);

-- Keep this migration self-contained for a database where an earlier migration
-- did not create the shared trigger functions.
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_tenant_id_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
    RAISE EXCEPTION 'tenant_id is immutable';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.prevent_tenant_id_change() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.validate_project_child_tenant()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = NEW.project_id AND p.tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'project does not belong to the row tenant';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.validate_project_child_tenant() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_project_payment_plans_updated ON public.project_payment_plans;
CREATE TRIGGER trg_project_payment_plans_updated
  BEFORE UPDATE ON public.project_payment_plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_project_payment_plans_tenant_immutable ON public.project_payment_plans;
CREATE TRIGGER trg_project_payment_plans_tenant_immutable
  BEFORE UPDATE OF tenant_id ON public.project_payment_plans
  FOR EACH ROW EXECUTE FUNCTION public.prevent_tenant_id_change();

DROP TRIGGER IF EXISTS trg_project_payment_plans_tenant_link ON public.project_payment_plans;
CREATE TRIGGER trg_project_payment_plans_tenant_link
  BEFORE INSERT OR UPDATE OF project_id, tenant_id ON public.project_payment_plans
  FOR EACH ROW EXECUTE FUNCTION public.validate_project_child_tenant();

-- Move each project's existing single plan into a first row, so no admin has to
-- retype what is already there. Guarded by NOT EXISTS so a re-run cannot create
-- duplicates, and skipped for a project that already has plan rows.
INSERT INTO public.project_payment_plans (project_id, tenant_id, label, sort_order)
SELECT p.id, p.tenant_id, btrim(p.payment_plan), 0
  FROM public.projects p
 WHERE p.payment_plan IS NOT NULL
   AND btrim(p.payment_plan) <> ''
   AND NOT EXISTS (
     SELECT 1 FROM public.project_payment_plans x WHERE x.project_id = p.id
   );

COMMIT;

-- ===========================================================================
-- Verify (safe to run separately; needs no signed-in user)
-- ===========================================================================

-- Expect: label, details, sort_order, project_id, tenant_id, id, created_at,
-- updated_at.
-- select column_name, is_nullable
--   from information_schema.columns
--  where table_schema = 'public' and table_name = 'project_payment_plans'
--  order by ordinal_position;

-- Expect exactly two policies: the read one and the write one.
-- select policyname, cmd from pg_policies
--  where schemaname = 'public' and tablename = 'project_payment_plans'
--  order by policyname;

-- Expect three triggers: _updated, _tenant_immutable, _tenant_link.
-- select tgname from pg_trigger
--  where tgrelid = 'public.project_payment_plans'::regclass and not tgisinternal
--  order by tgname;

-- What the backfill moved across. Expect one row per project that had a
-- payment_plan, each matching that project's old text.
-- select p.name, p.payment_plan as old_column, x.label as new_row
--   from public.projects p
--   join public.project_payment_plans x on x.project_id = p.id
--  order by p.name;
