-- TEST ONLY (throwaway databases). Release hardening (20261214000000).
--
--   F = ...ab01 founder   D = ...ab02 asks to be deleted, with a full history:
--   blocked by B, warned, a notice and an appeal, a settled month and content-ad
--   revenue as a creator   B = ...ab03 other member   A = ...ab04 advertiser member
\set ON_ERROR_STOP on

set role supabase_auth_admin;
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
select ('00000000-0000-4000-8000-fdfdfd00' || n)::uuid, 'rh-' || n || '@example.test', now(), '{}'
from unnest(array['ab01', 'ab02', 'ab03', 'ab04']) n;
reset role;
update public.profiles p set username = 'rh_' || v.u, display_name = 'Rh ' || upper(v.u)
from (values ('ab01', 'f'), ('ab02', 'd'), ('ab03', 'b'), ('ab04', 'a')) v(n, u)
where p.id = ('00000000-0000-4000-8000-fdfdfd00' || v.n)::uuid;
update ops.member_launch_settings set founder_user_id = '00000000-0000-4000-8000-fdfdfd00ab01' where id;
select ops.grant_member_access('00000000-0000-4000-8000-fdfdfd00ab01', 'founder', 'rh-test');
select ops.grant_member_access(('00000000-0000-4000-8000-fdfdfd00' || n)::uuid, 'fan', 'rh-test') from unnest(array['ab02', 'ab03', 'ab04']) n;

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

-- 1. History stays append-only for every direct change.
do $$
begin
  perform pg_temp.expect_error('delete from social.block_events', 'append-only|history', 'deleting block history directly');
  perform pg_temp.expect_error('delete from ops.enforcements', 'append-only|history', 'deleting enforcements directly');
  perform pg_temp.expect_error('update ops.appeals set body = ''x''', 'appeal|decided|cannot|only', 'editing an appeal directly');
  perform pg_temp.expect_error('delete from sim.settlement_lines', 'append-only', 'deleting settlement lines directly');
  perform pg_temp.expect_error('insert into sim.revenue_entries (month, kind, net_cents, note, recorded_by) values (date_trunc(''month'', now())::date, ''content_ad'', 100, ''x'', ''t'')',
    'needs its creator', 'content-ad revenue without a creator');
  raise notice 'PASS: history, settlements and revenue keep their direct-change protections';
end $$;

-- 2. D's full history.
begin;
select pg_temp.as_member('ab03');
set local role authenticated;
select public.app_block(pg_temp.g('ab02'));
commit;
insert into ops.enforcements (member_id, level, reason, note) values (pg_temp.g('ab02'), 'warning', 'spam', 'rh test');
insert into ops.member_notices (member_id, kind, reason, enforcement_id)
select pg_temp.g('ab02'), 'warning', 'spam', id from ops.enforcements where member_id = pg_temp.g('ab02');
insert into ops.appeals (member_id, notice_id, body)
select pg_temp.g('ab02'), id, 'I think this was a mistake.' from ops.member_notices where member_id = pg_temp.g('ab02');
insert into sim.revenue_entries (month, kind, creator_id, net_cents, note, recorded_by)
values ((date_trunc('month', now()) - interval '6 months')::date, 'content_ad', pg_temp.g('ab02'), 5000, 'rh test', 'rh-test');
insert into sim.settlements (month, pool_cents, points, closed_by) values ((date_trunc('month', now()) - interval '6 months')::date, 1000, 100, 'rh-test');
insert into sim.settlement_lines (settlement_id, member_id, points, value_cents)
select id, pg_temp.g('ab02'), 100, 1000 from sim.settlements where closed_by = 'rh-test';
insert into ops.member_requests (member_id, kind, details) values (pg_temp.g('ab02'), 'access', 'My home address is 1 Example Street.');
insert into ops.member_requests (member_id, kind, details) values (pg_temp.g('ab02'), 'deletion', 'Please delete me.');

create temporary table rh_before as
select (select coalesce(sum(value_cents), 0) from sim.settlement_lines) as settled,
       (select coalesce(sum(net_cents), 0) from sim.revenue_entries) as revenue;
grant select on rh_before to authenticated;

-- 3. The founder deletes D: it no longer fails, and the money totals are unchanged.
select id as rh_req from ops.member_requests where member_id = pg_temp.g('ab02') and kind = 'deletion' \gset
begin;
select pg_temp.as_member('ab01');
set local role authenticated;
select public.app_founder_delete_member(:rh_req, 'rh_d');
commit;

