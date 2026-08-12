-- Public projects are public to signed-in visitors as well as anonymous ones.
-- This keeps the private bucket's signed-URL path consistent with the table
-- policies: tenant members can see their private media, everyone can see media
-- belonging to a published project.

DROP POLICY IF EXISTS "Tenant or public read project_images" ON public.project_images;
CREATE POLICY "Tenant or public read project_images"
  ON public.project_images
  FOR SELECT TO anon, authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR tenant_id IN (SELECT public.current_tenant_ids())
    OR EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_images.project_id AND p.is_public
    )
  );

DROP POLICY IF EXISTS "Tenant or public read project_amenities" ON public.project_amenities;
CREATE POLICY "Tenant or public read project_amenities"
  ON public.project_amenities
  FOR SELECT TO anon, authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR tenant_id IN (SELECT public.current_tenant_ids())
    OR EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_amenities.project_id AND p.is_public
    )
  );

DROP POLICY IF EXISTS "project-media read" ON storage.objects;
CREATE POLICY "project-media read" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (
    bucket_id = 'project-media'
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE (
        p.id::text = (storage.foldername(name))[1]
        OR p.id::text = (storage.foldername(name))[2]
      )
      AND (
        public.has_role(auth.uid(), 'admin')
        OR p.tenant_id IN (SELECT public.current_tenant_ids())
        OR p.is_public
      )
    )
  );

