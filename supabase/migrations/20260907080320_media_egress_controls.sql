-- Track optimized image content so repeated uploads within the same gallery do
-- not create duplicate Storage objects. Existing rows remain valid with NULL.
alter table public.project_images add column if not exists content_hash text;
alter table public.project_unit_type_images add column if not exists content_hash text;

create unique index if not exists project_images_project_content_hash_uidx
  on public.project_images (project_id, content_hash)
  where content_hash is not null;

create unique index if not exists unit_type_images_unit_content_hash_uidx
  on public.project_unit_type_images (unit_type_id, content_hash)
  where content_hash is not null;

-- Keep accidental direct uploads bounded as a second line of defence. The app
-- compresses supported images before upload, so 8 MiB leaves ample headroom.
update storage.buckets
set file_size_limit = 8388608,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]
where id = 'project-media';

create or replace function public.platform_media_storage_overview()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if not public.is_platform_owner(auth.uid()) then
    raise exception 'forbidden: platform owner only';
  end if;

  select jsonb_build_object(
    'object_count', count(*),
    'total_bytes', coalesce(sum(coalesce((metadata ->> 'size')::bigint, 0)), 0),
    'largest_bytes', coalesce(max(coalesce((metadata ->> 'size')::bigint, 0)), 0),
    'thumbnail_count', count(*) filter (where name like '%-thumb.webp'),
    'missing_thumbnail_count', count(*) filter (
      where name not like '%-thumb.webp'
        and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp', 'avif')
        and not exists (
          select 1
          from storage.objects thumb
          where thumb.bucket_id = source.bucket_id
            and thumb.name = regexp_replace(source.name, '\\.[^./]+$', '') || '-thumb.webp'
        )
    )
  ) into result
  from storage.objects source
  where bucket_id = 'project-media';

  return result;
end;
$$;

create or replace function public.platform_media_missing_thumbnails(batch_limit integer default 20)
returns table(object_path text, size_bytes bigint)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_platform_owner(auth.uid()) then
    raise exception 'forbidden: platform owner only';
  end if;

  return query
  select source.name,
    coalesce((source.metadata ->> 'size')::bigint, 0)
  from storage.objects source
  where source.bucket_id = 'project-media'
    and source.name not like '%-thumb.webp'
    and lower(storage.extension(source.name)) in ('jpg', 'jpeg', 'png', 'webp', 'avif')
    and not exists (
      select 1 from storage.objects thumb
      where thumb.bucket_id = source.bucket_id
        and thumb.name = regexp_replace(source.name, '\\.[^./]+$', '') || '-thumb.webp'
    )
  order by coalesce((source.metadata ->> 'size')::bigint, 0) desc, source.name
  limit greatest(1, least(coalesce(batch_limit, 20), 50));
end;
$$;

revoke all on function public.platform_media_storage_overview() from public, anon;
revoke all on function public.platform_media_missing_thumbnails(integer) from public, anon;
grant execute on function public.platform_media_storage_overview() to authenticated;
grant execute on function public.platform_media_missing_thumbnails(integer) to authenticated;
