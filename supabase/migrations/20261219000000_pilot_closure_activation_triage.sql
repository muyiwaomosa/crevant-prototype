-- Founder decisions of Nov 26 on SP-PRG-001 (docs/SP-PRG-001-ALIGNMENT.md,
-- section 9):
--
--   1. Pilot account deletion: a SIMULATED balance closure. Recognition
--      points are removed and unallocated eligible points cancelled (the
--      existing recorded reversals); allocated simulated earnings are closed
--      by an auditable closure record that keeps totals only (no member id,
--      the account is erased). Closed amounts never become Splitpost revenue
--      and settlement history is unchanged, so reconciliation stays exact.
--      Pilot only: no precedent for real money.
--   2. The SP-PRG-001 activation definitions (creator, consumer, advertiser),
--      effective Nov 26, with the previous consumer metric alongside for a
--      30-day transition, through the existing Intelligence Engine.
--   3. Qualification review triage: routine cases (every eligibility check
--      passes) apart from flagged ones (a restriction, hold or open report),
--      with the reason a decision is pending, the time waiting, and review
--      volume, turnaround and revocation rates. Approval stays manual.

-- ---------------------------------------------------------------------------
-- 1. Simulated balance closure

create table sim.balance_closures (
  id                    bigint generated always as identity primary key,
  request_id            bigint,
  reason                text not null check (reason in ('account_deleted')),
  recognition_points    integer not null default 0,
  eligible_points       integer not null default 0,
  creator_locked_cents  bigint not null default 0,
  creator_open_cents    bigint not null default 0,
  creator_settled_cents bigint not null default 0,
  consumer_locked_cents bigint not null default 0,
  consumer_open_cents   bigint not null default 0,
  consumer_settled_cents bigint not null default 0,
  closed_by             text not null,
  closed_at             timestamptz not null default pg_catalog.now()
);
comment on table sim.balance_closures is 'SIMULATED pilot balance closures on account deletion: totals only (the account is erased). Closed amounts are not Splitpost revenue; settlement history is unchanged. Pilot only, never a precedent for real money. Append-only.';
alter table sim.balance_closures enable row level security;
revoke all on table sim.balance_closures from public, anon, authenticated;
create trigger balance_closures_append_only before update or delete on sim.balance_closures
for each row execute function ops.history_append_only();
create trigger balance_closures_no_truncate before truncate on sim.balance_closures
for each statement execute function ops.history_append_only();

