-- Deliberate violation (rolled back): anonymous visitors can call a member function
grant execute on function public.app_feed(timestamptz, integer) to anon;
