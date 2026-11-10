-- Deliberate violation (rolled back): an entry point has no fixed search path
alter function waitlist_api.submit(text, text[], text, text, text, text, boolean, boolean, text, text, text) reset search_path;
