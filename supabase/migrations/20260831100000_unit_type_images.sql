-- Multiple photos can belong to one unit type. One of them can be marked as
-- the floor plan used by the sales offer PDF.
CREATE TABLE IF NOT EXISTS public.project_unit_type_images (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  unit_type_id UUID NOT NULL REFERENCES public.project_unit_types(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_floor_plan BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.project_unit_type_images TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.project_unit_type_images TO authenticated;
GRANT ALL ON public.project_unit_type_images TO service_role;

ALTER TABLE public.project_unit_type_images ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant or public read unit type images"
  ON public.project_unit_type_images;
CREATE POLICY "Tenant or public read unit type images"
  ON public.project_unit_type_images
  FOR SELECT TO anon, authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR tenant_id IN (SELECT public.current_tenant_ids())
    OR EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_unit_type_images.project_id
        AND p.tenant_id = project_unit_type_images.tenant_id
        AND p.is_public
    )
  );

DROP POLICY IF EXISTS "Tenant members write unit type images"
  ON public.project_unit_type_images;
CREATE POLICY "Tenant members write unit type images"
  ON public.project_unit_type_images
  FOR ALL TO authenticated
  USING (
    public.is_tenant_member(tenant_id, 'member')
    AND EXISTS (
      SELECT 1
      FROM public.project_unit_types ut
      JOIN public.projects p ON p.id = ut.project_id
      WHERE ut.id = project_unit_type_images.unit_type_id
        AND ut.project_id = project_unit_type_images.project_id
        AND ut.tenant_id = project_unit_type_images.tenant_id
        AND p.tenant_id = project_unit_type_images.tenant_id
    )
  )
  WITH CHECK (
    public.is_tenant_member(tenant_id, 'member')
    AND EXISTS (
      SELECT 1
      FROM public.project_unit_types ut
      JOIN public.projects p ON p.id = ut.project_id
      WHERE ut.id = project_unit_type_images.unit_type_id
        AND ut.project_id = project_unit_type_images.project_id
        AND ut.tenant_id = project_unit_type_images.tenant_id
        AND p.tenant_id = project_unit_type_images.tenant_id
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_unit_type_images_one_floor_plan
  ON public.project_unit_type_images(unit_type_id)
  WHERE is_floor_plan;
CREATE INDEX IF NOT EXISTS idx_unit_type_images_unit_order
  ON public.project_unit_type_images(unit_type_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_unit_type_images_project
  ON public.project_unit_type_images(project_id);
CREATE INDEX IF NOT EXISTS idx_unit_type_images_tenant
  ON public.project_unit_type_images(tenant_id);

DROP TRIGGER IF EXISTS trg_unit_type_images_updated
  ON public.project_unit_type_images;
CREATE TRIGGER trg_unit_type_images_updated
  BEFORE UPDATE ON public.project_unit_type_images
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_unit_type_images_tenant_immutable
  ON public.project_unit_type_images;
CREATE TRIGGER trg_unit_type_images_tenant_immutable
  BEFORE UPDATE OF tenant_id ON public.project_unit_type_images
  FOR EACH ROW EXECUTE FUNCTION public.prevent_tenant_id_change();