do $$
declare
  b record;
begin
  select * into b from rh_before;
  if exists (select 1 from auth.users where id = pg_temp.g('ab02')) then
    raise exception 'FAIL: the account was not deleted';
  end if;
  if exists (select 1 from social.block_events where blocked_id = pg_temp.g('ab02')) or exists (select 1 from ops.enforcements where member_id = pg_temp.g('ab02'))
     or exists (select 1 from ops.member_notices where member_id = pg_temp.g('ab02')) or exists (select 1 from ops.appeals where member_id = pg_temp.g('ab02')) then
    raise exception 'FAIL: the deleted member''s moderation history remains under their account';
  end if;
  if (select coalesce(sum(value_cents), 0) from sim.settlement_lines) <> b.settled or (select coalesce(sum(net_cents), 0) from sim.revenue_entries) <> b.revenue then
    raise exception 'FAIL: deleting an account changed simulated settled or revenue totals';
  end if;
  if exists (select 1 from ops.member_requests where details is not null and member_id is null and kind = 'access') then
    raise exception 'FAIL: the member''s other request text survived the deletion';
  end if;
  raise notice 'PASS: a member who was blocked, warned, appealed, settled and credited can be deleted; totals and closed months are unchanged and no request text remains';
end $$;

-- 4. The advertiser's own report withholds every member count under 10.
insert into ads.advertisers (id, name, website, offering, problem_solved, desired_outcome, customer_needs, objective, conversion_action, categories, status, requested_by, requested_at)
values (pg_temp.g('ad01'), 'Rh Shop', 'https://rh.example', 'Pans', 'Sticky pans', 'Better meals', 'Good pans', 'sales', 'Buy', array['home_kitchen'], 'approved', pg_temp.g('ab04'), now());
insert into ads.campaigns (id, advertiser_id, name, status, placement, categories, allow_general, starts_on, ends_on, headline, body, cta_label, landing_url)
values (pg_temp.g('ac01'), pg_temp.g('ad01'), 'Rh pans', 'active', 'feed', array['home_kitchen'], true, current_date, current_date + 30, 'Pans', 'Cook', 'Shop', 'https://rh.example/p');
insert into ads.impressions (campaign_id, member_id, surface, match, viewed_at, clicked_at)
values (pg_temp.g('ac01'), pg_temp.g('ab03'), 'feed', 'general', now(), now()), (pg_temp.g('ac01'), pg_temp.g('ab01'), 'feed', 'general', now(), null);

begin;
select pg_temp.as_member('ab04');
set local role authenticated;
do $$
declare
  r jsonb := public.app_my_campaign_report(pg_temp.g('ac01'));
begin
  if r->'impressions' <> 'null'::jsonb or r->'clicks' <> 'null'::jsonb or r->'served' <> 'null'::jsonb or r->'ctr' <> 'null'::jsonb
     or r->'by_match'->'general'->'impressions' <> 'null'::jsonb or r->'by_match'->'general'->'clicks' <> 'null'::jsonb then
    raise exception 'FAIL: the advertiser sees counts under 10: %', r;
  end if;
  raise notice 'PASS: the advertiser''s report withholds impressions, clicks, delivery by match and click-through under 10';
end $$;
commit;

-- 5. Creator intelligence shows the creator's own simulated share, never the total revenue beside it.
insert into sim.revenue_entries (month, kind, creator_id, net_cents, note, recorded_by)
values ((date_trunc('month', now()) - interval '1 month')::date, 'content_ad', pg_temp.g('ab03'), 10000, 'rh test', 'rh-test');
begin;
select pg_temp.as_member('ab03');
set local role authenticated;
do $$
declare
  m jsonb := public.app_creator_insights(30)->'money';
begin
  if jsonb_array_length(m->'simulated_by_month') < 1 or (m->'simulated_by_month'->0) ? 'revenue_cents'
     or (m->'simulated_by_month'->0->>'creator_cents')::bigint <> 4000 then
    raise exception 'FAIL: creator intelligence money is wrong: %', m->'simulated_by_month';
  end if;
  raise notice 'PASS: creator intelligence returns the creator''s own simulated share without the revenue total';
end $$;
commit;
