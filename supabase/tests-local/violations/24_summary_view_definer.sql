-- Deliberate violation (rolled back): the summary view runs with its owner's rights
alter view ops.waitlist_summary set (security_invoker = false);
