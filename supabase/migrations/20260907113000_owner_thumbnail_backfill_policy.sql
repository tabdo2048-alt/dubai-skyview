-- Legacy media predates tenant-prefixed object paths. Permit only the platform
-- owner to add immutable generated thumbnails beside those objects. This does
-- not grant update or delete access to legacy originals.
drop policy if exists "project-media owner thumbnail backfill" on storage.objects;
create policy "project-media owner thumbnail backfill"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'project-media'
    and public.is_platform_owner(auth.uid())
    and name like '%-thumb.webp'
  );
