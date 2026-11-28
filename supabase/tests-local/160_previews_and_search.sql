-- TEST ONLY (throwaway databases). 20261204000000: fair discovery rotation,
-- privacy-preserving search measurement, and public previews (anonymous
-- access, boundaries, removal, referral attribution, abuse limits).
--
--   V = ...5101 a viewer (money)     X = ...5102 posts often     Y = ...5103 posts rarely
--   F = ...5104 the founder (search metrics)
\set ON_ERROR_STOP on

set role supabase_auth_admin;
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-4000-8000-fdfdfd005101', 'pv-v@example.test', now(), '{}'),
  ('00000000-0000-4000-8000-fdfdfd005102', 'pv-x@example.test', now(), '{}'),
  ('00000000-0000-4000-8000-fdfdfd005103', 'pv-y@example.test', now(), '{}');
reset role;
update public.profiles p set username = 'pv_' || v.u, display_name = 'Pv ' || upper(v.u)
from (values ('5101', 'v'), ('5102', 'x'), ('5103', 'y')) v(n, u)
where p.id = ('00000000-0000-4000-8000-fdfdfd00' || v.n)::uuid;
select ops.grant_member_access(('00000000-0000-4000-8000-fdfdfd00' || n)::uuid, 'fan', 'pv-test') from unnest(array['5101', '5102', '5103']) n;
insert into ops.age_attestations (user_id, wording_version, source)
select ('00000000-0000-4000-8000-fdfdfd00' || n)::uuid, 'adult-v1', 'test' from unnest(array['5101', '5102', '5103']) n
on conflict do nothing;
insert into social.member_topics (user_id, topic) values ('00000000-0000-4000-8000-fdfdfd005101', 'money');

create function pg_temp.expect_error(sql text, expected text, what text)
returns void language plpgsql as $$
declare got text;
begin
  begin execute sql; exception when others then got := sqlerrm; end;
  if got is null then raise exception 'FAIL: % succeeded, expected "%"', what, expected; end if;
  if got !~ expected then raise exception 'FAIL: % failed with "%", expected "%"', what, got, expected; end if;
end; $$;
grant execute on function pg_temp.expect_error(text, text, text) to authenticated, anon;
create function pg_temp.p(n text) returns uuid language sql immutable as $$ select ('00000000-0000-4000-8000-fdfdfd00' || n)::uuid $$;
grant execute on function pg_temp.p(text) to authenticated, anon;

-- X posted three times today; Y once, 20 days ago.
insert into social.posts (id, author_id, body, topic, created_at) values
  (pg_temp.p('5201'), pg_temp.p('5102'), 'X money one',   'money', now() - interval '1 hour'),
  (pg_temp.p('5202'), pg_temp.p('5102'), 'X money two',   'money', now() - interval '2 hours'),
  (pg_temp.p('5203'), pg_temp.p('5102'), 'X money three', 'money', now() - interval '3 hours'),
  (pg_temp.p('5204'), pg_temp.p('5103'), 'Y money, rarely posted', 'money', now() - interval '20 days');

