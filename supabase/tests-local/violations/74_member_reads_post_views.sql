-- Deliberate violation (rolled back): members can read viewed state directly
grant select on social.post_views to authenticated;
