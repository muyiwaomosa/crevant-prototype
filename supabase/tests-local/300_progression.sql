-- TEST ONLY (throwaway databases). Progression (20261217000000) under the
-- approved rules of SP-PRG-001 (20261218000000): every measure with what it
-- must exclude, review before release, targeted holds, compensating
-- corrections, Option A, revocation and restoration, and qualification that
-- is kept when activity declines or goals change.
--
--   F = ...ab01 founder   C = ...ab02 creator   U = ...ab03 consumer
--   W = ...ab04 an eligible fan   X = ...ab05 email not confirmed
--   S = ...ab06 suspended          V = ...ab07, Z = ...ab08 other creators
\set ON_ERROR_STOP on

set role supabase_auth_admin;
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
select ('00000000-0000-4000-8000-a1a1a1a1' || n)::uuid, 'prg-' || n || '@example.test', now(), '{}'
from unnest(array['ab01', 'ab02', 'ab03', 'ab04', 'ab05', 'ab06', 'ab07', 'ab08']) n;
reset role;
update public.profiles p set username = 'prg_' || v.u, display_name = 'Prg ' || upper(v.u)
from (values ('ab01', 'f'), ('ab02', 'c'), ('ab03', 'u'), ('ab04', 'w'), ('ab05', 'x'), ('ab06', 's'), ('ab07', 'v'), ('ab08', 'z')) v(n, u)
where p.id = ('00000000-0000-4000-8000-a1a1a1a1' || v.n)::uuid;
update ops.member_launch_settings set founder_user_id = '00000000-0000-4000-8000-a1a1a1a1ab01' where id;
select ops.grant_member_access('00000000-0000-4000-8000-a1a1a1a1ab01', 'founder', 'prg-test');
select ops.grant_member_access(('00000000-0000-4000-8000-a1a1a1a1' || n)::uuid, 'fan', 'prg-test')
from unnest(array['ab02', 'ab03', 'ab04', 'ab05', 'ab06', 'ab07', 'ab08']) n;
-- X's email is no longer confirmed (as after an address change): X does not count.
set role supabase_auth_admin;
update auth.users set email_confirmed_at = null where id = '00000000-0000-4000-8000-a1a1a1a1ab05';
reset role;

create function pg_temp.g(n text) returns uuid language sql immutable as $$ select ('00000000-0000-4000-8000-a1a1a1a1' || n)::uuid $$;
grant execute on function pg_temp.g(text) to authenticated, anon;
create function pg_temp.as_member(n text) returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-a1a1a1a1' || n || '","role":"authenticated"}', true) $$;
grant execute on function pg_temp.as_member(text) to authenticated, anon;
-- Runs a function as a member and returns its result (or the error message).
create function pg_temp.call(n text, q text) returns jsonb language plpgsql as $$
declare r jsonb;
begin
  perform pg_temp.as_member(n);
  set local role authenticated;
  execute q into r;
  reset role;
  return r;
exception when others then
  reset role;
  return pg_catalog.jsonb_build_object('error', sqlerrm);
end $$;
grant execute on function pg_temp.call(text, text) to authenticated;
create function pg_temp.val(r jsonb, journey text, metric text) returns bigint language sql immutable as $$
  select (s ->> 'value')::bigint from jsonb_array_elements(r -> journey -> 'steps') s where s ->> 'metric' = metric $$;
create function pg_temp.money(r jsonb, journey text, k text) returns bigint language sql immutable as $$
  select (r -> 'earnings' -> journey ->> k)::bigint $$;
-- A recognition award in the ledger, as the rewards rules would record it.
create function pg_temp.award(member text, action text, creator text, at_ago interval, key text, status text default 'recognized') returns bigint language sql as $$
  insert into sim.points_ledger (member_id, action, points, redeemable, status, rule_version, source_key, creator_id, created_at)
  values (pg_temp.g(member), action, case when action = 'qualified_referral' then 100 else 2 end, action = 'qualified_referral', status, 'd6-v1',
          'prg-' || key, case when creator is null then null else pg_temp.g(creator) end, now() - at_ago)
  returning id $$;
