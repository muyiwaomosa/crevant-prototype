-- TEST ONLY (throwaway databases). Discovery (20261203000000): value and
-- intent based content discovery with reasons and fairness, post search,
-- sharing, and Home left untouched.
--
--   V = ...4101 a viewer interested in money
--   A = ...4102 a creator (money posts)     B = ...4103 a creator (food posts)
--   Q = ...4104 a creator the viewer mutes  F = ...4105 a creator the viewer follows
\set ON_ERROR_STOP on

set role supabase_auth_admin;
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-4000-8000-fdfdfd004101', 'dsc-v@example.test', now(), '{}'),
  ('00000000-0000-4000-8000-fdfdfd004102', 'dsc-a@example.test', now(), '{}'),
  ('00000000-0000-4000-8000-fdfdfd004103', 'dsc-b@example.test', now(), '{}'),
  ('00000000-0000-4000-8000-fdfdfd004104', 'dsc-q@example.test', now(), '{}'),
  ('00000000-0000-4000-8000-fdfdfd004105', 'dsc-f@example.test', now(), '{}');
reset role;
update public.profiles p set username = 'dsc_' || v.u, display_name = 'Dsc ' || upper(v.u)
from (values ('4101', 'v'), ('4102', 'a'), ('4103', 'b'), ('4104', 'q'), ('4105', 'f')) v(n, u)
where p.id = ('00000000-0000-4000-8000-fdfdfd00' || v.n)::uuid;
select ops.grant_member_access(('00000000-0000-4000-8000-fdfdfd00' || n)::uuid, 'fan', 'dsc-test') from unnest(array['4101', '4102', '4103', '4104', '4105']) n;
insert into ops.age_attestations (user_id, wording_version, source)
select ('00000000-0000-4000-8000-fdfdfd00' || n)::uuid, 'adult-v1', 'test' from unnest(array['4101', '4102', '4103', '4104', '4105']) n
on conflict do nothing;
insert into social.member_topics (user_id, topic) values ('00000000-0000-4000-8000-fdfdfd004101', 'money');

create function pg_temp.expect_error(sql text, expected text, what text)
returns void language plpgsql as $$
declare got text;
begin
  begin execute sql; exception when others then got := sqlerrm; end;
  if got is null then raise exception 'FAIL: % succeeded, expected "%"', what, expected; end if;
  if got !~ expected then raise exception 'FAIL: % failed with "%", expected "%"', what, got, expected; end if;
end; $$;
grant execute on function pg_temp.expect_error(text, text, text) to authenticated, anon;
create function pg_temp.d(n text) returns uuid language sql immutable as $$ select ('00000000-0000-4000-8000-fdfdfd00' || n)::uuid $$;
grant execute on function pg_temp.d(text) to authenticated, anon;

-- A: 4 money posts (only 2 may show); B: 1 food post; Q: 1 money post (muted);
-- F: 1 money post (followed); A: 1 uncategorized; A: 1 money post 40 days old; V: own money post.
insert into social.posts (id, author_id, body, topic, created_at) values
  (pg_temp.d('4201'), pg_temp.d('4102'), 'Budget basics for payday',  'money', now() - interval '1 hour'),
  (pg_temp.d('4202'), pg_temp.d('4102'), 'Saving on groceries',        'money', now() - interval '2 hours'),
  (pg_temp.d('4203'), pg_temp.d('4102'), 'Emergency fund in a month',  'money', now() - interval '3 hours'),
  (pg_temp.d('4204'), pg_temp.d('4102'), 'Rent versus buy',            'money', now() - interval '4 hours'),
  (pg_temp.d('4205'), pg_temp.d('4103'), 'Jollof for a crowd',         'food',  now() - interval '1 hour'),
  (pg_temp.d('4206'), pg_temp.d('4104'), 'Muted money talk',           'money', now() - interval '1 hour'),
  (pg_temp.d('4207'), pg_temp.d('4105'), 'Followed money talk',        'money', now() - interval '1 hour'),
  (pg_temp.d('4208'), pg_temp.d('4102'), 'Uncategorized thoughts on budgets', null, now() - interval '1 hour'),
  (pg_temp.d('4209'), pg_temp.d('4102'), 'An old budget post',         'money', now() - interval '40 days'),
  (pg_temp.d('4210'), pg_temp.d('4101'), 'My own budget post',         'money', now() - interval '1 hour');

begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-fdfdfd004101","role":"authenticated"}', true);
set local role authenticated;
select public.app_follow('00000000-0000-4000-8000-fdfdfd004105', 'profile');
commit;

-- Q is muted by V (set directly: muting through the app needs a follow, which would hide Q from discovery anyway).
insert into social.mutes (member_id, creator_id) values (pg_temp.d('4101'), pg_temp.d('4104'));

