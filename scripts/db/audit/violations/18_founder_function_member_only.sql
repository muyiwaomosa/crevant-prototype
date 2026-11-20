-- A founder function that checks only membership.
create or replace function public.app_founder_feedback_set_status(p_id uuid, p_status text)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := social.current_member();
begin
  update ops.feedback set status = p_status where id = p_id;
end;
$$;
