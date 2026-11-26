-- TEST ONLY (throwaway databases). Ad placement attribution and the ads switch,
-- deterministically: the same member is served one campaign both in the Home
-- feed and with a creator's post, and every count is checked by placement.
--
--   F = ...ac01 founder   V = ...ac02 viewer who chose the category   C = ...ac03 creator
\set ON_ERROR_STOP on

set role supabase_auth_admin;
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
select ('00000000-0000-4000-8000-fafafa00' || n)::uuid, 'pa-' || n || '@example.test', now(), '{}'
from unnest(array['ac01', 'ac02', 'ac03']) n;
reset role;
update public.profiles p set username = 'pa_' || v.u, display_name = 'Pa ' || upper(v.u)
from (values ('ac01', 'f'), ('ac02', 'v'), ('ac03', 'c')) v(n, u)
where p.id = ('00000000-0000-4000-8000-fafafa00' || v.n)::uuid;
update ops.member_launch_settings set founder_user_id = '00000000-0000-4000-8000-fafafa00ac01' where id;
select ops.grant_member_access('00000000-0000-4000-8000-fafafa00ac01', 'founder', 'pa-test');
select ops.grant_member_access(('00000000-0000-4000-8000-fafafa00' || n)::uuid, 'fan', 'pa-test') from unnest(array['ac02', 'ac03']) n;

create function pg_temp.g(n text) returns uuid language sql immutable as $$ select ('00000000-0000-4000-8000-fafafa00' || n)::uuid $$;
grant execute on function pg_temp.g(text) to authenticated, anon;
create function pg_temp.as_member(n text) returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-fafafa00' || n || '","role":"authenticated"}', true) $$;
grant execute on function pg_temp.as_member(text) to authenticated, anon;

-- Two posts by C, a campaign for both placements in a category V chose, and
-- no other live campaign competing for V's slots.
create temporary table pa_paused as select id from ads.campaigns where status = 'active';
update ads.campaigns set status = 'paused' where id in (select id from pa_paused);
insert into social.posts (id, author_id, body) values
  (pg_temp.g('bf01'), pg_temp.g('ac03'), 'Placement test post one'),
  (pg_temp.g('bf02'), pg_temp.g('ac03'), 'Placement test post two');
insert into ads.advertisers (id, name, website, offering, problem_solved, desired_outcome, customer_needs, objective, conversion_action, categories, status)
values (pg_temp.g('ad01'), 'Pa Shoes', 'https://pa.example', 'Shoes', 'Kids outgrow shoes', 'One pair a year', 'Parents', 'sales', 'Buy', array['kids_family'], 'approved');
insert into ads.campaigns (id, advertiser_id, name, status, placement, categories, allow_general, daily_cap, starts_on, ends_on, headline, body, cta_label, landing_url)
values (pg_temp.g('aa01'), pg_temp.g('ad01'), 'Pa both placements', 'active', 'both', array['kids_family'], false, 3,
        current_date, current_date + 30, 'Shoes', 'That grow', 'See', 'https://pa.example/s');
begin;
select pg_temp.as_member('ac02');
set local role authenticated;
select public.app_set_ad_preference('kids_family', 'chosen');
commit;

create function pg_temp.serve(n text, surface text, post uuid) returns uuid language plpgsql as $$
declare v uuid;
begin
  perform pg_temp.as_member(n);
  execute 'set local role authenticated';
  select impression_id into v from public.app_ad_for(surface, post);
  execute 'reset role';
  return v;
end $$;
create function pg_temp.view(n text, imp uuid) returns void language plpgsql as $$
begin
  perform pg_temp.as_member(n);
  execute 'set local role authenticated';
  perform public.app_ad_event(imp, 'view');
  execute 'reset role';
end $$;
create function pg_temp.set_ads(on_ boolean, why text) returns void language plpgsql as $$
begin
  perform pg_temp.as_member('ac01');
  execute 'set local role authenticated';
  perform public.app_founder_set_switch('ads', on_, why);
  execute 'reset role';
end $$;
create function pg_temp.report() returns jsonb language plpgsql as $$
declare r jsonb;
begin
  perform pg_temp.as_member('ac01');
  execute 'set local role authenticated';
  r := public.app_founder_campaign_report(pg_temp.g('aa01'));
  execute 'reset role';
  return r;
end $$;
create function pg_temp.served(p_surface text) returns bigint language sql as $$
  select count(*) from ads.impressions i where i.member_id = pg_temp.g('ac02') and (p_surface is null or i.surface = p_surface) $$;

-- 1. With ads off, neither placement serves and nothing is recorded.
do $$
begin
  perform pg_temp.set_ads(false, 'placement test: off before any serve');
  if pg_temp.serve('ac02', 'feed', null) is not null or pg_temp.serve('ac02', 'content', pg_temp.g('bf01')) is not null
     or pg_temp.served(null) <> 0 then
    raise exception 'FAIL: an ad was served while ads were off';
  end if;
  perform pg_temp.set_ads(true, 'placement test: on');
  raise notice 'PASS: with ads off, neither the feed nor a post serves an ad, and no impression is recorded';