create temporary table prg_ids (k text primary key, id bigint);
grant all on prg_ids to authenticated;

-- C's posts: two in the last 28 days in different weeks, one older, one deleted, one hidden.
insert into social.posts (id, author_id, body, created_at) values
  (pg_temp.g('cc01'), pg_temp.g('ab02'), 'C now', now()),
  (pg_temp.g('cc02'), pg_temp.g('ab02'), 'C nine days ago', now() - interval '9 days'),
  (pg_temp.g('cc03'), pg_temp.g('ab02'), 'C forty days ago', now() - interval '40 days'),
  (pg_temp.g('cc04'), pg_temp.g('ab02'), 'C deleted', now()),
  (pg_temp.g('cc05'), pg_temp.g('ab02'), 'C hidden', now()),
  (pg_temp.g('cc07'), pg_temp.g('ab07'), 'V post', now()),
  (pg_temp.g('cc08'), pg_temp.g('ab08'), 'Z post', now());
update social.posts set deleted_at = now() where id = pg_temp.g('cc04');
update social.posts set hidden_at = now() where id = pg_temp.g('cc05');
-- Followers of C: W, U (and V, below) count; X (email not confirmed) and S (suspended) do not.
insert into social.follows (follower_id, creator_id) values
  (pg_temp.g('ab04'), pg_temp.g('ab02')), (pg_temp.g('ab03'), pg_temp.g('ab02')),
  (pg_temp.g('ab05'), pg_temp.g('ab02')), (pg_temp.g('ab06'), pg_temp.g('ab02'));
-- (A Clique only includes people you follow: V follows C; U follows V, Z and X.)
insert into social.follows (follower_id, creator_id) values
  (pg_temp.g('ab07'), pg_temp.g('ab02')), (pg_temp.g('ab03'), pg_temp.g('ab07')),
  (pg_temp.g('ab03'), pg_temp.g('ab08')), (pg_temp.g('ab03'), pg_temp.g('ab05'));
-- C in Cliques: W and U count; X does not; V added then removed does not.
insert into social.clique_members (fan_id, creator_id) values
  (pg_temp.g('ab04'), pg_temp.g('ab02')), (pg_temp.g('ab03'), pg_temp.g('ab02')), (pg_temp.g('ab05'), pg_temp.g('ab02'));
insert into social.clique_members (fan_id, creator_id, added_at, removed_at, removal_reason)
values (pg_temp.g('ab07'), pg_temp.g('ab02'), now() - interval '2 days', now() - interval '1 day', 'removed');
-- U's Clique: C, V and Z count; X (not confirmed) does not.
insert into social.clique_members (fan_id, creator_id) values
  (pg_temp.g('ab03'), pg_temp.g('ab07')), (pg_temp.g('ab03'), pg_temp.g('ab08')), (pg_temp.g('ab03'), pg_temp.g('ab05'));
