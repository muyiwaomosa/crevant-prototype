-- TEST ONLY (throwaway databases). 20261219000000: the pilot simulated
-- balance closure on account deletion, the SP-PRG-001 activation
-- definitions, and routine versus flagged qualification review.
--
--   F = ...cd01 founder   D = ...cd02 member who asks to be deleted
--   A = ...cd03 consumer  C1..C3 = ...cd04..cd06 creators   R = ...cd07 reporter
\set ON_ERROR_STOP on

set role supabase_auth_admin;
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
select ('00000000-0000-4000-8000-b2b2b2b2' || n)::uuid, 'cat-' || n || '@example.test', now(), '{}'
from unnest(array['cd01', 'cd02', 'cd03', 'cd04', 'cd05', 'cd06', 'cd07']) n;
reset role;
update public.profiles p set username = 'cat_' || n, display_name = 'Cat ' || upper(n)
from unnest(array['cd01', 'cd02', 'cd03', 'cd04', 'cd05', 'cd06', 'cd07']) n
where p.id = ('00000000-0000-4000-8000-b2b2b2b2' || n)::uuid;
update ops.member_launch_settings set founder_user_id = '00000000-0000-4000-8000-b2b2b2b2cd01' where id;
select ops.grant_member_access('00000000-0000-4000-8000-b2b2b2b2cd01', 'founder', 'cat-test');
select ops.grant_member_access(('00000000-0000-4000-8000-b2b2b2b2' || n)::uuid, 'fan', 'cat-test')
from unnest(array['cd02', 'cd03', 'cd04', 'cd05', 'cd06', 'cd07']) n;

create function pg_temp.g(n text) returns uuid language sql immutable as $$ select ('00000000-0000-4000-8000-b2b2b2b2' || n)::uuid $$;
grant execute on function pg_temp.g(text) to authenticated, anon;
create function pg_temp.call(n text, q text) returns jsonb language plpgsql as $$
declare r jsonb;
begin
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-b2b2b2b2' || n || '","role":"authenticated"}', true);
  set local role authenticated;
  execute q into r;
  reset role;
  return r;
exception when others then
  reset role;
  return pg_catalog.jsonb_build_object('error', sqlerrm);
end $$;
grant execute on function pg_temp.call(text, text) to authenticated;
create function pg_temp.award(member text, action text, creator text, key text, status text default 'recognized', ago interval default '0') returns bigint language sql as $$
  insert into sim.points_ledger (member_id, action, points, redeemable, status, rule_version, source_key, creator_id, created_at)
  values (pg_temp.g(member), action, case when action = 'qualified_referral' then 100 else 2 end, action = 'qualified_referral', status, 'd6-v1',
          'cat-' || key, case when creator is null then null else pg_temp.g(creator) end, now() - ago)
  returning id $$;

-- D: a recognition award, an approved referral, a creator share (locked) and a month-close allocation (locked).
insert into social.posts (id, author_id, body) values (pg_temp.g('ee01'), pg_temp.g('cd02'), 'D post');
select pg_temp.award('cd02', 'save', 'cd04', 'd-save');
select pg_temp.award('cd02', 'qualified_referral', null, 'd-ref', 'approved');
select pg_temp.call('cd01', $q$select to_jsonb(public.app_founder_record_sim_revenue('2003-07-01', 'content_ad', pg_temp.g('cd02'), pg_temp.g('ee01'), 10000, 'cat test'))$q$);
select pg_temp.call('cd01', $q$select to_jsonb(c.settlement_id) from public.app_founder_close_month('2003-07-01') c$q$);
-- A second referral after the close: approved, not yet allocated.
select pg_temp.award('cd02', 'qualified_referral', null, 'd-ref2', 'approved');
insert into ops.member_requests (member_id, kind, details) values (pg_temp.g('cd02'), 'deletion', 'Please delete my account.');

do $$
declare
  bad text[] := '{}';
  before jsonb := pg_temp.call('cd02', 'select public.app_my_deletion_consequences()');
  v_req bigint := (select id from ops.member_requests where member_id = pg_temp.g('cd02') and kind = 'deletion');
  v_allocated bigint := (select value_cents from sim.settlement_lines where member_id = pg_temp.g('cd02'));
  v_revenue bigint := (select sum(net_cents) from sim.revenue_entries);
  v_lines bigint := (select sum(value_cents) from sim.settlement_lines);
  v_pool bigint := sim.open_pool_cents();
  r jsonb;
  c sim.balance_closures%rowtype;