-- ---------------------------------------------------------------------------
-- 1. Fair rotation: the rare poster's only post comes before anyone's second.
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-fdfdfd005101","role":"authenticated"}', true);
set local role authenticated;
do $$
declare ids uuid[];
begin
  -- Positions in the full list (other test files add their own posts too).
  select array_agg(d.id order by d.ord) into ids
  from public.app_discover_content(null, 50) with ordinality d(id, author_id, author_username, author_display_name, body, created_at,
       like_count, comment_count, liked_by_me, author_in_my_clique, is_mine, media, topic, topic_label, reason, ord)
  where d.author_id in (pg_temp.p('5102'), pg_temp.p('5103'));
  -- Round one holds X's newest and Y's only post (in the day's rotation order), then X's second; X's third never shows.
  if cardinality(ids) <> 3 or ids[3] <> pg_temp.p('5202')
     or not (ids[1:2] @> array[pg_temp.p('5201'), pg_temp.p('5204')]) then
    raise exception 'FAIL: each creator''s newest post should come before anyone''s second (at most two each), got %', ids;
  end if;
  raise notice 'PASS: fair rotation: every creator''s newest post comes before anyone''s second, whatever how often or how recently they post';
end $$;
commit;

-- ---------------------------------------------------------------------------
-- 2. Search measurement: counts only; topic only from the approved list.
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-fdfdfd005101","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  perform public.app_note_search('search', true, null);
  perform public.app_note_search('search', false, null);
  perform public.app_note_search('search', true, 'money');
  perform public.app_note_search('focus', true, 'not_a_topic'); -- counted with no topic
  perform public.app_note_search_selection('search', null);
  perform pg_temp.expect_error('select public.app_note_search(''history'', true, null)', 'invalid_request', 'an unknown surface');
  perform pg_temp.expect_error('select count(*) from social.search_metrics_daily', 'permission denied', 'members reading search counts');
  perform pg_temp.expect_error('select * from public.app_founder_search_metrics(28)', 'not_founder|founder', 'a member reading founder metrics');
  perform public.app_follow(pg_temp.p('5103'), 'search');
end $$;
commit;
do $$
begin
  if (select searches || '|' || with_results || '|' || selections from social.search_metrics_daily where day = (now() at time zone 'utc')::date and surface = 'search' and topic = '') <> '2|1|1'
     or (select searches from social.search_metrics_daily where day = (now() at time zone 'utc')::date and surface = 'search' and topic = 'money') <> 1
     or (select searches from social.search_metrics_daily where day = (now() at time zone 'utc')::date and surface = 'focus' and topic = '') <> 1 then
    raise exception 'FAIL: search counts are wrong';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'social' and table_name = 'search_metrics_daily'
             and column_name ~* '(member|user|query|words|text|result_id|ip)') then
    raise exception 'FAIL: search measurement stores something personal';
  end if;
  if (select source from social.follow_events where follower_id = pg_temp.p('5101') and creator_id = pg_temp.p('5103')) <> 'search' then
    raise exception 'FAIL: a follow from search should record its source';
  end if;
  raise notice 'PASS: search measurement keeps daily counts only (volume, with results, opened, approved topic); follows from search are attributed; members can''t read it';
end $$;

-- ---------------------------------------------------------------------------
-- 3. Public previews: off by default, then on; anonymous, read-only, narrow.
begin;
set local role anon;
do $$
begin
  perform pg_temp.expect_error('select * from public.app_public_post(pg_temp.p(''5201''), null)', 'not_available', 'a preview while previews are off');
  raise notice 'PASS: previews are off by default: visitors get nothing';
end $$;
commit;
select ops.set_public_previews('test', true, 'preview tests');
-- On by default (20261222000000): a creator who switched previews off is never
-- previewed; one who made no choice is, once previews are on project-wide.
insert into social.preview_optouts (member_id) values (pg_temp.p('5102'));
begin;
set local role anon;
do $$
begin
  perform pg_temp.expect_error('select * from public.app_public_post(pg_temp.p(''5201''), null)', 'not_found', 'a preview of a creator who switched previews off');
  raise notice 'PASS: a creator who switched previews off is never previewed, even with previews on';
end $$;
commit;
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-fdfdfd005102","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  perform pg_temp.expect_error('select public.app_set_public_previews(true, ''Not A Version!'')', 'invalid_request', 'switching on with a malformed wording version');
  perform public.app_set_public_previews(true, 'previews-v2');
end $$;
commit;
begin;
set local role anon;
do $$
declare r record;
begin
  select * into r from public.app_public_post(pg_temp.p('5201'), '0123456789abcdef');
  if r.body <> 'X money one' or r.author_username <> 'pv_x' or r.author_display_name <> 'Pv X' or r.topic_label <> 'Money & business' or r.has_photo then
    raise exception 'FAIL: the preview should show the text, topic and creator: %', r;
  end if;
  perform public.app_public_post(pg_temp.p('5201'), 'not-a-code');
  perform pg_temp.expect_error('select * from public.app_feed_page(null, null, 10, ''all'')', 'permission denied', 'a visitor reading Home');
  perform pg_temp.expect_error('select * from public.app_post(pg_temp.p(''5201''))', 'permission denied', 'a visitor reading a member post');
  perform pg_temp.expect_error('select * from public.app_member(''pv_x'')', 'permission denied', 'a visitor reading a profile');
  perform pg_temp.expect_error('select count(*) from social.posts', 'permission denied', 'a visitor reading posts directly');
  perform pg_temp.expect_error('select count(*) from social.preview_visits', 'permission denied', 'a visitor reading visits');
  perform pg_temp.expect_error('select * from public.app_public_post(''00000000-0000-4000-8000-0000000fffff'', null)', 'not_found', 'a missing post');
  raise notice 'PASS: a visitor sees only the preview of an eligible post (text, time, topic, creator), and nothing else in the member API';
