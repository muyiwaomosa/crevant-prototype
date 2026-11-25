-- TEST ONLY (throwaway databases). Content (20261202000000): post topics,
-- editing with history, saves, reposts, card details, Home with reposts and
-- complete coverage, Active Supporter from saves and reposts, events, limits.
--
--   M = ...3101 a member     A = ...3102 a creator M follows
--   R = ...3103 someone M follows who reposts     O = ...3104 a creator M does not follow
\set ON_ERROR_STOP on

set role supabase_auth_admin;
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-4000-8000-fdfdfd003101', 'cnt-m@example.test', now(), '{}'),
  ('00000000-0000-4000-8000-fdfdfd003102', 'cnt-a@example.test', now(), '{}'),
  ('00000000-0000-4000-8000-fdfdfd003103', 'cnt-r@example.test', now(), '{}'),
  ('00000000-0000-4000-8000-fdfdfd003104', 'cnt-o@example.test', now(), '{}');
reset role;
update public.profiles set username = 'cnt_m', display_name = 'Cnt M' where id = '00000000-0000-4000-8000-fdfdfd003101';
update public.profiles set username = 'cnt_a', display_name = 'Cnt A' where id = '00000000-0000-4000-8000-fdfdfd003102';
update public.profiles set username = 'cnt_r', display_name = 'Cnt R' where id = '00000000-0000-4000-8000-fdfdfd003103';
update public.profiles set username = 'cnt_o', display_name = 'Cnt O' where id = '00000000-0000-4000-8000-fdfdfd003104';
select ops.grant_member_access(u, 'fan', 'cnt-test') from unnest(array[
  '00000000-0000-4000-8000-fdfdfd003101', '00000000-0000-4000-8000-fdfdfd003102',
  '00000000-0000-4000-8000-fdfdfd003103', '00000000-0000-4000-8000-fdfdfd003104']::uuid[]) u;
insert into ops.age_attestations (user_id, wording_version, source)
select u, 'adult-v1', 'test' from unnest(array[
  '00000000-0000-4000-8000-fdfdfd003101', '00000000-0000-4000-8000-fdfdfd003102',
  '00000000-0000-4000-8000-fdfdfd003103', '00000000-0000-4000-8000-fdfdfd003104']::uuid[]) u
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
create function pg_temp.u(n text) returns uuid language sql immutable as $$ select ('00000000-0000-4000-8000-fdfdfd00' || n)::uuid $$;
grant execute on function pg_temp.u(text) to authenticated, anon;

-- Posts: A 3, R 1, O 2, M 1. Two O posts share a timestamp (paging).
insert into social.posts (id, author_id, body, created_at)
select pg_temp.u('32' || lpad(i::text, 2, '0')), a, 'Cnt post ' || i, now() - make_interval(mins => 100 - i)
from (values (1, pg_temp.u('3102')), (2, pg_temp.u('3102')), (3, pg_temp.u('3102')), (4, pg_temp.u('3103')),
             (5, pg_temp.u('3104')), (6, pg_temp.u('3104')), (7, pg_temp.u('3101'))) v(i, a);
update social.posts set created_at = (select created_at from social.posts where id = pg_temp.u('3205')) where id = pg_temp.u('3206');

-- ---------------------------------------------------------------------------
-- 1. Topic: once, from the approved list, only by the author.
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-fdfdfd003102","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  perform pg_temp.expect_error('select public.app_set_post_topic(pg_temp.u(''3201''), ''astrology'')', 'unknown_topic', 'an unknown topic');
  perform pg_temp.expect_error('select public.app_set_post_topic(pg_temp.u(''3204''), ''money'')', 'not_found', 'topic on someone else''s post');
  perform public.app_set_post_topic(pg_temp.u('3201'), 'money');
  perform pg_temp.expect_error('select public.app_set_post_topic(pg_temp.u(''3201''), ''food'')', 'not_found', 'setting a topic twice');
  if (select topic_label from public.app_post_meta(array[pg_temp.u('3201')])) <> 'Money & business'
     or (select edited_at from public.app_post_meta(array[pg_temp.u('3201')])) is not null then
    raise exception 'FAIL: the first topic should show, without marking the post edited';
  end if;
  raise notice 'PASS: a post gets its first topic once, from the approved list, by its author, without counting as an edit';
end $$;
commit;

