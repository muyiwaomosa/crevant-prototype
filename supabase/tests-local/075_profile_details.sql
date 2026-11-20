-- TEST ONLY (throwaway databases). Profile details, interests and
-- interest-based discovery (20261123000000), as real signed-in accounts
-- calling the same functions the app calls.
--
--   A = ...0c01, B = ...0c02, C = ...0c03: active pilot members, complete profiles.
--   R = ...0c04: an active member, revoked during the test.
--   N = ...0c05: a complete profile, never granted (signed in only).

set role supabase_auth_admin;
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-4000-8000-000000000c01', 'details-a@example.test', now()),
  ('00000000-0000-4000-8000-000000000c02', 'details-b@example.test', now()),
  ('00000000-0000-4000-8000-000000000c03', 'details-c@example.test', now()),
  ('00000000-0000-4000-8000-000000000c04', 'details-r@example.test', now()),
  ('00000000-0000-4000-8000-000000000c05', 'details-n@example.test', now());
reset role;
update public.profiles set username = 'det_a', display_name = 'Det A' where id = '00000000-0000-4000-8000-000000000c01';
update public.profiles set username = 'det_b', display_name = 'Det B' where id = '00000000-0000-4000-8000-000000000c02';
update public.profiles set username = 'det_c', display_name = 'Det C' where id = '00000000-0000-4000-8000-000000000c03';
update public.profiles set username = 'det_r', display_name = 'Det R' where id = '00000000-0000-4000-8000-000000000c04';
update public.profiles set username = 'det_n', display_name = 'Det N' where id = '00000000-0000-4000-8000-000000000c05';
select ops.grant_member_access('00000000-0000-4000-8000-000000000c01', 'creator', 'test');
select ops.grant_member_access('00000000-0000-4000-8000-000000000c02', 'fan', 'test');
select ops.grant_member_access('00000000-0000-4000-8000-000000000c03', 'tester', 'test');
select ops.grant_member_access('00000000-0000-4000-8000-000000000c04', 'creator', 'test');

create function pg_temp.expect_error_pd(sql text, expected text, what text)
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
grant execute on function pg_temp.expect_error_pd(text, text, text) to authenticated, anon;

-- A fingerprint of every membership row and its history, to prove the
-- identity preference never changes access.
create function pg_temp.access_fp()
returns text
language sql
as $$
  select coalesce(md5(string_agg(user_id::text || cohort || status || coalesce(expires_at::text, '-') || updated_at::text, ',' order by user_id)), '-')
         || '/' || (select count(*) from ops.member_access_events)
  from ops.member_access;
$$;
create temp table pd_fp as select pg_temp.access_fp() as fp;

-- ---------------------------------------------------------------------------
-- 1. Without pilot membership, nothing: N (signed in, complete profile) and anon.
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000c05","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  perform pg_temp.expect_error_pd('select * from public.app_topics()', 'no_pilot_access', 'N reading topics');
  perform pg_temp.expect_error_pd('select * from public.app_my_details()', 'no_pilot_access', 'N reading their details');
  perform pg_temp.expect_error_pd($q$select public.app_set_profile_details('creator', 'Hi', 'Because', array['food'])$q$, 'no_pilot_access', 'N saving details');
  perform pg_temp.expect_error_pd('select * from public.app_member_details(''00000000-0000-4000-8000-000000000c01'')', 'no_pilot_access', 'N reading a member''s details');
  perform pg_temp.expect_error_pd('select * from public.app_discover_people()', 'no_pilot_access', 'N discovering');
  perform pg_temp.expect_error_pd('select * from public.app_suggested_creators()', 'no_pilot_access', 'N reading suggestions');
  perform pg_temp.expect_error_pd('select * from social.profile_details', 'permission denied', 'N reading details directly');
  perform pg_temp.expect_error_pd('select * from social.topics', 'permission denied', 'N reading topics directly');
  raise notice 'PASS: without pilot membership, every profile detail function refuses (no_pilot_access) and the tables are unreachable';
end $$;
commit;
do $$
begin
  if exists (select 1 from social.profile_details where user_id = '00000000-0000-4000-8000-000000000c05') then
    raise exception 'FAIL: N saved details without membership';
  end if;
end $$;

