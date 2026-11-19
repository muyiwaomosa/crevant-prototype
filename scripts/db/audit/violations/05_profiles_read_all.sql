-- A policy letting members read every profile.
create policy "profiles: read all" on public.profiles for select to authenticated using (true);
