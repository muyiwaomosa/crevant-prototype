-- TEST ONLY (throwaway databases). Foundation v2 (20261130000000): adult
-- confirmation, controlled link registration (settings, hook, claim), referral
-- links, events and complete Home paging, through the real functions.
--
--   F  = ...0f01 the founder (launch founder, founder cohort)
--   R  = ...0f02 a member who refers people
--   C  = ...0f03 a creator
--   X  = ...0f04 a member granted without a confirmation (tests the requirement)
--   N1..N6 = ...0f11..0f16 new accounts registering through links
--   Z  = ...0f20 an unconfirmed account
\set ON_ERROR_STOP on

-- This file tests the requirement itself: stop the test-only automatic confirmation.
drop trigger if exists zz_test_auto_attest on ops.member_access;

set role supabase_auth_admin;
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-4000-8000-fdfdfd000f01', 'fnd-f@example.test', now(), '{}'),
  ('00000000-0000-4000-8000-fdfdfd000f02', 'fnd-r@example.test', now(), '{}'),
  ('00000000-0000-4000-8000-fdfdfd000f03', 'fnd-c@example.test', now(), '{}'),
  ('00000000-0000-4000-8000-fdfdfd000f04', 'fnd-x@example.test', now(), '{}'),
  ('00000000-0000-4000-8000-fdfdfd000f11', 'fnd-n1@example.test', now(), '{}'),
  ('00000000-0000-4000-8000-fdfdfd000f12', 'fnd-n2@example.test', now(), '{}'),
  ('00000000-0000-4000-8000-fdfdfd000f13', 'fnd-n3@example.test', now(), '{}'),
  ('00000000-0000-4000-8000-fdfdfd000f14', 'fnd-n4@example.test', now(), '{}'),
  ('00000000-0000-4000-8000-fdfdfd000f15', 'fnd-n5@example.test', now(), '{}'),
  ('00000000-0000-4000-8000-fdfdfd000f16', 'fnd-n6@example.test', now(), '{}'),
  ('00000000-0000-4000-8000-fdfdfd000f20', 'fnd-z@example.test', null, '{}');
reset role;
update public.profiles set username = 'fnd_f', display_name = 'Fnd F' where id = '00000000-0000-4000-8000-fdfdfd000f01';
update public.profiles set username = 'fnd_r', display_name = 'Fnd R' where id = '00000000-0000-4000-8000-fdfdfd000f02';
update public.profiles set username = 'fnd_c', display_name = 'Fnd C' where id = '00000000-0000-4000-8000-fdfdfd000f03';
update public.profiles set username = 'fnd_x', display_name = 'Fnd X' where id = '00000000-0000-4000-8000-fdfdfd000f04';

create function pg_temp.expect_error(sql text, expected text, what text)
returns void language plpgsql as $$
declare got text;
begin
  begin execute sql; exception when others then got := sqlerrm; end;
  if got is null then raise exception 'FAIL: % succeeded, expected "%"', what, expected; end if;
  if got !~ expected then raise exception 'FAIL: % failed with "%", expected "%"', what, got, expected; end if;
end; $$;
grant execute on function pg_temp.expect_error(text, text, text) to authenticated, anon;

-- The founder: the launch founder may hold the founder cohort.
update ops.member_launch_settings set founder_user_id = '00000000-0000-4000-8000-fdfdfd000f01' where id and founder_user_id is null;
do $$
begin
  if (select founder_user_id from ops.member_launch_settings where id) is distinct from '00000000-0000-4000-8000-fdfdfd000f01'::uuid then
    -- Another test already set a launch founder: make F the founder for this file.
    update ops.member_launch_settings set founder_user_id = '00000000-0000-4000-8000-fdfdfd000f01' where id;
  end if;
