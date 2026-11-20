-- Committing an upload would no longer re-check membership (a revoked member could still set a picture).
create or replace function public.svc_avatar_commit(p_path text) returns text language plpgsql security definer set search_path = '' as $$
declare u record; v_old text;
begin
  select * into u from social.avatar_uploads where path = p_path for update;
  select a.path into v_old from social.avatars a where a.user_id = u.user_id;
  insert into social.avatars as a (user_id, path) values (u.user_id, p_path) on conflict (user_id) do update set path = excluded.path;
  return v_old;
end;
$$;
revoke all on function public.svc_avatar_commit(text) from public, anon, authenticated;
