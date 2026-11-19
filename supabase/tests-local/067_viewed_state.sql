-- TEST ONLY (throwaway databases). Viewed state (20261121000000_viewed_state):
-- recording views, the Unseen-first strip and catch-up. Simultaneous requests:
-- scripts/db/viewed-state-concurrency-test.sh. Query plans at scale:
-- scripts/db/viewed-state-plan-test.sh.
--
-- Members: F = ...901 (the fan), creators A..E = ...902..906, G = ...907 (a
-- second fan), H = ...908 (a creator with many posts, for the hourly cap),
-- ...909 (a creator nobody follows at first).
-- Times are fixed around T0 = 2026-11-01 12:00 UTC so the follow-date rule,
-- ordering and ties are exact.

set role supabase_auth_admin;
insert into auth.users (id, email, email_confirmed_at)
select ('00000000-0000-4000-8000-000000000' || n::text)::uuid, 'views' || n || '@example.test', now()
from generate_series(901, 909) as n;
reset role;
-- Pilot membership (20261122000000): these test members are granted access.
select ops.grant_member_access(u.id, 'tester', 'test') from auth.users u where u.email like 'views%@example.test';
update public.profiles p set username = 'views_' || right(p.id::text, 3), display_name = 'Views ' || right(p.id::text, 3)
where p.id::text between '00000000-0000-4000-8000-000000000901' and '00000000-0000-4000-8000-000000000909';

create function pg_temp.v(n int) returns uuid language sql immutable as $$ select ('00000000-0000-4000-8000-000000000' || n::text)::uuid $$;
grant execute on function pg_temp.v(int) to authenticated, anon;
create function pg_temp.t(minutes int) returns timestamptz language sql immutable as $$ select timestamptz '2026-11-01 12:00:00+00' + make_interval(mins => minutes) $$;
grant execute on function pg_temp.t(int) to authenticated;

create function pg_temp.expect_error_vs(sql text, expected text, what text)
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
  if got is null or pg_catalog.strpos(got, expected) = 0 then
    raise exception 'FAIL: % failed with "%", expected "%"', what, got, expected;
  end if;
end;
$$;
grant execute on function pg_temp.expect_error_vs(text, text, text) to authenticated, anon;

-- The strip, as one comparable string: creator:count:clique, in order.
create function pg_temp.strip() returns text language sql as $$
  select coalesce(string_agg(right(id::text, 3) || ':' || unseen_count || ':' || in_my_clique, ',' order by ord), '')
  from (select *, row_number() over () as ord from public.app_unseen_creators()) s
$$;
grant execute on function pg_temp.strip() to authenticated;

-- Follows at T0 (direct, so followed_at is exact): F follows A, B, C, D; B and D are in F's Clique.
insert into social.follows (follower_id, creator_id, followed_at)
select pg_temp.v(901), pg_temp.v(n), pg_temp.t(0) from generate_series(902, 905) as n;
insert into social.clique_members (fan_id, creator_id) values (pg_temp.v(901), pg_temp.v(903)), (pg_temp.v(901), pg_temp.v(905));
-- G follows A from T0 too.
insert into social.follows (follower_id, creator_id, followed_at) values (pg_temp.v(907), pg_temp.v(902), pg_temp.t(0));

-- Posts. A: 2 before the follow, 12 after. B: 3 after, plus 1 deleted. C: only before.
-- D: 1 after. E (not followed): 2 after. F: 1 of their own.
insert into social.posts (author_id, body, created_at) values
  (pg_temp.v(902), 'A before 1', pg_temp.t(-120)), (pg_temp.v(902), 'A before 2', pg_temp.t(-60)),
  (pg_temp.v(904), 'C before', pg_temp.t(-30)),
  (pg_temp.v(905), 'D after', pg_temp.t(5)),
  (pg_temp.v(906), 'E after 1', pg_temp.t(7)), (pg_temp.v(906), 'E after 2', pg_temp.t(8)),
  (pg_temp.v(901), 'F own post', pg_temp.t(9));
insert into social.posts (author_id, body, created_at)
select pg_temp.v(902), 'A after ' || i, pg_temp.t(i) from generate_series(1, 12) as i;
insert into social.posts (author_id, body, created_at)
select pg_temp.v(903), 'B after ' || i, pg_temp.t(19 + i) from generate_series(1, 3) as i;
insert into social.posts (author_id, body, created_at, deleted_at) values (pg_temp.v(903), 'B deleted', pg_temp.t(23), pg_temp.t(24));

