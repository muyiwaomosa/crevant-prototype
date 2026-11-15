-- Deliberate violation (rolled back): anyone, not only accepted creators, can hold an active link
drop trigger creator_links_require_accepted_creator on ops.creator_links;
