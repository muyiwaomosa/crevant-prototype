-- TEST ONLY (throwaway databases). Relationships (20261201000000): follow
-- source, mute, Active Supporter, profile counts, non-binding Support Intent,
-- Clique first Home with complete coverage, relationship lists and audience
-- insight, through the real functions.
--
--   M  = ...2101 a member (follows A, B and Q; A is in the Clique)
--   A  = ...2102 a creator in M's Clique
--   B  = ...2103 a creator M follows
--   Q  = ...2104 a creator M mutes
--   S  = ...2105 another follower of A (becomes an Active Supporter)
--   O  = ...2106 a creator nobody follows
\set ON_ERROR_STOP on

set role supabase_auth_admin;
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-4000-8000-fdfdfd002101', 'rel-m@example.test', now(), '{}'),
  ('00000000-0000-4000-8000-fdfdfd002102', 'rel-a@example.test', now(), '{}'),
  ('00000000-0000-4000-8000-fdfdfd002103', 'rel-b@example.test', now(), '{}'),
  ('00000000-0000-4000-8000-fdfdfd002104', 'rel-q@example.test', now(), '{}'),
  ('00000000-0000-4000-8000-fdfdfd002105', 'rel-s@example.test', now(), '{}'),
  ('00000000-0000-4000-8000-fdfdfd002106', 'rel-o@example.test', now(), '{}');
reset role;
update public.profiles set username = 'rel_m', display_name = 'Rel M' where id = '00000000-0000-4000-8000-fdfdfd002101';
update public.profiles set username = 'rel_a', display_name = 'Rel A' where id = '00000000-0000-4000-8000-fdfdfd002102';
update public.profiles set username = 'rel_b', display_name = 'Rel B' where id = '00000000-0000-4000-8000-fdfdfd002103';
update public.profiles set username = 'rel_q', display_name = 'Rel Q' where id = '00000000-0000-4000-8000-fdfdfd002104';
update public.profiles set username = 'rel_s', display_name = 'Rel S' where id = '00000000-0000-4000-8000-fdfdfd002105';
update public.profiles set username = 'rel_o', display_name = 'Rel O' where id = '00000000-0000-4000-8000-fdfdfd002106';
select ops.grant_member_access('00000000-0000-4000-8000-fdfdfd002101', 'fan', 'rel-test');
select ops.grant_member_access('00000000-0000-4000-8000-fdfdfd002102', 'creator', 'rel-test');
select ops.grant_member_access('00000000-0000-4000-8000-fdfdfd002103', 'creator', 'rel-test');
select ops.grant_member_access('00000000-0000-4000-8000-fdfdfd002104', 'creator', 'rel-test');
select ops.grant_member_access('00000000-0000-4000-8000-fdfdfd002105', 'fan', 'rel-test');
select ops.grant_member_access('00000000-0000-4000-8000-fdfdfd002106', 'creator', 'rel-test');
insert into ops.age_attestations (user_id, wording_version, source)
select u, 'adult-v1', 'test' from unnest(array[
  '00000000-0000-4000-8000-fdfdfd002101', '00000000-0000-4000-8000-fdfdfd002102', '00000000-0000-4000-8000-fdfdfd002103',
  '00000000-0000-4000-8000-fdfdfd002104', '00000000-0000-4000-8000-fdfdfd002105', '00000000-0000-4000-8000-fdfdfd002106']::uuid[]) u
on conflict do nothing;

create function pg_temp.expect_error(sql text, expected text, what text)
returns void language plpgsql as $$
declare got text;
begin
  begin execute sql; exception when others then got := sqlerrm; end;
  if got is null then raise exception 'FAIL: % succeeded, expected "%"', what, expected; end if;
  if got !~ expected then raise exception 'FAIL: % failed with "%", expected "%"', what, got, expected; end if;
end; $$;
grant execute on function pg_temp.expect_error(text, text, text) to authenticated, anon;
create function pg_temp.r(n text) returns uuid language sql immutable as $$ select ('00000000-0000-4000-8000-fdfdfd00' || n)::uuid $$;
grant execute on function pg_temp.r(text) to authenticated, anon;

