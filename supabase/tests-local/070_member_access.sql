-- TEST ONLY (throwaway databases). Pilot membership (20261122000000), as real
-- (Member function counts include the six profile detail functions of 20261123000000 the seven moderation functions of 20261124000000, the six profile picture functions of 20261125000000, the six feedback functions of 20261126000000 and the six photo functions of 20261127000000.)
-- signed-in accounts calling the same functions the app calls.
--
--   P1, P2, P3 = ...0a01..0a03: accounts that existed BEFORE the migration
--                (supabase/tests-local/before/20261122000000.sql).
--   A = ...0b01, B = ...0b02: complete profiles, granted during the test.
--   N = ...0b03: a complete profile, never granted at first (identity only).
--   I = ...0b04: signed in, no profile, no membership.
--   U = ...0b05: an unconfirmed account.

set role supabase_auth_admin;
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-4000-8000-000000000b01', 'gate-a@example.test', now()),
  ('00000000-0000-4000-8000-000000000b02', 'gate-b@example.test', now()),
  ('00000000-0000-4000-8000-000000000b03', 'gate-n@example.test', now()),
  ('00000000-0000-4000-8000-000000000b04', 'gate-i@example.test', now()),
  ('00000000-0000-4000-8000-000000000b05', 'gate-u@example.test', null);
reset role;
-- Profiles set by server code (a member can no longer set one without membership).
update public.profiles set username = 'gate_a', display_name = 'Gate A' where id = '00000000-0000-4000-8000-000000000b01';
update public.profiles set username = 'gate_b', display_name = 'Gate B' where id = '00000000-0000-4000-8000-000000000b02';
update public.profiles set username = 'gate_n', display_name = 'Gate N' where id = '00000000-0000-4000-8000-000000000b03';
insert into social.posts (id, author_id, body) values ('00000000-0000-4000-8000-00000000bb03', '00000000-0000-4000-8000-000000000b03', 'A post by N');

create function pg_temp.expect_error(sql text, expected text, what text)
returns void
language plpgsql
as $$
declare
  got text;
begin
  begin
    execute sql;
  exception when others then
    got := sqlerrm;
  end;
  if got is null then
    raise exception 'FAIL: % succeeded, expected "%"', what, expected;
  end if;
  if got !~ expected then
    raise exception 'FAIL: % failed with "%", expected "%"', what, got, expected;
  end if;
end;
$$;
grant execute on function pg_temp.expect_error(text, text, text) to authenticated, anon;

-- Every public.app_* function, called with null arguments, as the current role.
-- Expects each to refuse with `expected`, except those listed in `except_fns`.
create function pg_temp.every_member_function_refuses(expected text, except_fns text[])
returns integer
language plpgsql
as $$
declare
  f record;
  n int := 0;
begin
  for f in
    select p.proname,
           'select * from public.' || p.proname || '(' ||
           coalesce((select string_agg('null::' || format_type(t, null), ', ' order by o) from unnest(p.proargtypes::oid[]) with ordinality as a(t, o)), '') || ')' as call
    from pg_proc p join pg_namespace s on s.oid = p.pronamespace
    where s.nspname = 'public' and p.proname like 'app\_%' and p.proname <> all (except_fns)
  loop
    perform pg_temp.expect_error(f.call, expected, f.call);
    n := n + 1;
  end loop;
  return n;
end;
$$;
grant execute on function pg_temp.every_member_function_refuses(text, text[]) to authenticated, anon;

-- ---------------------------------------------------------------------------
-- 1. The migration preserved every existing account and all their content,
--    and granted nobody access.
do $$
declare
  r record;
  now_fp text;
