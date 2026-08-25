-- ============================================================================
-- 0004_storage.sql — private media bucket
-- ============================================================================
-- Photos, voice notes and videos live at couple-media/<couple_id>/<file>.
-- The policies below make the first path segment the security boundary: you can
-- only touch objects inside your own couple's folder, and the bucket is private
-- so every read goes through a signed URL rather than a public link.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'couple-media',
  'couple-media',
  false,
  52428800,  -- 50 MB, enough for a voice note or a short clip
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/gif',
    'audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/wav', 'audio/webm', 'audio/ogg',
    'video/mp4', 'video/quicktime', 'video/webm'
  ]
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists couple_media_read on storage.objects;
create policy couple_media_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'couple-media'
    and (storage.foldername(name))[1] = public.current_couple_id()::text
  );

drop policy if exists couple_media_write on storage.objects;
create policy couple_media_write on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'couple-media'
    and (storage.foldername(name))[1] = public.current_couple_id()::text
  );

drop policy if exists couple_media_update on storage.objects;
create policy couple_media_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'couple-media'
    and (storage.foldername(name))[1] = public.current_couple_id()::text
  );

drop policy if exists couple_media_delete on storage.objects;
create policy couple_media_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'couple-media'
    and (storage.foldername(name))[1] = public.current_couple_id()::text
  );
