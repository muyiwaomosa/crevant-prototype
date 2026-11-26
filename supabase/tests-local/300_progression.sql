-- TEST ONLY (throwaway databases). Progression (20261217000000): goals,
-- qualification and simulated locked earnings.
--
--   F = ...ab01 founder   C = ...ab02 creator   U = ...ab03 consumer
--   W = ...ab04 a follower of C
\set ON_ERROR_STOP on

set role supabase_auth_admin;
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
select ('00000000-0000-4000-8000-a1a1a1a1' || n)::uuid, 'pr-' || n || '@example.test', now(), '{}'
from unnest(array['ab01', 'ab02', 'ab03', 'ab04']) n;
reset role;
update public.profiles p set username = 'prg_' || v.u, display_name = 'Prg ' || upper(v.u)
from (values ('ab01', 'f'), ('ab02', 'c'), ('ab03', 'u'), ('ab04', 'w')) v(n, u)
where p.id = ('00000000-0000-4000-8000-a1a1a1a1' || v.n)::uuid;
update ops.member_launch_settings set founder_user_id = '00000000-0000-4000-8000-a1a1a1a1ab01' where id;
select ops.grant_member_access('00000000-0000-4000-8000-a1a1a1a1ab01', 'founder', 'pr-test');
select ops.grant_member_access(('00000000-0000-4000-8000-a1a1a1a1' || n)::uuid, 'fan', 'pr-test') from unnest(array['ab02', 'ab03', 'ab04']) n;

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

-- C has two posts, W follows C and keeps C in their Clique; U reads, saves and comments on C's post.
insert into social.posts (id, author_id, body) values
  (pg_temp.g('cc01'), pg_temp.g('ab02'), 'First post by C'),
  (pg_temp.g('cc02'), pg_temp.g('ab02'), 'Second post by C');
insert into social.follows (follower_id, creator_id) values (pg_temp.g('ab04'), pg_temp.g('ab02')), (pg_temp.g('ab03'), pg_temp.g('ab02'));
insert into social.clique_members (fan_id, creator_id) values (pg_temp.g('ab04'), pg_temp.g('ab02')), (pg_temp.g('ab03'), pg_temp.g('ab02'));

-- Simulated revenue for C in an earlier month, and a month close where U holds approved points.
create temporary table pr_ids (k text primary key, id bigint);
grant all on pr_ids to authenticated;

do $$
declare
  r jsonb;
  bad text[] := '{}';
begin
  -- 1. The switch is off by default: nothing shows, nothing is checked.
  if ops.feature_on('progression') then bad := bad || 'progression is on by default'::text; end if;
  r := pg_temp.call('ab02', 'select public.app_my_progress()');
  if r <> '{"enabled": false}'::jsonb then bad := bad || ('switch off still shows progress: ' || r::text); end if;
  if (pg_temp.call('ab02', 'select public.app_features()') ->> 'progression')::boolean then bad := bad || 'features report progression on'::text; end if;

  -- 2. Only the founder sets goals; every measure needs a whole value of 1 or more, and a reason.
  r := pg_temp.call('ab02', $q$select to_jsonb(public.app_founder_set_goals('creator', '{"original_posts": 1}', 'member tries'))$q$);
  if r ->> 'error' is null then bad := bad || 'a member set goals'::text; end if;
  r := pg_temp.call('ab01', $q$select to_jsonb(public.app_founder_set_goals('creator', '{"original_posts": 2}', 'only one value'))$q$);
  if r ->> 'error' <> 'every_goal_needs_a_value' then bad := bad || ('partial goals accepted: ' || r::text); end if;
  r := pg_temp.call('ab01', $q$select to_jsonb(public.app_founder_set_goals('creator', '{"original_posts": 0, "posting_weeks": 1, "genuine_followers": 1, "active_supporters": 1, "clique_connections": 1}', 'zero value'))$q$);
  if r ->> 'error' <> 'every_goal_needs_a_value' then bad := bad || ('zero target accepted: ' || r::text); end if;
  r := pg_temp.call('ab01', $q$select to_jsonb(public.app_founder_set_goals('creator', '{"original_posts": 1.5, "posting_weeks": 1, "genuine_followers": 1, "active_supporters": 1, "clique_connections": 1}', 'fraction'))$q$);
  if r ->> 'error' <> 'every_goal_needs_a_value' then bad := bad || ('fractional target accepted: ' || r::text); end if;
  r := pg_temp.call('ab01', $q$select to_jsonb(public.app_founder_set_goals('creator', '{"original_posts": 1, "posting_weeks": 1, "genuine_followers": 1, "active_supporters": 1, "clique_connections": 1, "likes": 1}', 'unknown goal'))$q$);
  if r ->> 'error' <> 'unknown_goal' then bad := bad || ('unknown goal accepted: ' || r::text); end if;
  r := pg_temp.call('ab01', $q$select to_jsonb(public.app_founder_set_goals('creator', '{"original_posts": 1, "posting_weeks": 1, "genuine_followers": 1, "active_supporters": 1, "clique_connections": 1}', ''))$q$);
  if r ->> 'error' <> 'reason_required' then bad := bad || ('goals without a reason accepted: ' || r::text); end if;
  if exists (select 1 from sim.goal_versions) then bad := bad || 'a refused goal change was recorded'::text; end if;
  if cardinality(bad) > 0 then raise exception 'FAIL: progression (switch, goal validation): %', bad; end if;
  raise notice 'PASS: progression is off by default and shows nothing; only the founder sets goals, every measure with a whole value and a reason';
