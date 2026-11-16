-- Deliberate violation (rolled back): a member function loses its fixed search path
alter function public.app_follow(uuid) reset search_path;
