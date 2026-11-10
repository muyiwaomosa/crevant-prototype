-- Deliberate violation (rolled back): the server function's login role can read the waitlist
grant usage on schema ops to waitlist_writer;
grant select on ops.waitlist to waitlist_writer;
