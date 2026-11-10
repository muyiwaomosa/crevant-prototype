-- Deliberate violation (rolled back): the entry point runs with its owner's rights
alter function public.waitlist_submit(text, text[], text, text, text, text, text, text, boolean, boolean, text, boolean, text) security definer;