-- W returns to C in two weeks (a comment now, a save nine days ago); S engages but is suspended below.
insert into social.comments (post_id, author_id, body) values (pg_temp.g('cc01'), pg_temp.g('ab04'), 'This really changed how I think about my mornings, thank you.');
insert into social.saves (member_id, post_id, saved_at) values (pg_temp.g('ab04'), pg_temp.g('cc02'), now() - interval '9 days');
insert into social.saves (member_id, post_id, saved_at) values (pg_temp.g('ab06'), pg_temp.g('cc01'), now()), (pg_temp.g('ab06'), pg_temp.g('cc02'), now() - interval '9 days');
insert into ops.enforcements (member_id, level, reason, starts_at, actor_id)
values (pg_temp.g('ab06'), 'suspension', 'spam', now() - interval '1 minute', pg_temp.g('ab01'));
-- U's ledger: three engagements with three creators in two weeks (C and V are in U's Clique),
-- one on U's own post and one reversed (neither counts); shares and referrals.
select pg_temp.award('ab03', 'meaningful_comment', 'ab02', interval '0', 'e1');
select pg_temp.award('ab03', 'save', 'ab07', interval '9 days', 'e2');
select pg_temp.award('ab03', 'repost', 'ab08', interval '40 days', 'e3');
select pg_temp.award('ab03', 'save', 'ab03', interval '0', 'e4');
insert into prg_ids select 'rev_award', pg_temp.award('ab03', 'repost', 'ab02', interval '0', 'e5');
insert into sim.points_ledger (member_id, action, points, redeemable, status, rule_version, source_key, creator_id, reverses)
select pg_temp.g('ab03'), 'repost', -2, false, 'reversal', 'd6-v1', 'prg-e5-rev', pg_temp.g('ab02'), id from prg_ids where k = 'rev_award';
select pg_temp.award('ab03', 'external_share', 'ab02', interval '0', 's1');
select pg_temp.award('ab03', 'external_share', 'ab03', interval '0', 's2');
select pg_temp.award('ab03', 'qualified_referral', null, interval '0', 'r1', 'approved');
select pg_temp.award('ab03', 'qualified_referral', null, interval '0', 'r2', 'pending_review');

do $$
declare
  bad text[] := '{}';
  c jsonb := sim.goal_values(pg_temp.g('ab02'), 'creator');
  f jsonb := sim.goal_values(pg_temp.g('ab03'), 'consumer');
begin
  -- 1. The approved benchmarks are in force, recorded with their approval; the switch is off.
  if (select targets from sim.goal_versions where audience = 'creator' order by id desc limit 1)
       <> '{"original_posts": 20, "posting_weeks": 3, "genuine_followers": 100, "clique_connections": 5, "returning_supporters": 5}'::jsonb
     or (select targets from sim.goal_versions where audience = 'consumer' order by id desc limit 1)
       <> '{"clique_creators": 10, "meaningful_engagements": 30, "engaged_creators": 3, "supporting_weeks": 4, "external_shares": 5, "qualified_referrals": 5}'::jsonb
     or exists (select 1 from sim.goal_versions where set_by not like 'founder%') then
    bad := bad || 'the approved benchmarks are not in force as recorded'::text;
  end if;
  if ops.feature_on('progression') or pg_temp.call('ab02', 'select public.app_my_progress()') <> '{"enabled": false}'::jsonb then
    bad := bad || 'progression is not off by default'::text;
  end if;
  -- No goal counts as met without a target of 1 or more for every measure.
  if sim.goals_met('{"a": 5}', '{}', array['a']) or sim.goals_met('{"a": 5}', '{"a": 0}', array['a'])
     or not sim.goals_met('{"a": 5, "b": 1}', '{"a": 5, "b": 1}', array['a', 'b']) or sim.goals_met('{}', '{}', '{}') then
    bad := bad || 'goals_met is wrong'::text;
  end if;
  -- 2. Creator measures (CQ-01 to CQ-05), with what each excludes.
  if c <> '{"original_posts": 3, "posting_weeks": 2, "genuine_followers": 3, "clique_connections": 2, "returning_supporters": 1}'::jsonb then
    bad := bad || ('creator measures: ' || c::text);
  end if;
  -- 3. Consumer measures (FQ-01 to FQ-05): ledger awards that stand, others' posts, Clique weeks, lifetime shares and referrals.
  if f <> '{"clique_creators": 3, "meaningful_engagements": 3, "engaged_creators": 3, "supporting_weeks": 2, "external_shares": 1, "qualified_referrals": 1}'::jsonb then
    bad := bad || ('consumer measures: ' || f::text);
  end if;
  if cardinality(bad) > 0 then raise exception 'FAIL: progression (benchmarks and measures): %', bad; end if;
  raise notice 'PASS: progression: the approved SP-PRG-001 benchmarks are in force; every creator and consumer measure counts only eligible activity (deleted, hidden, old, self, unconfirmed, suspended, removed, reversed and pending all excluded); off by default';
