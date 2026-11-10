-- Deliberate violation (rolled back): members can read the waitlist
grant select on ops.waitlist to authenticated;