end $$;
select ops.grant_member_access('00000000-0000-4000-8000-fdfdfd000f01', 'founder', 'fnd-test');
select ops.grant_member_access('00000000-0000-4000-8000-fdfdfd000f02', 'fan', 'fnd-test');
select ops.grant_member_access('00000000-0000-4000-8000-fdfdfd000f03', 'creator', 'fnd-test');
select ops.grant_member_access('00000000-0000-4000-8000-fdfdfd000f04', 'tester', 'fnd-test');
insert into ops.age_attestations (user_id, wording_version, source) values
  ('00000000-0000-4000-8000-fdfdfd000f01', 'adult-v1', 'in_app'),
  ('00000000-0000-4000-8000-fdfdfd000f02', 'adult-v1', 'in_app'),
  ('00000000-0000-4000-8000-fdfdfd000f03', 'adult-v1', 'in_app');

-- ---------------------------------------------------------------------------
-- 1. Adult confirmation is required by every member function.
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-fdfdfd000f04","role":"authenticated"}', true);
set local role authenticated;
do $$
declare st record; t timestamptz; t2 timestamptz;
begin
  select * into st from public.app_access_state();
  if st.status <> 'attestation_required' then raise exception 'FAIL: X state is %, expected attestation_required', st.status; end if;
  perform pg_temp.expect_error('select * from public.app_me()', 'adult_attestation_required', 'X reading app_me');
  perform pg_temp.expect_error('select * from public.app_feed_page()', 'adult_attestation_required', 'X reading the feed');
  perform pg_temp.expect_error('select public.app_attest_adult(''Bad Version!'')', 'invalid_wording_version', 'a malformed wording version');
  t := public.app_attest_adult('adult-v1');
  t2 := public.app_attest_adult('adult-v2');
  if t is null or t2 <> t then raise exception 'FAIL: confirming twice changed the confirmation (% then %)', t, t2; end if;
  select * into st from public.app_access_state();
  if st.status <> 'active' then raise exception 'FAIL: X state after confirming is %', st.status; end if;
  perform * from public.app_me();
  raise notice 'PASS: without an 18+ confirmation every member function refuses; confirming is the member''s own, once';
end $$;
commit;
do $$
begin
  begin
    update ops.age_attestations set wording_version = 'x' where user_id = '00000000-0000-4000-8000-fdfdfd000f04';
    raise exception 'FAIL: an attestation was edited';
  exception when others then
    if sqlerrm !~ 'cannot be changed' then raise; end if;
  end;
  if (select source from ops.age_attestations where user_id = '00000000-0000-4000-8000-fdfdfd000f04') <> 'in_app' then
    raise exception 'FAIL: the in-app confirmation was not recorded as in_app';
  end if;
  raise notice 'PASS: attestations cannot be edited';
end $$;
-- Without membership, confirming is refused.
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-fdfdfd000f11","role":"authenticated"}', true);
set local role authenticated;
select pg_temp.expect_error('select public.app_attest_adult(''adult-v1'')', 'no_pilot_access', 'confirming without membership');
commit;