-- ---------------------------------------------------------------------------
-- 1. Follows record their source; an unknown source is refused.
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-fdfdfd002101","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  perform pg_temp.expect_error('select public.app_follow(pg_temp.r(''2102''), ''billboard'')', 'invalid_request', 'an unknown follow source');
  perform public.app_follow(pg_temp.r('2102'), 'profile');
  perform public.app_follow(pg_temp.r('2103'), 'discover');
  perform public.app_follow(pg_temp.r('2104'));
  perform public.app_follow(pg_temp.r('2102'), 'post'); -- already following: nothing recorded twice
  perform public.app_clique_add(pg_temp.r('2102'));
  raise notice 'PASS: follows accept a known source or none, and refuse an unknown one';
end $$;
commit;
do $$
begin
  if (select array_agg(coalesce(source, '-') order by creator_id) from social.follow_events
      where follower_id = '00000000-0000-4000-8000-fdfdfd002101' and action = 'followed') <> array['profile', 'discover', '-'] then
    raise exception 'FAIL: follow sources were not recorded once each: %', (select array_agg(coalesce(source, '-')) from social.follow_events where follower_id = '00000000-0000-4000-8000-fdfdfd002101');
  end if;
  if (select props ->> 'source' from analytics.events where name = 'followed' and actor_id = '00000000-0000-4000-8000-fdfdfd002101'
      and creator_id = '00000000-0000-4000-8000-fdfdfd002103') is distinct from 'discover' then
    raise exception 'FAIL: the follow event does not carry its source';
  end if;
  raise notice 'PASS: the follow history and the event stream record each follow''s source once';
end $$;

-- Posts: A has 3 recent (one already seen by M) and 1 from 10 days ago, B 4, Q 2, O 1, M 1 of their own.
insert into social.posts (id, author_id, body, created_at)
select ('00000000-0000-4000-8000-fdfdfd0022' || lpad(i::text, 2, '0'))::uuid, a, 'Rel post ' || i, now() - make_interval(mins => i)
from (values (1, pg_temp.r('2102')), (2, pg_temp.r('2102')), (3, pg_temp.r('2102')),
             (4, pg_temp.r('2103')), (5, pg_temp.r('2103')), (6, pg_temp.r('2103')), (7, pg_temp.r('2103')),
             (8, pg_temp.r('2104')), (9, pg_temp.r('2104')), (10, pg_temp.r('2106')), (11, pg_temp.r('2101'))) v(i, a);
-- Same timestamp for two B posts, to prove paging and the group never skip one.
update social.posts set created_at = (select created_at from social.posts where id = '00000000-0000-4000-8000-fdfdfd002204')
where id = '00000000-0000-4000-8000-fdfdfd002205';
-- An older A post: in the feed, outside the 7-day Clique first group. Follows are back-dated so it counts.
update social.follows set followed_at = now() - interval '30 days' where follower_id = '00000000-0000-4000-8000-fdfdfd002101';
insert into social.posts (id, author_id, body, created_at)
values ('00000000-0000-4000-8000-fdfdfd002212', '00000000-0000-4000-8000-fdfdfd002102', 'Rel post old', now() - interval '10 days');
insert into social.post_views (viewer_id, post_id, basis) values ('00000000-0000-4000-8000-fdfdfd002101', '00000000-0000-4000-8000-fdfdfd002203', 'visible');

-- ---------------------------------------------------------------------------
-- 2. Mute: only followed creators; Home leaves them out everywhere; profile and history stay.
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-fdfdfd002101","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  perform pg_temp.expect_error('select public.app_mute(pg_temp.r(''2106''))', 'not_following', 'muting a creator not followed');
  perform pg_temp.expect_error('select public.app_mute(pg_temp.r(''2101''))', 'invalid_request', 'muting yourself');
  if not exists (select 1 from public.app_feed_page(null, null, 50, 'all') where author_id = pg_temp.r('2104')) then
    raise exception 'FAIL: before muting, Q''s posts should be on Home';
  end if;
  perform public.app_mute(pg_temp.r('2104'));
  perform public.app_mute(pg_temp.r('2104')); -- again: nothing changes
  if exists (select 1 from public.app_feed_page(null, null, 50, 'all') where author_id = pg_temp.r('2104'))
     or exists (select 1 from public.app_unseen_creators() where id = pg_temp.r('2104')) then
    raise exception 'FAIL: a muted creator still appears on Home';
  end if;
  if not (select muted_by_me and followed_by_me from public.app_member('rel_q'))
     or (select count(*) from public.app_member_posts_page(pg_temp.r('2104'), null, null, 50)) <> 2
     or not (select muted from public.app_my_relationships() where id = pg_temp.r('2104')) then
    raise exception 'FAIL: muting should keep the follow and the profile, and show as muted';
  end if;
  raise notice 'PASS: muting hides a followed creator from Home only; the follow and their profile stay';
