-- TEST ONLY (throwaway databases). The member launch gate (20261129000000):
-- founder-only membership while external access is not approved, enforced
-- by the database for every path. Runs after 105, which set the launch
-- founder (F = ...0f01), and 005, which opened external access for the
-- earlier tests. This closes it, tests the gate, and reopens it at the end.
--
--   E = ...c701: a tester given access while the gate was open (existing access).
--   N = ...c702: an account never given access.
--   X = ...c703: an account used to try the founder cohort.

set role supabase_auth_admin;
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-4000-8000-00000000c701', 'lg-e@example.test', now()),
  ('00000000-0000-4000-8000-00000000c702', 'lg-n@example.test', now()),
  ('00000000-0000-4000-8000-00000000c703', 'lg-x@example.test', now());
reset role;

create function pg_temp.expect_error_lg(sql text, expected text, what text)
returns void language plpgsql as $$
declare got text;
begin
  begin execute sql; exception when others then got := sqlerrm; end;
  if got is null then raise exception 'FAIL: % succeeded, expected "%"', what, expected; end if;
  if got !~ expected then raise exception 'FAIL: % failed with "%", expected "%"', what, got, expected; end if;
end;
$$;
grant execute on function pg_temp.expect_error_lg(text, text, text) to service_role, authenticated, anon;

-- E gets access while the gate is still open (as existing testers have).
select ops.grant_member_access('00000000-0000-4000-8000-00000000c701', 'tester', 'test', now() + interval '30 days');

-- 1. Closing needs no phrase, is recorded, and takes nobody's access away.
do $$
begin
  if (select founder_user_id from ops.member_launch_settings) <> '00000000-0000-4000-8000-000000000f01' then
    raise exception 'FAIL: the launch founder is not F';
  end if;
  perform ops.set_external_access('test', false);
  if (select external_access_approved from ops.member_launch_settings) then raise exception 'FAIL: the gate did not close'; end if;
  if not exists (select 1 from ops.member_launch_events where action = 'external_access_closed' and actor = 'test') then
    raise exception 'FAIL: closing the gate was not recorded';
  end if;
  if not ops.member_access_active('00000000-0000-4000-8000-00000000c701') or not ops.member_access_active('00000000-0000-4000-8000-000000000f01') then
    raise exception 'FAIL: closing the gate took existing access away';
  end if;
  raise notice 'PASS: closing the gate is recorded and keeps every existing membership';
end $$;

-- 2. Closed: nobody but the founder can be given membership, by any path.
do $$
begin
  -- The server function (the administrative path).
  perform pg_temp.expect_error_lg($q$select ops.grant_member_access('00000000-0000-4000-8000-00000000c702', 'tester', 'test')$q$, 'external member access is not approved', 'granting a tester while closed');
  perform pg_temp.expect_error_lg($q$select ops.grant_member_access('00000000-0000-4000-8000-00000000c702', 'creator', 'test')$q$, 'external member access is not approved', 'granting a creator while closed');
  -- A direct insert by the table owner.
  perform pg_temp.expect_error_lg($q$insert into ops.member_access (user_id, cohort, status, updated_by) values ('00000000-0000-4000-8000-00000000c702', 'fan', 'active', 'test')$q$, 'external member access is not approved', 'a direct insert by the owner while closed');
  if exists (select 1 from ops.member_access where user_id = '00000000-0000-4000-8000-00000000c702') then
    raise exception 'FAIL: a refused grant left a row';
  end if;
  -- The founder may still be given (or renewed) membership.
  perform ops.grant_member_access('00000000-0000-4000-8000-000000000f01', 'founder', 'test');
  update ops.member_access set expires_at = now() + interval '1 year' where user_id = '00000000-0000-4000-8000-000000000f01';
  update ops.member_access set expires_at = null where user_id = '00000000-0000-4000-8000-000000000f01';
  if not ops.member_access_active('00000000-0000-4000-8000-000000000f01') then raise exception 'FAIL: the founder lost access'; end if;
  raise notice 'PASS: closed, the server function and direct writes refuse every account but the launch founder; the founder can be renewed';
