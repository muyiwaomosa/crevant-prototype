-- Deliberate violation (rolled back): the cleanup trigger loses its fixed search path
alter function ops.profiles_before_write() reset search_path;
