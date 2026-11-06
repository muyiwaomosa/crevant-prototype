-- Deliberate violation (rolled back): the cleanup trigger runs with elevated privileges
alter function ops.profiles_before_write() security definer;