end $$;

-- The founder turns progression on and, for this test only, sets goals the test data can meet.
begin;
select pg_temp.as_member('ab01');
set local role authenticated;
select public.app_founder_set_switch('progression', true, 'progression test');
select public.app_founder_set_goals('creator', '{"original_posts": 3, "posting_weeks": 2, "genuine_followers": 3, "clique_connections": 2, "returning_supporters": 1}', 'test values');
select public.app_founder_set_goals('consumer', '{"clique_creators": 3, "meaningful_engagements": 3, "engaged_creators": 3, "supporting_weeks": 2, "external_shares": 1, "qualified_referrals": 1}', 'test values');
insert into prg_ids select 'e1', public.app_founder_record_sim_revenue('2003-03-01', 'content_ad', pg_temp.g('ab02'), pg_temp.g('cc01'), 10000, 'prg e1');
insert into prg_ids select 'e2', public.app_founder_record_sim_revenue('2003-03-01', 'content_ad', pg_temp.g('ab02'), pg_temp.g('cc02'), 5000, 'prg e2');
commit;
-- U is under a restriction for now.
insert into ops.enforcements (member_id, level, reason, starts_at, ends_at, actor_id)
values (pg_temp.g('ab03'), 'restriction', 'spam', now() - interval '1 minute', now() + interval '1 day', pg_temp.g('ab01'));

do $$
declare
  r jsonb;
  bad text[] := '{}';
begin
  -- 4. Goals met: Under review, with the date and version; earnings stay locked until the founder's review.
  r := pg_temp.call('ab02', 'select public.app_my_progress()');
  if r -> 'creator' ->> 'status' <> 'under_review' or r -> 'creator' ->> 'qualified_at' is null
     or (select version_id from sim.qualifications where member_id = pg_temp.g('ab02') and audience = 'creator')
        <> (select max(id) from sim.goal_versions where audience = 'creator') then
    bad := bad || ('creator not under review: ' || (r -> 'creator')::text);
  end if;
  if pg_temp.money(r, 'creator', 'locked_cents') <> 6000 or pg_temp.money(r, 'creator', 'eligible_cents') <> 0 then
    bad := bad || ('creator earnings not locked before review: ' || (r -> 'earnings')::text);
  end if;
  if r -> 'consumer' ->> 'status' <> 'in_progress' then bad := bad || 'C has a consumer status without meeting consumer goals'::text; end if;
  -- A restriction in force: U meets every goal but is not recorded.
  r := pg_temp.call('ab03', 'select public.app_my_progress()');
  if r -> 'consumer' ->> 'status' <> 'in_progress' then bad := bad || ('a restricted member was recorded: ' || (r -> 'consumer')::text); end if;
  begin
    insert into sim.creator_share_states (revenue_entry_id, state, set_by) select id, 'eligible', 'test' from prg_ids where k = 'e1';
    bad := bad || 'release before the review was accepted'::text;
  exception when others then
    if sqlerrm <> 'not_qualified' then bad := bad || ('unexpected: ' || sqlerrm); end if;
  end;
  -- Only the founder decides; approval needs goals met; once only.
  if pg_temp.call('ab02', $q$select to_jsonb(public.app_founder_decide_qualification(pg_temp.g('ab02'), 'creator', 'approved', 'self'))$q$) ->> 'error' is null then
    bad := bad || 'a member approved themselves'::text;
  end if;
  if pg_temp.call('ab01', $q$select to_jsonb(public.app_founder_decide_qualification(pg_temp.g('ab03'), 'consumer', 'approved', 'too early'))$q$) ->> 'error' <> 'goals_not_met' then
    bad := bad || 'approval without goals met was accepted'::text;
  end if;
  if cardinality(bad) > 0 then raise exception 'FAIL: progression (review): %', bad; end if;
  raise notice 'PASS: progression: meeting every goal records the date and goal version and puts the member Under review; earnings stay locked until the founder''s documented approval; a restriction prevents it; only the founder decides';
