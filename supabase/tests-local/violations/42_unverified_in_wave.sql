-- Deliberate violation (rolled back): unverified entries can be selected for an invitation wave
drop trigger waitlist_selections_require_verified on ops.waitlist_selections;
