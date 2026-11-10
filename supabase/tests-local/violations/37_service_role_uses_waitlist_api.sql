-- Deliberate violation (rolled back): service_role can call the waitlist entry points
grant usage on schema waitlist_api to service_role;
grant execute on function waitlist_api.admin_open() to service_role;
