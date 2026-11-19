-- Direct profile updates restored, bypassing the membership check in app_set_profile.
grant update (username, display_name) on table public.profiles to authenticated;
create policy "profiles: update own" on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
