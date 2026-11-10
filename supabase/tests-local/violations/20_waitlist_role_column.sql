-- Deliberate violation (rolled back): a role column on the waitlist
alter table ops.waitlist add column role text;
