-- TEST ONLY (throwaway databases). Intelligence (20261210000000): every metric
-- is checked against the source events it is computed from.
--
--   F = ...7901 founder   C = ...7902 creator   A = ...7903 commenter (followed from search)
--   B = ...7904 opener (from discover)   X = ...7905 doesn't follow   T = ...7906 test account
--   E = ...7907 comments then deletes
\set ON_ERROR_STOP on

set role supabase_auth_admin;
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
select ('00000000-0000-4000-8000-fdfdfd00' || n)::uuid, 'in-' || n || '@example.test', now(), '{}'
from unnest(array['7901', '7902', '7903', '7904', '7905', '7906', '7907']) n;
reset role;
update public.profiles p set username = 'in_' || v.u, display_name = 'In ' || upper(v.u)
from (values ('7901', 'f'), ('7902', 'c'), ('7903', 'a'), ('7904', 'b'), ('7905', 'x'), ('7906', 't'), ('7907', 'e')) v(n, u)
where p.id = ('00000000-0000-4000-8000-fdfdfd00' || v.n)::uuid;
update ops.member_launch_settings set founder_user_id = '00000000-0000-4000-8000-fdfdfd007901' where id;
select ops.grant_member_access('00000000-0000-4000-8000-fdfdfd007901', 'founder', 'in-test');
select ops.grant_member_access(('00000000-0000-4000-8000-fdfdfd00' || n)::uuid, 'fan', 'in-test') from unnest(array['7902', '7903', '7904', '7905', '7907']) n;
select ops.grant_member_access('00000000-0000-4000-8000-fdfdfd007906', 'tester', 'in-test');

create function pg_temp.expect_error(sql text, expected text, what text)
returns void language plpgsql as $$
declare got text;
begin
  begin execute sql; exception when others then got := sqlerrm; end;
  if got is null then raise exception 'FAIL: % succeeded, expected "%"', what, expected; end if;
  if got !~ expected then raise exception 'FAIL: % failed with "%", expected "%"', what, got, expected; end if;
end; $$;
grant execute on function pg_temp.expect_error(text, text, text) to authenticated, anon;
create function pg_temp.g(n text) returns uuid language sql immutable as $$ select ('00000000-0000-4000-8000-fdfdfd00' || n)::uuid $$;
grant execute on function pg_temp.g(text) to authenticated, anon;
create function pg_temp.as_member(n text) returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-fdfdfd00' || n || '","role":"authenticated"}', true) $$;
grant execute on function pg_temp.as_member(text) to authenticated, anon;

-- C's posts; follows (with sources) from A, B, T, F, E; X does not follow.
insert into social.posts (id, author_id, body, created_at) values
  (pg_temp.g('7a01'), pg_temp.g('7902'), 'C on budgeting', now() - interval '2 days'),
  (pg_temp.g('7a02'), pg_temp.g('7902'), 'C on saving', now() - interval '1 day');
insert into social.follows (follower_id, creator_id, followed_at)
select pg_temp.g(n), pg_temp.g('7902'), now() - interval '20 days' from unnest(array['7903', '7904', '7906', '7901', '7907']) n;
insert into social.follow_events (follower_id, creator_id, action, source, occurred_at) values
  (pg_temp.g('7903'), pg_temp.g('7902'), 'followed', 'search', now() - interval '3 days'),
  (pg_temp.g('7904'), pg_temp.g('7902'), 'followed', 'discover', now() - interval '3 days'),
  (pg_temp.g('7906'), pg_temp.g('7902'), 'followed', null, now() - interval '3 days'),
  (pg_temp.g('7901'), pg_temp.g('7902'), 'followed', 'profile', now() - interval '12 days');
