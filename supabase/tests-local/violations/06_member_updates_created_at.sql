-- Deliberate violation (rolled back): members can change created_at
grant update (created_at) on public.profiles to authenticated;
