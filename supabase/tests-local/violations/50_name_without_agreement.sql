-- Deliberate violation (rolled back): a creator's name can be shown without their recorded agreement
alter table ops.pilot_creators drop constraint pilot_creators_public_name_agreed;
