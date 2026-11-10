-- Deliberate violation (rolled back): an internal waitlist function runs with its owner's rights
alter function ops.join_waitlist(text, text[], text, text, text, text, boolean, boolean, text, text, text) security definer;
