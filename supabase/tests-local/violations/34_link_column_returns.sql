-- Deliberate violation (rolled back): the waitlist stores a public link again
alter table ops.waitlist add column public_link text;
