-- Deliberate violation (rolled back): a policy lets members read every profile
create policy "profiles: read all" on public.profiles for select to authenticated using (true);