-- ---------------------------------------------------------------------------
-- 1. Anonymous visitors can't use any of it.
begin;
set local role anon;
do $$
begin
  perform pg_temp.expect_error_vs('select public.app_mark_viewed(array[pg_temp.v(902)])', 'permission denied', 'anon marking a view');
  perform pg_temp.expect_error_vs('select * from public.app_unseen_creators()', 'permission denied', 'anon reading the strip');
  perform pg_temp.expect_error_vs('select * from public.app_catch_up(pg_temp.v(902))', 'permission denied', 'anon catching up');
  perform pg_temp.expect_error_vs('select * from social.post_views', 'permission denied', 'anon reading views');
  raise notice 'PASS: anonymous visitors cannot record views, read the strip or catch up';
end $$;
commit;

-- ---------------------------------------------------------------------------
-- 2. The strip: followed creators with unseen posts only; My Clique first, then
--    the rest; newest unseen first within each; counts capped at 10 (9+).
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000901","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  got text := pg_temp.strip();
  latest timestamptz;
begin
  -- B (Clique, latest +22m, 3 unseen: the deleted one excluded), D (Clique, +5m, 1),
  -- then A (not in Clique, 12 unseen shown as 10). C (only older posts) and E (not followed) are absent.
  if got <> '903:3:true,905:1:true,902:10:false' then
    raise exception 'FAIL: the strip is %', got;
  end if;
  select latest_unseen_at into latest from public.app_unseen_creators() where id = pg_temp.v(902);
  if latest <> pg_temp.t(12) then
    raise exception 'FAIL: A''s latest unseen post should be +12m, is %', latest;
  end if;
  raise notice 'PASS: the strip lists only followed creators with unseen posts, My Clique first, newest first, capped at 10';
  raise notice 'PASS: posts from before the follow and deleted posts are not unseen';
end $$;
commit;

-- ---------------------------------------------------------------------------
-- 3. Recording views: once per post, own/deleted/missing ignored, validated.
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000901","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  a10 uuid; a11 uuid; a12 uuid; own uuid; gone uuid; n int;
begin
  select s.id into a10 from public.app_catch_up(pg_temp.v(902)) s where s.body = 'A after 10';
  select s.id into a11 from public.app_catch_up(pg_temp.v(902)) s where s.body = 'A after 11';
  select s.id into a12 from public.app_catch_up(pg_temp.v(902)) s where s.body = 'A after 12';
  select s.id into own from public.app_member_posts(pg_temp.v(901)) s;
  -- Three new posts, repeated, plus own, a missing id and a null.
  n := public.app_mark_viewed(array[a10, a11, a12, a12, own, gen_random_uuid(), null]);
  if n <> 3 then
    raise exception 'FAIL: marking three new posts recorded %', n;
  end if;
  n := public.app_mark_viewed(array[a10, a11, a12], 'played');
  if n <> 0 then
    raise exception 'FAIL: marking the same posts again recorded %', n;
  end if;
  if public.app_mark_viewed(array[]::uuid[]) <> 0 or public.app_mark_viewed(null) <> 0 then
    raise exception 'FAIL: an empty batch should record nothing';
  end if;
  perform pg_temp.expect_error_vs('select public.app_mark_viewed(array[gen_random_uuid()], ''liked'')', 'invalid_request', 'an unknown basis');
  perform pg_temp.expect_error_vs('select public.app_mark_viewed(array[gen_random_uuid()], null)', 'invalid_request', 'a null basis');
  perform pg_temp.expect_error_vs('select public.app_mark_viewed(array(select gen_random_uuid() from generate_series(1, 51)))', 'too_many', '51 ids in one batch');
  -- The limit counts the request as sent: repeats and nulls don't get around it.
  perform pg_temp.expect_error_vs(format('select public.app_mark_viewed(array_fill(%L::uuid, array[51]))', a10), 'too_many', '51 copies of one id');
  perform pg_temp.expect_error_vs(format('select public.app_mark_viewed(array_fill(%L::uuid, array[30]) || array_fill(null::uuid, array[21]))', a11), 'too_many', '30 repeats and 21 nulls');
  perform pg_temp.expect_error_vs(format('select public.app_mark_viewed(array_fill(%L::uuid, array[1000]))', a12), 'too_many', '1,000 copies of one id');
  -- Exactly 50 entries, all repeats of already-viewed posts, is within the limit and records nothing.
  if public.app_mark_viewed(array_fill(a10, array[50])) <> 0 then
    raise exception 'FAIL: 50 repeats of a viewed post should be accepted and record nothing';
  end if;
  -- 50 distinct ids is allowed (all missing here, so nothing recorded).
  if public.app_mark_viewed(array(select gen_random_uuid() from generate_series(1, 50))) <> 0 then
    raise exception 'FAIL: a batch of 50 missing ids should record nothing';
  end if;
  -- A: 12 unseen after the follow, 3 viewed: 9 left, latest now +9m.
  if pg_temp.strip() <> '903:3:true,905:1:true,902:9:false' then
    raise exception 'FAIL: after viewing three of A''s posts the strip is %', pg_temp.strip();
  end if;
  raise notice 'PASS: each post is recorded once per member; repeats, own, missing and null ids are ignored';
  raise notice 'PASS: a batch is limited to 50 ids as sent (repeats and nulls count), and the basis must be visible or played';
