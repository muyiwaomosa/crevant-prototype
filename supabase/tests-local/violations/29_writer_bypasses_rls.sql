-- Deliberate violation (rolled back): the server function's login role bypasses row level security
alter role waitlist_writer bypassrls;
