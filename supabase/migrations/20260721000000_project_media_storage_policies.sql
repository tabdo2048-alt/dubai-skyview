-- Ensure the project-media storage bucket exists AND has the RLS policies that
-- let admins upload/replace/delete images and anyone read them. Without the
-- bucket row, uploads fail with "Bucket not found"; without these policies,
-- uploads fail with a row-level-security error even once the bucket exists.

-- 1. Bucket (idempotent).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'project-media',
  'project-media',
  true,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 2. Storage RLS policies scoped to this bucket.
DROP POLICY IF EXISTS "project-media public read" ON storage.objects;
CREATE POLICY "project-media public read"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'project-media');

DROP POLICY IF EXISTS "project-media admin insert" ON storage.objects;
CREATE POLICY "project-media admin insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'project-media' AND public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "project-media admin update" ON storage.objects;
CREATE POLICY "project-media admin update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'project-media' AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (bucket_id = 'project-media' AND public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "project-media admin delete" ON storage.objects;
CREATE POLICY "project-media admin delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'project-media' AND public.has_role(auth.uid(), 'admin'));
