-- TEST ONLY (throwaway databases). 20261209000000: restored points don't use
-- up daily earning capacity; image and video ad creatives (a file is needed
-- before activation; plays and completions count once, in order).
--
--   F = ...7701 the founder   C = ...7702 a creator   M = ...7703 a member
\set ON_ERROR_STOP on

set role supabase_auth_admin;
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-4000-8000-fdfdfd007701', 'cr-f@example.test', now(), '{}'),
  ('00000000-0000-4000-8000-fdfdfd007702', 'cr-c@example.test', now(), '{}'),
  ('00000000-0000-4000-8000-fdfdfd007703', 'cr-m@example.test', now(), '{}');
reset role;
update public.profiles p set username = 'cr_' || v.u, display_name = 'Cr ' || upper(v.u)
from (values ('7701', 'f'), ('7702', 'c'), ('7703', 'm')) v(n, u)
where p.id = ('00000000-0000-4000-8000-fdfdfd00' || v.n)::uuid;
update ops.member_launch_settings set founder_user_id = '00000000-0000-4000-8000-fdfdfd007701' where id;
select ops.grant_member_access('00000000-0000-4000-8000-fdfdfd007701', 'founder', 'cr-test');
select ops.grant_member_access(('00000000-0000-4000-8000-fdfdfd00' || n)::uuid, 'fan', 'cr-test') from unnest(array['7702', '7703']) n;

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

-- ---------------------------------------------------------------------------
-- 1. Restorations don't use up the daily cap; ordinary awards still do.
do $$
declare cap integer := (select daily_cap from sim.point_rules where version = 'd6-v1' and action = 'save');
begin
  -- A full day of restored save points (as after a reversed appeal).
  insert into sim.points_ledger (member_id, action, points, redeemable, status, rule_version, source_key)
  select pg_temp.g('7703'), 'save', 2, false, 'recognized', 'd6-v1', 'restored:hidden:probe-' || n from generate_series(1, cap) n;
  perform sim.award(pg_temp.g('7703'), 'save', 'save:probe-new', pg_temp.g('7702'), null);
  if not exists (select 1 from sim.points_ledger where source_key = 'save:probe-new') then
    raise exception 'FAIL: restored entries used up the daily cap';
  end if;
  -- A full day of ordinary saves still stops more.
  insert into sim.points_ledger (member_id, action, points, redeemable, status, rule_version, source_key)
  select pg_temp.g('7703'), 'save', 2, false, 'recognized', 'd6-v1', 'save:probe-' || n from generate_series(2, cap) n;
  perform sim.award(pg_temp.g('7703'), 'save', 'save:probe-over', pg_temp.g('7702'), null);
  if exists (select 1 from sim.points_ledger where source_key = 'save:probe-over') then
    raise exception 'FAIL: the daily cap no longer holds for ordinary awards';
  end if;
  -- Duplicate prevention is unchanged.
  perform sim.award(pg_temp.g('7703'), 'save', 'save:probe-new', pg_temp.g('7702'), null);
  if (select count(*) from sim.points_ledger where source_key = 'save:probe-new') <> 1 then
    raise exception 'FAIL: an award happened twice';
  end if;
  raise notice 'PASS: restored points do not consume daily earning capacity; ordinary caps and duplicate prevention hold';
end $$;

-- ---------------------------------------------------------------------------
-- 2. Creatives.
insert into social.posts (id, author_id, body, topic) values (pg_temp.g('7801'), pg_temp.g('7702'), 'A post', 'art');
begin;
select pg_temp.as_member('7701');
set local role authenticated;
do $$
declare adv uuid; v uuid;
begin
  adv := public.app_founder_save_advertiser(jsonb_build_object(
    'name', 'Clipco', 'website', 'https://clip.example', 'offering', 'Video tools', 'problem_solved', 'Editing is slow', 'desired_outcome', 'Faster edits',
    'customer_needs', 'Creators editing video', 'objective', 'traffic', 'conversion_action', 'Visit', 'categories', jsonb_build_array('creative_tools')));
  perform public.app_founder_review_advertiser(adv, true);
  perform pg_temp.expect_error(format($q$select public.app_founder_save_campaign(%L::jsonb)$q$, jsonb_build_object(
    'advertiser_id', adv, 'name', 'No file', 'placement', 'content', 'categories', jsonb_build_array('creative_tools'), 'context_topics', jsonb_build_array('art'),
    'starts_on', current_date - 1, 'ends_on', current_date + 9, 'headline', 'h', 'body', 'b', 'cta_label', 'c', 'landing_url', 'https://clip.example',
    'creative_kind', 'video')), 'invalid_request', 'a video campaign without a file and a text alternative');
  v := public.app_founder_save_campaign(jsonb_build_object(
    'advertiser_id', adv, 'name', 'Video', 'placement', 'content', 'categories', jsonb_build_array('creative_tools'), 'context_topics', jsonb_build_array('art'),
    'starts_on', current_date - 1, 'ends_on', current_date + 9, 'headline', 'Edit faster', 'body', 'Thirty seconds to see how.', 'cta_label', 'Watch more',
    'landing_url', 'https://clip.example', 'creative_kind', 'video', 'media_path', 'clipco/demo.mp4', 'media_alt', 'A person trims a clip in two taps.'));
  perform pg_temp.expect_error(format('select public.app_founder_set_campaign_status(%L, %L)', v, 'active'), 'creative_missing', 'activating before the file is uploaded');
  perform set_config('cr.v', v::text, false);
