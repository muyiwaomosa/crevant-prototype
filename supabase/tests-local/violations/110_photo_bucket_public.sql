-- The post-photos bucket made public (anyone with a path could read photos).
update storage.buckets set public = true where id = 'post-photos';
