-- Deliberate violation (rolled back): the server function's login can prepare waves
grant execute on function waitlist_api.admin_wave_select(text, text, text[], integer) to waitlist_writer;
