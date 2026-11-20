-- A member function that returns feedback (members must never see any).
create or replace function public.app_topics()
returns table (slug text, label text)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_uid uuid := social.current_member();
begin
  return query select f.body, f.category from ops.feedback f;
end;
$$;
