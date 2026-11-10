-- Deliberate violation (rolled back): the server function's login role can read member profiles
grant select on public.profiles to waitlist_writer;
