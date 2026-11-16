-- Deliberate violation (rolled back): acquisition events start holding an email address
alter table ops.acquisition_events add column email text;