begin
  for r in select * from test_fixture.premigration loop
    now_fp := case r.part
      when 'auth' then (select count(*)::text || md5(string_agg(id::text || email || coalesce(email_confirmed_at::text, ''), ',' order by id)) from auth.users where id::text like '00000000-0000-4000-8000-000000000a0_')
      when 'profiles' then (select count(*)::text || md5(string_agg(id::text || coalesce(username, '-') || coalesce(display_name, '-') || created_at::text || updated_at::text, ',' order by id)) from public.profiles where id::text like '00000000-0000-4000-8000-000000000a0_')
      when 'posts' then (select count(*)::text || md5(string_agg(id::text || author_id::text || body || created_at::text || coalesce(deleted_at::text, '-'), ',' order by id)) from social.posts where author_id::text like '00000000-0000-4000-8000-000000000a0_')
      when 'follows' then (select count(*)::text || md5(string_agg(follower_id::text || creator_id::text || followed_at::text, ',' order by follower_id, creator_id)) from social.follows where follower_id::text like '00000000-0000-4000-8000-000000000a0_')
      when 'clique' then (select count(*)::text || md5(string_agg(fan_id::text || creator_id::text || added_at::text || coalesce(removed_at::text, '-'), ',' order by fan_id, creator_id)) from social.clique_members where fan_id::text like '00000000-0000-4000-8000-000000000a0_')
      when 'likes' then (select count(*)::text || md5(string_agg(user_id::text || post_id::text, ',' order by user_id, post_id)) from social.likes where user_id::text like '00000000-0000-4000-8000-000000000a0_')
      when 'comments' then (select count(*)::text || md5(string_agg(id::text || post_id::text || author_id::text || body, ',' order by id)) from social.comments where author_id::text like '00000000-0000-4000-8000-000000000a0_')
      when 'views' then (select count(*)::text || md5(string_agg(viewer_id::text || post_id::text || basis, ',' order by viewer_id, post_id)) from social.post_views where viewer_id::text like '00000000-0000-4000-8000-000000000a0_')
    end;
    if now_fp is distinct from r.fp then
      raise exception 'FAIL: existing % changed during the migration (% -> %)', r.part, r.fp, now_fp;
    end if;
  end loop;
  if (select count(*) from test_fixture.premigration) <> 8 or exists (select 1 from test_fixture.premigration where fp like '0%') then
    raise exception 'FAIL: the pre-migration fixture is incomplete';
  end if;
  if exists (select 1 from ops.member_access where user_id::text like '00000000-0000-4000-8000-000000000a0_')
     or exists (select 1 from ops.member_access_events where user_id::text like '00000000-0000-4000-8000-000000000a0_') then
    raise exception 'FAIL: the migration granted access to an existing account';
  end if;
  raise notice 'PASS: the migration kept every existing account, profile, post, follow, Clique, like, comment and view, and granted nobody access';
end $$;

-- Existing accounts are now signed-in only.
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000a01","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  if (select status from public.app_access_state()) <> 'none' then
    raise exception 'FAIL: an existing account has access after the migration';
  end if;
  perform pg_temp.expect_error('select * from public.app_feed()', 'no_pilot_access', 'an existing account reading the feed');
  perform pg_temp.expect_error('select * from public.app_post(''00000000-0000-4000-8000-00000000aa02'')', 'no_pilot_access', 'an existing account reading a post');
  raise notice 'PASS: existing accounts are signed-in only until the founder grants access';
end $$;
commit;

-- ---------------------------------------------------------------------------
-- 2. Authenticated, complete profile, NO membership: nothing.
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000b03","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  n int;
  st record;
begin
  select * into st from public.app_access_state();
  if st.status <> 'none' or st.expires_at is not null then
    raise exception 'FAIL: N''s access state is %', st;
  end if;
  -- app_claim_access is how membership is obtained (20261130000000), so it answers instead of refusing.
  n := pg_temp.every_member_function_refuses('no_pilot_access', array['app_access_state', 'app_claim_access']);
  if n <> 83 then
    raise exception 'FAIL: expected 83 member functions to refuse, checked %', n;
  end if;
  perform pg_temp.expect_error('select count(*) from social.posts', 'permission denied', 'N reading social.posts directly');
  perform pg_temp.expect_error('select count(*) from ops.member_access', 'permission denied', 'N reading memberships');
  perform pg_temp.expect_error('select count(*) from social.visible_members', 'permission denied', 'N reading the visible member list');
  perform pg_temp.expect_error('update public.profiles set display_name = ''x'' where id = auth.uid()', 'permission denied', 'N writing their profile directly');
  raise notice 'PASS: signed in without pilot membership, all 83 member functions refuse (no_pilot_access) and no table is reachable';
