-- Deliberate violation (rolled back): members can read the posts table directly
grant select on social.posts to authenticated;