create or replace function public.app_founder_delete_member(p_request bigint, p_confirm_username text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_founder();
  r ops.member_requests%rowtype;
  v_username text;
  v_forfeited integer := 0;
  v_recognition integer := 0;
  v_eligible integer := 0;
  v_key text;
  v_posts bigint;
  e jsonb;
begin
  select * into r from ops.member_requests where id = p_request for update;
  if not found or r.kind <> 'deletion' or r.status <> 'open' or r.member_id is null then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  select p.username into v_username from public.profiles p where p.id = r.member_id;
  if v_username is null or v_username <> lower(pg_catalog.btrim(coalesce(p_confirm_username, ''))) then
    raise exception 'confirmation_mismatch' using errcode = 'P0001';
  end if;
  if r.member_id = v_uid or exists (select 1 from ops.member_access a where a.user_id = r.member_id and a.cohort = 'founder') then
    raise exception 'cannot_delete_founder' using errcode = 'P0001';
  end if;
  -- The simulated balances at closure, before anything changes (pilot policy, Nov 26).
  e := sim.earnings_summary(r.member_id);
  select coalesce(sum(l.points) filter (where not l.redeemable), 0), coalesce(sum(l.points) filter (where l.redeemable), 0)
    into v_recognition, v_eligible
  from sim.points_ledger l
  where l.member_id = r.member_id and l.reverses is null and l.points > 0
    and sim.award_state(l.id) in ('recognized', 'pending_review', 'approved');
  -- Recognition points removed and unallocated eligible points cancelled, as recorded reversals.
  for v_key in select l.source_key from sim.points_ledger l
               where l.member_id = r.member_id and l.reverses is null and l.points > 0
                 and sim.award_state(l.id) in ('recognized', 'pending_review', 'approved') loop
    perform sim.reverse(v_key, 'account_deleted:' || v_key);
    v_forfeited := v_forfeited + 1;
  end loop;
  -- Allocated simulated earnings closed by one auditable record (totals only).
  insert into sim.balance_closures (request_id, reason, recognition_points, eligible_points,
                                    creator_locked_cents, creator_open_cents, creator_settled_cents,
                                    consumer_locked_cents, consumer_open_cents, consumer_settled_cents, closed_by)
  values (r.id, 'account_deleted', v_recognition, v_eligible,
          (e -> 'creator' ->> 'locked_cents')::bigint,
          (e -> 'creator' ->> 'eligible_cents')::bigint + (e -> 'creator' ->> 'paused_cents')::bigint,
          (e -> 'creator' ->> 'settled_cents')::bigint,
          (e -> 'consumer' ->> 'locked_cents')::bigint,
          (e -> 'consumer' ->> 'eligible_cents')::bigint + (e -> 'consumer' ->> 'paused_cents')::bigint,
          (e -> 'consumer' ->> 'settled_cents')::bigint,
          'founder:' || v_uid);
  select count(*) into v_posts from social.posts s where s.author_id = r.member_id;
  update ops.member_requests set status = 'completed', resolved_at = pg_catalog.now(), details = null where id = r.id;
  -- No free text from the member's other requests, and no invitation, survive the account.
  update ops.member_requests set details = null where member_id = r.member_id and details is not null;
  perform ops.forget_member_invitations(r.member_id);
  insert into ops.member_request_events (request_id, action, actor, note)
  values (r.id, 'account_deleted', 'founder:' || v_uid::text,
          pg_catalog.format('%s posts removed; %s simulated awards forfeited; simulated balances closed (pilot policy)', v_posts, v_forfeited));
  delete from auth.users where id = r.member_id;
  return pg_catalog.jsonb_build_object('posts_removed', v_posts, 'awards_forfeited', v_forfeited,
    'closed_cents', (e -> 'creator' ->> 'accumulated_cents')::bigint - (e -> 'creator' ->> 'settled_cents')::bigint
                  + (e -> 'consumer' ->> 'accumulated_cents')::bigint - (e -> 'consumer' ->> 'settled_cents')::bigint);
end;
$$;

-- What the member is told before confirming, and what the founder sees before deleting: the member's own simulated balances.
create function public.app_my_deletion_consequences()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_member();
  e jsonb := sim.earnings_summary(v_uid);
begin
  return pg_catalog.jsonb_build_object(
    'recognition_points', (select coalesce(sum(l.points), 0) from sim.points_ledger l
                           where l.member_id = v_uid and l.reverses is null and not l.redeemable and l.points > 0
                             and sim.award_state(l.id) = 'recognized'),
    'eligible_points', (select coalesce(sum(l.points), 0) from sim.points_ledger l
                        where l.member_id = v_uid and l.reverses is null and l.redeemable and l.points > 0
                          and sim.award_state(l.id) in ('pending_review', 'approved')),
    'open_simulated_cents', (e -> 'creator' ->> 'accumulated_cents')::bigint - (e -> 'creator' ->> 'settled_cents')::bigint
                          + (e -> 'consumer' ->> 'accumulated_cents')::bigint - (e -> 'consumer' ->> 'settled_cents')::bigint);
end;
$$;
comment on function public.app_my_deletion_consequences() is 'The member''s own points and open SIMULATED earnings that a deletion would close (pilot policy). Shown before they confirm a deletion request.';

-- ---------------------------------------------------------------------------
-- 2. Activation definitions (SP-PRG-001 8.5), with the previous consumer metric for 30 days

create function public.app_founder_activation()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_founder();
  v_out jsonb;
begin
  perform v_uid;
  with mem as (
    select a.user_id as id from ops.member_access a
    where a.status = 'active' and (a.expires_at is null or a.expires_at > pg_catalog.now()) and a.cohort not in ('tester', 'founder')),
  meaningful as (
    -- Meaningful engagement: recognition awards for thoughtful comments, saves and reposts that still stand.
    select l.member_id, l.creator_id from sim.points_ledger l
    where l.reverses is null and l.action in ('meaningful_comment', 'save', 'repost') and l.creator_id is not null
      and l.creator_id <> l.member_id and sim.award_state(l.id) in ('recognized', 'approved', 'settled'))
  select pg_catalog.jsonb_build_object(
    'kind', 'actual',
    'effective_from', '2026-11-26',
    'transition_until', '2026-12-26',
    'creator', pg_catalog.jsonb_build_object(
      'definition', 'Published at least one eligible original post and has at least one meaningful audience connection (an eligible follower, or meaningful engagement from another member)',
      'denominator_definition', 'Active pilot members, testers and the founder excluded',
      'denominator', (select count(*) from mem),
      'activated', (select count(*) from mem m
                    where exists (select 1 from social.posts s where s.author_id = m.id and s.deleted_at is null and s.hidden_at is null)
                      and (exists (select 1 from social.follows f where f.creator_id = m.id and f.follower_id <> m.id and sim.eligible_member(f.follower_id))
                           or exists (select 1 from meaningful g where g.creator_id = m.id)))),
    'consumer', pg_catalog.jsonb_build_object(
      'definition', 'Intentionally follows at least three creators, has at least one creator in their Clique and has completed at least one meaningful engagement',
      'denominator_definition', 'Active pilot members, testers and the founder excluded',
      'denominator', (select count(*) from mem),
      'activated', (select count(*) from mem m
                    where (select count(*) from social.follows f where f.follower_id = m.id) >= 3
                      and exists (select 1 from social.clique_members c where c.fan_id = m.id and c.removed_at is null)
                      and exists (select 1 from meaningful g where g.member_id = m.id))),
    'consumer_previous', pg_catalog.jsonb_build_object(
      'definition', 'Previous metric (until 2026-12-26): within 7 days of registering, a follow and a qualifying connection',
      'denominator_definition', 'Registrations at least 7 days old',
      'denominator', (select count(*) from ops.registrations r where r.claimed_at < pg_catalog.now() - interval '7 days'),
      'activated', (select count(*) from ops.registrations r
                    where r.claimed_at < pg_catalog.now() - interval '7 days'
                      and exists (select 1 from social.follows f where f.follower_id = r.user_id and f.followed_at < r.claimed_at + interval '7 days')
                      and exists (select 1 from ops.connections(r.claimed_at, r.claimed_at + interval '7 days') c where c.consumer = r.user_id))),
    'advertiser', pg_catalog.jsonb_build_object(
      'definition', 'Completed managed onboarding (approved) and launched an approved test campaign with measurable delivery (at least one viewed impression)',
      'denominator_definition', 'Advertisers who started onboarding',
      'denominator', (select count(*) from ads.advertisers),
      'activated', (select count(*) from ads.advertisers v
                    where v.status = 'approved'
                      and exists (select 1 from ads.campaigns c join ads.impressions i on i.campaign_id = c.id
                                  where c.advertiser_id = v.id and c.status <> 'draft' and i.viewed_at is not null))),
    'comparability', 'The creator and advertiser metrics are new. The new consumer metric has no time window and a different denominator, so it is not comparable with the previous one; both are reported until 2026-12-26.')
  into v_out;
  return v_out;
end;
$$;
comment on function public.app_founder_activation() is 'Founder: activation by the SP-PRG-001 definitions (effective 2026-11-26), with each definition, denominator and classification, and the previous consumer metric alongside until 2026-12-26. Aggregates only.';

-- ---------------------------------------------------------------------------
-- 3. Review triage

-- Why a member who met their goals is not a routine case: plain reasons, no personal data.
create function sim.review_concerns(p_member uuid)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select array_remove(array[
    case when not sim.in_good_standing(p_member) then 'a restriction or suspension is in force' end,
    case when sim.account_held(p_member) then 'an account-wide financial hold' end,
    case when exists (select 1 from sim.financial_holds h where h.member_id = p_member and h.scope <> 'account'
                      and not exists (select 1 from sim.financial_hold_releases x where x.hold_id = h.id)) then 'a targeted financial hold' end,
    case when exists (select 1 from ops.content_reports c where c.target_owner_id = p_member and c.status = 'open') then 'an open report about their content or profile' end,
    case when exists (select 1 from sim.points_ledger l where l.member_id = p_member and l.action = 'qualified_referral'
                      and l.reverses is null and sim.award_state(l.id) = 'pending_review') then 'a referral waiting for review' end,
    case when not sim.eligible_member(p_member) then 'membership or email not confirmed' end
  ], null);
$$;
revoke all on function sim.review_concerns(uuid) from public, anon, authenticated;

create or replace function public.app_founder_progression_queue()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_founder();
begin
  perform v_uid;
  return pg_catalog.jsonb_build_object(
    'members', coalesce((select pg_catalog.jsonb_agg(x.j order by x.flagged desc, x.met) from (
                 select q.qualified_at as met, pg_catalog.cardinality(c.concerns) > 0 as flagged,
                   pg_catalog.jsonb_build_object(
                     'member_id', q.member_id, 'username', p.username, 'audience', q.audience, 'goals_met_at', q.qualified_at,
                     'version_id', q.version_id, 'status', sim.qualification_status(q.member_id, q.audience),
                     'routine', pg_catalog.cardinality(c.concerns) = 0,
                     'concerns', pg_catalog.to_jsonb(c.concerns),
                     'pending_reason', case
                       when sim.qualification_status(q.member_id, q.audience) <> 'under_review' then null
                       when pg_catalog.cardinality(c.concerns) = 0 then 'Every milestone met and every routine check passed: waiting for your approval'
                       else 'Flagged for review: ' || pg_catalog.array_to_string(c.concerns, '; ') end,
                     'waiting_hours', case when sim.qualification_status(q.member_id, q.audience) = 'under_review'
                                           then pg_catalog.floor(extract(epoch from (pg_catalog.now() - q.qualified_at)) / 3600)::int end) as j
                 from sim.qualifications q
                 left join public.profiles p on p.id = q.member_id
                 cross join lateral (select sim.review_concerns(q.member_id) as concerns) c) x), '[]'::jsonb),
    'holds', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
               'id', h.id, 'username', p.username, 'scope', h.scope, 'revenue_entry_id', h.revenue_entry_id, 'settlement_id', h.settlement_id,
               'reason', h.reason, 'evidence_ref', h.evidence_ref, 'justification', h.justification, 'placed_at', h.placed_at) order by h.placed_at)
             from sim.financial_holds h left join public.profiles p on p.id = h.member_id
             where not exists (select 1 from sim.financial_hold_releases x where x.hold_id = h.id)), '[]'::jsonb),
    'decisions', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
                   'username', p.username, 'audience', d.audience, 'decision', d.decision, 'reason', d.reason,
                   'evidence_ref', d.evidence_ref, 'decided_at', d.decided_at) order by d.id desc)
                 from (select * from sim.qualification_decisions order by id desc limit 50) d
                 left join public.profiles p on p.id = d.member_id), '[]'::jsonb),
    'metrics', (select pg_catalog.jsonb_build_object(
                  'under_review', count(*) filter (where sim.qualification_status(q.member_id, q.audience) = 'under_review'),
                  'routine_waiting', count(*) filter (where sim.qualification_status(q.member_id, q.audience) = 'under_review'
                                                       and pg_catalog.cardinality(sim.review_concerns(q.member_id)) = 0),
                  'flagged_waiting', count(*) filter (where sim.qualification_status(q.member_id, q.audience) = 'under_review'
                                                       and pg_catalog.cardinality(sim.review_concerns(q.member_id)) > 0),
                  'oldest_waiting_hours', pg_catalog.floor(extract(epoch from (pg_catalog.now() - min(q.qualified_at)
                                          filter (where sim.qualification_status(q.member_id, q.audience) = 'under_review'))) / 3600)::int,
                  'approved', (select count(*) from sim.qualification_decisions d where d.decision = 'approved'),
                  'revoked', (select count(*) from sim.qualification_decisions d where d.decision = 'revoked'),
                  'restored', (select count(*) from sim.qualification_decisions d where d.decision = 'restored'),
                  'decisions_7d', (select count(*) from sim.qualification_decisions d where d.decided_at > pg_catalog.now() - interval '7 days'),
                  'median_turnaround_hours', (select pg_catalog.round((pg_catalog.percentile_cont(0.5) within group (
                                                order by extract(epoch from (d.decided_at - q2.qualified_at)) / 3600))::numeric, 1)
                                              from sim.qualification_decisions d
                                              join sim.qualifications q2 on q2.member_id = d.member_id and q2.audience = d.audience
                                              where d.decision = 'approved'),
                  'revocation_rate', case when (select count(*) from sim.qualification_decisions d where d.decision = 'approved') = 0 then null
                                          else pg_catalog.round((select count(*) from sim.qualification_decisions d where d.decision = 'revoked')::numeric
                                                 / (select count(*) from sim.qualification_decisions d where d.decision = 'approved'), 3) end)
                from sim.qualifications q));
end;
$$;
comment on function public.app_founder_progression_queue() is 'Founder: members who met their goals, routine or flagged (with plain reasons and time waiting), open holds, the latest decisions and review workload metrics. Approval stays manual.';

do $$
declare
  f text;
begin
  foreach f in array array['public.app_my_deletion_consequences()', 'public.app_founder_activation()'] loop
    execute pg_catalog.format('revoke all on function %s from public, anon', f);
    execute pg_catalog.format('grant execute on function %s to authenticated', f);
  end loop;
end;
$$;
