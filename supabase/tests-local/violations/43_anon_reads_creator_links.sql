-- Deliberate violation (rolled back): visitors can read creator invitation links
grant select on ops.creator_links to anon;
