-- Deliberate violation (rolled back): viewed state can be rewritten or deleted
drop trigger post_views_permanent on social.post_views;