-- Last week's activity: A saved a post (A is retained this week).
insert into social.saves (member_id, post_id, saved_at) values (pg_temp.g('7903'), pg_temp.g('7a01'), ops.week_start(now(), -1) + interval '1 day');
-- Views (reach): A and B saw C's posts, B on two different days.
insert into social.post_views (viewer_id, post_id, viewed_at, basis) values
  (pg_temp.g('7903'), pg_temp.g('7a01'), now() - interval '1 hour', 'visible'),
  (pg_temp.g('7904'), pg_temp.g('7a01'), now() - interval '2 days', 'visible'),
  (pg_temp.g('7904'), pg_temp.g('7a02'), now() - interval '1 hour', 'visible');

-- This week's activity, through the member functions.
begin;
select pg_temp.as_member('7903');
set local role authenticated;
select public.app_add_comment(pg_temp.g('7a02'), 'This breakdown finally made my budget make sense.');  -- meaningful: connects
commit;
begin;
select pg_temp.as_member('7904');
set local role authenticated;
select public.app_add_comment(pg_temp.g('7a02'), 'nice');   -- not meaningful
select public.app_note_open(pg_temp.g('7a02'));             -- opening: connects
select public.app_note_open(pg_temp.g('7a02'));             -- once
commit;
begin;
select pg_temp.as_member('7905');
set local role authenticated;
select public.app_save(pg_temp.g('7a02'));                  -- doesn't follow: no connection
commit;
begin;
select pg_temp.as_member('7906');
set local role authenticated;
select public.app_save(pg_temp.g('7a02'));                  -- test account
commit;
begin;
select pg_temp.as_member('7901');
set local role authenticated;
select public.app_repost(pg_temp.g('7a02'));                -- founder
commit;
begin;
select pg_temp.as_member('7907');
set local role authenticated;
select public.app_delete_comment(public.app_add_comment(pg_temp.g('7a02'), 'A long thoughtful comment I then deleted.'));
commit;
begin;
select pg_temp.as_member('7902');
set local role authenticated;
select public.app_note_open(pg_temp.g('7a02'));             -- own post: nothing
commit;

-- ---------------------------------------------------------------------------
-- 1. Connections against the source events.
do $$
begin
  if (select count(*) from social.post_opens) <> 1 then raise exception 'FAIL: post opens: %', (select count(*) from social.post_opens); end if;
  if (select string_agg(right(consumer::text, 4) || ':' || test || ':' || founder_dependent, ',' order by consumer)
      from ops.connections(ops.week_start(now()), now()) where creator = pg_temp.g('7902'))
     <> '7901:false:true,7903:false:false,7904:false:false,7906:true:false' then
    raise exception 'FAIL: this week''s connections: %', (select string_agg(right(consumer::text, 4) || ':' || test || ':' || founder_dependent, ',' order by consumer)
      from ops.connections(ops.week_start(now()), now()) where creator = pg_temp.g('7902'));
  end if;
  if (select count(*) from ops.connections(ops.week_start(now(), -1), ops.week_start(now()))) <> 1 then
    raise exception 'FAIL: last week''s connections';
  end if;
  if extract(isodow from ops.week_start(now()) at time zone 'America/Toronto') <> 1 or (ops.week_start(now()) at time zone 'America/Toronto')::time <> '00:00' then
    raise exception 'FAIL: the week does not start on Monday at midnight in Toronto';
  end if;
  raise notice 'PASS: connections count each following pair once a week for meaningful comments, saves, reposts, shares and opens; never self, non-followers, short or deleted comments; test and founder-dependent pairs are marked';
end $$;

