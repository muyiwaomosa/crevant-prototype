-- The post-photos bucket made public.
update storage.buckets set public = true where id = 'post-photos';