end $$;

do $$
declare
  r jsonb;
  bad text[] := '{}';
  v_e1 bigint := (select id from prg_ids where k = 'e1');
  v_e2 bigint := (select id from prg_ids where k = 'e2');
begin
  -- 5. Approved: qualified; a hold on one entry pauses only that entry.
  perform pg_temp.call('ab01', $q$select to_jsonb(public.app_founder_place_hold(pg_temp.g('ab02'), 'creator_entry', (select id from prg_ids where k = 'e1'), null,
                                                       'refund dispute under review', 'case-17', null, 'One advertising entry is being checked.'))$q$);
  if pg_temp.call('ab01', $q$select to_jsonb(public.app_founder_place_hold(pg_temp.g('ab02'), 'account', null, null, 'broad', null, 'short', 'msg'))$q$) ->> 'error' <> 'justification_required' then
    bad := bad || 'an account-wide hold without a justification was accepted'::text;
  end if;
  perform pg_temp.call('ab01', $q$select to_jsonb(public.app_founder_decide_qualification(pg_temp.g('ab02'), 'creator', 'approved', 'integrity review passed', 'review-1'))$q$);
  if pg_temp.call('ab01', $q$select to_jsonb(public.app_founder_decide_qualification(pg_temp.g('ab02'), 'creator', 'approved', 'again'))$q$) ->> 'error' <> 'decision_not_allowed' then
    bad := bad || 'a second approval was accepted'::text;
  end if;
  r := pg_temp.call('ab02', 'select public.app_my_progress()');
  if r -> 'creator' ->> 'status' <> 'qualified' then bad := bad || ('approved creator not qualified: ' || (r -> 'creator')::text); end if;
  if pg_temp.money(r, 'creator', 'eligible_cents') <> 2000 or pg_temp.money(r, 'creator', 'paused_cents') <> 4000 or pg_temp.money(r, 'creator', 'locked_cents') <> 0 then
    bad := bad || ('a targeted hold did not pause only its entry: ' || (r -> 'earnings')::text);
  end if;
  if not exists (select 1 from jsonb_array_elements(r -> 'notices') n where n ->> 'kind' = 'hold' and n ->> 'message' = 'One advertising entry is being checked.')
     or (r -> 'notices')::text ~ 'refund dispute|case-17' then
    bad := bad || ('the hold notice is missing or exposes the internal reason: ' || (r -> 'notices')::text);
  end if;
  -- 6. A refund is a compensating entry: never larger than what is left; the original is unchanged.
  if pg_temp.call('ab01', format($q$select to_jsonb(public.app_founder_correct_revenue(%s, -6000, 'refund', 'too much', null))$q$, v_e2)) ->> 'error' <> 'correction_too_large' then
    bad := bad || 'a refund larger than the entry was accepted'::text;
  end if;
  perform pg_temp.call('ab01', format($q$select to_jsonb(public.app_founder_correct_revenue(%s, -2500, 'refund', 'advertiser refund', 'refund-9'))$q$, v_e2));
  begin
    update sim.revenue_entries set net_cents = 0 where id = v_e2;
    bad := bad || 'a revenue entry was edited'::text;
  exception when others then null;
  end;
  r := pg_temp.call('ab02', 'select public.app_my_progress()');
  if pg_temp.money(r, 'creator', 'accumulated_cents') <> 5000 or pg_temp.money(r, 'creator', 'eligible_cents') <> 1000 then
    bad := bad || ('the refund is not reflected once: ' || (r -> 'earnings')::text);
  end if;
  if cardinality(bad) > 0 then raise exception 'FAIL: progression (approval, holds, corrections): %', bad; end if;
  raise notice 'PASS: progression: the founder''s approval releases the creator share; a targeted hold pauses only its entry and shows the member a plain message, not the internal reason; an account hold needs a justification; a refund is a compensating entry, never larger than what is left';