begin;
set local role anon;
do $$
begin
  perform pg_temp.expect_error_pd('select * from public.app_topics()', 'permission denied', 'anon reading topics');
  perform pg_temp.expect_error_pd($q$select public.app_set_profile_details('fan', null, null, null)$q$, 'permission denied', 'anon saving details');
  perform pg_temp.expect_error_pd('select * from public.app_discover_people()', 'permission denied', 'anon discovering');
  raise notice 'PASS: anonymous visitors can call none of the profile detail functions';
end $$;
commit;

-- ---------------------------------------------------------------------------
-- 2. A member sets up their details; the rules hold.
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000c01","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  d record;
  n int;
begin
  select count(*) into n from public.app_topics();
  if n < 1 or (select slug from public.app_topics() limit 1) <> 'food' then
    raise exception 'FAIL: the topic list is empty or out of order';
  end if;

  select * into d from public.app_my_details();
  if d.identity is not null or d.bio is not null or d.follow_reason is not null or d.topics <> '{}' or d.onboarded then
    raise exception 'FAIL: a new member should have no details yet: %', d;
  end if;

  perform public.app_set_profile_details(' Creator ', '  I cook on a budget.  ', ' New recipes every week ', array['music', 'food', 'food', null]);
  select * into d from public.app_my_details();
  if d.identity <> 'creator' or d.bio <> 'I cook on a budget.' or d.follow_reason <> 'New recipes every week'
     or d.topics <> array['food', 'music'] or not d.onboarded then
    raise exception 'FAIL: details were not saved as given (trimmed, deduplicated, in topic order): %', d;
  end if;

  -- Each field may be cleared; whitespace counts as empty.
  perform public.app_set_profile_details(null, '   ', '', '{}');
  select * into d from public.app_my_details();
  if d.identity is not null or d.bio is not null or d.follow_reason is not null or d.topics <> '{}' or not d.onboarded then
    raise exception 'FAIL: clearing details did not clear them (or forgot setup was done): %', d;
  end if;

  perform pg_temp.expect_error_pd($q$select public.app_set_profile_details('admin', null, null, null)$q$, 'invalid_identity', 'an unknown identity');
  perform pg_temp.expect_error_pd($q$select public.app_set_profile_details('fan', repeat('x', 161), null, null)$q$, 'bio_too_long', 'a 161 character bio');
  perform pg_temp.expect_error_pd($q$select public.app_set_profile_details('fan', null, repeat('x', 141), null)$q$, 'follow_reason_too_long', 'a 141 character follow reason');
  perform pg_temp.expect_error_pd($q$select public.app_set_profile_details('fan', E'two\nlines', null, null)$q$, 'invalid_text', 'a bio with a line break');
  perform pg_temp.expect_error_pd($q$select public.app_set_profile_details('fan', null, E'tab\there', null)$q$, 'invalid_text', 'a follow reason with a control character');
  perform pg_temp.expect_error_pd($q$select public.app_set_profile_details('fan', null, null, array['food','money','tech','music','film','art'])$q$, 'too_many_topics', 'six interests');
  perform pg_temp.expect_error_pd($q$select public.app_set_profile_details('fan', null, null, array['food','not_a_topic'])$q$, 'unknown_topic', 'an unknown interest');

  -- Exactly the limits are fine, in any script and with emoji.
  perform public.app_set_profile_details('both', repeat('é', 160), repeat('🎵', 140), array['food','money','tech','music','film']);
  select * into d from public.app_my_details();
  if char_length(d.bio) <> 160 or char_length(d.follow_reason) <> 140 or cardinality(d.topics) <> 5 then
    raise exception 'FAIL: values at the limits were not accepted: %', d;
  end if;

  -- The final details A keeps for the rest of the test.
  perform public.app_set_profile_details('creator', 'I cook on a budget.', 'New recipes every week', array['food', 'music']);

  perform pg_temp.expect_error_pd($q$insert into social.profile_details (user_id, identity) values (auth.uid(), 'creator')$q$, 'permission denied', 'A writing details directly');
  perform pg_temp.expect_error_pd($q$insert into social.member_topics (user_id, topic) values (auth.uid(), 'tech')$q$, 'permission denied', 'A writing interests directly');
  perform pg_temp.expect_error_pd($q$insert into social.topics (slug, label, sort_order) values ('mine', 'Mine', 999)$q$, 'permission denied', 'A adding a topic');
  raise notice 'PASS: a member saves, changes and clears their own details, within the limits, and only through app_set_profile_details';
end $$;
commit;

-- Setup stays done from the first save.
do $$
declare
  first_at timestamptz := (select onboarded_at from social.profile_details where user_id = '00000000-0000-4000-8000-000000000c01');
