-- Photo paths handed out without the membership check.
create or replace function public.app_post_photos(p_posts uuid[])
returns table (post_id uuid, full_path text, feed_path text)
language sql stable security definer set search_path = ''
as $$ select m.post_id, u.full_path, u.feed_path from social.post_media m join social.media_uploads u on u.id = m.upload_id where m.post_id = any (p_posts) $$;
