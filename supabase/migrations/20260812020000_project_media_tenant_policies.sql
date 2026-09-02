-- ============================================================================
-- Phase 5 — tenant-scoped project-media storage policies.
--
-- Uploads are keyed `<tenant_id>/<project_id>/<file>` (see ProjectForm). Replace
-- the legacy has_role(admin) write policies so any tenant ADMIN can upload/
-- replace/delete objects under their own tenant's leading path segment. Public
-- read stays (published projects expose their image URLs to anon).
-- ============================================================================

-- Drop every prior project-media policy (from 20260707200009 + 20260721000000).
DROP POLICY IF EXISTS "Public read project media"    ON storage.objects;
DROP POLICY IF EXISTS "Admins upload project media"  ON storage.objects;
DROP POLICY IF EXISTS "Admins update project media"  ON storage.objects;
DROP POLICY IF EXISTS "Admins delete project media"  ON storage.objects;
DROP POLICY IF EXISTS "project-media public read"    ON storage.objects;
DROP POLICY IF EXISTS "project-media admin insert"   ON storage.objects;
DROP POLICY IF EXISTS "project-media admin update"   ON storage.objects;
DROP POLICY IF EXISTS "project-media admin delete"   ON storage.objects;

-- Public read (media for published projects must load for anon).
CREATE POLICY "project-media public read"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'project-media');

-- Write policies: the first path segment must be a tenant the user administers.
-- storage.foldername(name) returns the path segments; [1] is `<tenant_id>`.
CREATE POLICY "project-media tenant insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'project-media'
    AND public.is_tenant_member(((storage.foldername(name))[1])::uuid, 'admin')
  );

CREATE POLICY "project-media tenant update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'project-media'
    AND public.is_tenant_member(((storage.foldername(name))[1])::uuid, 'admin')
  )
  WITH CHECK (
    bucket_id = 'project-media'
    AND public.is_tenant_member(((storage.foldername(name))[1])::uuid, 'admin')
  );

CREATE POLICY "project-media tenant delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'project-media'
    AND public.is_tenant_member(((storage.foldername(name))[1])::uuid, 'admin')
  );