begin
  if first_at is null or first_at > now() then
    raise exception 'FAIL: onboarded_at was not recorded';
  end if;
  if (select count(*) from social.member_topics where user_id = '00000000-0000-4000-8000-000000000c01') <> 2 then
    raise exception 'FAIL: A should have exactly 2 interests';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. The identity preference grants nothing and restricts nothing.
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000c02","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  -- B is a "fan" by membership cohort; choosing "creator" changes no access.
  perform public.app_set_profile_details('fan', 'Here for the food.', null, array['food', 'travel']);
  perform public.app_create_post('A fan can post.', gen_random_uuid());
  perform public.app_set_profile_details('creator', 'Here for the food.', null, array['food', 'travel']);
  perform public.app_follow('00000000-0000-4000-8000-000000000c03');
  perform public.app_clique_add('00000000-0000-4000-8000-000000000c03');
  raise notice 'PASS: a member can post, follow and add to their Clique whatever identity they choose';
end $$;
commit;
do $$
begin
  if (select fp from pd_fp) <> pg_temp.access_fp() then
    raise exception 'FAIL: changing the identity preference changed pilot membership';
  end if;
  if (select cohort from ops.member_access where user_id = '00000000-0000-4000-8000-000000000c02') <> 'fan' then
    raise exception 'FAIL: the identity preference changed the membership cohort';
  end if;
  -- No access check reads the details.
  if exists (select 1 from pg_proc where oid in ('social.current_access()'::regprocedure, 'social.current_member()'::regprocedure,
                                                 'ops.member_access_active(uuid)'::regprocedure, 'social.is_member(uuid)'::regprocedure)
             and prosrc ~ '(profile_details|identity|member_topics)')
     or pg_get_viewdef('social.visible_members'::regclass) ~ '(profile_details|identity)' then
    raise exception 'FAIL: an access check reads the profile details';
  end if;
  raise notice 'PASS: the identity preference never changes membership or its history, and no access check reads it';
end $$;

-- R, an active "creator" member, sets details; then R is revoked.
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000c04","role":"authenticated"}', true);
set local role authenticated;
select public.app_set_profile_details('creator', 'Revoked soon.', 'Follow me', array['food']);
commit;
select ops.revoke_member_access('00000000-0000-4000-8000-000000000c04', 'test', 'test');

begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000c04","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  perform pg_temp.expect_error_pd($q$select public.app_set_profile_details('creator', 'Still here', null, null)$q$, 'no_pilot_access', 'a revoked creator saving details');
  perform pg_temp.expect_error_pd('select * from public.app_my_details()', 'no_pilot_access', 'a revoked creator reading their details');
  perform pg_temp.expect_error_pd('select * from public.app_suggested_creators()', 'no_pilot_access', 'a revoked creator reading suggestions');
  raise notice 'PASS: a revoked member, whatever their identity preference, can no longer read or change details';
end $$;
commit;
do $$
begin
  if (select bio from social.profile_details where user_id = '00000000-0000-4000-8000-000000000c04') <> 'Revoked soon.' then
    raise exception 'FAIL: a revoked member changed their details';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Discovery and suggestions, as C (interests: food, music).
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000c03","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  ids uuid[];
  r record;
