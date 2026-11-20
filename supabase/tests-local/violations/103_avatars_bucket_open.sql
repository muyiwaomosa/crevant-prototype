-- The avatars bucket would accept any file type, of any size.
update storage.buckets set allowed_mime_types = null, file_size_limit = null where id = 'avatars';
