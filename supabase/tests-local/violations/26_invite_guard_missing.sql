-- Deliberate violation (rolled back): invitations for unverified waitlist addresses allowed
drop trigger invitations_require_verified_waitlist_email on ops.invitations;