begin
  perform public.app_set_profile_details('fan', null, null, array['food', 'music']);

  -- Everyone visible except C: A shares 2 interests, B shares 1. R is revoked, N never granted.
  select array_agg(id order by ord) into ids
  from (select id, row_number() over () ord from public.app_discover_people(null, null, 50)) s
  where id::text like '00000000-0000-4000-8000-000000000c0_';
  if ids <> array['00000000-0000-4000-8000-000000000c01', '00000000-0000-4000-8000-000000000c02']::uuid[] then
    raise exception 'FAIL: Discover should list A (2 shared) then B (1 shared), without R, N or C: %', ids;
  end if;
  select * into r from public.app_discover_people(null, null, 50) where id = '00000000-0000-4000-8000-000000000c01';
  if r.shared_topics <> 2 or r.identity <> 'creator' or r.bio <> 'I cook on a budget.' or r.follow_reason <> 'New recipes every week'
     or r.topics <> array['food', 'music'] or r.followed_by_me then
    raise exception 'FAIL: A''s Discover card is wrong: %', r;
  end if;

  -- By topic: only B chose travel. By name: still works.
  if (select array_agg(id) from public.app_discover_people(null, 'travel', 50) where id::text like '00000000-0000-4000-8000-000000000c0_')
     <> array['00000000-0000-4000-8000-000000000c02']::uuid[] then
    raise exception 'FAIL: filtering by travel should find only B';
  end if;
  if (select count(*) from public.app_discover_people(null, 'not_a_topic', 50)) <> 0 then
    raise exception 'FAIL: an unknown topic should find nobody';
  end if;
  if (select array_agg(id) from public.app_discover_people('det_a', null, 50)) <> array['00000000-0000-4000-8000-000000000c01']::uuid[] then
    raise exception 'FAIL: searching by name should still find A';
  end if;
  if (select count(*) from public.app_discover_people('det_r', null, 50)) <> 0 then
    raise exception 'FAIL: a revoked member must not be discoverable';
  end if;

  -- Suggestions: people C doesn't follow yet, shared interests first.
  select array_agg(id order by ord) into ids
  from (select id, row_number() over () ord from public.app_suggested_creators(20)) s
  where id::text like '00000000-0000-4000-8000-000000000c0_';
  if ids <> array['00000000-0000-4000-8000-000000000c01', '00000000-0000-4000-8000-000000000c02']::uuid[] then
    raise exception 'FAIL: suggestions should be A then B: %', ids;
  end if;
  -- Following reuses the existing function, and removes them from suggestions.
  perform public.app_follow('00000000-0000-4000-8000-000000000c01');
  if exists (select 1 from public.app_suggested_creators(20) where id = '00000000-0000-4000-8000-000000000c01') then
    raise exception 'FAIL: someone C follows is still suggested';
  end if;
  if not (select followed_by_me from public.app_discover_people('det_a', null, 50)) then
    raise exception 'FAIL: Discover does not show that C follows A';
  end if;

  -- A member's details on their profile page; none for revoked or unknown members.
  select * into r from public.app_member_details('00000000-0000-4000-8000-000000000c01');
  if r.bio <> 'I cook on a budget.' or r.topics <> array['food', 'music'] then
    raise exception 'FAIL: A''s profile details are wrong: %', r;
  end if;
  if (select count(*) from public.app_member_details('00000000-0000-4000-8000-000000000c04')) <> 0
     or (select count(*) from public.app_member_details('00000000-0000-4000-8000-000000000c05')) <> 0 then
    raise exception 'FAIL: a revoked or never-granted member''s details are visible';
  end if;
  -- A member with no details yet still appears, with empty details.
  if (select count(*) from public.app_member_details('00000000-0000-4000-8000-000000000c02')) <> 1 then
    raise exception 'FAIL: B''s details row is missing';
  end if;
  -- Limits are capped.
  if (select count(*) from public.app_discover_people(null, null, 10000)) > 50 or (select count(*) from public.app_suggested_creators(10000)) > 20 then
    raise exception 'FAIL: the page size caps do not hold';
  end if;
  raise notice 'PASS: Discover finds visible members by name and interest, shared interests first; suggestions skip people already followed; revoked and never-granted members never appear';
end $$;
commit;

-- ---------------------------------------------------------------------------
-- 5. A retired topic disappears from the list and from profiles, and can't be chosen.
update social.topics set active = false where slug = 'music';
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000c01","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  if exists (select 1 from public.app_topics() where slug = 'music') then
    raise exception 'FAIL: a retired topic is still listed';
  end if;
  if (select topics from public.app_my_details()) <> array['food'] then
    raise exception 'FAIL: a retired topic still shows on the profile';
  end if;
  perform pg_temp.expect_error_pd($q$select public.app_set_profile_details('creator', null, null, array['music'])$q$, 'unknown_topic', 'choosing a retired topic');
  raise notice 'PASS: a retired topic is hidden everywhere and can''t be chosen';
end $$;
commit;
update social.topics set active = true where slug = 'music';

-- Deleting an account removes its details and interests.
do $$
begin
  set local role supabase_auth_admin;
  delete from auth.users where id = '00000000-0000-4000-8000-000000000c04';
  reset role;
  if exists (select 1 from social.profile_details where user_id = '00000000-0000-4000-8000-000000000c04')
     or exists (select 1 from social.member_topics where user_id = '00000000-0000-4000-8000-000000000c04') then
    raise exception 'FAIL: a deleted account left details or interests behind';
  end if;
  raise notice 'PASS: deleting an account removes its details and interests';
end $$;