end $$;
commit;

-- ---------------------------------------------------------------------------
-- 3. Clique first and complete coverage. The group is M's unseen recent Clique
--    posts; the group plus the chronological feed (group removed) shows every
--    eligible post exactly once: everything followed and not muted, and M's own.
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-fdfdfd002101","role":"authenticated"}', true);
set local role authenticated;
create temp table shown (id uuid, place text);
do $$
declare
  b_at timestamptz; b_id uuid; n int; pages int := 0; r record;
  expected int;
begin
  insert into shown select p.id, 'group' from public.app_home_priority(10) p;
  if (select array_agg(id order by id) from shown) <> array[pg_temp.r('2201'), pg_temp.r('2202')] then
    raise exception 'FAIL: the Clique first group should be A''s two unseen recent posts, got %', (select array_agg(id) from shown);
  end if;
  loop
    n := 0;
    for r in select * from public.app_feed_page(b_at, b_id, 2, 'all') loop
      if not exists (select 1 from shown s where s.id = r.id and s.place = 'group') then
        insert into shown values (r.id, 'feed');
      end if;
      b_at := r.created_at; b_id := r.id; n := n + 1;
    end loop;
    pages := pages + 1;
    exit when n < 2 or pages > 50;
  end loop;
  -- Eligible: A 4 (3 recent + old), B 4, M's own 1. Not Q (muted), not O (not followed).
  expected := 9;
  if (select count(*) from shown) <> expected or (select count(distinct id) from shown) <> expected then
    raise exception 'FAIL: coverage: % shown, % distinct, expected % each exactly once', (select count(*) from shown), (select count(distinct id) from shown), expected;
  end if;
  if exists (select 1 from shown s join public.app_feed_page(null, null, 50, 'all') f on f.id = s.id where f.author_id in (pg_temp.r('2104'), pg_temp.r('2106'))) then
    raise exception 'FAIL: a muted or unfollowed creator reached Home';
  end if;
  if (select count(*) from public.app_feed_page(null, null, 50, 'clique')) <> 4 then
    raise exception 'FAIL: My Clique should show A''s 4 posts';
  end if;
  raise notice 'PASS: Clique first shows unseen Clique posts first, and with the chronological feed every eligible post appears exactly once (9 of 9), nothing muted or unfollowed';
end $$;
commit;

-- Seeing the group's posts empties it: nothing is starved or pinned.
insert into social.post_views (viewer_id, post_id, basis) values
  ('00000000-0000-4000-8000-fdfdfd002101', '00000000-0000-4000-8000-fdfdfd002201', 'visible'),
  ('00000000-0000-4000-8000-fdfdfd002101', '00000000-0000-4000-8000-fdfdfd002202', 'visible');
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-fdfdfd002101","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  if exists (select 1 from public.app_home_priority(10)) then
    raise exception 'FAIL: seen posts should leave the Clique first group';
  end if;
  perform public.app_unmute(pg_temp.r('2104'));
  perform public.app_unmute(pg_temp.r('2104')); -- again: nothing changes
  if (select count(*) from public.app_feed_page(null, null, 50, 'all') where author_id = pg_temp.r('2104')) <> 2 then
    raise exception 'FAIL: unmuting should bring the creator back to Home';
  end if;
  -- A new follow ends an old mute.
  perform public.app_mute(pg_temp.r('2104'));
  perform public.app_unfollow(pg_temp.r('2104'));
  perform public.app_follow(pg_temp.r('2104'), 'catch_up');
  if (select muted_by_me from public.app_member('rel_q')) then
    raise exception 'FAIL: following again should end an old mute';
  end if;
  raise notice 'PASS: seen posts leave the group; unmuting brings a creator back; a new follow ends an old mute';