end $$;
commit;

do $$
begin
  if exists (select 1 from social.post_views where viewer_id = '00000000-0000-4000-8000-000000000901' and basis <> 'visible') then
    raise exception 'FAIL: a repeat report changed the first view''s basis';
  end if;
  if exists (select 1 from social.post_views v join social.posts s on s.id = v.post_id where v.viewer_id = s.author_id) then
    raise exception 'FAIL: a member''s own post was recorded as viewed';
  end if;
  raise notice 'PASS: the first view is kept as recorded; own posts are never recorded';
end $$;

-- 4. Deleted posts leave the counts; the strip follows.
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000903","role":"authenticated"}', true);
set local role authenticated;
select public.app_delete_post((select id from public.app_member_posts('00000000-0000-4000-8000-000000000903') where body = 'B after 3'));
commit;
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000901","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  -- B's latest unseen is now +21m, still newer than D's +5m.
  if pg_temp.strip() <> '903:2:true,905:1:true,902:9:false' then
    raise exception 'FAIL: after B deleted a post the strip is %', pg_temp.strip();
  end if;
  raise notice 'PASS: deleting a post removes it from unseen counts';
end $$;
commit;

-- ---------------------------------------------------------------------------
-- 5. Catch-up: newest 20 unseen per batch, shown oldest first, stable paging on
--    (created_at, id) even when timestamps are identical; read-only.
-- D gets 25 more posts, all at exactly the same time (+30m), so a batch
-- boundary falls inside a run of identical timestamps.
insert into social.posts (author_id, body, created_at)
select pg_temp.v(905), 'D tie ' || lpad(i::text, 2, '0'), pg_temp.t(30) from generate_series(1, 25) as i;

begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000901","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  b1 uuid[]; b2 uuid[]; b3 uuid[]; all_unseen uuid[];
  first_at timestamptz; first_id uuid;
  ok boolean;
begin
  -- Every unseen D post, newest first, the way the server defines it.
  select array_agg(id order by created_at desc, id desc) into all_unseen
  from public.app_catch_up(pg_temp.v(905));
  -- (The first batch alone; built below from all three batches.)
  select array_agg(id order by ord) into b1 from (select id, row_number() over () as ord from public.app_catch_up(pg_temp.v(905))) x;
  if cardinality(b1) <> 20 then
    raise exception 'FAIL: the first catch-up batch has % posts, expected 20', cardinality(b1);
  end if;
  -- Shown oldest first: created_at and id never go down.
  select bool_and(ok_row) into ok from (
    select (created_at, id) >= lag((created_at, id)) over (order by ord) is not false as ok_row
    from (select *, row_number() over () as ord from public.app_catch_up(pg_temp.v(905))) x) y;
  if not ok then
    raise exception 'FAIL: a catch-up batch is not oldest first';
  end if;
  -- Next batch from the oldest post shown.
  select created_at, id into first_at, first_id from public.app_catch_up(pg_temp.v(905)) limit 1;
  select array_agg(id order by ord) into b2 from (select id, row_number() over () as ord from public.app_catch_up(pg_temp.v(905), first_at, first_id)) x;
  if cardinality(b2) <> 6 then
    raise exception 'FAIL: the second catch-up batch has % posts, expected 6 (5 ties and D after)', cardinality(b2);
  end if;
  if b1 && b2 then
    raise exception 'FAIL: two catch-up batches repeat a post';
  end if;
  select created_at, id into first_at, first_id from public.app_catch_up(pg_temp.v(905), first_at, first_id) limit 1;
  select coalesce(array_agg(id), '{}') into b3 from public.app_catch_up(pg_temp.v(905), first_at, first_id);
  if cardinality(b3) <> 0 then
    raise exception 'FAIL: a third batch should be empty, has %', cardinality(b3);
  end if;
  -- Together: exactly the 26 unseen posts, none skipped.
  if (select count(distinct x) from unnest(b1 || b2) as x) <> 26 then
    raise exception 'FAIL: the batches together do not cover all 26 unseen posts';
  end if;
  -- The first batch is the newest 20.
  if (select count(*) from unnest(b1) as x where x = any (all_unseen[1:20])) <> 20 then
    raise exception 'FAIL: the first batch is not the newest 20 unseen posts';
  end if;
  -- Catch-up never marks anything viewed.
  if pg_temp.strip() <> '905:10:true,903:2:true,902:9:false' then
    raise exception 'FAIL: catching up changed the strip (or D did not move first): %', pg_temp.strip();
  end if;
  -- Bad cursors and creators you don't follow.
  perform pg_temp.expect_error_vs(format('select * from public.app_catch_up(%L, %L)', pg_temp.v(905), pg_temp.t(30)), 'invalid_request', 'a cursor time without an id');
  perform pg_temp.expect_error_vs(format('select * from public.app_catch_up(%L, null, %L)', pg_temp.v(905), gen_random_uuid()), 'invalid_request', 'a cursor id without a time');
  if exists (select 1 from public.app_catch_up(pg_temp.v(906))) or exists (select 1 from public.app_catch_up(pg_temp.v(904))) then
    raise exception 'FAIL: catch-up returned posts for a creator not followed, or posts from before the follow';
  end if;
  raise notice 'PASS: catch-up returns the newest 20 unseen posts oldest first, and the next batch continues without skipping or repeating, even with identical timestamps';
  raise notice 'PASS: catch-up never marks posts viewed, and returns nothing for creators you do not follow';