end $$;
begin;
set local role service_role;
do $$
begin
  perform pg_temp.expect_error_lg($q$insert into ops.member_access (user_id, cohort, status, updated_by) values ('00000000-0000-4000-8000-00000000c702', 'tester', 'active', 'test')$q$, 'external member access is not approved', 'a direct insert by service_role while closed');
  perform pg_temp.expect_error_lg($q$select ops.grant_member_access('00000000-0000-4000-8000-00000000c702', 'tester', 'test')$q$, 'external member access is not approved', 'the server key granting while closed');
  perform pg_temp.expect_error_lg($q$update ops.member_launch_settings set external_access_approved = true$q$, 'permission denied', 'the server key opening the gate directly');
  perform pg_temp.expect_error_lg($q$update ops.member_launch_settings set founder_user_id = '00000000-0000-4000-8000-00000000c702'$q$, 'permission denied', 'the server key replacing the founder directly');
  raise notice 'PASS: the server key (service_role) can neither grant nor change the gate directly while it is closed';
end $$;
commit;

-- 3. Closed: existing access is kept and may be narrowed, never widened.
do $$
declare e text := '00000000-0000-4000-8000-00000000c701';
begin
  -- Narrowing or unrelated changes pass.
  execute format('update ops.member_access set expires_at = now() + interval ''10 days'', reason = ''shortened'' where user_id = %L', e);
  execute format('update ops.member_access set updated_by = ''test-2'' where user_id = %L', e);
  if not ops.member_access_active(e::uuid) then raise exception 'FAIL: narrowing removed access'; end if;
  -- Widening is refused: a longer expiry, no expiry, another cohort.
  perform pg_temp.expect_error_lg(format('update ops.member_access set expires_at = now() + interval ''90 days'' where user_id = %L', e), 'external member access is not approved', 'extending a tester while closed');
  perform pg_temp.expect_error_lg(format('update ops.member_access set expires_at = null where user_id = %L', e), 'external member access is not approved', 'removing a tester''s expiry while closed');
  perform pg_temp.expect_error_lg(format('update ops.member_access set cohort = ''creator'' where user_id = %L', e), 'external member access is not approved', 'changing a tester''s cohort while closed');
  perform pg_temp.expect_error_lg(format('select ops.grant_member_access(%L, ''tester'', ''test'', now() + interval ''60 days'')', e), 'external member access is not approved', 're-granting a tester for longer while closed');
  -- Revoking always works; re-activating is refused.
  perform ops.revoke_member_access(e::uuid, 'test');
  if ops.member_access_active(e::uuid) then raise exception 'FAIL: revoking did not work while closed'; end if;
  perform pg_temp.expect_error_lg(format('select ops.grant_member_access(%L, ''tester'', ''test'')', e), 'external member access is not approved', 're-activating a revoked tester while closed');
  perform pg_temp.expect_error_lg(format('update ops.member_access set status = ''active'', revoked_at = null where user_id = %L', e), 'external member access is not approved', 're-activating directly while closed');
  raise notice 'PASS: closed, existing access is kept and may be shortened or revoked, but never extended, re-cohorted or re-activated';
end $$;

-- 4. The founder cohort is the launch founder's only, open or closed.
do $$
declare x text := '00000000-0000-4000-8000-00000000c703';
begin
  perform pg_temp.expect_error_lg(format('select ops.grant_member_access(%L, ''founder'', ''test'')', x), 'only the launch founder may hold the founder cohort', 'the founder cohort for another account (closed)');
  perform ops.set_external_access('test', true, 'APPROVE EXTERNAL MEMBER ACCESS');
  perform pg_temp.expect_error_lg(format('select ops.grant_member_access(%L, ''founder'', ''test'')', x), 'only the launch founder may hold the founder cohort', 'the founder cohort for another account (open)');
  perform ops.grant_member_access(x::uuid, 'tester', 'test');
  perform pg_temp.expect_error_lg(format('update ops.member_access set cohort = ''founder'' where user_id = %L', x), 'only the launch founder may hold the founder cohort', 'promoting a tester to the founder cohort (open)');
  raise notice 'PASS: open or closed, only the launch founder may be given the founder cohort';
end $$;

