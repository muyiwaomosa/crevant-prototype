-- Deliberate violation (rolled back): a member function loses its fixed search path
alter function public.app_unfollow(uuid) reset search_path;