-- ---------------------------------------------------------------------------
-- 2. Editing: own live posts only; history kept; nothing changed records nothing.
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-fdfdfd003102","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  perform pg_temp.expect_error('select public.app_edit_post(pg_temp.u(''3204''), ''mine now'', null)', 'not_found', 'editing someone else''s post');
  perform pg_temp.expect_error('select public.app_edit_post(pg_temp.u(''3201''), ''   '', null)', 'empty', 'editing to nothing');
  perform pg_temp.expect_error('select public.app_edit_post(pg_temp.u(''3201''), repeat(''x'', 2001), null)', 'too_long', 'editing past 2,000 characters');
  perform public.app_edit_post(pg_temp.u('3201'), 'Cnt post 1', 'money'); -- unchanged: nothing recorded
  perform public.app_edit_post(pg_temp.u('3201'), 'Cnt post 1, corrected', 'learning');
  if (select body from public.app_post(pg_temp.u('3201'))) <> 'Cnt post 1, corrected'
     or (select topic from public.app_post_meta(array[pg_temp.u('3201')])) <> 'learning'
     or (select edited_at from public.app_post_meta(array[pg_temp.u('3201')])) is null then
    raise exception 'FAIL: the edit should change text and topic and mark the post edited';
  end if;
  if (select count(*) from public.app_post_edits(pg_temp.u('3201'))) <> 1
     or (select previous_body || '|' || previous_topic from public.app_post_edits(pg_temp.u('3201'))) <> 'Cnt post 1|money' then
    raise exception 'FAIL: the earlier version should be kept once';
  end if;
  raise notice 'PASS: authors edit their own live posts; the earlier version is kept; an unchanged edit records nothing';
end $$;
commit;
-- Others can't read the history; hidden posts can't be edited; history is append-only.
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-fdfdfd003101","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  if exists (select 1 from public.app_post_edits(pg_temp.u('3201'))) then
    raise exception 'FAIL: another member read the edit history';
  end if;
  perform pg_temp.expect_error('select count(*) from social.post_edits', 'permission denied', 'reading edits directly');
end $$;
commit;
update social.posts set deleted_at = now(), hidden_at = now() where id = pg_temp.u('3203');
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-fdfdfd003102","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  perform pg_temp.expect_error('select public.app_edit_post(pg_temp.u(''3203''), ''edited while hidden'', null)', 'not_found', 'editing a hidden post');
end $$;
commit;
update social.posts set deleted_at = null, hidden_at = null where id = pg_temp.u('3203');
do $$
begin
  perform pg_temp.expect_error('update social.post_edits set previous_body = ''x''', 'append-only', 'rewriting edit history');
  perform pg_temp.expect_error('delete from social.post_edits', 'append-only', 'deleting edit history');
  if (select count(*) from analytics.events where name = 'post_edited' and post_id = pg_temp.u('3201')) <> 1 then
    raise exception 'FAIL: the edit should be one event';
  end if;
  raise notice 'PASS: only the author sees the history; hidden posts cannot be edited; history is append-only; the edit is one event';
end $$;

-- ---------------------------------------------------------------------------
-- 3. Saves: private, idempotent, paged; Reposts: not your own, idempotent.
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-fdfdfd003101","role":"authenticated"}', true);
set local role authenticated;
do $$
declare n int;
begin
  perform public.app_follow(pg_temp.u('3102'), 'profile');
  perform public.app_follow(pg_temp.u('3103'), 'profile');
  perform public.app_save(pg_temp.u('3201'));
  perform public.app_save(pg_temp.u('3201'));
  perform public.app_save(pg_temp.u('3205'));
  perform pg_temp.expect_error('select public.app_save(''00000000-0000-4000-8000-0000000fffff'')', 'not_found', 'saving nothing');
  select count(*) into n from public.app_saved_page(null, null, 1);
  if n <> 1 or (select count(*) from public.app_saved_page(null, null, 50)) <> 2 then
    raise exception 'FAIL: two saved posts, paged';
  end if;
  if (select array_agg(id order by saved_at desc, id desc) from public.app_saved_page(null, null, 50)) <> array[pg_temp.u('3205'), pg_temp.u('3201')] then
    raise exception 'FAIL: saved posts should be newest saved first';
  end if;
  if not (select saved_by_me from public.app_post_meta(array[pg_temp.u('3201')])) then
    raise exception 'FAIL: the card should say saved';
  end if;
  perform public.app_unsave(pg_temp.u('3205'));
  perform public.app_unsave(pg_temp.u('3205'));
  perform pg_temp.expect_error('select public.app_repost(pg_temp.u(''3207''))', 'cannot_repost_own', 'reposting your own post');
  raise notice 'PASS: saves are idempotent, private and paged; your own post cannot be reposted';
end $$;
commit;
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-fdfdfd003103","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  perform public.app_repost(pg_temp.u('3205')); -- O's post, which M does not follow
  perform public.app_repost(pg_temp.u('3205'));
  perform public.app_repost(pg_temp.u('3202')); -- A's post, which M already follows
  if (select repost_count from public.app_post_meta(array[pg_temp.u('3205')])) <> 1
     or not (select reposted_by_me from public.app_post_meta(array[pg_temp.u('3205')])) then
    raise exception 'FAIL: one repost, by R';
  end if;
  if exists (select 1 from public.app_saved_page(null, null, 50)) then
    raise exception 'FAIL: another member''s saves leaked';
  end if;
  raise notice 'PASS: reposts are idempotent and counted; saves stay private';
