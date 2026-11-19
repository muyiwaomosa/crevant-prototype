-- The membership check removed: social.current_access() no longer requires an active pilot membership.
create or replace function social.current_access()
returns uuid
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = 'P0001';
  end if;
  return v_uid;
end;
$$;
