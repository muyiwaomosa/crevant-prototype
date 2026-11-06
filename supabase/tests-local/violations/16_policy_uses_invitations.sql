-- Deliberate violation (rolled back): a policy decides access from invitation labels
create policy "profiles: by source" on public.profiles for select to authenticated using (exists (select 1 from ops.invitations i where i.accepted_user_id = id and i.source = 'vip'));
