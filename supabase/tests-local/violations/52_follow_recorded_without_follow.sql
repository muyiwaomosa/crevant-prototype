-- Deliberate violation (rolled back): an invitation can be marked followed although no real follow exists
alter table ops.creator_link_redemptions drop constraint creator_link_redemptions_pending_until_follows;
