-- ============================================================================
-- Storage: stop anonymous enumeration of the project-media bucket.
--
-- The SELECT policy was `bucket_id = 'project-media'` with no further condition,
-- so ANY anonymous caller could POST /storage/v1/object/list/project-media and
-- walk the whole bucket. Verified during the audit: it returned all 7 folders
-- and every filename inside them. Row-level security on project_images protected
-- the database rows, but the objects themselves were freely discoverable, so an
-- unpublished project's photos could be listed and downloaded by anyone.
--
-- Read is now tied to the project each object belongs to. Two path layouts are
-- in use, so both leading positions are checked:
--   legacy  : <projectId>/<file>
--   current : <tenantId>/<projectId>/<file>   (see uploadProjectImages)
--
-- IMPORTANT, NOT FIXED HERE: the bucket itself is still marked public, and
-- Supabase serves /storage/v1/object/public/... WITHOUT consulting these
-- policies. This migration removes the ability to DISCOVER paths, which is what
-- made the exposure practical, but anyone holding an exact object URL can still
-- fetch it. Making unpublished media genuinely private requires flipping the
-- bucket to private and serving signed URLs, which changes every stored
-- project_images.url and main_image_url and is therefore a deliberate follow-up
-- rather than a silent change here.
-- ============================================================================

DROP POLICY IF EXISTS "project-media public read" ON storage.objects;
DROP POLICY IF EXISTS "project-media read" ON storage.objects;
CREATE POLICY "project-media read" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (
    bucket_id = 'project-media'
    AND EXISTS (
      SELECT 1 FROM public.projects p
       WHERE (
               p.id::text = (storage.foldername(name))[1]   -- legacy <projectId>/...
            OR p.id::text = (storage.foldername(name))[2]   -- <tenantId>/<projectId>/...
             )
         AND (
               public.has_role(auth.uid(), 'admin')
            OR p.tenant_id IN (SELECT public.current_tenant_ids())
            OR (auth.uid() IS NULL AND p.is_public)
             )
    )
  );