end $$;
commit;

-- Signed in with no profile and no membership: the same.
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000b04","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  if pg_temp.every_member_function_refuses('no_pilot_access', array['app_access_state', 'app_claim_access']) <> 83 then
    raise exception 'FAIL: not every member function was checked';
  end if;
  raise notice 'PASS: an account with no profile and no membership is refused by every member function';
end $$;
commit;

-- Anonymous visitors can't even ask.
begin;
set local role anon;
do $$
begin
  perform pg_temp.expect_error('select * from public.app_access_state()', 'permission denied', 'anon reading an access state');
  if pg_temp.every_member_function_refuses('permission denied', array[]::text[]) <> 85 then
    raise exception 'FAIL: not every member function was checked for anon';
  end if;
  raise notice 'PASS: anonymous visitors can call none of the 85 member functions';
end $$;
commit;

-- ---------------------------------------------------------------------------
-- 3. Members can never grant or restore their own access.
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000b03","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  perform pg_temp.expect_error($q$select ops.grant_member_access('00000000-0000-4000-8000-000000000b03', 'founder', 'me')$q$, 'permission denied', 'N granting themselves access');
  perform pg_temp.expect_error($q$select ops.revoke_member_access('00000000-0000-4000-8000-000000000b01', 'me')$q$, 'permission denied', 'N revoking someone else');
  perform pg_temp.expect_error($q$insert into ops.member_access (user_id, cohort, status, updated_by) values ('00000000-0000-4000-8000-000000000b03', 'founder', 'active', 'me')$q$, 'permission denied', 'N inserting a membership');
  perform pg_temp.expect_error($q$update ops.member_access set status = 'active'$q$, 'permission denied', 'N restoring a membership');
  perform pg_temp.expect_error($q$select social.current_access()$q$, 'permission denied', 'N calling the access helper');
  perform pg_temp.expect_error($q$select ops.member_access_active('00000000-0000-4000-8000-000000000b03')$q$, 'permission denied', 'N calling the active check');
  perform pg_temp.expect_error($q$select public.app_set_profile('gate_n', 'Gate N')$q$, 'no_pilot_access', 'N setting a profile');
  raise notice 'PASS: a member can''t grant, restore or revoke access, directly or through any function';
end $$;
commit;
do $$
begin
  if exists (select 1 from ops.member_access where user_id = '00000000-0000-4000-8000-000000000b03') then
    raise exception 'FAIL: N obtained a membership';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Granting: server only, validated, recorded.
do $$
begin
  perform pg_temp.expect_error($q$select ops.grant_member_access('00000000-0000-4000-8000-000000000b05', 'tester', 'founder')$q$, 'no confirmed account', 'granting an unconfirmed account');
  perform pg_temp.expect_error($q$select ops.grant_member_access('00000000-0000-4000-8000-0000000000ff', 'tester', 'founder')$q$, 'no confirmed account', 'granting an account that does not exist');
  perform pg_temp.expect_error($q$select ops.grant_member_access('00000000-0000-4000-8000-000000000b01', 'tester', 'founder', now() - interval '1 minute')$q$, 'expiry must be in the future', 'granting with a past expiry');
  perform pg_temp.expect_error($q$select ops.grant_member_access('00000000-0000-4000-8000-000000000b01', 'vip', 'founder')$q$, 'member_access_cohort_check', 'granting an unknown cohort');
  perform pg_temp.expect_error($q$select ops.grant_member_access('00000000-0000-4000-8000-000000000b01', 'tester', 'founder@example.com')$q$, 'member_access_updated_by_check', 'an email address as the actor');
  perform pg_temp.expect_error($q$select ops.grant_member_access('00000000-0000-4000-8000-000000000b01', 'tester', 'founder', null, 'asked by a@b.c')$q$, 'member_access_reason_check', 'an email address in the reason');
  perform pg_temp.expect_error($q$select ops.revoke_member_access('00000000-0000-4000-8000-000000000b01', 'founder')$q$, 'no active membership', 'revoking an account with no membership');
  if exists (select 1 from ops.member_access_events where user_id in ('00000000-0000-4000-8000-000000000b01', '00000000-0000-4000-8000-000000000b05')) then
    raise exception 'FAIL: a refused grant left a history row';
  end if;
  raise notice 'PASS: grants refuse unconfirmed or unknown accounts, past expiries, unknown cohorts and email addresses in the record';
