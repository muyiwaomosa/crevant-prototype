-- Deliberate violation (rolled back): server code can issue links without the admin
grant execute on function ops.create_creator_link(uuid, integer, text) to service_role;