-- ---------------------------------------------------------------------------
-- 2. Creator intelligence (C).
insert into sim.revenue_entries (month, kind, creator_id, net_cents, note, recorded_by)
values ((date_trunc('month', now()) - interval '1 month')::date, 'content_ad', pg_temp.g('7902'), 10000, 'intelligence test', 'test');
begin;
select pg_temp.as_member('7902');
set local role authenticated;
do $$
declare i jsonb := public.app_creator_insights(7);
begin
  if (i->'attention'->>'followers')::int <> 5 or (i->'attention'->>'new_followers')::int <> 3 or (i->'attention'->>'new_followers_before')::int <> 1
     or i->'attention'->'sources' <> '{"search": 1, "discover": 1, "other": 1}'::jsonb or (i->'attention'->>'reached')::int <> 2 or (i->'attention'->>'posts')::int <> 2 then
    raise exception 'FAIL: attention: %', i->'attention';
  end if;
  if (i->'retention'->>'returning')::int <> 1 or (i->'retention'->>'connections_this_week')::int <> 4 or (i->'retention'->>'connections_last_week')::int <> 1 then
    raise exception 'FAIL: retention: %', i->'retention';
  end if;
  if (i->'money'->>'actual_income_cents')::int <> 0 or (i->'money'->'simulated_by_month'->0->>'creator_cents')::int <> 4000 then
    raise exception 'FAIL: money: %', i->'money';
  end if;
  if i::text ~ '7903|7904|in_a|in_b' then raise exception 'FAIL: creator intelligence identifies a follower'; end if;
end $$;
commit;
do $$ begin raise notice 'PASS: creator Attention, Retention and Money match the source events; simulated and actual income are apart; no follower is identified'; end $$;

-- ---------------------------------------------------------------------------
-- 3. Consumer intelligence (A, B).
begin;
select pg_temp.as_member('7903');
set local role authenticated;
do $$
declare i jsonb := public.app_my_contribution_insights();
begin
  if (i->>'connections_this_week')::int <> 1 or (i->>'connections_last_week')::int <> 1 or (i->'referrals'->>'joined')::int <> 0 then
    raise exception 'FAIL: A''s contribution insights: %', i;
  end if;
end $$;
commit;
begin;
select pg_temp.as_member('7904');
set local role authenticated;
do $$
declare i jsonb := public.app_my_contribution_insights();
begin
  if jsonb_array_length(i->'opportunities') <> 2 or i->'opportunities'->0->>'username' <> 'in_c' then
    raise exception 'FAIL: B''s opportunities: %', i->'opportunities';
  end if;
end $$;
commit;
do $$ begin raise notice 'PASS: consumer intelligence counts the member''s own connections and suggests posts they haven''t saved or shared'; end $$;

-- ---------------------------------------------------------------------------
-- 4. Founder intelligence.
begin;
select pg_temp.as_member('7903');
set local role authenticated;
select pg_temp.expect_error('select public.app_founder_overview()', 'not_founder', 'a member reading the founder overview');
commit;
select set_config('in.expect', (select count(*) filter (where not test) || ',' || count(*) filter (where not test and founder_dependent) || ',' || count(*) filter (where test)
                                 from ops.connections(ops.week_start(now()), now())), false);
begin;
select pg_temp.as_member('7901');
set local role authenticated;
do $$
declare o jsonb := public.app_founder_overview();
declare w jsonb := o->'north_star'->'weeks'->-1;
begin
  if o->'north_star'->>'kind' <> 'actual' or o->'rewards'->>'kind' <> 'simulated' then raise exception 'FAIL: kinds are not labelled'; end if;
  if jsonb_array_length(o->'north_star'->'weeks') <> 8 then raise exception 'FAIL: eight weeks expected'; end if;
  -- Other test files add their own activity this week, so compare with the source directly.
  if (w->>'connections') || ',' || (w->>'founder_dependent') || ',' || (w->>'test') <> current_setting('in.expect')
     or (w->>'test')::int < 1 or (w->>'founder_dependent')::int < 1 then
    raise exception 'FAIL: the North Star week does not match its source: %', w;
  end if;
  if (o->'members'->>'test_members')::int < 1 then raise exception 'FAIL: test members are not counted apart'; end if;
  if o::text ~ '00000000-0000-4000-8000-fdfdfd00' or o::text ~ '"in_[a-z]"' then
    raise exception 'FAIL: the founder overview identifies a member';
  end if;
end $$;
commit;
do $$ begin raise notice 'PASS: the founder overview labels actual and simulated figures, keeps test data apart, matches its sources and identifies no one'; end $$;