end $$;

-- Turn the switch on (founder, recorded with a reason).
begin;
select pg_temp.as_member('ab01');
set local role authenticated;
select public.app_founder_set_switch('progression', true, 'progression test');
commit;

-- Simulated revenue: one content advertising entry for C (last month), and U holds approved redeemable points at a close.
begin;
select pg_temp.as_member('ab01');
set local role authenticated;
insert into pr_ids select 'rev1', public.app_founder_record_sim_revenue('2003-03-01', 'content_ad', pg_temp.g('ab02'), pg_temp.g('cc01'), 10000, 'progression test');
commit;
insert into sim.points_ledger (member_id, action, points, redeemable, status, rule_version, source_key)
values (pg_temp.g('ab03'), 'qualified_referral', 100, true, 'approved', 'd6-v1', 'pr-test-award-1');
begin;
select pg_temp.as_member('ab01');
set local role authenticated;
insert into pr_ids select 'set1', c.settlement_id from public.app_founder_close_month('2003-03-01') c;
commit;

do $$
declare
  r jsonb;
  steps jsonb;
  bad text[] := '{}';
  v_set bigint := (select id from pr_ids where k = 'set1');
  v_rev bigint := (select id from pr_ids where k = 'rev1');
begin
  -- 3. Unset goals never qualify, and earnings stay locked (not absorbed, not lost).
  r := pg_temp.call('ab02', 'select public.app_my_progress()');
  if not (r ->> 'enabled')::boolean then bad := bad || 'switch on but progress disabled'::text; end if;
  steps := r -> 'creator' -> 'steps';
  if jsonb_array_length(steps) <> 5 or exists (select 1 from jsonb_array_elements(steps) s where s ->> 'target' is not null) then
    bad := bad || ('steps without goals show targets: ' || steps::text);
  end if;
  if (select (s ->> 'value')::int from jsonb_array_elements(steps) s where s ->> 'metric' = 'original_posts') <> 2
     or (select (s ->> 'value')::int from jsonb_array_elements(steps) s where s ->> 'metric' = 'genuine_followers') <> 2
     or (select (s ->> 'value')::int from jsonb_array_elements(steps) s where s ->> 'metric' = 'clique_connections') <> 2 then
    bad := bad || ('creator measures wrong: ' || steps::text);
  end if;
  if r -> 'creator' ->> 'qualified_at' is not null or exists (select 1 from sim.qualifications) then
    bad := bad || 'an unset goal qualified a member'::text;
  end if;
  if (r -> 'earnings' -> 'creator' ->> 'accumulated_cents')::int <> 4000 or (r -> 'earnings' -> 'creator' ->> 'locked_cents')::int <> 4000
     or (r -> 'earnings' -> 'creator' ->> 'eligible_cents')::int <> 0 then
    bad := bad || ('creator earnings not locked: ' || (r -> 'earnings')::text);
  end if;
  -- Option A: U's approved points took their share at the close; the value is locked.
  r := pg_temp.call('ab03', 'select public.app_my_progress()');
  if (select value_cents from sim.settlement_lines where settlement_id = v_set and member_id = pg_temp.g('ab03')) is distinct from (r -> 'earnings' -> 'consumer' ->> 'accumulated_cents')::bigint
     or (r -> 'earnings' -> 'consumer' ->> 'accumulated_cents')::int < 4000
     or (r -> 'earnings' -> 'consumer' ->> 'locked_cents') <> (r -> 'earnings' -> 'consumer' ->> 'accumulated_cents') then
    bad := bad || ('consumer allocation not locked: ' || (r -> 'earnings')::text);
  end if;
  if (select (s ->> 'value')::int from jsonb_array_elements(r -> 'consumer' -> 'steps') s where s ->> 'metric' = 'verified_contributions') <> 1 then
    bad := bad || ('settled referral not counted as a verified contribution: ' || (r -> 'consumer' -> 'steps')::text);
  end if;
  -- Settled points never enter another pool.
  if exists (select 1 from sim.outstanding() o where o.member_id = pg_temp.g('ab03')) then
    bad := bad || 'settled points are still outstanding'::text;
  end if;

  -- 4. The database refuses an eligible state for an unqualified member, and settled before eligible.
  begin
    insert into sim.creator_share_states (revenue_entry_id, state, set_by) values (v_rev, 'eligible', 'test');
    bad := bad || 'eligible state accepted for an unqualified creator'::text;
  exception when others then
    if sqlerrm <> 'not_qualified' then bad := bad || ('unexpected: ' || sqlerrm); end if;
  end;
  begin
    insert into sim.allocation_states (settlement_id, member_id, state, set_by) values (v_set, pg_temp.g('ab03'), 'eligible', 'test');
    bad := bad || 'eligible state accepted for an unqualified consumer'::text;
  exception when others then
    if sqlerrm <> 'not_qualified' then bad := bad || ('unexpected: ' || sqlerrm); end if;
  end;
  if cardinality(bad) > 0 then raise exception 'FAIL: progression (unset goals, locked earnings): %', bad; end if;
  raise notice 'PASS: progression: unset goals show progress but never qualify; creator shares and consumer allocations (Option A) stay locked, and the database refuses to release them early';
