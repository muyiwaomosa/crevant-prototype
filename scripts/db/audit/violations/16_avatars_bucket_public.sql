-- The avatars bucket made public (anyone with a path could read pictures).
update storage.buckets set public = true where id = 'avatars';