end $$;

select ops.grant_member_access('00000000-0000-4000-8000-000000000b01', 'creator', 'founder', null, 'pilot creator');
select ops.grant_member_access('00000000-0000-4000-8000-000000000b02', 'fan', 'founder', now() + interval '1 hour', 'pilot fan');

begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000b02","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  st record;
begin
  select * into st from public.app_access_state();
  if st.status <> 'active' or st.expires_at is null or st.expires_at <= now() then
    raise exception 'FAIL: B''s access state is %', st;
  end if;
  if (select count(*) from public.app_access_state()) <> 1 then
    raise exception 'FAIL: app_access_state returned more than the caller''s own row';
  end if;
  perform * from public.app_me();
  perform * from public.app_feed();
  raise notice 'PASS: a granted member is active (with the expiry shown) and can use the member app';
end $$;
commit;

-- ---------------------------------------------------------------------------
-- 5. Accounts without membership are invisible to members, and can't be
--    followed, liked, commented on or added to an Inner Clique.
--    (A follow of N made before the gate stays recorded, but shows nothing.)
insert into social.follows (follower_id, creator_id, followed_at) values ('00000000-0000-4000-8000-000000000b01', '00000000-0000-4000-8000-000000000b03', now() - interval '1 day');
insert into social.comments (post_id, author_id, body) values ('00000000-0000-4000-8000-00000000bb03', '00000000-0000-4000-8000-000000000b03', 'N comments on their own post');

create function pg_temp.a_sees_n()
returns text
language plpgsql
as $$
declare
  n text := '00000000-0000-4000-8000-000000000b03';
  p uuid := '00000000-0000-4000-8000-00000000bb03';
  seen text[] := '{}';
begin
  if exists (select 1 from public.app_feed() f where f.author_id = n::uuid) then seen := seen || 'feed'::text; end if;
  if exists (select 1 from public.app_member('gate_n')) then seen := seen || 'member page'::text; end if;
  if exists (select 1 from public.app_member_posts(n::uuid)) then seen := seen || 'member posts'::text; end if;
  if exists (select 1 from public.app_post(p)) then seen := seen || 'post'::text; end if;
  if exists (select 1 from public.app_comments(p)) then seen := seen || 'comments'::text; end if;
  if exists (select 1 from public.app_discover() d where d.id = n::uuid) then seen := seen || 'discover'::text; end if;
  if exists (select 1 from public.app_discover('gate_n')) then seen := seen || 'discover search'::text; end if;
  if exists (select 1 from public.app_following() f where f.id = n::uuid) then seen := seen || 'following'::text; end if;
  if exists (select 1 from public.app_unseen_creators() u where u.id = n::uuid) then seen := seen || 'unseen'::text; end if;
  if exists (select 1 from public.app_catch_up(n::uuid)) then seen := seen || 'catch-up'::text; end if;
  return array_to_string(seen, ',');
end;
$$;
grant execute on function pg_temp.a_sees_n() to authenticated;

begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000b01","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  seen text := pg_temp.a_sees_n();
begin
  if seen <> '' then
    raise exception 'FAIL: A can see N (no membership) in: %', seen;
  end if;
  perform pg_temp.expect_error($q$select public.app_follow('00000000-0000-4000-8000-000000000b03')$q$, 'not_found', 'A following N');
  perform pg_temp.expect_error($q$select public.app_like('00000000-0000-4000-8000-00000000bb03')$q$, 'not_found', 'A liking N''s post');
  perform pg_temp.expect_error($q$select public.app_add_comment('00000000-0000-4000-8000-00000000bb03', 'hi')$q$, 'not_found', 'A commenting on N''s post');
  perform pg_temp.expect_error($q$select public.app_add_comment('00000000-0000-4000-8000-00000000bb03', 'hi', gen_random_uuid())$q$, 'not_found', 'A commenting on N''s post (request id)');
  perform pg_temp.expect_error($q$select public.app_clique_add('00000000-0000-4000-8000-000000000b03')$q$, 'not_found', 'A adding N to their Inner Clique');
  if public.app_mark_viewed(array['00000000-0000-4000-8000-00000000bb03']::uuid[]) <> 0 then
    raise exception 'FAIL: A recorded a view of N''s post';
  end if;
  -- Accounts from before the gate are hidden too.
  if exists (select 1 from public.app_member('pre_one')) or exists (select 1 from public.app_post('00000000-0000-4000-8000-00000000aa01')) then
    raise exception 'FAIL: A can see an existing account that was never granted';
  end if;
  raise notice 'PASS: accounts without membership are invisible in every member view and can''t be followed, liked, commented on, viewed or added to a Clique';
end $$;
commit;

-- Granted, N appears; revoked, N disappears again, at once.
select ops.grant_member_access('00000000-0000-4000-8000-000000000b03', 'creator', 'founder');
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000b01","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  seen text := pg_temp.a_sees_n();
begin
  if seen <> 'feed,member page,member posts,post,comments,discover,discover search,following,unseen,catch-up' then
    raise exception 'FAIL: once granted, N should be visible everywhere; seen in: %', seen;
  end if;
  raise notice 'PASS: once granted, a member is visible in every member view';
end $$;
commit;

begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000b03","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  perform * from public.app_feed();
  perform public.app_create_post('N, as a member');
end $$;
commit;

select ops.revoke_member_access('00000000-0000-4000-8000-000000000b03', 'founder', 'pilot rules');

-- N's very next request is refused, with the same (still valid) session.
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000b03","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  if (select status from public.app_access_state()) <> 'revoked' then
    raise exception 'FAIL: N''s state is not revoked';
  end if;
  if pg_temp.every_member_function_refuses('no_pilot_access', array['app_access_state', 'app_claim_access']) <> 83 then
    raise exception 'FAIL: not every member function was checked after revocation';
  end if;
  raise notice 'PASS: revocation takes effect on the next request, for all 56 member functions';
end $$;
commit;

begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000b01","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  seen text := pg_temp.a_sees_n();
begin
  if seen <> '' then
    raise exception 'FAIL: after revocation, A still sees N in: %', seen;
  end if;
  raise notice 'PASS: after revocation, the member''s profile and content disappear from every member view';
end $$;
commit;

-- ---------------------------------------------------------------------------
-- 6. Expiry. B's membership runs out (here by server code moving the expiry
--    into the past, which is itself recorded).
update ops.member_access set expires_at = now() - interval '1 minute', updated_at = now(), updated_by = 'founder', reason = 'end of cohort'
where user_id = '00000000-0000-4000-8000-000000000b02';
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000b02","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  st record;
begin
  select * into st from public.app_access_state();
  if st.status <> 'expired' then
    raise exception 'FAIL: B''s state is % after expiry', st;
  end if;
  if pg_temp.every_member_function_refuses('no_pilot_access', array['app_access_state', 'app_claim_access']) <> 83 then
    raise exception 'FAIL: not every member function was checked after expiry';
  end if;
  raise notice 'PASS: an expired membership is refused by all 56 member functions, and the account sees "expired"';
end $$;
commit;
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000b01","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  if exists (select 1 from public.app_member('gate_b')) or exists (select 1 from public.app_discover('gate_b')) then
    raise exception 'FAIL: A can still see B after B''s membership expired';
  end if;
  raise notice 'PASS: an expired member is invisible to other members';
end $$;
commit;

-- Restoring: N is granted again (server only).
select ops.grant_member_access('00000000-0000-4000-8000-000000000b03', 'creator', 'founder', null, 'appeal accepted');
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000b03","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  if (select status from public.app_access_state()) <> 'active' then
    raise exception 'FAIL: N was not restored';
  end if;
  perform * from public.app_feed();
  raise notice 'PASS: a revoked member can be restored by server code';