end $$;
commit;
do $$
begin
  if (select array_agg(name order by id) from analytics.events where name in ('muted', 'unmuted') and actor_id = '00000000-0000-4000-8000-fdfdfd002101')
     <> array['muted', 'unmuted', 'muted', 'unmuted'] then
    raise exception 'FAIL: mute events: %', (select array_agg(name order by id) from analytics.events where name in ('muted', 'unmuted') and actor_id = '00000000-0000-4000-8000-fdfdfd002101');
  end if;
  perform pg_temp.expect_error('update social.mute_events set action = ''muted''', 'append-only', 'rewriting mute history');
  perform pg_temp.expect_error('delete from social.mute_events', 'append-only', 'deleting mute history');
  raise notice 'PASS: each mute and unmute is recorded once, and the history is append-only';
end $$;

-- ---------------------------------------------------------------------------
-- 4. Active Supporter: a follower with a meaningful comment on the creator's posts in 28 days.
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-fdfdfd002105","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  perform public.app_follow(pg_temp.r('2102'), 'comment');
  perform public.app_add_comment(pg_temp.r('2201'), 'nice!');
  if (select i_am_active_supporter from public.app_member('rel_a')) or (select active_supporter_count from public.app_member('rel_a')) <> 0 then
    raise exception 'FAIL: a short comment should not make an Active Supporter';
  end if;
  perform public.app_add_comment(pg_temp.r('2201'), 'This breakdown finally made my budget click.');
  if not (select i_am_active_supporter from public.app_member('rel_a')) then
    raise exception 'FAIL: a meaningful comment should make S an Active Supporter of A';
  end if;
  raise notice 'PASS: a meaningful comment makes a follower an Active Supporter; a short one does not';
end $$;
commit;
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-fdfdfd002101","role":"authenticated"}', true);
set local role authenticated;
do $$
declare m record;
begin
  select * into m from public.app_member('rel_a');
  if m.follower_count <> 2 or m.clique_count <> 1 or m.active_supporter_count <> 1 or m.i_am_active_supporter then
    raise exception 'FAIL: A''s counts: %', m;
  end if;
  if (select active_supporter from public.app_my_relationships() where id = pg_temp.r('2102')) then
    raise exception 'FAIL: M has no meaningful activity on A';
  end if;
  raise notice 'PASS: profile counts: 2 followers, 1 in a Clique, 1 Active Supporter';
end $$;
commit;
-- Old activity (29 days) does not count, and neither does a deleted comment.
update social.comments set created_at = now() - interval '29 days'
where author_id = '00000000-0000-4000-8000-fdfdfd002105' and body like 'This breakdown%';
do $$
begin
  if social.is_active_supporter('00000000-0000-4000-8000-fdfdfd002105', '00000000-0000-4000-8000-fdfdfd002102') then
    raise exception 'FAIL: activity older than 28 days should not count';
  end if;
  update social.comments set created_at = now() - interval '1 day'
  where author_id = '00000000-0000-4000-8000-fdfdfd002105' and body like 'This breakdown%';
  if not social.is_active_supporter('00000000-0000-4000-8000-fdfdfd002105', '00000000-0000-4000-8000-fdfdfd002102') then
    raise exception 'FAIL: recent meaningful activity should count';
  end if;
  if (select (props ->> 'meaningful')::boolean from analytics.events where name = 'comment_added'
      and actor_id = '00000000-0000-4000-8000-fdfdfd002105' order by id desc limit 1) is not true then
    raise exception 'FAIL: the comment event does not say it was meaningful';
  end if;
  raise notice 'PASS: only the last 28 days count, and comment events record whether they were meaningful';
end $$;

-- ---------------------------------------------------------------------------
-- 5. Support Intent: non-binding, the member's own, recorded once per change.
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-fdfdfd002101","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  perform pg_temp.expect_error('select public.app_record_support_intent(pg_temp.r(''2102''), ''usd_50'')', 'invalid_request', 'an unknown option');
  perform pg_temp.expect_error('select public.app_record_support_intent(pg_temp.r(''2101''), ''usd_5'')', 'invalid_request', 'supporting yourself');
  perform pg_temp.expect_error('select public.app_record_support_intent(''00000000-0000-4000-8000-0000000fffff'', ''usd_5'')', 'not_found', 'supporting nobody');
  perform pg_temp.expect_error('select count(*) from intent.support_intents', 'permission denied', 'reading Support Intent directly');
  if exists (select 1 from public.app_support_intent(pg_temp.r('2102'))) then
    raise exception 'FAIL: no Support Intent yet';
  end if;
  perform public.app_record_support_intent(pg_temp.r('2102'), 'withdrawn'); -- nothing to withdraw: nothing recorded
  perform public.app_record_support_intent(pg_temp.r('2102'), 'usd_5');
  perform public.app_record_support_intent(pg_temp.r('2102'), 'usd_5'); -- same again: nothing recorded
  if (select choice from public.app_support_intent(pg_temp.r('2102'))) <> 'usd_5'
     or (select support_choice from public.app_my_relationships() where id = pg_temp.r('2102')) <> 'usd_5' then
    raise exception 'FAIL: the Support Intent should read $5 a month';
  end if;
  perform public.app_record_support_intent(pg_temp.r('2102'), 'not_sure');
  perform public.app_record_support_intent(pg_temp.r('2103'), 'usd_10');
  perform public.app_record_support_intent(pg_temp.r('2103'), 'withdrawn');
  if exists (select 1 from public.app_support_intent(pg_temp.r('2103')))
     or (select support_choice from public.app_my_relationships() where id = pg_temp.r('2103')) is not null then
    raise exception 'FAIL: a withdrawn Support Intent should read as none';
  end if;
  raise notice 'PASS: Support Intent records known options only, once per change, and can be withdrawn';