end $$;
commit;
do $$
begin
  if (select string_agg(ref_code || ':' || views, ',' order by ref_code) from social.preview_visits where post_id = pg_temp.p('5201')) <> ':1,0123456789abcdef:1' then
    raise exception 'FAIL: visits should be counted per referral link (an invalid link counts with none): %',
      (select string_agg(ref_code || ':' || views, ',' order by ref_code) from social.preview_visits where post_id = pg_temp.p('5201'));
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'social' and table_name = 'preview_visits'
             and column_name ~* '(ip|agent|visitor|user|member|session)') then
    raise exception 'FAIL: preview visits store visitor identity';
  end if;
  raise notice 'PASS: preview visits are counted per day, post and referral link, with no visitor identity';
end $$;

-- Removal, moderation and withdrawn consent: never previewed.
update social.posts set deleted_at = now() where id = pg_temp.p('5202');
insert into ops.content_reports (reporter_id, target_type, target_id, target_owner_id, reason, priority)
values (pg_temp.p('5101'), 'post', pg_temp.p('5203'), pg_temp.p('5102'), 'spam', false);
insert into social.preview_optouts (member_id) values (pg_temp.p('5103')); -- Y switched previews off
begin;
set local role anon;
do $$
begin
  perform pg_temp.expect_error('select * from public.app_public_post(pg_temp.p(''5202''), null)', 'not_found', 'a deleted post');
  perform pg_temp.expect_error('select * from public.app_public_post(pg_temp.p(''5203''), null)', 'not_found', 'a post with an open report');
  perform pg_temp.expect_error('select * from public.app_public_post(pg_temp.p(''5204''), null)', 'not_found', 'a post whose creator switched previews off');
  raise notice 'PASS: deleted and reported posts, and creators who switched previews off, are never previewed';
end $$;
commit;
-- A member whose access was revoked is no longer previewed.
select ops.revoke_member_access(pg_temp.p('5102'), 'pv-test');
begin;
set local role anon;
do $$
begin
  perform pg_temp.expect_error('select * from public.app_public_post(pg_temp.p(''5201''), null)', 'not_found', 'a post by a member whose access was revoked');
  raise notice 'PASS: posts by members whose access ended are never previewed';
end $$;
commit;

-- Abuse prevention: 60 views a minute per post.
select ops.grant_member_access(pg_temp.p('5102'), 'fan', 'pv-test');
insert into social.posts (id, author_id, body) values (pg_temp.p('5205'), pg_temp.p('5102'), 'Rate limit probe');
begin;
set local role anon;
do $$
begin
  for i in 1..60 loop perform public.app_public_post(pg_temp.p('5205'), null); end loop;
  perform pg_temp.expect_error('select * from public.app_public_post(pg_temp.p(''5205''), null)', 'rate_limited', 'a 61st preview of one post in a minute');
  raise notice 'PASS: previews are rate limited per post (and overall)';
end $$;
commit;

-- Members switch previews off and on again at any time (on again records the wording shown).
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-fdfdfd005103","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  if public.app_public_previews_allowed() then raise exception 'FAIL: Y switched previews off'; end if;
  perform public.app_set_public_previews(true, 'previews-v2');
  if not public.app_public_previews_allowed() then raise exception 'FAIL: Y switched previews on again'; end if;
  perform public.app_set_public_previews(false, 'previews-v2');
  if public.app_public_previews_allowed() then raise exception 'FAIL: Y switched previews off again'; end if;
  raise notice 'PASS: previews are on by default; members switch them off at once and on again at any time (with the wording shown)';
end $$;
commit;
do $$
begin
  if not exists (select 1 from social.preview_optouts where member_id = pg_temp.p('5103'))
     or exists (select 1 from social.preview_consents where member_id = pg_temp.p('5103')) then
    raise exception 'FAIL: switching off is not recorded at once';
  end if;
  if (select wording_version from social.preview_consents where member_id = pg_temp.p('5102')) is distinct from 'previews-v2'
     or exists (select 1 from social.preview_optouts where member_id = pg_temp.p('5102')) then
    raise exception 'FAIL: switching on again did not clear the switch-off or record the wording shown';
  end if;
end $$;
select ops.set_public_previews('test', false, 'preview tests done');
do $$
begin
  perform pg_temp.expect_error('update ops.public_preview_events set reason = ''x''', 'append-only', 'rewriting the switch history');
  if (select count(*) from ops.public_preview_events where actor = 'test') <> 2 then
    raise exception 'FAIL: both switch changes should be recorded';
  end if;
  raise notice 'PASS: every change to the preview switch is recorded, append-only';
end $$;