-- ---------------------------------------------------------------------------
-- 1. For you: interests, not followed, not muted, categorized, recent, two per creator, with reasons.
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-fdfdfd004101","role":"authenticated"}', true);
set local role authenticated;
do $$
declare ids uuid[];
begin
  select array_agg(id order by created_at desc, id desc) into ids from public.app_discover_content(null, 30);
  if ids <> array[pg_temp.d('4201'), pg_temp.d('4202')] then
    raise exception 'FAIL: For you should be A''s two newest money posts, got %', ids;
  end if;
  if exists (select 1 from public.app_discover_content(null, 30) where reason <> 'Because you''re interested in Money & business') then
    raise exception 'FAIL: every suggestion should give its reason';
  end if;
  -- A chosen focus for this visit.
  if (select array_agg(id) from public.app_discover_content('food', 30)) <> array[pg_temp.d('4205')]
     or (select reason from public.app_discover_content('food', 30)) <> 'In Food & cooking, the topic you chose' then
    raise exception 'FAIL: a chosen topic should show that topic with its reason';
  end if;
  perform pg_temp.expect_error('select * from public.app_discover_content(''astrology'', 30)', 'unknown_topic', 'an unknown topic');
  raise notice 'PASS: For you shows recent categorized posts in the member''s interests from people they don''t follow, two per creator, never own, muted, followed, old or uncategorized, each with a reason; a chosen focus works';
end $$;
commit;

-- No interests: everything eligible, with an invitation to choose interests.
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-fdfdfd004103","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  if not exists (select 1 from public.app_discover_content(null, 30) where reason like 'New in % Choose interests to tailor this')
     or exists (select 1 from public.app_discover_content(null, 30) where author_id = pg_temp.d('4103')) then
    raise exception 'FAIL: without interests, discovery should show categorized posts from others and say how to tailor it';
  end if;
  raise notice 'PASS: without interests, discovery still shows posts and invites the member to choose interests';
end $$;
commit;

-- ---------------------------------------------------------------------------
-- 2. Search: words or topic name; muted excluded; short queries refused.
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-fdfdfd004101","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  if not exists (select 1 from public.app_search_posts('groceries', 30) where id = pg_temp.d('4202')) then
    raise exception 'FAIL: searching a word should find the post';
  end if;
  if not exists (select 1 from public.app_search_posts('Food', 30) where id = pg_temp.d('4205')) then
    raise exception 'FAIL: searching a topic name should find its posts';
  end if;
  if exists (select 1 from public.app_search_posts('Muted', 30) where id = pg_temp.d('4206')) then
    raise exception 'FAIL: search should leave out muted creators';
  end if;
  perform pg_temp.expect_error('select * from public.app_search_posts(''a'', 30)', 'invalid_query', 'a one-letter search');
  raise notice 'PASS: post search finds words and topic names, leaves out muted creators, and refuses tiny queries';
end $$;
commit;

-- ---------------------------------------------------------------------------
-- 3. Sharing: once per post and channel an hour; one event each.
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-fdfdfd004101","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  perform public.app_record_share(pg_temp.d('4201'), 'copy_link');
  perform public.app_record_share(pg_temp.d('4201'), 'copy_link');
  perform public.app_record_share(pg_temp.d('4201'), 'share_sheet');
  perform pg_temp.expect_error('select public.app_record_share(pg_temp.d(''4201''), ''email'')', 'invalid_request', 'an unknown channel');
  perform pg_temp.expect_error('select public.app_record_share(''00000000-0000-4000-8000-0000000fffff'', ''copy_link'')', 'not_found', 'sharing nothing');
  perform pg_temp.expect_error('select count(*) from social.shares', 'permission denied', 'reading shares directly');
end $$;
commit;
do $$
begin
  if (select count(*) from social.shares where member_id = '00000000-0000-4000-8000-fdfdfd004101') <> 2
     or (select count(*) from analytics.events where name = 'post_shared' and actor_id = '00000000-0000-4000-8000-fdfdfd004101') <> 2 then
    raise exception 'FAIL: two shares (one per channel), two events';
  end if;
  perform pg_temp.expect_error('update social.shares set channel = ''copy_link''', 'append-only', 'rewriting shares');
  raise notice 'PASS: a share counts once per post and channel an hour, is one event, and is append-only';
end $$;

-- ---------------------------------------------------------------------------
-- 4. Discovery never changes Home.
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-fdfdfd004101","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  if exists (select 1 from public.app_feed_items_page(null, null, 50, 'all') where author_id in (pg_temp.d('4102'), pg_temp.d('4103'))) then
    raise exception 'FAIL: discovered creators appeared on Home without a follow';
  end if;
  raise notice 'PASS: discovery never adds anyone to Home';
end $$;
commit;