end $$;

-- C gets an active supporter (W's meaningful comment) but is under a restriction in force.
insert into social.comments (post_id, author_id, body) values (pg_temp.g('cc01'), pg_temp.g('ab04'), 'This really changed how I think about my mornings, thank you.');
insert into ops.enforcements (member_id, level, reason, starts_at, ends_at, actor_id)
values (pg_temp.g('ab02'), 'restriction', 'spam', now() - interval '1 minute', now() + interval '1 day', pg_temp.g('ab01'));
begin;
select pg_temp.as_member('ab01');
set local role authenticated;
select public.app_founder_set_goals('creator', '{"original_posts": 2, "posting_weeks": 1, "genuine_followers": 2, "active_supporters": 1, "clique_connections": 2}', 'pilot creator goals v1');
select public.app_founder_set_goals('consumer', '{"clique_engagement_weeks": 1, "support_weeks": 1, "shares": 1, "verified_contributions": 1}', 'pilot consumer goals v1');
commit;

do $$
declare
  r jsonb;
  bad text[] := '{}';
begin
  -- 5. Integrity is a gate: a restriction in force blocks qualification.
  r := pg_temp.call('ab02', 'select public.app_my_progress()');
  if (r ->> 'good_standing')::boolean or r -> 'creator' ->> 'qualified_at' is not null then
    bad := bad || ('a restricted creator qualified: ' || r::text);
  end if;
  if exists (select 1 from jsonb_array_elements(r -> 'creator' -> 'steps') s where (s ->> 'value')::int < (s ->> 'target')::int) then
    bad := bad || ('creator should meet every goal here: ' || (r -> 'creator' -> 'steps')::text);
  end if;
  if (r -> 'earnings' -> 'creator' ->> 'locked_cents')::int <> 4000 then bad := bad || 'restricted creator share released'::text; end if;
  -- 6. Lifted: C qualifies once, and the locked share becomes eligible.
  insert into ops.enforcement_lifts (enforcement_id, actor_id, via)
  select e.id, pg_temp.g('ab01'), 'moderator' from ops.enforcements e where e.member_id = pg_temp.g('ab02');
  r := pg_temp.call('ab02', 'select public.app_my_progress()');
  if r -> 'creator' ->> 'qualified_at' is null then bad := bad || ('creator who met every goal not qualified: ' || r::text); end if;
  if (r -> 'earnings' -> 'creator' ->> 'locked_cents')::int <> 0 or (r -> 'earnings' -> 'creator' ->> 'eligible_cents')::int <> 4000 then
    bad := bad || ('qualified creator share not released: ' || (r -> 'earnings')::text);
  end if;
  perform pg_temp.call('ab02', 'select public.app_my_progress()');
  if (select count(*) from sim.creator_share_states s join sim.revenue_entries e on e.id = s.revenue_entry_id where e.creator_id = pg_temp.g('ab02')) <> 1
     or (select count(*) from sim.qualifications where member_id = pg_temp.g('ab02')) <> 1 then
    bad := bad || 'repeating the check recorded a second state or qualification'::text;
  end if;
  -- 7. U is short of the consumer goals (no Clique engagement week, no support week, no share): still locked.
  r := pg_temp.call('ab03', 'select public.app_my_progress()');
  if r -> 'consumer' ->> 'qualified_at' is not null or (r -> 'earnings' -> 'consumer' ->> 'eligible_cents')::int <> 0 then
    bad := bad || ('consumer qualified without meeting goals: ' || r::text);
  end if;
  if cardinality(bad) > 0 then raise exception 'FAIL: progression (qualification): %', bad; end if;
  raise notice 'PASS: progression: a restriction in force blocks qualification; once lifted, a creator who meets every goal qualifies once and their locked share becomes eligible; a consumer short of a goal stays locked';
end $$;

-- The founder raises the creator goals: C stays qualified (no retrospective disadvantage).
begin;
select pg_temp.as_member('ab01');
set local role authenticated;
select public.app_founder_set_goals('creator', '{"original_posts": 50, "posting_weeks": 4, "genuine_followers": 50, "active_supporters": 5, "clique_connections": 10}', 'pilot creator goals v2');
commit;
-- U comments meaningfully on a post by C (in U's Clique) and shares it.
insert into social.comments (post_id, author_id, body) values (pg_temp.g('cc02'), pg_temp.g('ab03'), 'I tried this with my family last night and it worked well.');
insert into social.shares (member_id, post_id, channel) values (pg_temp.g('ab03'), pg_temp.g('cc02'), 'copy_link');
-- A second content advertising entry for C after qualification.
begin;
select pg_temp.as_member('ab01');
set local role authenticated;
insert into pr_ids select 'rev2', public.app_founder_record_sim_revenue('2003-04-01', 'content_ad', pg_temp.g('ab02'), pg_temp.g('cc02'), 5000, 'progression test 2');
commit;

do $$
declare
  r jsonb;
  bad text[] := '{}';
  v_rev2 bigint := (select id from pr_ids where k = 'rev2');
begin
  -- 8. Settled before eligible is refused, even for a qualified creator.
  begin
    insert into sim.creator_share_states (revenue_entry_id, state, set_by) values (v_rev2, 'settled', 'test');
    bad := bad || 'settled before eligible accepted'::text;
  exception when others then
    if sqlerrm <> 'not_eligible' then bad := bad || ('unexpected: ' || sqlerrm); end if;
  end;
  r := pg_temp.call('ab02', 'select public.app_my_progress()');
  if r -> 'creator' ->> 'qualified_at' is null then bad := bad || 'raising the goals took away a qualification'::text; end if;
  if (r -> 'earnings' -> 'creator' ->> 'accumulated_cents')::int <> 6000 or (r -> 'earnings' -> 'creator' ->> 'eligible_cents')::int <> 6000 then
    bad := bad || ('new share of a qualified creator not eligible: ' || (r -> 'earnings')::text);
  end if;
  -- 9. U now meets every consumer goal: qualified, and the locked allocation becomes eligible.
  r := pg_temp.call('ab03', 'select public.app_my_progress()');
  if r -> 'consumer' ->> 'qualified_at' is null or (r -> 'earnings' -> 'consumer' ->> 'locked_cents')::int <> 0
     or (r -> 'earnings' -> 'consumer' ->> 'eligible_cents') <> (r -> 'earnings' -> 'consumer' ->> 'accumulated_cents') then
    bad := bad || ('consumer who met every goal not released: ' || r::text);
  end if;
  if cardinality(bad) > 0 then raise exception 'FAIL: progression (goal changes, consumer release): %', bad; end if;
  raise notice 'PASS: progression: raising the goals keeps earlier qualifications; new shares of a qualified creator are eligible; settled before eligible is refused; a consumer who meets every goal has their locked allocation released';
end $$;

-- C is suspended for a day after qualifying, and a third entry arrives.
insert into ops.enforcements (member_id, level, reason, starts_at, ends_at, actor_id)
values (pg_temp.g('ab02'), 'suspension', 'spam', now() - interval '1 minute', now() + interval '1 day', pg_temp.g('ab01'));
begin;
select pg_temp.as_member('ab01');
set local role authenticated;
insert into pr_ids select 'rev3', public.app_founder_record_sim_revenue('2003-05-01', 'content_ad', pg_temp.g('ab02'), pg_temp.g('cc02'), 2500, 'progression test 3');
commit;

do $$
declare
  r jsonb;
  bad text[] := '{}';
begin
  -- 10. Integrity at every step: under a suspension nothing new is released or settled.
  perform sim.release_qualified(pg_temp.g('ab02'));
  if exists (select 1 from sim.creator_share_states where revenue_entry_id = (select id from pr_ids where k = 'rev3')) then
    bad := bad || 'a suspended creator had a new share released'::text;
  end if;
  r := pg_temp.call('ab01', $q$select public.app_founder_settle_eligible('test settle while suspended')$q$);
  if r <> '{"creator_entries": 0, "consumer_allocations": 1}'::jsonb then bad := bad || ('a suspended creator was settled: ' || r::text); end if;
  -- Lifted: the third entry is released and everything eligible settles.
  insert into ops.enforcement_lifts (enforcement_id, actor_id, via)
  select e.id, pg_temp.g('ab01'), 'appeal' from ops.enforcements e
  where e.member_id = pg_temp.g('ab02') and e.level = 'suspension';
  r := pg_temp.call('ab02', 'select public.app_my_progress()');
  if (r -> 'earnings' -> 'creator' ->> 'eligible_cents')::int <> 7000 then bad := bad || ('creator share not released after the lift: ' || (r -> 'earnings')::text); end if;
  if cardinality(bad) > 0 then raise exception 'FAIL: progression (integrity after qualifying): %', bad; end if;
  raise notice 'PASS: progression: under a suspension nothing new is released or settled; after the lift it is';
end $$;

do $$
declare
  r jsonb;
  bad text[] := '{}';
begin
  -- 11. Simulated settlement: once, idempotent, never twice.
  r := pg_temp.call('ab02', $q$select public.app_founder_settle_eligible('test settle')$q$);
  if r ->> 'error' is null then bad := bad || 'a member settled earnings'::text; end if;
  r := pg_temp.call('ab01', $q$select public.app_founder_settle_eligible('test settle')$q$);
  if r <> '{"creator_entries": 3, "consumer_allocations": 0}'::jsonb then bad := bad || ('settlement counts wrong: ' || r::text); end if;
  r := pg_temp.call('ab01', $q$select public.app_founder_settle_eligible('test settle again')$q$);
  if r <> '{"creator_entries": 0, "consumer_allocations": 0}'::jsonb then bad := bad || ('settled twice: ' || r::text); end if;
  r := pg_temp.call('ab02', 'select public.app_my_progress()');
  if (r -> 'earnings' -> 'creator' ->> 'settled_cents')::int <> 7000 or (r -> 'earnings' -> 'creator' ->> 'eligible_cents')::int <> 0 then
    bad := bad || ('creator settlement totals wrong: ' || (r -> 'earnings')::text);
  end if;
  -- 12. Append-only and private.
  begin
    update sim.creator_share_states set state = 'eligible';
    bad := bad || 'a state was changed'::text;
  exception when others then null;
  end;
  begin
    delete from sim.qualifications;
    bad := bad || 'a qualification was deleted'::text;
  exception when others then null;
  end;
  if has_table_privilege('authenticated', 'sim.goal_versions', 'select') or has_table_privilege('authenticated', 'sim.qualifications', 'select')
     or has_table_privilege('authenticated', 'sim.creator_share_states', 'insert') or has_table_privilege('authenticated', 'sim.allocation_states', 'insert') then
    bad := bad || 'members can reach progression tables directly'::text;
  end if;
  -- 13. The founder sees every version with its reason and the qualified counts.
  r := pg_temp.call('ab01', 'select public.app_founder_goals()');
  if jsonb_array_length(r -> 'versions') <> 3 or (r -> 'qualified' ->> 'creator')::int <> 1 or (r -> 'qualified' ->> 'consumer')::int <> 1
     or (r -> 'versions' -> 0 ->> 'reason') <> 'pilot creator goals v2' then
    bad := bad || ('founder goal history wrong: ' || r::text);
  end if;
  if cardinality(bad) > 0 then raise exception 'FAIL: progression (settlement, history): %', bad; end if;
  raise notice 'PASS: progression: simulated settlement happens once per eligible amount; states and versions are append-only and private; the founder sees every goal version with its reason';
end $$;

-- 14. Switch off again: progress hidden, nothing checked; recorded states stay.
begin;
select pg_temp.as_member('ab01');
set local role authenticated;
select public.app_founder_set_switch('progression', false, 'progression test done');
commit;
do $$
begin
  if pg_temp.call('ab02', 'select public.app_my_progress()') <> '{"enabled": false}'::jsonb
     or (select count(*) from sim.creator_share_states) <> 6 then
    raise exception 'FAIL: progression (switch off): progress still shown or states changed';
  end if;
  raise notice 'PASS: progression: switching it off hides progress and leaves every recorded state as it was';
end $$;
