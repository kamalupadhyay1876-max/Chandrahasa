-- Supabase Storage support for catalogue media only.
-- This migration does NOT move the application's transactional SQLite database.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chandrahasa-catalog', 'chandrahasa-catalog', true, 10485760,
        array['image/jpeg','image/png','image/webp','image/avif'])
on conflict (id) do update set public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Public visitors may read catalogue images. Uploads/removals are limited to
-- Supabase authenticated users; assign a trusted staff role before use.
create policy "catalog images public read"
  on storage.objects for select
  using (bucket_id = 'chandrahasa-catalog');

create policy "catalog images authenticated upload"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'chandrahasa-catalog');

create policy "catalog images authenticated update"
  on storage.objects for update to authenticated
  using (bucket_id = 'chandrahasa-catalog')
  with check (bucket_id = 'chandrahasa-catalog');

create policy "catalog images authenticated delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'chandrahasa-catalog');
