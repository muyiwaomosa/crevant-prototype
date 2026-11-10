-- Deliberate violation (rolled back): visitors can call the waitlist entry point
grant execute on function public.waitlist_submit(text, text[], text, text, text, text, text, text, boolean, boolean, text, text) to anon;
