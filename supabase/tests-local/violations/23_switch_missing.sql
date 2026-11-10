-- Deliberate violation (rolled back): the server-side switch is missing
delete from ops.settings where key = 'waitlist_submissions';
