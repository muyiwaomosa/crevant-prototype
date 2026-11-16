-- Deliberate violation (rolled back): an unreviewed member function appears
create function public.app_read_everything() returns setof social.posts language sql security definer set search_path = '' as $$ select * from social.posts $$;