end $$;
commit;

-- Viewing a catch-up batch updates the strip: mark D's first batch.
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000901","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  if public.app_mark_viewed(array(select id from public.app_catch_up(pg_temp.v(905)))) <> 20 then
    raise exception 'FAIL: marking a catch-up batch should record 20';
  end if;
  -- D still has 5 unseen posts at +30m, newer than B's +21m, so D stays first.
  if pg_temp.strip() <> '905:6:true,903:2:true,902:9:false' then
    raise exception 'FAIL: after viewing D''s first batch the strip is %', pg_temp.strip();
  end if;
  raise notice 'PASS: viewing posts (from catch-up or Home) is shared: the strip counts drop';
end $$;
commit;

-- ---------------------------------------------------------------------------
-- 6. Views are recorded for creators you don't follow, and kept across unfollow
--    and refollow; refollowing resets the unseen baseline to the new follow.
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000901","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  e1 uuid := (select id from public.app_member_posts('00000000-0000-4000-8000-000000000906') where body = 'E after 1');
begin
  if public.app_mark_viewed(array[e1]) <> 1 then
    raise exception 'FAIL: a view of a creator you do not follow was not recorded';
  end if;
  perform public.app_unfollow(pg_temp.v(902));
  perform public.app_follow(pg_temp.v(902));
  -- Refollowed now (2026-11-18 or later), after all of A's posts: nothing unseen.
  if pg_temp.strip() <> '905:6:true,903:2:true' then
    raise exception 'FAIL: after refollowing A the strip is %', pg_temp.strip();
  end if;
  raise notice 'PASS: views of creators you do not follow are recorded';
  raise notice 'PASS: refollowing resets the unseen baseline to the new follow date';
end $$;
commit;

do $$
begin
  if (select count(*) from social.post_views v join social.posts s on s.id = v.post_id
      where v.viewer_id = '00000000-0000-4000-8000-000000000901' and s.author_id = '00000000-0000-4000-8000-000000000902') <> 3 then
    raise exception 'FAIL: unfollowing and refollowing changed earlier views of A''s posts';
  end if;
  raise notice 'PASS: earlier views are kept across unfollow and refollow';
end $$;

-- ---------------------------------------------------------------------------
-- 7. Each member's views are their own.
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000907","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  -- G follows A since T0 and has viewed nothing: all 12 of A's later posts unseen (10 shown).
  if pg_temp.strip() <> '902:10:false' then
    raise exception 'FAIL: another member''s views affected G''s strip: %', pg_temp.strip();
  end if;
  perform pg_temp.expect_error_vs('select * from social.post_views', 'permission denied', 'a member reading the views table');
  raise notice 'PASS: each member sees only their own unseen state, and cannot read the views table';
end $$;
commit;

