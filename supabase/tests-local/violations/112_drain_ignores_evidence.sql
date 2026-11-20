-- The drain no longer holds reported evidence or protects live posts.
create or replace function public.svc_media_drain_claim(p_limit integer default 50)
returns table (id bigint, bucket text, path text)
language sql security definer set search_path = ''
as $$ select q.id, q.bucket, q.path from ops.media_deletions q where q.deleted_at is null limit p_limit $$;
