-- Deliberate violation (rolled back): selection reasons become free text
alter table ops.waitlist_selections drop constraint waitlist_selections_reasons_allowed;
