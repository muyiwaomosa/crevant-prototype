-- The membership history made editable: its append-only guard dropped.
drop trigger member_access_events_no_update on ops.member_access_events;