end $$;

-- 7. Option A: U and W both hold approved redeemable points at a close; U then qualifies, W does not.
select pg_temp.award('ab04', 'qualified_referral', null, interval '0', 'rw', 'approved');
begin;
select pg_temp.as_member('ab01');
set local role authenticated;
insert into prg_ids select 'set1', c.settlement_id from public.app_founder_close_month('2003-04-01') c;
commit;
insert into ops.enforcement_lifts (enforcement_id, actor_id, via)
select e.id, pg_temp.g('ab01'), 'moderator' from ops.enforcements e where e.member_id = pg_temp.g('ab03') and e.level = 'restriction';

do $$
declare
  r jsonb;
  bad text[] := '{}';
  v_set bigint := (select id from prg_ids where k = 'set1');
  u_value bigint := (select value_cents from sim.settlement_lines where settlement_id = (select id from prg_ids where k = 'set1') and member_id = pg_temp.g('ab03'));
  w_value bigint := (select value_cents from sim.settlement_lines where settlement_id = (select id from prg_ids where k = 'set1') and member_id = pg_temp.g('ab04'));
  v_pool bigint;
begin
  if u_value is null or w_value is null or u_value <= 0 or w_value <= 0 then
    bad := bad || 'qualified and unqualified members did not both take part in the allocation'::text;
  end if;
  if exists (select 1 from sim.outstanding() o where o.member_id in (pg_temp.g('ab03'), pg_temp.g('ab04'))) then
    bad := bad || 'allocated points can enter another pool'::text;
  end if;
  r := pg_temp.call('ab03', 'select public.app_my_progress()');
  if r -> 'consumer' ->> 'status' <> 'under_review' or pg_temp.money(r, 'consumer', 'locked_cents') <> u_value then
    bad := bad || ('U not under review with a locked allocation: ' || r::text);
  end if;
  perform pg_temp.call('ab01', $q$select to_jsonb(public.app_founder_decide_qualification(pg_temp.g('ab03'), 'consumer', 'approved', 'integrity review passed'))$q$);
  r := pg_temp.call('ab03', 'select public.app_my_progress()');
  if r -> 'consumer' ->> 'status' <> 'qualified' or pg_temp.money(r, 'consumer', 'eligible_cents') <> u_value then
    bad := bad || ('U''s allocation not unlocked: ' || (r -> 'earnings')::text);
  end if;
  -- Creator and consumer qualification are independent within one account.
  if r -> 'creator' ->> 'status' <> 'in_progress' then bad := bad || 'consumer qualification leaked into the creator journey'::text; end if;
  r := pg_temp.call('ab04', 'select public.app_my_progress()');
  if pg_temp.money(r, 'consumer', 'locked_cents') <> w_value then bad := bad || ('W''s allocation not locked: ' || (r -> 'earnings')::text); end if;
  -- An invalid referral found after the close: a correction returns W's value to the open pool.
  v_pool := sim.open_pool_cents();
  perform pg_temp.call('ab01', format($q$select to_jsonb(public.app_founder_correct_allocation(%s, pg_temp.g('ab04'), %s, 'invalid_activity', 'referral found invalid', 'case-21'))$q$, v_set, -w_value));
  if sim.open_pool_cents() <> v_pool + w_value then bad := bad || 'the corrected value did not return to the pool'::text; end if;
  r := pg_temp.call('ab04', 'select public.app_my_progress()');
  if pg_temp.money(r, 'consumer', 'accumulated_cents') <> 0 then bad := bad || ('W''s correction not reflected: ' || (r -> 'earnings')::text); end if;
  if cardinality(bad) > 0 then raise exception 'FAIL: progression (Option A): %', bad; end if;
  raise notice 'PASS: progression: Option A: qualified and unqualified members take part in one close, allocated points never enter another pool, the unqualified value stays locked, approval unlocks it, and a correction returns invalid value to the open pool';
