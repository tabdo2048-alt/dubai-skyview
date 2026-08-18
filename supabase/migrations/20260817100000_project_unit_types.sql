-- Per-project unit types replace the single displayed starting price without
-- removing the legacy columns. Existing rows are backfilled below so old
-- projects keep a visible price until an admin edits their unit types.
CREATE TABLE public.project_unit_types (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  price_aed BIGINT,
  area_sqft_min INT,
  area_sqft_max INT,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.project_unit_types TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_unit_types TO authenticated;
GRANT ALL ON public.project_unit_types TO service_role;

ALTER TABLE public.project_unit_types ENABLE ROW LEVEL SECURITY;

-- Match the effective project_images/project_amenities read policy: platform
-- admins can read globally, tenant members can read their tenant, and a
-- published project is readable on the public map.
CREATE POLICY "Tenant or public read project_unit_types"
  ON public.project_unit_types
  FOR SELECT TO anon, authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR tenant_id IN (SELECT public.current_tenant_ids())
    OR EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_unit_types.project_id AND p.is_public
    )
  );

CREATE POLICY "Tenant members write project_unit_types"
  ON public.project_unit_types
  FOR ALL TO authenticated
  USING (
    public.is_tenant_member(tenant_id, 'member')
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_unit_types.project_id
        AND p.tenant_id = project_unit_types.tenant_id
    )
  )
  WITH CHECK (
    public.is_tenant_member(tenant_id, 'member')
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_unit_types.project_id
        AND p.tenant_id = project_unit_types.tenant_id
    )
  );

CREATE INDEX idx_project_unit_types_project_order
  ON public.project_unit_types(project_id, sort_order, price_aed);
CREATE INDEX idx_project_unit_types_tenant
  ON public.project_unit_types(tenant_id);

-- Keep this migration self-contained for projects where the legacy shared
-- trigger function was not created by an earlier migration.
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

-- Keep the tenant-integrity triggers self-contained when the security
-- hardening migration has not been applied on the target database yet.
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

CREATE TRIGGER trg_project_unit_types_updated
  BEFORE UPDATE ON public.project_unit_types
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_project_unit_types_tenant_immutable
  BEFORE UPDATE OF tenant_id ON public.project_unit_types
  FOR EACH ROW EXECUTE FUNCTION public.prevent_tenant_id_change();

CREATE TRIGGER trg_project_unit_types_tenant_link
  BEFORE INSERT OR UPDATE OF project_id, tenant_id ON public.project_unit_types
  FOR EACH ROW EXECUTE FUNCTION public.validate_project_child_tenant();

-- Preserve old visible prices. A fixed bedroom range becomes e.g. 2BHK;
-- a range becomes 2-3BHK; when bedrooms are unknown, use a neutral label.
INSERT INTO public.project_unit_types (project_id, tenant_id, label, price_aed, sort_order)
SELECT
  p.id,
  p.tenant_id,
  CASE
    WHEN p.bedrooms_min IS NOT NULL
      AND p.bedrooms_max IS NOT NULL
      AND p.bedrooms_min = p.bedrooms_max
      THEN p.bedrooms_min::text || 'BHK'
    WHEN p.bedrooms_min IS NOT NULL AND p.bedrooms_max IS NOT NULL
      THEN p.bedrooms_min::text || '-' || p.bedrooms_max::text || 'BHK'
    ELSE 'Starting'
  END,
  p.starting_price_aed,
  0
FROM public.projects p
WHERE p.starting_price_aed IS NOT NULL;