end $$;
commit;

-- ---------------------------------------------------------------------------
-- 4. Home with reposts: each post once, everything eligible reached.
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-fdfdfd003101","role":"authenticated"}', true);
set local role authenticated;
create temp table seen (id uuid, by_name text);
do $$
declare b_at timestamptz; b_id uuid; n int; pages int := 0; r record;
begin
  loop
    n := 0;
    for r in select * from public.app_feed_items_page(b_at, b_id, 2, 'all') loop
      insert into seen values (r.id, r.reposted_by_username);
      b_at := r.activity_at; b_id := r.id; n := n + 1;
    end loop;
    pages := pages + 1;
    exit when n < 2 or pages > 50;
  end loop;
  -- A 3 + R 1 + M 1 + O's reposted post 1 = 6; O's other post is not reachable (not followed, not reposted).
  if (select count(*) from seen) <> 6 or (select count(distinct id) from seen) <> 6 then
    raise exception 'FAIL: Home with reposts: % rows, % distinct, expected 6 each once', (select count(*) from seen), (select count(distinct id) from seen);
  end if;
  if (select by_name from seen where id = pg_temp.u('3205')) <> 'cnt_r' or (select by_name from seen where id = pg_temp.u('3202')) is not null
     or exists (select 1 from seen where id = pg_temp.u('3206')) then
    raise exception 'FAIL: the repost should show its distributor, a followed creator''s post should not show as a repost, and an unreposted post should not appear';
  end if;
  if exists (select 1 from public.app_feed_items_page(null, null, 50, 'clique') where reposted_by_id is not null) then
    raise exception 'FAIL: My Clique should not include reposts';
  end if;
  perform public.app_mute(pg_temp.u('3103'));
  if exists (select 1 from public.app_feed_items_page(null, null, 50, 'all') where reposted_by_id = pg_temp.u('3103') or author_id = pg_temp.u('3103')) then
    raise exception 'FAIL: a muted reposter should leave Home';
  end if;
  perform public.app_unmute(pg_temp.u('3103'));
  raise notice 'PASS: Home with reposts shows every eligible post once (6 of 6), credits the distributor, and honours mutes';
end $$;
commit;

-- ---------------------------------------------------------------------------
-- 5. Active Supporter from a save; events; limits; account deletion.
do $$
begin
  if not social.is_active_supporter('00000000-0000-4000-8000-fdfdfd003101', '00000000-0000-4000-8000-fdfdfd003102') then
    raise exception 'FAIL: saving a followed creator''s post should make an Active Supporter';
  end if;
  if (select string_agg(name, ',' order by id) from analytics.events where name in ('post_saved', 'post_unsaved') and actor_id = '00000000-0000-4000-8000-fdfdfd003101')
     <> 'post_saved,post_saved,post_unsaved' then
    raise exception 'FAIL: save events: %', (select string_agg(name, ',' order by id) from analytics.events where name in ('post_saved', 'post_unsaved') and actor_id = '00000000-0000-4000-8000-fdfdfd003101');
  end if;
  if (select count(*) from analytics.events where name = 'post_reposted' and actor_id = '00000000-0000-4000-8000-fdfdfd003103') <> 2 then
    raise exception 'FAIL: two repost events';
  end if;
  raise notice 'PASS: a save counts toward Active Supporter; saves and reposts are recorded once each';
end $$;
insert into social.content_actions (member_id, action)
select '00000000-0000-4000-8000-fdfdfd003104', 'repost' from generate_series(1, 60);
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-fdfdfd003104","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  perform pg_temp.expect_error('select public.app_repost(pg_temp.u(''3201''))', 'rate_limited', 'a 61st repost change in an hour');
  raise notice 'PASS: reposts are limited to 60 changes an hour';
end $$;
commit;
delete from auth.users where id in ('00000000-0000-4000-8000-fdfdfd003103', '00000000-0000-4000-8000-fdfdfd003104');
do $$
begin
  if exists (select 1 from social.reposts where reposter_id = '00000000-0000-4000-8000-fdfdfd003103')
     or exists (select 1 from social.content_actions where member_id = '00000000-0000-4000-8000-fdfdfd003104')
     or exists (select 1 from social.posts where author_id = '00000000-0000-4000-8000-fdfdfd003104') then
    raise exception 'FAIL: account deletion left reposts, actions or posts';
  end if;
  raise notice 'PASS: deleting an account removes its reposts, actions and posts';
end $$;
