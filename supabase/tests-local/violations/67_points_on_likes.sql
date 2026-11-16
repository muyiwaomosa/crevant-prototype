-- Deliberate violation (rolled back): Release 1 starts storing points on likes
alter table social.likes add column points integer;
