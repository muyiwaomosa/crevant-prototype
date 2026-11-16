-- Deliberate violation (rolled back): the waitlist starts storing a raw link
alter table ops.waitlist add column referral_url text;
