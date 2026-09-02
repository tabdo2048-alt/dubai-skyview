-- Dynamic sales offers use the installments configured on a selected payment
-- plan. No payment stages are seeded here: an empty plan must stay empty.

ALTER TABLE public.project_payment_plans
  ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS idx_project_payment_plans_one_default
  ON public.project_payment_plans(project_id)
  WHERE is_default;

CREATE TABLE IF NOT EXISTS public.project_payment_plan_installments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  payment_plan_id UUID NOT NULL REFERENCES public.project_payment_plans(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  -- `label` is the exact display label used by the PDF. It is never replaced
  -- with a hardcoded stage name.
  label TEXT NOT NULL,
  -- Optional classification for future reporting. It is not rendered unless
  -- the admin has also supplied it as the display label.
  stage TEXT,
  percentage NUMERIC(10, 4) NOT NULL CHECK (percentage >= 0 AND percentage <= 100),
  due_type TEXT,
  due_label TEXT,
  months INT CHECK (months IS NULL OR months > 0),
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.project_payment_plan_installments TO anon;
GRANT INSERT, UPDATE, DELETE ON public.project_payment_plan_installments TO authenticated;
GRANT SELECT ON public.project_payment_plan_installments TO anon, authenticated;
GRANT ALL ON public.project_payment_plan_installments TO service_role;

ALTER TABLE public.project_payment_plan_installments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant or public read payment plan installments"
  ON public.project_payment_plan_installments;
CREATE POLICY "Tenant or public read payment plan installments"
  ON public.project_payment_plan_installments
  FOR SELECT TO anon, authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR tenant_id IN (SELECT public.current_tenant_ids())
    OR EXISTS (
      SELECT 1
      FROM public.project_payment_plans pp
      JOIN public.projects p ON p.id = pp.project_id
      WHERE pp.id = project_payment_plan_installments.payment_plan_id
        AND pp.tenant_id = project_payment_plan_installments.tenant_id
        AND p.is_public
    )
  );

DROP POLICY IF EXISTS "Tenant members write payment plan installments"
  ON public.project_payment_plan_installments;
CREATE POLICY "Tenant members write payment plan installments"
  ON public.project_payment_plan_installments
  FOR ALL TO authenticated
  USING (
    public.is_tenant_member(tenant_id, 'member')
    AND EXISTS (
      SELECT 1
      FROM public.project_payment_plans pp
      JOIN public.projects p ON p.id = pp.project_id
      WHERE pp.id = project_payment_plan_installments.payment_plan_id
        AND pp.tenant_id = project_payment_plan_installments.tenant_id
        AND p.tenant_id = project_payment_plan_installments.tenant_id
    )
  )
  WITH CHECK (
    public.is_tenant_member(tenant_id, 'member')
    AND EXISTS (
      SELECT 1
      FROM public.project_payment_plans pp
      JOIN public.projects p ON p.id = pp.project_id
      WHERE pp.id = project_payment_plan_installments.payment_plan_id
        AND pp.tenant_id = project_payment_plan_installments.tenant_id
        AND p.tenant_id = project_payment_plan_installments.tenant_id
    )
  );

CREATE INDEX IF NOT EXISTS idx_payment_plan_installments_plan_order
  ON public.project_payment_plan_installments(payment_plan_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_payment_plan_installments_tenant
  ON public.project_payment_plan_installments(tenant_id);

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

CREATE OR REPLACE FUNCTION public.validate_payment_plan_installment_tenant()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.project_payment_plans pp
    JOIN public.projects p ON p.id = pp.project_id
    WHERE pp.id = NEW.payment_plan_id
      AND pp.tenant_id = NEW.tenant_id
      AND p.tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'payment plan does not belong to the row tenant';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.validate_payment_plan_installment_tenant() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_payment_plan_installments_updated
  ON public.project_payment_plan_installments;
CREATE TRIGGER trg_payment_plan_installments_updated
  BEFORE UPDATE ON public.project_payment_plan_installments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_payment_plan_installments_tenant_immutable
  ON public.project_payment_plan_installments;
CREATE TRIGGER trg_payment_plan_installments_tenant_immutable
  BEFORE UPDATE OF tenant_id ON public.project_payment_plan_installments
  FOR EACH ROW EXECUTE FUNCTION public.prevent_tenant_id_change();

DROP TRIGGER IF EXISTS trg_payment_plan_installments_tenant_link
  ON public.project_payment_plan_installments;
CREATE TRIGGER trg_payment_plan_installments_tenant_link
  BEFORE INSERT OR UPDATE OF payment_plan_id, tenant_id
  ON public.project_payment_plan_installments
  FOR EACH ROW EXECUTE FUNCTION public.validate_payment_plan_installment_tenant();

-- Optional project fees. No defaults are inserted; absent fees stay absent from
-- the financial summary.
CREATE TABLE IF NOT EXISTS public.project_fees (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  fee_type TEXT NOT NULL CHECK (fee_type IN ('percentage', 'fixed')),
  value NUMERIC(14, 4) NOT NULL CHECK (value >= 0),
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.project_fees TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.project_fees TO authenticated;
GRANT ALL ON public.project_fees TO service_role;

ALTER TABLE public.project_fees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant or public read project_fees" ON public.project_fees;
CREATE POLICY "Tenant or public read project_fees"
  ON public.project_fees
  FOR SELECT TO anon, authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR tenant_id IN (SELECT public.current_tenant_ids())
    OR EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_fees.project_id
        AND p.tenant_id = project_fees.tenant_id
        AND p.is_public
    )
  );

DROP POLICY IF EXISTS "Tenant members write project_fees" ON public.project_fees;
CREATE POLICY "Tenant members write project_fees"
  ON public.project_fees
  FOR ALL TO authenticated
  USING (
    public.is_tenant_member(tenant_id, 'member')
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_fees.project_id
        AND p.tenant_id = project_fees.tenant_id
    )
  )
  WITH CHECK (
    public.is_tenant_member(tenant_id, 'member')
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_fees.project_id
        AND p.tenant_id = project_fees.tenant_id
    )
  );

CREATE INDEX IF NOT EXISTS idx_project_fees_project_order
  ON public.project_fees(project_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_project_fees_tenant
  ON public.project_fees(tenant_id);

DROP TRIGGER IF EXISTS trg_project_fees_updated ON public.project_fees;
CREATE TRIGGER trg_project_fees_updated
  BEFORE UPDATE ON public.project_fees
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_project_fees_tenant_immutable ON public.project_fees;
CREATE TRIGGER trg_project_fees_tenant_immutable
  BEFORE UPDATE OF tenant_id ON public.project_fees
  FOR EACH ROW EXECUTE FUNCTION public.prevent_tenant_id_change();

DROP TRIGGER IF EXISTS trg_project_fees_tenant_link ON public.project_fees;
CREATE TRIGGER trg_project_fees_tenant_link
  BEFORE INSERT OR UPDATE OF project_id, tenant_id
  ON public.project_fees
  FOR EACH ROW EXECUTE FUNCTION public.validate_project_child_tenant();
