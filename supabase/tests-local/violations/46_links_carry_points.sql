-- Deliberate violation (rolled back): link redemptions start awarding Connection Points
alter table ops.creator_link_redemptions add column cp_awarded integer;
