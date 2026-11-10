-- Deliberate violation (rolled back): participant groups can be set by hand instead of coming from the person's answers
alter table ops.waitlist alter column participant_groups drop expression;
