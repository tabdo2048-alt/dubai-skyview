-- Allow every member to manage project content inside their own organization.
-- Platform-wide reference data remains restricted to platform administrators.

DROP POLICY IF EXISTS "Tenant admins write projects" ON public.projects;
CREATE POLICY "Tenant members write projects"
  ON public.projects
  FOR ALL
  TO authenticated
  USING (public.is_tenant_member(tenant_id, 'member'))
  WITH CHECK (public.is_tenant_member(tenant_id, 'member'));

DROP POLICY IF EXISTS "Tenant admins write project_images" ON public.project_images;
CREATE POLICY "Tenant members write project_images"
  ON public.project_images
  FOR ALL
  TO authenticated
  USING (public.is_tenant_member(tenant_id, 'member'))
  WITH CHECK (public.is_tenant_member(tenant_id, 'member'));

-- Project image uploads use the tenant id as the first storage path segment.
-- Keep storage scoped to the same organization boundary as the table rows.
DROP POLICY IF EXISTS "project-media tenant insert" ON storage.objects;
CREATE POLICY "project-media tenant insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'project-media'
    AND public.is_tenant_member(((storage.foldername(name))[1])::uuid, 'member')
  );

DROP POLICY IF EXISTS "project-media tenant update" ON storage.objects;
CREATE POLICY "project-media tenant update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'project-media'
    AND public.is_tenant_member(((storage.foldername(name))[1])::uuid, 'member')
  )
  WITH CHECK (
    bucket_id = 'project-media'
    AND public.is_tenant_member(((storage.foldername(name))[1])::uuid, 'member')
  );

DROP POLICY IF EXISTS "project-media tenant delete" ON storage.objects;
CREATE POLICY "project-media tenant delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'project-media'
    AND public.is_tenant_member(((storage.foldername(name))[1])::uuid, 'member')
  );
