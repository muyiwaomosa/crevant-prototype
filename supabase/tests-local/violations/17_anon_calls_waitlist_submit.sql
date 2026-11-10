-- Deliberate violation (rolled back): visitors can call the waitlist entry point
grant usage on schema waitlist_api to anon;
grant execute on function waitlist_api.submit(text, text[], text, text, text, text, boolean, boolean, text, text, text) to anon;