end $$;
commit;

-- ---------------------------------------------------------------------------
-- 7. Every change is recorded, and the record can't be changed.
do $$
declare
  n_actions text := (select string_agg(action || ':' || actor || ':' || coalesce(reason, '-'), ' ' order by id) from ops.member_access_events where user_id = '00000000-0000-4000-8000-000000000b03');
  b_actions text := (select string_agg(action || ':' || actor || ':' || coalesce(reason, '-'), ' ' order by id) from ops.member_access_events where user_id = '00000000-0000-4000-8000-000000000b02');
begin
  if n_actions <> 'granted:founder:- revoked:founder:pilot rules restored:founder:appeal accepted' then
    raise exception 'FAIL: N''s history is %', n_actions;
  end if;
  if b_actions <> 'granted:founder:pilot fan changed:founder:end of cohort' then
    raise exception 'FAIL: B''s history is %', b_actions;
  end if;
  if exists (select 1 from ops.member_access_events where occurred_at is null or actor is null or actor like '%@%') then
    raise exception 'FAIL: a history row has no time or actor, or an email address';
  end if;
  perform pg_temp.expect_error('update ops.member_access_events set actor = ''someone else''', 'append-only', 'editing the history (even as the owner)');
  perform pg_temp.expect_error('delete from ops.member_access_events', 'append-only', 'deleting the history (even as the owner)');
  perform pg_temp.expect_error('truncate ops.member_access_events', 'append-only', 'truncating the history (even as the owner)');
  raise notice 'PASS: grants, revocations, restorations and changes are recorded with actor and reason, and the history can''t be edited, deleted or truncated';
end $$;

-- The database records who really made each change, whatever the typed actor
-- label says: this test runs as the 'postgres' login without switching role,
-- and server code switching to service_role is recorded as such.
do $$
begin
  if (select count(*) from ops.member_access_events where user_id::text like '00000000-0000-4000-8000-000000000b0_') < 6
     or exists (select 1 from ops.member_access_events
                where user_id::text like '00000000-0000-4000-8000-000000000b0_'
                  and (db_session_user is distinct from 'postgres' or db_role is distinct from 'none')) then
    raise exception 'FAIL: a change made as postgres (no role switch) was not recorded as such';
  end if;
end $$;
begin;
set local role service_role;
-- The typed label claims 'postgres', but the database records the role really used.
select ops.grant_member_access('00000000-0000-4000-8000-000000000b01', 'creator', 'postgres', null, 'regranted by server code');
commit;
do $$
declare
  r record;
begin
  select action, actor, db_session_user, db_role into r
  from ops.member_access_events where user_id = '00000000-0000-4000-8000-000000000b01' order by id desc limit 1;
  if r.action <> 'changed' or r.actor <> 'postgres' or r.db_session_user <> 'postgres' or r.db_role <> 'service_role' then
    raise exception 'FAIL: a change by server code as service_role was recorded as %', r;
  end if;
  perform pg_temp.expect_error($q$insert into ops.member_access_events (user_id, action, actor) values ('00000000-0000-4000-8000-000000000b01', 'granted', 'x')$q$,
    'db_session_user', 'a history row without the database login');
  raise notice 'PASS: every change records the real database login and role alongside the typed actor label (a label can''t impersonate the role used)';
end $$;

-- Deleting an account removes its membership; the history keeps the record.
set role supabase_auth_admin;
delete from auth.users where id = '00000000-0000-4000-8000-000000000b03';
reset role;
do $$
begin
  if exists (select 1 from ops.member_access where user_id = '00000000-0000-4000-8000-000000000b03') then
    raise exception 'FAIL: a deleted account kept its membership';
  end if;
  if (select action || ':' || actor || ':' || db_role from ops.member_access_events where user_id = '00000000-0000-4000-8000-000000000b03' order by id desc limit 1) <> 'removed:account_deleted:supabase_auth_admin' then
    raise exception 'FAIL: deleting the account was not recorded';
  end if;
  raise notice 'PASS: deleting an account removes its membership and records the removal';
end $$;
