-- The founder check widened to moderators (moderation must not open the inbox).
create or replace function social.current_founder()
returns uuid language plpgsql stable security invoker set search_path = ''
as $$
declare
  v_uid uuid := social.current_member();
begin
  if not ops.moderator_active(v_uid) then
    raise exception 'not_founder' using errcode = 'P0001';
  end if;
  return v_uid;
end;
$$;
