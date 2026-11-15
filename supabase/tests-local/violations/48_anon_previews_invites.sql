-- Deliberate violation (rolled back): anonymous visitors can call the invitation preview directly
grant usage on schema waitlist_api to anon;
grant execute on function waitlist_api.invite_preview(text, text) to anon;