end $$;

do $$
declare
  r jsonb;
  bad text[] := '{}';
begin
  -- 8. Settlement: only released, unheld amounts; once.
  r := pg_temp.call('ab01', $q$select public.app_founder_settle_eligible('test statement')$q$);
  if (r ->> 'creator_entries')::int <> 2 or (r ->> 'consumer_allocations')::int < 1 then bad := bad || ('settlement counts: ' || r::text); end if;
  r := pg_temp.call('ab01', $q$select public.app_founder_settle_eligible('test statement again')$q$);
  if r <> '{"creator_entries": 0, "consumer_allocations": 0}'::jsonb then bad := bad || ('settled twice: ' || r::text); end if;
  r := pg_temp.call('ab02', 'select public.app_my_progress()');
  if pg_temp.money(r, 'creator', 'settled_cents') <> 1000 or pg_temp.money(r, 'creator', 'paused_cents') <> 4000 then
    bad := bad || ('settlement totals: ' || (r -> 'earnings')::text);
  end if;
  -- Releasing the hold makes the held entry unlocked.
  r := pg_temp.call('ab01', format($q$select to_jsonb(public.app_founder_release_hold(%s, 'dispute closed'))$q$,
                                   (select max(id) from sim.financial_holds where member_id = pg_temp.g('ab02'))));
  if r ->> 'error' is not null then bad := bad || ('release hold: ' || r::text); end if;
  r := pg_temp.call('ab02', 'select public.app_my_progress()');
  if pg_temp.money(r, 'creator', 'eligible_cents') <> 4000 or pg_temp.money(r, 'creator', 'paused_cents') <> 0 then
    bad := bad || ('releasing the hold did not unlock: ' || (r -> 'earnings')::text);
  end if;
  -- 9. Maintaining qualification: a follower leaves and the goals rise; C stays qualified.
  r := pg_temp.call('ab04', $q$select to_jsonb(1) from (select public.app_unfollow(pg_temp.g('ab02'))) x$q$);
  if r ->> 'error' is not null or exists (select 1 from social.follows where follower_id = pg_temp.g('ab04') and creator_id = pg_temp.g('ab02')) then
    bad := bad || ('W could not unfollow: ' || r::text);
  end if;
  perform pg_temp.call('ab01', $q$select to_jsonb(public.app_founder_set_goals('creator', '{"original_posts": 50, "posting_weeks": 4, "genuine_followers": 500, "clique_connections": 50, "returning_supporters": 50}', 'raised'))$q$);
  r := pg_temp.call('ab02', 'select public.app_my_progress()');
  if r -> 'creator' ->> 'status' <> 'qualified' then bad := bad || 'a decline or a goal change took away a qualification'::text; end if;
  -- 10. Revocation: documented, with evidence and a message; amounts stay attributed (locked), nothing is taken.
  if pg_temp.call('ab01', $q$select to_jsonb(public.app_founder_decide_qualification(pg_temp.g('ab02'), 'creator', 'revoked', 'fraud'))$q$) ->> 'error' <> 'evidence_required' then
    bad := bad || 'a revocation without evidence was accepted'::text;
  end if;
  perform pg_temp.call('ab01', $q$select to_jsonb(public.app_founder_decide_qualification(pg_temp.g('ab02'), 'creator', 'revoked', 'confirmed purchased followers', 'case-30',
                                                       'Your creator qualification was revoked after a review. You can appeal.'))$q$);
  r := pg_temp.call('ab02', 'select public.app_my_progress()');
  if r -> 'creator' ->> 'status' <> 'revoked' or pg_temp.money(r, 'creator', 'accumulated_cents') <> 5000
     or pg_temp.money(r, 'creator', 'settled_cents') <> 1000 or pg_temp.money(r, 'creator', 'locked_cents') <> 4000 then
    bad := bad || ('revocation: ' || r::text);
  end if;
  if not exists (select 1 from jsonb_array_elements(r -> 'notices') n where n ->> 'kind' = 'revoked' and n ->> 'message' ~ 'You can appeal') then
    bad := bad || 'the member is not told about the revocation'::text;
  end if;
  -- Restored after an appeal.
  perform pg_temp.call('ab01', $q$select to_jsonb(public.app_founder_decide_qualification(pg_temp.g('ab02'), 'creator', 'restored', 'appeal upheld', 'appeal-4'))$q$);
  r := pg_temp.call('ab02', 'select public.app_my_progress()');
  if r -> 'creator' ->> 'status' <> 'qualified' or pg_temp.money(r, 'creator', 'eligible_cents') <> 4000 then
    bad := bad || ('restoration: ' || r::text);
  end if;
  if cardinality(bad) > 0 then raise exception 'FAIL: progression (settlement, maintenance, revocation): %', bad; end if;
  raise notice 'PASS: progression: settlement only of released, unheld amounts, once; a released hold unlocks; declines and goal changes keep a qualification; revocation needs evidence and a message, keeps amounts attributed, and an appeal restores it';
