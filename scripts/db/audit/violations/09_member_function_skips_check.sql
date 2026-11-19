-- A listed member function rewritten so it no longer checks the caller through social.current_member().
create or replace function public.app_unlike(p_post uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from social.likes where user_id = auth.uid() and post_id = p_post;
end;
$$;
