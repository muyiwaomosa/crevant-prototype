-- Deliberate violation (rolled back): an unverified entry can be marked invited
alter table ops.waitlist drop constraint waitlist_invite_needs_verified_email;
