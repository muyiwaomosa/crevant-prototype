-- The switch no longer checks the audience (every member could post photos).
create or replace function ops.photos_open()
returns boolean language sql stable security definer set search_path = ''
as $$ select s.photos_enabled and s.photo_storage_cap_bytes is not null from ops.media_settings s where s.id $$;
