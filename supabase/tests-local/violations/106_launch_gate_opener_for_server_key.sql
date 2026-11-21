-- Violation: the server key (service_role) may open the launch gate.
grant execute on function ops.set_external_access(text, boolean, text) to service_role;