-- 5. Opening: only with the exact phrase and an actor label; recorded; then testers may be given access.
do $$
begin
  perform ops.set_external_access('test', false);
  perform pg_temp.expect_error_lg($q$select ops.set_external_access('test', true)$q$, 'exact phrase', 'opening without the phrase');
  perform pg_temp.expect_error_lg($q$select ops.set_external_access('test', true, 'approve external member access')$q$, 'exact phrase', 'opening with a different phrase');
  perform pg_temp.expect_error_lg($q$select ops.set_external_access('a@b.c', true, 'APPROVE EXTERNAL MEMBER ACCESS')$q$, 'actor label', 'an email address as the actor');
  perform pg_temp.expect_error_lg($q$select ops.set_external_access('test', null)$q$, 'true or false', 'no choice');
  if (select external_access_approved from ops.member_launch_settings) then raise exception 'FAIL: a refused opening opened the gate'; end if;
  perform ops.set_external_access('test', true, 'APPROVE EXTERNAL MEMBER ACCESS');
  perform ops.grant_member_access('00000000-0000-4000-8000-00000000c702', 'tester', 'test');
  if not ops.member_access_active('00000000-0000-4000-8000-00000000c702') then raise exception 'FAIL: opening did not allow a tester'; end if;
  if (select count(*) from ops.member_launch_events where actor = 'test' and action = 'external_access_opened') < 2 then
    raise exception 'FAIL: openings were not recorded';
  end if;
  raise notice 'PASS: opening needs the exact phrase and an actor label, is recorded, and then allows testers';
end $$;

-- 6. The founder is set once only, with its phrase, for a real account.
do $$
begin
  perform pg_temp.expect_error_lg($q$select ops.set_launch_founder('test', '00000000-0000-4000-8000-00000000c703', 'SET THE LAUNCH FOUNDER')$q$, 'already set', 'replacing the launch founder');
  perform pg_temp.expect_error_lg($q$select ops.set_launch_founder('test', '00000000-0000-4000-8000-00000000c703', 'set the launch founder')$q$, 'exact phrase', 'the founder without the phrase');
  perform pg_temp.expect_error_lg($q$select ops.set_launch_founder('a@b.c', '00000000-0000-4000-8000-00000000c703', 'SET THE LAUNCH FOUNDER')$q$, 'actor label', 'an email address as the actor');
  if (select founder_user_id from ops.member_launch_settings) <> '00000000-0000-4000-8000-000000000f01' then raise exception 'FAIL: the founder changed'; end if;
  raise notice 'PASS: the launch founder cannot be replaced, and setting it needs the exact phrase';
end $$;

-- 7. The records are append only; members can neither read nor change the gate.
do $$
begin
  perform pg_temp.expect_error_lg($q$update ops.member_launch_events set actor = 'x'$q$, 'append only|append-only|cannot', 'editing a launch record');
  perform pg_temp.expect_error_lg($q$delete from ops.member_launch_events$q$, 'append only|append-only|cannot', 'deleting launch records');
  raise notice 'PASS: the launch gate records cannot be edited or deleted';
end $$;
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000c703","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  perform pg_temp.expect_error_lg($q$select ops.set_external_access('me', true, 'APPROVE EXTERNAL MEMBER ACCESS')$q$, 'permission denied', 'a member opening the gate');
  perform pg_temp.expect_error_lg($q$select ops.set_launch_founder('me', '00000000-0000-4000-8000-00000000c703', 'SET THE LAUNCH FOUNDER')$q$, 'permission denied', 'a member making themselves founder');
  perform pg_temp.expect_error_lg($q$select ops.grant_member_access('00000000-0000-4000-8000-00000000c703', 'founder', 'me')$q$, 'permission denied', 'a member granting themselves access');
  perform pg_temp.expect_error_lg($q$select * from ops.member_launch_settings$q$, 'permission denied', 'a member reading the gate');
  raise notice 'PASS: a signed-in member can neither read the gate nor grant, open or set the founder';
end $$;
commit;

-- 8. No ordinary app path gives membership: a signed-in account without access stays without it.
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000c701","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  if (select status from public.app_access_state()) <> 'revoked' then raise exception 'FAIL: a revoked account is not shown as revoked'; end if;
  perform pg_temp.expect_error_lg($q$select public.app_set_profile('lg_e', 'Lg E')$q$, 'no_pilot_access', 'a revoked account using a member function');
  raise notice 'PASS: signing in gives no membership: a revoked account stays without access';
end $$;
commit;
