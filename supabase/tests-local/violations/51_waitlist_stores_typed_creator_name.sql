-- Deliberate violation (rolled back): the waitlist stores a creator's name or handle as typed by a visitor
alter table ops.waitlist add column introducer_reported text;