begin
  -- 1. Before confirming, the member sees what a deletion would close.
  if (before ->> 'eligible_points')::int <> 100 or (before ->> 'recognition_points')::int <> 2
     or (before ->> 'open_simulated_cents')::bigint <> 4000 + v_allocated then
    bad := bad || ('consequences: ' || before::text);
  end if;
  r := pg_temp.call('cd01', format($q$select public.app_founder_delete_member(%s, 'cat_cd02')$q$, v_req));
  if r ->> 'error' is not null or (r ->> 'closed_cents')::bigint <> 4000 + v_allocated then bad := bad || ('delete: ' || r::text); end if;
  select * into c from sim.balance_closures where request_id = v_req;
  -- 2. One auditable closure with totals only; recognition removed and eligible points cancelled as reversals.
  if not found or c.creator_locked_cents <> 4000 or c.consumer_locked_cents <> v_allocated or c.eligible_points <> 100 or c.recognition_points <> 2 then
    bad := bad || ('closure record: ' || coalesce(row_to_json(c)::text, 'none'));
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'sim' and table_name = 'balance_closures' and column_name ~ 'member|user|email|name') then
    bad := bad || 'the closure keeps personal data'::text;
  end if;
  if exists (select 1 from sim.points_ledger l where l.source_key in ('cat-d-save', 'cat-d-ref2') and sim.award_state(l.id) not in ('reversal')) then
    bad := bad || 'unallocated points were not cancelled'::text;
  end if;
  -- 3. Not Splitpost revenue; settlement history and reconciliation unchanged.
  if (select sum(net_cents) from sim.revenue_entries) <> v_revenue or (select sum(value_cents) from sim.settlement_lines) <> v_lines
     or sim.open_pool_cents() <> v_pool then
    bad := bad || 'closure changed revenue, settlement lines or the pool'::text;
  end if;
  if exists (select 1 from sim.settlements s where s.points > 0 and s.pool_cents <> (select coalesce(sum(value_cents), 0) from sim.settlement_lines l where l.settlement_id = s.id)) then
    bad := bad || 'a closed month no longer reconciles to the cent'::text;
  end if;
  begin
    update sim.balance_closures set eligible_points = 0;
    bad := bad || 'a closure was edited'::text;
  exception when others then null;
  end;
  if cardinality(bad) > 0 then raise exception 'FAIL: pilot balance closure: %', bad; end if;
  raise notice 'PASS: pilot balance closure: the member sees what deletion closes; one auditable closure with totals only; recognition removed and eligible points cancelled; revenue, settlement lines and the pool unchanged, so nothing becomes Splitpost revenue and every month still reconciles';
end $$;

-- Activation: A follows three creators and engages meaningfully; the Clique step comes last.
insert into social.posts (id, author_id, body) values (pg_temp.g('ee04'), pg_temp.g('cd04'), 'C1 post');
insert into social.follows (follower_id, creator_id) values (pg_temp.g('cd03'), pg_temp.g('cd04')), (pg_temp.g('cd03'), pg_temp.g('cd05')), (pg_temp.g('cd03'), pg_temp.g('cd06'));
select pg_temp.award('cd03', 'meaningful_comment', 'cd04', 'a-c1');
create temporary table cat_counts as select pg_temp.call('cd01', 'select public.app_founder_activation()') as before;
grant select on cat_counts to authenticated;
insert into social.clique_members (fan_id, creator_id) values (pg_temp.g('cd03'), pg_temp.g('cd04'));

do $$
declare
  bad text[] := '{}';
  b jsonb := (select before from cat_counts);
  r jsonb := pg_temp.call('cd01', 'select public.app_founder_activation()');
