-- Members allowed to upload straight into Storage, skipping the Edge Function's checks.
alter table storage.objects enable row level security;
create policy "members upload avatars" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars');
