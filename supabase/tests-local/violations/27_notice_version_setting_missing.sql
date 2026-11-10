-- Deliberate violation (rolled back): the approved notice version setting is missing
delete from ops.settings where key = 'waitlist_notice_version';
