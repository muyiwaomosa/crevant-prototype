-- Violation: the server key (service_role) may set the launch founder.
grant execute on function ops.set_launch_founder(text, uuid, text) to service_role;