-- ---------------------------------------------------------------------------
-- 8. The hourly cap: a batch that would go past 3,000 new views is refused and
--    writes nothing; exactly 3,000 is allowed; older views don't count.
insert into social.posts (author_id, body, created_at)
select pg_temp.v(908), 'H ' || i, pg_temp.t(i) from generate_series(1, 3010) as i;
-- G has 2,998 views in the last hour (inserted directly: the permanence trigger only guards updates and deletes).
insert into social.post_views (viewer_id, post_id, basis)
select pg_temp.v(907), s.id, 'visible' from social.posts s where s.author_id = pg_temp.v(908) and s.created_at <= pg_temp.t(2998);

begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000907","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  three uuid[] := array(select id from public.app_member_posts('00000000-0000-4000-8000-000000000908', null, 50) order by created_at desc limit 3);
  before int;
begin
  perform pg_temp.expect_error_vs(format('select public.app_mark_viewed(%L::uuid[])', three), 'rate_limited', 'a batch going past 3,000 views an hour');
  -- Two fit exactly (2,998 + 2 = 3,000), then one more does not.
  if public.app_mark_viewed(three[1:2]) <> 2 then
    raise exception 'FAIL: two views reaching exactly 3,000 should be allowed';
  end if;
  perform pg_temp.expect_error_vs(format('select public.app_mark_viewed(%L::uuid[])', three[3:3]), 'rate_limited', 'a 3,001st view in an hour');
  -- Requests that add nothing are never refused.
  if public.app_mark_viewed(three[1:2]) <> 0 then
    raise exception 'FAIL: repeating already-recorded views should record nothing and not be refused';
  end if;
  raise notice 'PASS: the hourly cap allows exactly 3,000 new views and refuses a batch that would go past it';
end $$;
commit;

do $$
begin
  if (select count(*) from social.post_views where viewer_id = '00000000-0000-4000-8000-000000000907') <> 3000 then
    raise exception 'FAIL: a refused batch wrote something (G has % views)', (select count(*) from social.post_views where viewer_id = '00000000-0000-4000-8000-000000000907');
  end if;
  raise notice 'PASS: refused batches write nothing';
end $$;

-- Views older than an hour no longer count (moved back inside a rolled-back transaction).
begin;
alter table social.post_views disable trigger post_views_permanent;
update social.post_views set viewed_at = viewed_at - interval '2 hours' where viewer_id = '00000000-0000-4000-8000-000000000907';
alter table social.post_views enable trigger post_views_permanent;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000907","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  -- The third-newest H post: refused above, so not yet viewed.
  if public.app_mark_viewed(array(select id from public.app_member_posts('00000000-0000-4000-8000-000000000908', null, 50) order by created_at desc offset 2 limit 1)) <> 1 then
    raise exception 'FAIL: views older than an hour still counted against the cap';
  end if;
  raise notice 'PASS: views older than an hour no longer count against the cap';
end $$;
rollback;

-- ---------------------------------------------------------------------------
-- 9. Views are permanent, removed only with the account or the post.
do $$
declare
  got text;
begin
  begin
    update social.post_views set basis = 'played' where viewer_id = '00000000-0000-4000-8000-000000000901';
  exception when others then got := sqlerrm; end;
  if got is null or pg_catalog.strpos(got, 'never rewritten') = 0 then
    raise exception 'FAIL: a view could be rewritten (%)', got;
  end if;
  got := null;
  begin
    delete from social.post_views where viewer_id = '00000000-0000-4000-8000-000000000901';
  exception when others then got := sqlerrm; end;
  if got is null or pg_catalog.strpos(got, 'never rewritten or deleted') = 0 then
    raise exception 'FAIL: a view could be deleted directly (%)', got;
  end if;
  raise notice 'PASS: views can never be rewritten or deleted directly';
end $$;

delete from auth.users where id = '00000000-0000-4000-8000-000000000907';
do $$
begin
  if exists (select 1 from social.post_views where viewer_id = '00000000-0000-4000-8000-000000000907') then
    raise exception 'FAIL: deleting an account left its views behind';
  end if;
  raise notice 'PASS: deleting an account removes its views';
end $$;

-- 10. Not a reward signal: no points or money anywhere near it.
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'social' and table_name = 'post_views'
             and column_name ~* '(point|^cp_|_cp$|amount|cash|money|reward|balance|payout|eligib)') then
    raise exception 'FAIL: viewed state carries points, money or reward data';
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where p.prosrc ~ 'post_views' and n.nspname not in ('public', 'social')) then
    raise exception 'FAIL: something outside the social core reads viewed state';
  end if;
  raise notice 'PASS: viewed state carries no points, money or reward data, and nothing outside the social core reads it';
end $$;