end $$;

do $$
declare
  r jsonb;
  bad text[] := '{}';
begin
  -- 11. Private, append-only; the founder scorecard; members cannot see it.
  begin
    delete from sim.qualification_decisions;
    bad := bad || 'a decision was deleted'::text;
  exception when others then null;
  end;
  begin
    delete from sim.financial_holds;
    bad := bad || 'a hold was deleted'::text;
  exception when others then null;
  end;
  if has_table_privilege('authenticated', 'sim.qualification_decisions', 'select') or has_table_privilege('authenticated', 'sim.financial_holds', 'select')
     or has_table_privilege('authenticated', 'sim.allocation_corrections', 'insert') then
    bad := bad || 'members can reach the decision, hold or correction tables'::text;
  end if;
  if pg_temp.call('ab02', 'select public.app_founder_progression_report()') ->> 'error' is null then bad := bad || 'a member read the scorecard'::text; end if;
  r := pg_temp.call('ab01', 'select public.app_founder_progression_report()');
  if (r -> 'creator' ->> 'denominator') is null or (r -> 'statuses' -> 'creator' ->> 'qualified')::int < 1
     or (r -> 'referrals' ->> 'qualified_referrals')::int < 2 or (r -> 'integrity' ->> 'revocations')::int < 1 or r -> 'money' ->> 'kind' <> 'simulated' then
    bad := bad || ('scorecard: ' || r::text);
  end if;
  r := pg_temp.call('ab01', 'select public.app_founder_progression_queue()');
  if not exists (select 1 from jsonb_array_elements(r -> 'members') m where m ->> 'username' = 'prg_c' and m ->> 'status' = 'qualified') then
    bad := bad || ('queue: ' || r::text);
  end if;
  if cardinality(bad) > 0 then raise exception 'FAIL: progression (privacy, scorecard): %', bad; end if;
  raise notice 'PASS: progression: decisions, holds and corrections are private and append-only; the founder sees the queue and a labelled scorecard; members cannot';
end $$;

-- 12. Switch off: progress hidden; every record kept.
begin;
select pg_temp.as_member('ab01');
set local role authenticated;
select public.app_founder_set_switch('progression', false, 'progression test done');
commit;
do $$
begin
  if pg_temp.call('ab02', 'select public.app_my_progress()') <> '{"enabled": false}'::jsonb
     or (select count(*) from sim.qualification_decisions where member_id = pg_temp.g('ab02')) <> 3
     or not exists (select 1 from sim.qualifications where member_id = pg_temp.g('ab02')) then
    raise exception 'FAIL: progression (switch off): progress still shown or records changed';
  end if;
  raise notice 'PASS: progression: switching it off hides progress and keeps every qualification, decision and ledger record';
end $$;
