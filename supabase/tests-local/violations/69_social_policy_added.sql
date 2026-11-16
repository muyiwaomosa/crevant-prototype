-- Deliberate violation (rolled back): a policy lets members read posts directly
create policy "posts: read all" on social.posts for select to authenticated using (true);
