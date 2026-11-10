-- Deliberate violation (rolled back): consent without a notice version
alter table ops.waitlist alter column waitlist_consent_version drop not null;