end $$;

-- 2. Both placements serve the same campaign, each attributed to its own placement.
do $$
declare
  f uuid := pg_temp.serve('ac02', 'feed', null);
  c uuid := pg_temp.serve('ac02', 'content', pg_temp.g('bf01'));
  r record;
begin
  if f is null or c is null then
    raise exception 'FAIL: feed % or content % was not served', f, c;
  end if;
  select * into r from ads.impressions where id = f;
  if r.surface <> 'feed' or r.post_id is not null or r.creator_id is not null or r.campaign_id <> pg_temp.g('aa01') or r.match <> 'preference' then
    raise exception 'FAIL: the feed impression is attributed wrongly: %', row_to_json(r);
  end if;
  select * into r from ads.impressions where id = c;
  if r.surface <> 'content' or r.post_id <> pg_temp.g('bf01') or r.creator_id <> pg_temp.g('ac03') or r.campaign_id <> pg_temp.g('aa01') then
    raise exception 'FAIL: the content impression is attributed wrongly: %', row_to_json(r);
  end if;
  -- The same slot again within 20 seconds serves nothing; the other placement is unaffected.
  if pg_temp.serve('ac02', 'feed', null) is not null or pg_temp.serve('ac02', 'content', pg_temp.g('bf01')) is not null then
    raise exception 'FAIL: the same slot was served twice within 20 seconds';
  end if;
  if pg_temp.served('feed') <> 1 or pg_temp.served('content') <> 1 then
    raise exception 'FAIL: expected one feed and one content serve, got % and %', pg_temp.served('feed'), pg_temp.served('content');
  end if;
  perform set_config('pa.feed', f::text, false);
  perform set_config('pa.content', c::text, false);
  raise notice 'PASS: the feed serve has no post or creator; the post serve carries its post and creator; each slot serves once';
end $$;

-- 3. Valid impressions count only what was seen, by placement, once each.
do $$
declare
  r jsonb := pg_temp.report();
begin
  if (r->>'served')::int <> 2 or (r->>'impressions')::int <> 0 or (r->>'content_impressions')::int <> 0 or (r->>'feed_impressions')::int <> 0 then
    raise exception 'FAIL: before any view the report is wrong: %', r;
  end if;
  perform pg_temp.view('ac02', current_setting('pa.content')::uuid);
  perform pg_temp.view('ac02', current_setting('pa.content')::uuid); -- a second view does not count twice
  r := pg_temp.report();
  if (r->>'served')::int <> 2 or (r->>'impressions')::int <> 1 or (r->>'content_impressions')::int <> 1 or (r->>'feed_impressions')::int <> 0 then
    raise exception 'FAIL: after the post ad was seen the report is wrong: %', r;
  end if;
  perform pg_temp.view('ac02', current_setting('pa.feed')::uuid);
  r := pg_temp.report();
  if (r->>'served')::int <> 2 or (r->>'impressions')::int <> 2 or (r->>'content_impressions')::int <> 1 or (r->>'feed_impressions')::int <> 1
     or (r->'by_match'->'preference'->>'impressions')::int <> 2 or (r->>'clicks')::int <> 0 then
    raise exception 'FAIL: after both were seen the report is wrong: %', r;
  end if;
  if (r->>'impressions')::int <> (select count(*) from ads.impressions where campaign_id = pg_temp.g('aa01') and viewed_at is not null) then
    raise exception 'FAIL: the report does not match the database';
  end if;
  raise notice 'PASS: the report counts served, valid, post and feed impressions exactly as recorded, a repeated view once';
end $$;

-- 4. Off again: a fresh slot serves nothing; back on, the same slot serves.
do $$
begin
  perform pg_temp.set_ads(false, 'placement test: off again');
  if pg_temp.serve('ac02', 'content', pg_temp.g('bf02')) is not null or pg_temp.served(null) <> 2 then
    raise exception 'FAIL: a fresh slot served an ad while ads were off';
  end if;
  perform pg_temp.set_ads(true, 'placement test: on again');
  if pg_temp.serve('ac02', 'content', pg_temp.g('bf02')) is null or pg_temp.served('content') <> 2 or pg_temp.served('feed') <> 1 then
    raise exception 'FAIL: the slot did not serve once ads were back on';
  end if;
  if (pg_temp.report()->>'served')::int <> 3 or (pg_temp.report()->>'impressions')::int <> 2 then
    raise exception 'FAIL: an unseen serve was counted as a valid impression: %', pg_temp.report();
  end if;
  raise notice 'PASS: while off a fresh slot serves nothing; once on it serves, and an unseen serve is not a valid impression';
end $$;

-- Leave other tests' campaigns as they were.
update ads.campaigns set status = 'paused' where id = pg_temp.g('aa01');
update ads.campaigns set status = 'active' where id in (select id from pa_paused);