begin
  if (r -> 'consumer' ->> 'activated')::int <> (b -> 'consumer' ->> 'activated')::int + 1 then
    bad := bad || ('the Clique step did not complete consumer activation: ' || (r -> 'consumer')::text);
  end if;
  -- C1: an eligible original post and a meaningful audience connection.
  if (r -> 'creator' ->> 'activated')::int < 1 or (r -> 'creator' ->> 'denominator')::int < 1 then bad := bad || ('creator: ' || (r -> 'creator')::text); end if;
  if r ->> 'effective_from' <> '2026-11-26' or r ->> 'transition_until' <> '2026-12-26' or r -> 'consumer_previous' ->> 'definition' is null
     or r -> 'advertiser' ->> 'definition' is null or r ->> 'kind' <> 'actual' or r ->> 'comparability' is null then
    bad := bad || ('definitions: ' || r::text);
  end if;
  if pg_temp.call('cd03', 'select public.app_founder_activation()') ->> 'error' is null then bad := bad || 'a member read activation'::text; end if;
  if cardinality(bad) > 0 then raise exception 'FAIL: activation: %', bad; end if;
  raise notice 'PASS: activation: the SP-PRG-001 creator, consumer and advertiser definitions with denominators and effective dates, the previous consumer metric alongside until 2026-12-26; founder only';
end $$;

-- Triage: C1 meets every creator goal (test values); an open report flags the case.
select pg_temp.call('cd01', $q$select to_jsonb(public.app_founder_set_switch('progression', true, 'triage test'))$q$);
select pg_temp.call('cd01', $q$select to_jsonb(public.app_founder_set_goals('creator', '{"original_posts": 1, "posting_weeks": 1, "genuine_followers": 1, "clique_connections": 1, "returning_supporters": 1}', 'triage test values'))$q$);
insert into social.saves (member_id, post_id, saved_at) values (pg_temp.g('cd03'), pg_temp.g('ee04'), now() - interval '9 days');
insert into social.reposts (reposter_id, post_id) values (pg_temp.g('cd03'), pg_temp.g('ee04'));
insert into ops.content_reports (reporter_id, target_type, target_id, target_owner_id, reason, priority)
values (pg_temp.g('cd07'), 'post', pg_temp.g('ee04'), pg_temp.g('cd04'), 'spam', false);
select pg_temp.call('cd04', 'select public.app_my_progress()');

do $$
declare
  bad text[] := '{}';
  q jsonb := pg_temp.call('cd01', 'select public.app_founder_progression_queue()');
  m jsonb := (select x from jsonb_array_elements(q -> 'members') x where x ->> 'username' = 'cat_cd04');
begin
  if m is null or m ->> 'status' <> 'under_review' or (m ->> 'routine')::boolean
     or m ->> 'pending_reason' !~ 'Flagged for review: an open report' or (m ->> 'waiting_hours') is null then
    bad := bad || ('flagged case: ' || coalesce(m::text, q::text));
  end if;
  if (q -> 'metrics' ->> 'flagged_waiting')::int < 1 or q -> 'metrics' -> 'oldest_waiting_hours' is null then bad := bad || ('metrics: ' || (q -> 'metrics')::text); end if;
  -- The report is dismissed: the same case becomes routine.
  update ops.content_reports set status = 'dismissed', resolved_at = now() where target_owner_id = pg_temp.g('cd04');
  q := pg_temp.call('cd01', 'select public.app_founder_progression_queue()');
  m := (select x from jsonb_array_elements(q -> 'members') x where x ->> 'username' = 'cat_cd04');
  if not (m ->> 'routine')::boolean or m ->> 'pending_reason' !~ 'every routine check passed' then bad := bad || ('routine case: ' || m::text); end if;
  -- Approval stays manual: nothing approved itself.
  if exists (select 1 from sim.qualification_decisions d where d.member_id = pg_temp.g('cd04')) then bad := bad || 'a routine case was approved automatically'::text; end if;
  perform pg_temp.call('cd01', $q$select to_jsonb(public.app_founder_decide_qualification(pg_temp.g('cd04'), 'creator', 'approved', 'routine review'))$q$);
  q := pg_temp.call('cd01', 'select public.app_founder_progression_queue()');
  if (q -> 'metrics' ->> 'approved')::int < 1 or (q -> 'metrics' ->> 'median_turnaround_hours') is null or (q -> 'metrics' ->> 'decisions_7d')::int < 1 then
    bad := bad || ('workload metrics: ' || (q -> 'metrics')::text);
  end if;
  perform pg_temp.call('cd01', $q$select to_jsonb(public.app_founder_set_switch('progression', false, 'triage test done'))$q$);
  if cardinality(bad) > 0 then raise exception 'FAIL: review triage: %', bad; end if;
  raise notice 'PASS: review triage: a case with an open report is flagged with its plain reason and time waiting; once resolved it is routine; approval stays manual; volume, turnaround and revocation metrics are reported';
end $$;