end $$;
commit;
-- (No storage here: activate directly to test serving and measurement.)
update ads.campaigns set status = 'active' where id = current_setting('cr.v')::uuid;
begin;
select pg_temp.as_member('7703');
set local role authenticated;
do $$
declare r record;
begin
  select * into r from public.app_ad_for('content', pg_temp.g('7801'));
  if r.creative_kind <> 'video' or r.media_path <> 'clipco/demo.mp4' or r.media_alt <> 'A person trims a clip in two taps.' then
    raise exception 'FAIL: the video creative is not served: % %', r.creative_kind, r.media_path;
  end if;
  perform public.app_ad_event(r.impression_id, 'play');      -- before a view: ignored
  perform public.app_ad_event(r.impression_id, 'complete');  -- before a play: ignored
  perform public.app_ad_event(r.impression_id, 'view');
  perform public.app_ad_event(r.impression_id, 'complete');  -- still before a play: ignored
  perform public.app_ad_event(r.impression_id, 'play');
  perform public.app_ad_event(r.impression_id, 'play');      -- once
  perform public.app_ad_event(r.impression_id, 'complete');
  perform set_config('cr.i', r.impression_id::text, false);
end $$;
commit;
do $$
declare i ads.impressions%rowtype;
begin
  select * into i from ads.impressions where id = current_setting('cr.i')::uuid;
  if i.played_at is null or i.completed_at is null or i.played_at < i.viewed_at or i.completed_at < i.played_at then
    raise exception 'FAIL: plays and completions are not recorded once, in order';
  end if;
  perform pg_temp.expect_error(format('update ads.impressions set played_at = now() where id = %L', i.id), 'recorded once', 'rewriting a play');
end $$;
begin;
select pg_temp.as_member('7701');
set local role authenticated;
do $$
declare rep jsonb := public.app_founder_campaign_report(current_setting('cr.v')::uuid);
begin
  if rep->>'creative_kind' <> 'video' or (rep->>'video_plays')::int <> 1 or (rep->>'video_completions')::int <> 1 then
    raise exception 'FAIL: the report does not count plays and completions: %', rep;
  end if;
  if jsonb_typeof(public.app_founder_ads()->'creatives') <> 'array' then
    raise exception 'FAIL: the founder cannot see the uploaded creatives';
  end if;
end $$;
commit;
do $$ begin raise notice 'PASS: image and video campaigns need a file and a text alternative before they run; video plays and completions count once, after a view, and are reported'; end $$;

-- ---------------------------------------------------------------------------
-- 3. Approved frequency, "shown with", hiding an advertiser.
do $$
begin
  perform pg_temp.expect_error($q$update ads.campaigns set daily_cap = 4 where id = current_setting('cr.v')::uuid$q$, 'daily_cap', 'a campaign cap above 3 a day');
end $$;
-- Five more served ads earlier today (six in all) reach the member's daily limit.
set session_replication_role = replica;
insert into ads.impressions (campaign_id, member_id, surface, match, served_at)
select current_setting('cr.v')::uuid, pg_temp.g('7703'), 'feed', 'general', greatest(date_trunc('day', now()), now() - interval '1 hour') + interval '1 second' from generate_series(1, 5);
set session_replication_role = origin;
begin;
select pg_temp.as_member('7703');
set local role authenticated;
do $$
begin
  if exists (select 1 from public.app_ad_for('content', pg_temp.g('7801'))) then
    raise exception 'FAIL: a seventh ad in a day was served';
  end if;
end $$;
commit;
set session_replication_role = replica;
delete from ads.impressions where member_id = pg_temp.g('7703') and match = 'general';
update ads.impressions set served_at = served_at - interval '1 minute' where member_id = pg_temp.g('7703');
set session_replication_role = origin;
begin;
select pg_temp.as_member('7703');
set local role authenticated;
do $$
declare r record;
begin
  select * into r from public.app_ad_for('content', pg_temp.g('7801'));
  if r.shown_with is distinct from 'Cr C' then raise exception 'FAIL: the content ad does not say whose post it is with: %', r.shown_with; end if;
  perform public.app_ad_event(r.impression_id, 'view');
  perform public.app_ad_event(r.impression_id, 'hidden_advertiser');
  if not exists (select 1 from public.app_my_ad_exclusions() where kind = 'advertiser') then
    raise exception 'FAIL: hiding the advertiser was not recorded';
  end if;
end $$;
commit;
set session_replication_role = replica;
update ads.impressions set served_at = served_at - interval '1 minute' where member_id = pg_temp.g('7703');
set session_replication_role = origin;
begin;
select pg_temp.as_member('7703');
set local role authenticated;
do $$
begin
  if exists (select 1 from public.app_ad_for('content', pg_temp.g('7801'))) then raise exception 'FAIL: a hidden advertiser was shown again'; end if;
end $$;
commit;
do $$ begin raise notice 'PASS: at most 6 ads a day per member and 3 per campaign; content ads say whose post they are with; a hidden advertiser stays hidden'; end $$;
