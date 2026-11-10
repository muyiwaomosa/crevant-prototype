-- Deliberate violation (rolled back): selections get a free text note again
alter table ops.waitlist_selections add column note text;
