-- Profile setup rewritten to trust any signed-in account, skipping pilot membership.
create or replace function public.app_set_profile(p_username text, p_display_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles set username = p_username, display_name = p_display_name where id = auth.uid();
end;
$$;