end $$;
commit;
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-fdfdfd002105","role":"authenticated"}', true);
set local role authenticated;
select public.app_record_support_intent('00000000-0000-4000-8000-fdfdfd002102', 'usd_10');
commit;
do $$
begin
  if (select count(*) from intent.support_intents where member_id = '00000000-0000-4000-8000-fdfdfd002101') <> 4 then
    raise exception 'FAIL: M''s Support Intent history should have 4 rows (usd_5, not_sure, usd_10, withdrawn), has %',
      (select count(*) from intent.support_intents where member_id = '00000000-0000-4000-8000-fdfdfd002101');
  end if;
  if (select count(*) from analytics.events where name = 'support_intent_recorded' and creator_id = '00000000-0000-4000-8000-fdfdfd002102') <> 3 then
    raise exception 'FAIL: Support Intent events for A should be 3';
  end if;
  perform pg_temp.expect_error('update intent.support_intents set choice = ''usd_10''', 'append-only', 'rewriting Support Intent');
  perform pg_temp.expect_error('delete from intent.support_intents', 'append-only', 'deleting Support Intent');
  raise notice 'PASS: Support Intent history and events are complete and append-only';
end $$;

-- ---------------------------------------------------------------------------
-- 6. Audience insight (A's own view): aggregates only.
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-fdfdfd002102","role":"authenticated"}', true);
set local role authenticated;
do $$
declare a record;
begin
  select * into a from public.app_my_audience();
  if a.follower_count <> 2 or a.clique_count <> 1 or a.active_supporter_count <> 1
     or a.new_followers_7d <> 1 or a.support_intent_count <> 2
     or a.support_by_choice <> '{"not_sure": 1, "usd_10": 1}'::jsonb
     or a.follow_sources_28d <> '{"profile": 1, "comment": 1}'::jsonb or a.posts_28d <> 4 then
    raise exception 'FAIL: A''s audience: %', a;
  end if;
  raise notice 'PASS: the audience insight counts stages, growth, follow sources and Support Intent by option';
end $$;
commit;

-- ---------------------------------------------------------------------------
-- 7. Limits: 120 mute changes an hour.
insert into social.mute_events (member_id, creator_id, action)
select '00000000-0000-4000-8000-fdfdfd002105', '00000000-0000-4000-8000-fdfdfd002103', case when i % 2 = 0 then 'muted' else 'unmuted' end
from generate_series(1, 120) i;
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-fdfdfd002105","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  perform pg_temp.expect_error('select public.app_mute(pg_temp.r(''2102''))', 'rate_limited', 'a 121st mute change in an hour');
  raise notice 'PASS: mute changes are limited to 120 an hour';
end $$;
commit;

-- ---------------------------------------------------------------------------
-- 8. Deleting an account removes its mutes, mute history and Support Intent.
delete from auth.users where id = '00000000-0000-4000-8000-fdfdfd002105';
do $$
begin
  if exists (select 1 from social.mute_events where member_id = '00000000-0000-4000-8000-fdfdfd002105')
     or exists (select 1 from intent.support_intents where member_id = '00000000-0000-4000-8000-fdfdfd002105') then
    raise exception 'FAIL: account deletion left mute or Support Intent history';
  end if;
  raise notice 'PASS: deleting an account removes its mutes and Support Intent';
end $$;