-- ---------------------------------------------------------------------------
-- 2. Registration settings: paused by default, recorded changes, founder only.
do $$
declare s ops.registration_settings;
begin
  select * into s from ops.registration_settings where id;
  if not s.paused or s.total_cap <> 200 or s.daily_cap <> 25 or s.per_referrer_daily_cap <> 5 then
    raise exception 'FAIL: unexpected default settings %', s;
  end if;
  perform pg_temp.expect_error('select ops.set_registration_settings('''', null, false)', 'actor_required', 'an unnamed change');
  perform ops.set_registration_settings('fnd-test', 'open for tests', false, 200, 3, 2);
  if (select count(*) from ops.registration_setting_events where changed_by = 'fnd-test' and (after ->> 'paused')::boolean = false and (before ->> 'paused')::boolean = true) <> 1 then
    raise exception 'FAIL: the settings change was not recorded with before and after';
  end if;
  perform pg_temp.expect_error('delete from ops.registration_setting_events', 'append', 'deleting the settings history');
  raise notice 'PASS: registration starts paused; changes are recorded and cannot be erased';
end $$;
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-fdfdfd000f02","role":"authenticated"}', true);
set local role authenticated;
select pg_temp.expect_error('select * from public.app_founder_registration()', 'not_founder', 'a member reading registration settings');
select pg_temp.expect_error('select public.app_founder_set_registration(true, null, null, null, null)', 'not_founder', 'a member pausing registration');
select pg_temp.expect_error('select public.app_founder_create_invitation_link(''fan'', 1, 7)', 'not_founder', 'a member creating an invitation link');
commit;

-- ---------------------------------------------------------------------------
-- 3. Links and the account creation hook.
create temp table codes (name text primary key, code text);
grant all on codes to authenticated;
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-fdfdfd000f01","role":"authenticated"}', true);
set local role authenticated;
insert into codes values ('inv1', public.app_founder_create_invitation_link('creator', 1, 7));
insert into codes values ('inv5', public.app_founder_create_invitation_link('fan', 5, 7));
do $$
declare r record;
begin
  select * into r from public.app_founder_registration();
  if r.paused or r.daily_cap <> 3 or r.registered_total <> 0 or not r.external_access_approved then
    raise exception 'FAIL: the founder sees unexpected settings %', r;
  end if;
  perform pg_temp.expect_error('select public.app_founder_create_invitation_link(''fan'', 1, 0)', 'invalid_expiry', 'a link that expires immediately');
end $$;
commit;
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-fdfdfd000f02","role":"authenticated"}', true);
set local role authenticated;
insert into codes values ('ref', public.app_my_referral_link());
do $$
begin
  if public.app_my_referral_link() <> (select code from codes where name = 'ref') then
    raise exception 'FAIL: a member got a second referral link';
  end if;
  if (select code from codes where name = 'ref') !~ '^[0-9a-f]{16}$' then raise exception 'FAIL: unexpected code format'; end if;
  raise notice 'PASS: a member has one personal referral link';
end $$;
commit;

do $$
declare
  ok jsonb := '{}'::jsonb;
  ev jsonb;
  ref text := (select code from codes where name = 'ref');
begin
  ev := jsonb_build_object('user', jsonb_build_object('email', 'someone@example.test', 'user_metadata', jsonb_build_object('registration_code', ref, 'adult_attested', 'true')));
  if public.hook_before_user_created(ev) <> ok then raise exception 'FAIL: a valid referral sign-up was refused: %', public.hook_before_user_created(ev); end if;
  ev := jsonb_build_object('user', jsonb_build_object('email', 'someone@example.test', 'user_metadata', jsonb_build_object('registration_code', ref)));
  if public.hook_before_user_created(ev) #>> '{error,message}' !~ '18 or older' then raise exception 'FAIL: a sign-up without the 18+ confirmation was allowed'; end if;
  ev := jsonb_build_object('user', jsonb_build_object('email', 'someone@example.test', 'user_metadata', jsonb_build_object('registration_code', '0123456789abcdef', 'adult_attested', 'true')));
  if public.hook_before_user_created(ev) #>> '{error,message}' !~ 'not valid' or (public.hook_before_user_created(ev) #>> '{error,http_code}')::int <> 403 then
    raise exception 'FAIL: an unknown code was allowed: %', public.hook_before_user_created(ev);
  end if;
  ev := jsonb_build_object('user', jsonb_build_object('email', 'someone@example.test', 'user_metadata', jsonb_build_object('adult_attested', 'true')));
  if public.hook_before_user_created(ev) ? 'error' is not true then raise exception 'FAIL: a sign-up without any code was allowed'; end if;
  ev := jsonb_build_object('user', jsonb_build_object('email', 'someone@mailinator.com', 'user_metadata', jsonb_build_object('registration_code', ref, 'adult_attested', 'true')));
  if public.hook_before_user_created(ev) #>> '{error,message}' !~ 'permanent email' then raise exception 'FAIL: a disposable address was allowed'; end if;
  -- A founder invitation by email still works without a code (the existing invite flow).
  insert into ops.invitations (email, source, campaign, expires_at) values ('invited@example.test', 'founder', 'pilot', now() + interval '7 days');
  ev := jsonb_build_object('user', jsonb_build_object('email', 'Invited@Example.test', 'user_metadata', '{}'::jsonb));
  if public.hook_before_user_created(ev) <> ok then raise exception 'FAIL: an invited email was refused'; end if;
  -- Paused: refused with the paused message.
  perform ops.set_registration_settings('fnd-test', 'pause check', true);
  ev := jsonb_build_object('user', jsonb_build_object('email', 'someone@example.test', 'user_metadata', jsonb_build_object('registration_code', ref, 'adult_attested', 'true')));
  if public.hook_before_user_created(ev) #>> '{error,message}' !~ 'paused' then raise exception 'FAIL: a sign-up while paused was allowed'; end if;
  perform ops.set_registration_settings('fnd-test', 'resume', false);
  raise notice 'PASS: accounts are created only with a valid link and the 18+ confirmation (or an open founder invitation); paused, unknown, missing and disposable are refused';
end $$;

-- ---------------------------------------------------------------------------
-- 4. Claiming membership.
create function pg_temp.claim_as(p_user uuid, p_code text, p_adult boolean)
returns text language plpgsql as $$
declare r text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r := public.app_claim_access(p_code, p_adult, 'adult-v1');
  reset role;
  return r;
end; $$;

begin;
do $$
declare
  ref text := (select code from codes where name = 'ref');
  inv1 text := (select code from codes where name = 'inv1');
  r text;
begin
  r := pg_temp.claim_as('00000000-0000-4000-8000-fdfdfd000f20', ref, true);
  if r <> 'not_confirmed' then raise exception 'FAIL: an unconfirmed account claimed: %', r; end if;
  r := pg_temp.claim_as('00000000-0000-4000-8000-fdfdfd000f11', null, true);
  if r <> 'link_required' then raise exception 'FAIL: a claim without a link answered %', r; end if;
  r := pg_temp.claim_as('00000000-0000-4000-8000-fdfdfd000f11', ref, false);
  if r <> 'adult_required' then raise exception 'FAIL: a claim without the confirmation answered %', r; end if;
  r := pg_temp.claim_as('00000000-0000-4000-8000-fdfdfd000f11', '0123456789abcdef', true);
  if r <> 'invalid' then raise exception 'FAIL: a claim with an unknown code answered %', r; end if;
  if exists (select 1 from ops.member_access where user_id = '00000000-0000-4000-8000-fdfdfd000f11') then
    raise exception 'FAIL: a refused claim granted membership';
  end if;

  -- A referral claim.
  r := pg_temp.claim_as('00000000-0000-4000-8000-fdfdfd000f11', ref, true);
  if r <> 'active' then raise exception 'FAIL: a valid referral claim answered %', r; end if;
  if not exists (select 1 from ops.member_access where user_id = '00000000-0000-4000-8000-fdfdfd000f11' and cohort = 'fan' and status = 'active' and updated_by = 'self-service')
     or not exists (select 1 from ops.age_attestations where user_id = '00000000-0000-4000-8000-fdfdfd000f11' and source = 'registration')
     or not exists (select 1 from ops.registrations where user_id = '00000000-0000-4000-8000-fdfdfd000f11' and kind = 'referral' and referrer_id = '00000000-0000-4000-8000-fdfdfd000f02')
     or exists (select 1 from social.follows where follower_id = '00000000-0000-4000-8000-fdfdfd000f11') then
    raise exception 'FAIL: the referral claim did not record membership, confirmation and attribution exactly (and no follow)';
  end if;
  if pg_temp.claim_as('00000000-0000-4000-8000-fdfdfd000f11', ref, true) <> 'active'
     or (select count(*) from ops.registrations where user_id = '00000000-0000-4000-8000-fdfdfd000f11') <> 1 then
    raise exception 'FAIL: claiming again was not idempotent';
  end if;

  -- An invitation claim: the link's cohort, single use.
  r := pg_temp.claim_as('00000000-0000-4000-8000-fdfdfd000f12', inv1, true);
  if r <> 'active' or (select cohort from ops.member_access where user_id = '00000000-0000-4000-8000-fdfdfd000f12') <> 'creator' then
    raise exception 'FAIL: the invitation claim answered % or the cohort is wrong', r;
  end if;
  r := pg_temp.claim_as('00000000-0000-4000-8000-fdfdfd000f13', inv1, true);
  if r <> 'invalid' then raise exception 'FAIL: a used single-use invitation answered %', r; end if;

  -- Per-referrer daily limit (2): the referrer already brought N1; one more fits.
  r := pg_temp.claim_as('00000000-0000-4000-8000-fdfdfd000f13', ref, true);
  if r <> 'full' and r <> 'referrer_limit' and r <> 'active' then raise exception 'FAIL: unexpected %', r; end if;
  raise notice 'PASS: claims need a verified email, a valid link and the 18+ confirmation; they record attribution, never follow anyone, and are idempotent; single-use links work once';
end $$;
commit;

do $$
declare r text;
  ref text := (select code from codes where name = 'ref');
  inv5 text := (select code from codes where name = 'inv5');
begin
  -- Daily cap is 3: N1, N2, N3 used it.
  r := pg_temp.claim_as('00000000-0000-4000-8000-fdfdfd000f14', inv5, true);
  if r <> 'full' then raise exception 'FAIL: a claim over the daily cap answered %', r; end if;
  perform ops.set_registration_settings('fnd-test', 'raise daily cap', null, null, 50, 2);
  r := pg_temp.claim_as('00000000-0000-4000-8000-fdfdfd000f14', ref, true);
  if r <> 'referrer_limit' then raise exception 'FAIL: a claim over the per-referrer limit answered %', r; end if;
  r := pg_temp.claim_as('00000000-0000-4000-8000-fdfdfd000f14', inv5, true);
  if r <> 'active' then raise exception 'FAIL: an invitation claim within the caps answered %', r; end if;
  -- Overall cap.
  perform ops.set_registration_settings('fnd-test', 'cap total', null, (select count(*)::int from ops.registrations));
  r := pg_temp.claim_as('00000000-0000-4000-8000-fdfdfd000f15', inv5, true);
  if r <> 'full' then raise exception 'FAIL: a claim over the overall cap answered %', r; end if;
  perform ops.set_registration_settings('fnd-test', 'uncap', null, 200);
  -- Paused.
  perform ops.set_registration_settings('fnd-test', 'pause', true);
  r := pg_temp.claim_as('00000000-0000-4000-8000-fdfdfd000f15', inv5, true);
  if r <> 'paused' then raise exception 'FAIL: a claim while paused answered %', r; end if;
  perform ops.set_registration_settings('fnd-test', 'resume', false);
  -- Launch gate closed: refused, nothing kept.
  perform ops.set_external_access('fnd-test', false);
  r := pg_temp.claim_as('00000000-0000-4000-8000-fdfdfd000f15', inv5, true);
  if r <> 'closed' or exists (select 1 from ops.registrations where user_id = '00000000-0000-4000-8000-fdfdfd000f15') then
    raise exception 'FAIL: a claim with the gate closed answered % or kept a record', r;
  end if;
  perform ops.set_external_access('fnd-test', true, 'APPROVE EXTERNAL MEMBER ACCESS');
  -- A revoked member never reclaims.
  perform ops.revoke_member_access('00000000-0000-4000-8000-fdfdfd000f14', 'fnd-test', 'test');
  r := pg_temp.claim_as('00000000-0000-4000-8000-fdfdfd000f14', inv5, true);
  if r <> 'revoked' then raise exception 'FAIL: a revoked member reclaimed: %', r; end if;
  -- A referral link stops working when its owner loses membership.
  perform ops.revoke_member_access('00000000-0000-4000-8000-fdfdfd000f02', 'fnd-test', 'test');
  r := pg_temp.claim_as('00000000-0000-4000-8000-fdfdfd000f16', ref, true);
  if r <> 'invalid' then raise exception 'FAIL: a revoked member''s referral link answered %', r; end if;
  perform ops.grant_member_access('00000000-0000-4000-8000-fdfdfd000f02', 'fan', 'fnd-test');
  raise notice 'PASS: daily, per-referrer and overall caps, pause, the launch gate and revocation all hold';
end $$;

-- ---------------------------------------------------------------------------
-- 5. Events: written once by the server, with the data class.
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-fdfdfd000f02","role":"authenticated"}', true);
set local role authenticated;
select public.app_follow('00000000-0000-4000-8000-fdfdfd000f03');
select public.app_clique_add('00000000-0000-4000-8000-fdfdfd000f03');
commit;
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-fdfdfd000f03","role":"authenticated"}', true);
set local role authenticated;
insert into codes values ('post', public.app_create_post('An event test post', gen_random_uuid())::text);
commit;
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-fdfdfd000f02","role":"authenticated"}', true);
set local role authenticated;
select public.app_like((select code from codes where name = 'post')::uuid);
select public.app_add_comment((select code from codes where name = 'post')::uuid, 'Nice one', gen_random_uuid());
select public.app_unlike((select code from codes where name = 'post')::uuid);
select public.app_clique_remove('00000000-0000-4000-8000-fdfdfd000f03');
select public.app_unfollow('00000000-0000-4000-8000-fdfdfd000f03');
commit;
do $$
declare
  r uuid := '00000000-0000-4000-8000-fdfdfd000f02';
  c uuid := '00000000-0000-4000-8000-fdfdfd000f03';
  p uuid := (select code from codes where name = 'post')::uuid;
  names text[];
begin
  select array_agg(name order by id) into names from analytics.events where actor_id = r and creator_id = c;
  if names <> array['followed', 'clique_joined', 'post_liked', 'comment_added', 'post_unliked', 'clique_left', 'followed'] and
     names <> array['followed', 'clique_joined', 'post_liked', 'comment_added', 'post_unliked', 'clique_left', 'unfollowed'] then
    raise exception 'FAIL: unexpected event sequence %', names;
  end if;
  if names[7] <> 'unfollowed' then raise exception 'FAIL: unfollow recorded as %', names[7]; end if;
  if (select count(*) from analytics.events where name = 'post_created' and post_id = p and actor_id = c and data_class = 'actual') <> 1 then
    raise exception 'FAIL: the post was not recorded once as actual';
  end if;
  if (select count(*) from analytics.events where name = 'registered' and actor_id = '00000000-0000-4000-8000-fdfdfd000f11' and props ->> 'referred' = 'true') <> 1 then
    raise exception 'FAIL: the referral registration was not recorded';
  end if;
  if (select props ->> 'reason' from analytics.events where name = 'clique_left' and actor_id = r order by id desc limit 1) <> 'removed' then
    raise exception 'FAIL: the clique removal reason was not recorded';
  end if;
  raise notice 'PASS: follows, Clique changes, posts, likes, comments and registrations are recorded once each, with the data class';
end $$;
-- A tester's actions are classed as test; the founder's as founder.
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-fdfdfd000f04","role":"authenticated"}', true);
set local role authenticated;
select public.app_follow('00000000-0000-4000-8000-fdfdfd000f03');
commit;
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-fdfdfd000f01","role":"authenticated"}', true);
set local role authenticated;
select public.app_follow('00000000-0000-4000-8000-fdfdfd000f03');
commit;
do $$
begin
  if (select data_class from analytics.events where name = 'followed' and actor_id = '00000000-0000-4000-8000-fdfdfd000f04') <> 'test'
     or (select data_class from analytics.events where name = 'followed' and actor_id = '00000000-0000-4000-8000-fdfdfd000f01') <> 'founder' then
    raise exception 'FAIL: data classes are wrong';
  end if;
  raise notice 'PASS: tester activity is classed test and founder activity founder';
end $$;
-- Members cannot read events.
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-fdfdfd000f02","role":"authenticated"}', true);
set local role authenticated;
select pg_temp.expect_error('select count(*) from analytics.events', 'permission denied', 'a member reading events');
commit;

-- ---------------------------------------------------------------------------
-- 6. Complete Home paging: identical timestamps are never skipped; the Clique filter.
do $$
declare i int;
begin
  for i in 1..25 loop
    insert into social.posts (author_id, body, created_at)
    values ('00000000-0000-4000-8000-fdfdfd000f03', 'Same-time post ' || i, '2026-11-30 12:00:00+00');
  end loop;
end $$;
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-fdfdfd000f02","role":"authenticated"}', true);
set local role authenticated;
select public.app_follow('00000000-0000-4000-8000-fdfdfd000f03');
create temp table seen (id uuid primary key, body text);
do $$
declare
  b_at timestamptz; b_id uuid; n int; pages int := 0; r record;
begin
  loop
    n := 0;
    for r in select * from public.app_feed_page(b_at, b_id, 10, 'all') where author_id = '00000000-0000-4000-8000-fdfdfd000f03' or true loop
      insert into seen values (r.id, r.body);
      b_at := r.created_at; b_id := r.id; n := n + 1;
    end loop;
    pages := pages + 1;
    exit when n < 10 or pages > 20;
  end loop;
  if (select count(*) from seen where body like 'Same-time post %') <> 25 then
    raise exception 'FAIL: paging reached % of 25 posts with the same timestamp', (select count(*) from seen where body like 'Same-time post %');
  end if;
  perform pg_temp.expect_error('select * from public.app_feed_page(now(), null, 10, ''all'')', 'invalid_cursor', 'half a cursor');
  perform pg_temp.expect_error('select * from public.app_feed_page(null, null, 10, ''everything'')', 'invalid_filter', 'an unknown filter');
  if exists (select 1 from public.app_feed_page(null, null, 50, 'clique')) then
    raise exception 'FAIL: the Clique filter showed posts from creators outside the Clique';
  end if;
  perform public.app_clique_add('00000000-0000-4000-8000-fdfdfd000f03');
  if (select count(*) from public.app_feed_page(null, null, 50, 'clique')) < 25
     or exists (select 1 from public.app_feed_page(null, null, 50, 'clique') where not author_in_my_clique) then
    raise exception 'FAIL: the Clique filter is wrong';
  end if;
  if (select count(*) from public.app_member_posts_page('00000000-0000-4000-8000-fdfdfd000f03', null, null, 50)) < 25 then
    raise exception 'FAIL: member posts paging is wrong';
  end if;
  raise notice 'PASS: Home pages on (created_at, id): 25 posts with one timestamp all reached across pages; the Clique filter shows only Clique creators';
end $$;
commit;

-- ---------------------------------------------------------------------------
-- 7. Deleting an account with likes, events and a registration still works.
delete from auth.users where id = '00000000-0000-4000-8000-fdfdfd000f11';
do $$
begin
  if exists (select 1 from ops.registrations where user_id = '00000000-0000-4000-8000-fdfdfd000f11')
     or exists (select 1 from ops.age_attestations where user_id = '00000000-0000-4000-8000-fdfdfd000f11')
     or exists (select 1 from analytics.events where actor_id = '00000000-0000-4000-8000-fdfdfd000f11') then
    raise exception 'FAIL: account deletion left registration, attestation or attributable events';
  end if;
  raise notice 'PASS: account deletion removes the registration and confirmation and detaches events';
end $$;
do $$
begin
  begin
    update ops.registrations set cohort = 'creator' where user_id = '00000000-0000-4000-8000-fdfdfd000f13';
    raise exception 'FAIL: a registration was edited';
  exception when others then
    if sqlerrm !~ 'cannot be changed' then raise; end if;
  end;
end $$;
delete from auth.users where id = '00000000-0000-4000-8000-fdfdfd000f02';
do $$
begin
  if exists (select 1 from ops.registrations where referrer_id = '00000000-0000-4000-8000-fdfdfd000f02')
     or not exists (select 1 from ops.registrations where user_id = '00000000-0000-4000-8000-fdfdfd000f13') then
    raise exception 'FAIL: deleting the referrer did not keep the referred account''s registration with the reference cleared';
  end if;
  raise notice 'PASS: a referrer with likes, comments, follows and referrals can be deleted; their referrals stay, without the reference; registrations are otherwise never edited';
end $$;

-- Restore the test-only automatic confirmation for any later files.
create trigger zz_test_auto_attest after insert or update on ops.member_access
for each row execute function test_support.auto_attest();
