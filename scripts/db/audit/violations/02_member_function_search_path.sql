-- A member function that no longer runs with an empty search path.
alter function public.app_feed(timestamp with time zone, integer) reset search_path;
