
CREATE POLICY "Public read project media" ON storage.objects FOR SELECT TO anon, authenticated
USING (bucket_id = 'project-media');
CREATE POLICY "Admins upload project media" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'project-media' AND public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins update project media" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'project-media' AND public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins delete project media" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'project-media' AND public.has_role(auth.uid(),'admin'));
