-- Deliberate violation (rolled back): marketing consent without a verified address
alter table ops.waitlist drop constraint waitlist_marketing_needs_verified_email;
