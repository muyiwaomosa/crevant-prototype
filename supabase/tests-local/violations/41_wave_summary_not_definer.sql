-- Deliberate violation (rolled back): a wave entry point runs with the caller's rights
alter function waitlist_api.admin_wave_summary(text) security invoker;
