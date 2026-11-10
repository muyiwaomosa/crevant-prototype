-- Deliberate violation (rolled back): an entry point runs with the caller's rights
alter function waitlist_api.admin_delete(uuid) security invoker;
