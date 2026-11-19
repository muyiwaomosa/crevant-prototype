-- Pilot membership no longer required: current_member() skips current_access().
create or replace function social.current_member()
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
