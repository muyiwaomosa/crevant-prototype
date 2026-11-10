-- Deliberate violation (rolled back): the admin login role can submit
grant execute on function waitlist_api.submit(text, text[], text, text, text, text, boolean, boolean, text, text, text) to waitlist_admin;
