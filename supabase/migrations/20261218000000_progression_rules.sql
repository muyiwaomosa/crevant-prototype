-- Progression rules (SP-PRG-001 v1.0, founder approval Nov 26, 2026).
-- Builds on 20261217000000 and aligns it with the approved specification:
--
--   * Metric definitions (PRG-02, PRG-03): weeks are Monday to Sunday in UTC
--     within the preceding 28 days; only eligible members count (active pilot
--     membership, confirmed email, no suspension in force, never the member
--     themselves); engagement reuses the Connection Points ledger, so its caps,
--     deduplication and reversals apply; shares and referrals are lifetime.
--   * The approved benchmarks, recorded as goal version 1 of each journey,
--     with the approval as their source. Later changes stay founder-only.
--   * Review before release (PRG-04, PRG-05): meeting every goal puts a member
--     Under review; the founder's documented decision approves, revokes (with
--     evidence) or restores. Qualification is kept apart from eligibility:
--     a restriction or an account-wide hold pauses release without erasing it.
--   * Targeted financial holds (PRG-06): one revenue entry, one month's
--     allocation, or (with a documented justification) the whole account.
--     A hold pauses; it never takes anything.
--   * Compensating corrections (PRG-04 5.6): refunds, invalid activity,
--     corrections and restorations are new append-only entries. A revenue
--     correction is a revenue entry of its own (negative or positive) with
--     the same kind and creator, so every existing total includes it; an
--     allocation correction returns value to, or takes it from, the open pool.
--     Each correction goes through the same locked, eligible, settled states.
--   * Founder scorecard rows for progression (PRG-07), aggregates only.
--
-- Everything stays SIMULATED and behind the 'progression' switch (off).
-- Nothing here reads or writes feeds, discovery, ranking or advertising.

-- ---------------------------------------------------------------------------
-- Eligibility of the people who count

-- An eligible member: active pilot membership, confirmed email, and no
-- suspension in force (a suspended account is not visible to others).
create function sim.eligible_member(p_member uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from ops.member_access a
                 where a.user_id = p_member and a.status = 'active' and (a.expires_at is null or a.expires_at > pg_catalog.now()))
     and exists (select 1 from auth.users u where u.id = p_member and u.email_confirmed_at is not null)
     and not exists (select 1 from ops.enforcements e
                     where e.member_id = p_member and e.level = 'suspension'
                       and e.starts_at <= pg_catalog.now() and (e.ends_at is null or e.ends_at > pg_catalog.now())
                       and not exists (select 1 from ops.enforcement_lifts l where l.enforcement_id = e.id));
$$;
revoke all on function sim.eligible_member(uuid) from public, anon, authenticated;

-- A calendar week, Monday to Sunday, in UTC.
create function sim.utc_week(p_at timestamptz)
returns timestamp
language sql
immutable
set search_path = ''
as $$
  select pg_catalog.date_trunc('week', p_at at time zone 'UTC');
$$;
revoke all on function sim.utc_week(timestamptz) from public, anon, authenticated;

-- Meaningful engagement for progression: the member's recognition awards for
-- thoughtful comments, saves and reposts on someone else's post that still
-- stand (not reversed). The ledger already applies the caps, deduplication
-- and integrity reversals of the rewards rules.
create function sim.meaningful_engagements(p_member uuid)
returns table (creator_id uuid, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select l.creator_id, l.created_at from sim.points_ledger l
  where l.member_id = p_member and l.reverses is null
    and l.action in ('meaningful_comment', 'save', 'repost')
    and l.creator_id is not null and l.creator_id <> p_member
    and sim.award_state(l.id) in ('recognized', 'approved', 'settled');
$$;
revoke all on function sim.meaningful_engagements(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- The approved catalogue and its measures

create or replace function sim.goal_metrics(p_audience text)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select case p_audience
    when 'creator' then array['original_posts', 'posting_weeks', 'genuine_followers', 'clique_connections', 'returning_supporters']
    when 'consumer' then array['clique_creators', 'meaningful_engagements', 'engaged_creators', 'supporting_weeks', 'external_shares', 'qualified_referrals']
  end;
$$;

create or replace function sim.goal_values(p_member uuid, p_audience text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case p_audience
  when 'creator' then pg_catalog.jsonb_build_object(
    -- CQ-01: lifetime eligible original posts (reposts are not posts; deleted or removed excluded).
    'original_posts', (select count(*) from social.posts s where s.author_id = p_member and s.deleted_at is null and s.hidden_at is null),
    -- CQ-02: distinct UTC weeks with an eligible original post in the preceding 28 days.
    'posting_weeks', (select count(distinct sim.utc_week(s.created_at)) from social.posts s
                      where s.author_id = p_member and s.deleted_at is null and s.hidden_at is null
                        and s.created_at >= pg_catalog.now() - interval '28 days'),
    -- CQ-03: distinct eligible members currently following.
    'genuine_followers', (select count(*) from social.follows f
                          where f.creator_id = p_member and f.follower_id <> p_member and sim.eligible_member(f.follower_id)),
    -- CQ-04: distinct eligible members currently keeping the creator in their Clique.
    'clique_connections', (select count(distinct c.fan_id) from social.clique_members c
                           where c.creator_id = p_member and c.removed_at is null and c.fan_id <> p_member and sim.eligible_member(c.fan_id)),
    -- CQ-05: eligible followers (active supporters) who meaningfully engaged with the creator's posts in at least two distinct UTC weeks of the preceding 28 days.
    'returning_supporters', (select count(*) from (
                               select x.member_id from (
                                 select c.author_id as member_id, sim.utc_week(c.created_at) as wk from social.comments c join social.posts s on s.id = c.post_id
                                 where s.author_id = p_member and c.author_id <> p_member and c.deleted_at is null and c.hidden_at is null
                                   and c.created_at >= pg_catalog.now() - interval '28 days' and social.meaningful_comment(c.body)
                                 union all
                                 select v.member_id, sim.utc_week(v.saved_at) from social.saves v join social.posts s on s.id = v.post_id
                                 where s.author_id = p_member and v.member_id <> p_member and v.saved_at >= pg_catalog.now() - interval '28 days'
                                 union all
                                 select r.reposter_id, sim.utc_week(r.created_at) from social.reposts r join social.posts s on s.id = r.post_id
                                 where s.author_id = p_member and r.reposter_id <> p_member and r.created_at >= pg_catalog.now() - interval '28 days') x
                               where exists (select 1 from social.follows f where f.follower_id = x.member_id and f.creator_id = p_member)
                                 and sim.eligible_member(x.member_id)
                               group by x.member_id
                               having count(distinct x.wk) >= 2) y))
  when 'consumer' then pg_catalog.jsonb_build_object(
    -- FQ-01: distinct eligible creators currently in the member's Clique (a milestone, not a limit).
    'clique_creators', (select count(distinct c.creator_id) from social.clique_members c
                        where c.fan_id = p_member and c.removed_at is null and c.creator_id <> p_member and sim.eligible_member(c.creator_id)),
    -- FQ-02: lifetime meaningful engagements (ledger: caps, deduplication, reversals) ...
    'meaningful_engagements', (select count(*) from sim.meaningful_engagements(p_member)),
    -- ... across at least three distinct creators (the approved condition, shown as its own step).
    'engaged_creators', (select count(distinct e.creator_id) from sim.meaningful_engagements(p_member) e),
    -- FQ-03: distinct UTC weeks in the preceding 28 days with meaningful support for a creator in the member's Clique.
    'supporting_weeks', (select count(distinct sim.utc_week(e.created_at)) from sim.meaningful_engagements(p_member) e
                         where e.created_at >= pg_catalog.now() - interval '28 days'
                           and exists (select 1 from social.clique_members c where c.fan_id = p_member and c.creator_id = e.creator_id and c.removed_at is null)),
    -- FQ-04: lifetime external shares that still stand in the ledger (one per post, capped, never your own posts).
    'external_shares', (select count(*) from sim.points_ledger l
                        where l.member_id = p_member and l.reverses is null and l.action = 'external_share'
                          and (l.creator_id is null or l.creator_id <> p_member)
                          and sim.award_state(l.id) in ('recognized', 'approved', 'settled')),
    -- FQ-05: lifetime qualified referrals, approved or settled after integrity review.
    'qualified_referrals', (select count(*) from sim.points_ledger l
                            where l.member_id = p_member and l.action = 'qualified_referral' and l.reverses is null
                              and sim.award_state(l.id) in ('approved', 'settled')))
  end;
$$;

-- Every measure of the catalogue has a target of 1 or more and is met.
create function sim.goals_met(p_values jsonb, p_targets jsonb, p_metrics text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(pg_catalog.cardinality(p_metrics), 0) > 0
     and not exists (select 1 from pg_catalog.unnest(p_metrics) m
                     where (p_targets ->> m) is null or (p_targets ->> m)::bigint < 1
                        or coalesce((p_values ->> m)::bigint, 0) < (p_targets ->> m)::bigint);
$$;
revoke all on function sim.goals_met(jsonb, jsonb, text[]) from public, anon, authenticated;

-- Records that a member met every goal (then Under review). Never on an
-- incomplete version; never under a restriction or suspension. Idempotent.
create or replace function sim.check_qualification(p_member uuid, p_audience text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version sim.goal_versions%rowtype;
begin
  if exists (select 1 from sim.qualifications q where q.member_id = p_member and q.audience = p_audience) then
    return true;
  end if;
  select * into v_version from sim.goal_versions g where g.audience = p_audience order by g.id desc limit 1;
  if not found or not sim.in_good_standing(p_member)
     or not sim.goals_met(sim.goal_values(p_member, p_audience), v_version.targets, sim.goal_metrics(p_audience)) then
    return false;
  end if;
  insert into sim.qualifications (member_id, audience, version_id) values (p_member, p_audience, v_version.id)
  on conflict (member_id, audience) do nothing;
  return true;
end;
$$;

-- The approved benchmarks (SP-PRG-001 v1.0), as version 1 of each journey.
insert into sim.goal_versions (audience, targets, reason, set_by) values
  ('creator', '{"original_posts": 20, "posting_weeks": 3, "genuine_followers": 100, "clique_connections": 5, "returning_supporters": 5}',
   'SP-PRG-001 v1.0 approved creator benchmarks (CQ-01 to CQ-05)', 'founder-approved:SP-PRG-001 v1.0 2026-11-26'),
  ('consumer', '{"clique_creators": 10, "meaningful_engagements": 30, "engaged_creators": 3, "supporting_weeks": 4, "external_shares": 5, "qualified_referrals": 5}',
   'SP-PRG-001 v1.0 approved consumer benchmarks (FQ-01 to FQ-05; engagement across 3 creators)', 'founder-approved:SP-PRG-001 v1.0 2026-11-26');

-- ---------------------------------------------------------------------------
-- Review, decisions and holds

create table sim.qualification_decisions (
  id              bigint generated always as identity primary key,
  member_id       uuid not null references auth.users (id) on delete cascade,
  audience        text not null check (audience in ('creator', 'consumer')),
  decision        text not null check (decision in ('approved', 'revoked', 'restored')),
  reason          text not null check (char_length(reason) between 3 and 500),
  evidence_ref    text check (evidence_ref is null or char_length(evidence_ref) between 1 and 200),
  member_message  text check (member_message is null or char_length(member_message) between 3 and 500),
  decided_by      text not null,
  decided_at      timestamptz not null default pg_catalog.now(),
  constraint revocation_documented check (decision <> 'revoked' or (evidence_ref is not null and member_message is not null))
);
comment on table sim.qualification_decisions is 'The founder''s documented qualification decisions: approved (after integrity review), revoked (with evidence and a message to the member), restored (after an appeal). The latest per member and journey is in force. Append-only.';

create table sim.financial_holds (
  id                bigint generated always as identity primary key,
  member_id         uuid not null references auth.users (id) on delete cascade,
  scope             text not null check (scope in ('account', 'creator_entry', 'consumer_allocation')),
  revenue_entry_id  bigint references sim.revenue_entries (id),
  settlement_id     bigint references sim.settlements (id),
  reason            text not null check (char_length(reason) between 3 and 500),
  evidence_ref      text check (evidence_ref is null or char_length(evidence_ref) between 1 and 200),
  justification     text check (justification is null or char_length(justification) between 10 and 500),
  member_message    text not null check (char_length(member_message) between 3 and 500),
  placed_by         text not null,
  placed_at         timestamptz not null default pg_catalog.now(),
  constraint hold_target check (
    (scope = 'account' and revenue_entry_id is null and settlement_id is null and justification is not null)
    or (scope = 'creator_entry' and revenue_entry_id is not null and settlement_id is null)
    or (scope = 'consumer_allocation' and settlement_id is not null and revenue_entry_id is null))
);
comment on table sim.financial_holds is 'SIMULATED targeted holds: one revenue entry, one month''s allocation, or (with a documented justification) a whole account. A hold pauses release and settlement; it never takes anything. Append-only.';

create table sim.financial_hold_releases (
  hold_id      bigint primary key references sim.financial_holds (id) on delete cascade,
  reason       text not null check (char_length(reason) between 3 and 500),
  released_by  text not null,
  released_at  timestamptz not null default pg_catalog.now()
);
comment on table sim.financial_hold_releases is 'When and why a hold ended. Append-only.';

-- ---------------------------------------------------------------------------
-- Compensating corrections

alter table sim.revenue_entries
  add column corrects bigint references sim.revenue_entries (id),
  add column correction_kind text check (correction_kind in ('refund', 'invalid_activity', 'correction', 'restoration')),
  add column evidence_ref text check (evidence_ref is null or char_length(evidence_ref) between 1 and 200);
alter table sim.revenue_entries drop constraint revenue_entries_net_cents_check;
alter table sim.revenue_entries add constraint revenue_entries_net_cents_check check (
  (corrects is null and correction_kind is null and net_cents >= 0)
  or (corrects is not null and correction_kind is not null and net_cents <> 0));
comment on column sim.revenue_entries.corrects is 'A compensating entry: the entry it corrects (same kind, creator and post). Negative for refunds and invalid activity.';

create function sim.revenue_correction_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  o sim.revenue_entries%rowtype;
begin
  if new.corrects is null then
    return new;
  end if;
  select * into o from sim.revenue_entries r where r.id = new.corrects;
  if not found or o.corrects is not null then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  if new.kind <> o.kind or new.creator_id is distinct from o.creator_id or new.post_id is distinct from o.post_id then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  if o.net_cents + coalesce((select sum(c.net_cents) from sim.revenue_entries c where c.corrects = o.id), 0) + new.net_cents < 0 then
    raise exception 'correction_too_large' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke all on function sim.revenue_correction_guard() from public, anon, authenticated;
create trigger revenue_correction_guard before insert on sim.revenue_entries for each row execute function sim.revenue_correction_guard();

create table sim.allocation_corrections (
  id             bigint generated always as identity primary key,
  settlement_id  bigint not null references sim.settlements (id),
  member_id      uuid references auth.users (id) on delete set null,
  delta_cents    bigint not null check (delta_cents <> 0),
  kind           text not null check (kind in ('invalid_activity', 'correction', 'restoration')),
  reason         text not null check (char_length(reason) between 3 and 500),
  evidence_ref   text check (evidence_ref is null or char_length(evidence_ref) between 1 and 200),
  recorded_by    text not null,
  recorded_at    timestamptz not null default pg_catalog.now()
);
comment on table sim.allocation_corrections is 'SIMULATED compensating corrections to a member''s month-close allocation. A negative correction returns value to the open fan pool; a restoration takes it back. Append-only.';

create function sim.allocation_correction_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_value bigint;
begin
  select l.value_cents into v_value from sim.settlement_lines l where l.settlement_id = new.settlement_id and l.member_id = new.member_id;
  if v_value is null then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  if v_value + coalesce((select sum(c.delta_cents) from sim.allocation_corrections c
                         where c.settlement_id = new.settlement_id and c.member_id = new.member_id), 0) + new.delta_cents < 0 then
    raise exception 'correction_too_large' using errcode = 'P0001';
  end if;
  if new.delta_cents > sim.open_pool_cents() and new.delta_cents > 0 then
    raise exception 'pool_too_small' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke all on function sim.allocation_correction_guard() from public, anon, authenticated;
create trigger allocation_correction_guard before insert on sim.allocation_corrections for each row execute function sim.allocation_correction_guard();

create table sim.allocation_correction_states (
  id             bigint generated always as identity primary key,
  correction_id  bigint not null references sim.allocation_corrections (id),
  state          text not null check (state in ('eligible', 'settled')),
  set_by         text not null,
  set_at         timestamptz not null default pg_catalog.now(),
  unique (correction_id, state)
);
comment on table sim.allocation_correction_states is 'SIMULATED: an allocation correction is locked, eligible and settled like the allocation it corrects. Append-only; never money.';

-- The open fan pool: corrections returned to it are available again.
create or replace function sim.open_pool_cents()
returns bigint
language sql
stable
set search_path = ''
as $$
  select coalesce((select sum((sim.split(r.kind, r.net_cents)).pool_cents) from sim.revenue_entries r), 0)
       - coalesce((select sum(sl.value_cents) from sim.settlement_lines sl), 0)
       - coalesce((select sum(c.delta_cents) from sim.allocation_corrections c), 0);
$$;

do $$
declare
  t text;
begin
  foreach t in array array['sim.qualification_decisions', 'sim.financial_holds', 'sim.financial_hold_releases',
                           'sim.allocation_corrections', 'sim.allocation_correction_states'] loop
    execute pg_catalog.format('alter table %s enable row level security', t);
    execute pg_catalog.format('revoke all on table %s from public, anon, authenticated', t);
    -- An account deletion may clear or cascade a member link; nothing else changes a row.
    execute pg_catalog.format('create trigger %s before update or delete on %s for each row when (pg_catalog.pg_trigger_depth() = 0) execute function ops.history_append_only()',
                              pg_catalog.replace(t, 'sim.', '') || '_append_only', t);
    execute pg_catalog.format('create trigger %s before truncate on %s for each statement execute function ops.history_append_only()',
                              pg_catalog.replace(t, 'sim.', '') || '_no_truncate', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Status

create function sim.account_held(p_member uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from sim.financial_holds h where h.member_id = p_member and h.scope = 'account'
                 and not exists (select 1 from sim.financial_hold_releases x where x.hold_id = h.id));
$$;

-- A revenue entry (or a correction of it) under a hold of its own, or its creator's account hold.
create function sim.entry_held(p_entry bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from sim.revenue_entries r
                 where r.id = p_entry
                   and (sim.account_held(r.creator_id)
                        or exists (select 1 from sim.financial_holds h
                                   where h.scope = 'creator_entry' and h.revenue_entry_id in (r.id, r.corrects)
                                     and not exists (select 1 from sim.financial_hold_releases x where x.hold_id = h.id))));
$$;

create function sim.allocation_held(p_settlement bigint, p_member uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select sim.account_held(p_member)
      or exists (select 1 from sim.financial_holds h
                 where h.scope = 'consumer_allocation' and h.settlement_id = p_settlement and h.member_id = p_member
                   and not exists (select 1 from sim.financial_hold_releases x where x.hold_id = h.id));
$$;

-- in_progress, under_review, qualified, eligibility_paused or revoked.
create function sim.qualification_status(p_member uuid, p_audience text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when not exists (select 1 from sim.qualifications q where q.member_id = p_member and q.audience = p_audience) then 'in_progress'
    else coalesce((select case d.decision
                            when 'revoked' then 'revoked'
                            else case when sim.in_good_standing(p_member) and not sim.account_held(p_member) then 'qualified' else 'eligibility_paused' end
                          end
                   from sim.qualification_decisions d where d.member_id = p_member and d.audience = p_audience
                   order by d.id desc limit 1), 'under_review')
  end;
$$;

create function sim.released(p_member uuid, p_audience text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select sim.qualification_status(p_member, p_audience) = 'qualified';
$$;

do $$
declare
  f text;
begin
  foreach f in array array['sim.account_held(uuid)', 'sim.entry_held(bigint)', 'sim.allocation_held(bigint, uuid)',
                           'sim.qualification_status(uuid, text)', 'sim.released(uuid, text)'] loop
    execute pg_catalog.format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- States: released only after approval, never while held

create or replace function sim.earnings_state_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member uuid;
  v_audience text;
  v_held boolean;
  v_eligible boolean;
begin
  if tg_table_name = 'creator_share_states' then
    select r.creator_id into v_member from sim.revenue_entries r where r.id = new.revenue_entry_id and r.kind = 'content_ad';
    v_audience := 'creator';
    v_held := sim.entry_held(new.revenue_entry_id);
    v_eligible := exists (select 1 from sim.creator_share_states s where s.revenue_entry_id = new.revenue_entry_id and s.state = 'eligible');
  elsif tg_table_name = 'allocation_states' then
    select l.member_id into v_member from sim.settlement_lines l where l.settlement_id = new.settlement_id and l.member_id = new.member_id;
    v_audience := 'consumer';
    v_held := sim.allocation_held(new.settlement_id, new.member_id);
    v_eligible := exists (select 1 from sim.allocation_states s where s.settlement_id = new.settlement_id and s.member_id = new.member_id and s.state = 'eligible');
  else
    select c.member_id, sim.allocation_held(c.settlement_id, c.member_id) into v_member, v_held
    from sim.allocation_corrections c where c.id = new.correction_id;
    v_audience := 'consumer';
    v_eligible := exists (select 1 from sim.allocation_correction_states s where s.correction_id = new.correction_id and s.state = 'eligible');
  end if;
  if new.state = 'settled' and not v_eligible then
    raise exception 'not_eligible' using errcode = 'P0001';
  end if;
  if v_member is null or not sim.released(v_member, v_audience) then
    raise exception 'not_qualified' using errcode = 'P0001';
  end if;
  if v_held then
    raise exception 'on_hold' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger allocation_correction_states_guard before insert on sim.allocation_correction_states for each row execute function sim.earnings_state_guard();

create or replace function sim.release_qualified(p_member uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if sim.released(p_member, 'creator') then
    insert into sim.creator_share_states (revenue_entry_id, state, set_by)
    select r.id, 'eligible', 'qualification' from sim.revenue_entries r
    where r.creator_id = p_member and r.kind = 'content_ad' and not sim.entry_held(r.id)
    on conflict (revenue_entry_id, state) do nothing;
  end if;
  if sim.released(p_member, 'consumer') then
    insert into sim.allocation_states (settlement_id, member_id, state, set_by)
    select l.settlement_id, l.member_id, 'eligible', 'qualification' from sim.settlement_lines l
    where l.member_id = p_member and not sim.allocation_held(l.settlement_id, l.member_id)
    on conflict (settlement_id, member_id, state) do nothing;
    insert into sim.allocation_correction_states (correction_id, state, set_by)
    select c.id, 'eligible', 'qualification' from sim.allocation_corrections c
    where c.member_id = p_member and not sim.allocation_held(c.settlement_id, c.member_id)
    on conflict (correction_id, state) do nothing;
  end if;
end;
$$;

-- Totals by state, each amount in exactly one: locked, paused (a hold or a
-- paused eligibility), unlocked (eligible and releasable) or settled.
create or replace function sim.earnings_summary(p_member uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with c as (
    select (sim.split(r.kind, r.net_cents)).creator_cents as cents, sim.entry_held(r.id) as held,
           exists (select 1 from sim.creator_share_states s where s.revenue_entry_id = r.id and s.state = 'eligible') as eligible,
           exists (select 1 from sim.creator_share_states s where s.revenue_entry_id = r.id and s.state = 'settled') as settled
    from sim.revenue_entries r where r.creator_id = p_member and r.kind = 'content_ad'),
  a as (
    select l.value_cents as cents, sim.allocation_held(l.settlement_id, l.member_id) as held,
           exists (select 1 from sim.allocation_states s where s.settlement_id = l.settlement_id and s.member_id = l.member_id and s.state = 'eligible') as eligible,
           exists (select 1 from sim.allocation_states s where s.settlement_id = l.settlement_id and s.member_id = l.member_id and s.state = 'settled') as settled
    from sim.settlement_lines l where l.member_id = p_member
    union all
    select k.delta_cents, sim.allocation_held(k.settlement_id, k.member_id),
           exists (select 1 from sim.allocation_correction_states s where s.correction_id = k.id and s.state = 'eligible'),
           exists (select 1 from sim.allocation_correction_states s where s.correction_id = k.id and s.state = 'settled')
    from sim.allocation_corrections k where k.member_id = p_member),
  cs as (select sim.qualification_status(p_member, 'creator') as st),
  fs as (select sim.qualification_status(p_member, 'consumer') as st)
  select pg_catalog.jsonb_build_object(
    'creator', (select pg_catalog.jsonb_build_object(
      'accumulated_cents', coalesce(sum(cents), 0),
      'settled_cents', coalesce(sum(cents) filter (where settled), 0),
      'paused_cents', coalesce(sum(cents) filter (where not settled and (held or (eligible and cs.st = 'eligibility_paused'))), 0),
      'eligible_cents', coalesce(sum(cents) filter (where not settled and not held and eligible and cs.st = 'qualified'), 0),
      'locked_cents', coalesce(sum(cents) filter (where not settled and not held and not (eligible and cs.st in ('qualified', 'eligibility_paused'))), 0))
      from c, cs),
    'consumer', (select pg_catalog.jsonb_build_object(
      'accumulated_cents', coalesce(sum(cents), 0),
      'settled_cents', coalesce(sum(cents) filter (where settled), 0),
      'paused_cents', coalesce(sum(cents) filter (where not settled and (held or (eligible and fs.st = 'eligibility_paused'))), 0),
      'eligible_cents', coalesce(sum(cents) filter (where not settled and not held and eligible and fs.st = 'qualified'), 0),
      'locked_cents', coalesce(sum(cents) filter (where not settled and not held and not (eligible and fs.st in ('qualified', 'eligibility_paused'))), 0))
      from a, fs));
$$;

-- What the member may see about holds and revocations: the founder's message, not the internal reason or evidence.
create function sim.member_notices(p_member uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(pg_catalog.jsonb_agg(x.n order by x.at desc), '[]'::jsonb) from (
    select pg_catalog.jsonb_build_object('kind', 'hold', 'scope', h.scope, 'message', h.member_message, 'since', h.placed_at,
                                         'status', 'under review') as n, h.placed_at as at
    from sim.financial_holds h
    where h.member_id = p_member and not exists (select 1 from sim.financial_hold_releases x where x.hold_id = h.id)
    union all
    select pg_catalog.jsonb_build_object('kind', 'revoked', 'audience', d.audience, 'message', d.member_message, 'since', d.decided_at,
                                         'status', 'decided'), d.decided_at
    from sim.qualification_decisions d
    where d.member_id = p_member and d.decision = 'revoked'
      and d.id = (select max(d2.id) from sim.qualification_decisions d2 where d2.member_id = p_member and d2.audience = d.audience)) x;
$$;
revoke all on function sim.member_notices(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Member and founder functions

create or replace function public.app_my_progress()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_member();
begin
  if not ops.feature_on('progression') then
    return pg_catalog.jsonb_build_object('enabled', false);
  end if;
  perform sim.check_qualification(v_uid, 'creator');
  perform sim.check_qualification(v_uid, 'consumer');
  perform sim.release_qualified(v_uid);
  return pg_catalog.jsonb_build_object(
    'enabled', true,
    'good_standing', sim.in_good_standing(v_uid),
    'creator', pg_catalog.jsonb_build_object(
      'status', sim.qualification_status(v_uid, 'creator'),
      'qualified_at', (select q.qualified_at from sim.qualifications q where q.member_id = v_uid and q.audience = 'creator'),
      'goals_since', (select g.set_at from sim.goal_versions g where g.audience = 'creator' order by g.id desc limit 1),
      'steps', sim.goal_steps(v_uid, 'creator')),
    'consumer', pg_catalog.jsonb_build_object(
      'status', sim.qualification_status(v_uid, 'consumer'),
      'qualified_at', (select q.qualified_at from sim.qualifications q where q.member_id = v_uid and q.audience = 'consumer'),
      'goals_since', (select g.set_at from sim.goal_versions g where g.audience = 'consumer' order by g.id desc limit 1),
      'steps', sim.goal_steps(v_uid, 'consumer')),
    'notices', sim.member_notices(v_uid),
    'earnings', sim.earnings_summary(v_uid));
end;
$$;
comment on function public.app_my_progress() is 'The member''s own goals, status (in progress, under review, qualified, eligibility paused, revoked), notices and SIMULATED earnings by state. While the progression switch is off: {enabled: false}, and nothing is checked or released.';

create or replace function public.app_founder_settle_eligible(p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_founder();
  v_reason text := pg_catalog.btrim(coalesce(p_reason, ''));
  v_creator integer;
  v_consumer integer;
  v_corrections integer;
begin
  if char_length(v_reason) < 3 then
    raise exception 'reason_required' using errcode = 'P0001';
  end if;
  -- First release what is due to every approved member (new revenue, released holds).
  perform sim.release_qualified(d.member_id) from (select distinct q.member_id from sim.qualification_decisions q) d;
  insert into sim.creator_share_states (revenue_entry_id, state, set_by)
  select s.revenue_entry_id, 'settled', 'founder:' || v_uid from sim.creator_share_states s
  join sim.revenue_entries r on r.id = s.revenue_entry_id
  where s.state = 'eligible' and r.creator_id is not null and sim.released(r.creator_id, 'creator') and not sim.entry_held(r.id)
  on conflict (revenue_entry_id, state) do nothing;
  get diagnostics v_creator = row_count;
  insert into sim.allocation_states (settlement_id, member_id, state, set_by)
  select s.settlement_id, s.member_id, 'settled', 'founder:' || v_uid from sim.allocation_states s
  where s.state = 'eligible' and s.member_id is not null and sim.released(s.member_id, 'consumer') and not sim.allocation_held(s.settlement_id, s.member_id)
  on conflict (settlement_id, member_id, state) do nothing;
  get diagnostics v_consumer = row_count;
  insert into sim.allocation_correction_states (correction_id, state, set_by)
  select s.correction_id, 'settled', 'founder:' || v_uid from sim.allocation_correction_states s
  join sim.allocation_corrections c on c.id = s.correction_id
  where s.state = 'eligible' and c.member_id is not null and sim.released(c.member_id, 'consumer') and not sim.allocation_held(c.settlement_id, c.member_id)
  on conflict (correction_id, state) do nothing;
  get diagnostics v_corrections = row_count;
  return pg_catalog.jsonb_build_object('creator_entries', v_creator, 'consumer_allocations', v_consumer + v_corrections);
end;
$$;

-- Members to review, open holds and recent decisions (usernames only).
create function public.app_founder_progression_queue()
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
    'members', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
                 'member_id', q.member_id, 'username', p.username, 'audience', q.audience, 'goals_met_at', q.qualified_at,
                 'version_id', q.version_id, 'status', sim.qualification_status(q.member_id, q.audience)) order by q.qualified_at)
               from sim.qualifications q left join public.profiles p on p.id = q.member_id), '[]'::jsonb),
    'holds', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
               'id', h.id, 'username', p.username, 'scope', h.scope, 'revenue_entry_id', h.revenue_entry_id, 'settlement_id', h.settlement_id,
               'reason', h.reason, 'evidence_ref', h.evidence_ref, 'justification', h.justification, 'placed_at', h.placed_at) order by h.placed_at)
             from sim.financial_holds h left join public.profiles p on p.id = h.member_id
             where not exists (select 1 from sim.financial_hold_releases x where x.hold_id = h.id)), '[]'::jsonb),
    'decisions', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
                   'username', p.username, 'audience', d.audience, 'decision', d.decision, 'reason', d.reason,
                   'evidence_ref', d.evidence_ref, 'decided_at', d.decided_at) order by d.id desc)
                 from (select * from sim.qualification_decisions order by id desc limit 50) d
                 left join public.profiles p on p.id = d.member_id), '[]'::jsonb));
end;
$$;
comment on function public.app_founder_progression_queue() is 'Founder: members who met their goals with their status, open financial holds and the latest qualification decisions.';

create function public.app_founder_decide_qualification(p_member uuid, p_audience text, p_decision text, p_reason text,
                                                        p_evidence_ref text default null, p_member_message text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_founder();
  v_reason text := pg_catalog.btrim(coalesce(p_reason, ''));
  v_latest text;
begin
  if p_audience not in ('creator', 'consumer') or p_decision not in ('approved', 'revoked', 'restored') then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  if char_length(v_reason) < 3 then
    raise exception 'reason_required' using errcode = 'P0001';
  end if;
  if not exists (select 1 from sim.qualifications q where q.member_id = p_member and q.audience = p_audience) then
    raise exception 'goals_not_met' using errcode = 'P0001';
  end if;
  select d.decision into v_latest from sim.qualification_decisions d
  where d.member_id = p_member and d.audience = p_audience order by d.id desc limit 1;
  if (p_decision = 'approved' and v_latest is not null)
     or (p_decision = 'revoked' and coalesce(v_latest, '') not in ('approved', 'restored'))
     or (p_decision = 'restored' and coalesce(v_latest, '') <> 'revoked') then
    raise exception 'decision_not_allowed' using errcode = 'P0001';
  end if;
  if p_decision = 'revoked' and (nullif(pg_catalog.btrim(coalesce(p_evidence_ref, '')), '') is null
                                 or char_length(pg_catalog.btrim(coalesce(p_member_message, ''))) < 3) then
    raise exception 'evidence_required' using errcode = 'P0001';
  end if;
  insert into sim.qualification_decisions (member_id, audience, decision, reason, evidence_ref, member_message, decided_by)
  values (p_member, p_audience, p_decision, v_reason, nullif(pg_catalog.btrim(coalesce(p_evidence_ref, '')), ''),
          nullif(pg_catalog.btrim(coalesce(p_member_message, '')), ''), 'founder:' || v_uid);
  -- Approval or restoration releases what is due at once (idempotent).
  perform sim.release_qualified(p_member);
end;
$$;
comment on function public.app_founder_decide_qualification(uuid, text, text, text, text, text) is 'Founder: after integrity review, approves a member who met their goals; revokes (evidence and a message to the member required) or restores after an appeal. Recorded; never edits balances.';

create function public.app_founder_place_hold(p_member uuid, p_scope text, p_revenue_entry bigint, p_settlement bigint,
                                              p_reason text, p_evidence_ref text, p_justification text, p_member_message text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_founder();
  v_id bigint;
begin
  if char_length(pg_catalog.btrim(coalesce(p_reason, ''))) < 3 or char_length(pg_catalog.btrim(coalesce(p_member_message, ''))) < 3 then
    raise exception 'reason_required' using errcode = 'P0001';
  end if;
  if p_scope = 'account' and char_length(pg_catalog.btrim(coalesce(p_justification, ''))) < 10 then
    raise exception 'justification_required' using errcode = 'P0001';
  end if;
  if (p_scope = 'creator_entry' and not exists (select 1 from sim.revenue_entries r where r.id = p_revenue_entry and r.creator_id = p_member))
     or (p_scope = 'consumer_allocation' and not exists (select 1 from sim.settlement_lines l where l.settlement_id = p_settlement and l.member_id = p_member)) then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  insert into sim.financial_holds (member_id, scope, revenue_entry_id, settlement_id, reason, evidence_ref, justification, member_message, placed_by)
  values (p_member, p_scope,
          case when p_scope = 'creator_entry' then p_revenue_entry end,
          case when p_scope = 'consumer_allocation' then p_settlement end,
          pg_catalog.btrim(p_reason), nullif(pg_catalog.btrim(coalesce(p_evidence_ref, '')), ''),
          case when p_scope = 'account' then pg_catalog.btrim(p_justification) end,
          pg_catalog.btrim(p_member_message), 'founder:' || v_uid)
  returning id into v_id;
  return v_id;
end;
$$;
comment on function public.app_founder_place_hold(uuid, text, bigint, bigint, text, text, text, text) is 'Founder: a SIMULATED targeted hold on one revenue entry or one month''s allocation, or on a whole account with a documented justification. Pauses release and settlement; takes nothing.';

create function public.app_founder_release_hold(p_hold bigint, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_founder();
begin
  if char_length(pg_catalog.btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'reason_required' using errcode = 'P0001';
  end if;
  if not exists (select 1 from sim.financial_holds h where h.id = p_hold) then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  insert into sim.financial_hold_releases (hold_id, reason, released_by) values (p_hold, pg_catalog.btrim(p_reason), 'founder:' || v_uid)
  on conflict (hold_id) do nothing;
  perform sim.release_qualified((select h.member_id from sim.financial_holds h where h.id = p_hold));
end;
$$;
comment on function public.app_founder_release_hold(bigint, text) is 'Founder: ends a hold, with the reason. Idempotent.';

create function public.app_founder_correct_revenue(p_entry bigint, p_delta_cents bigint, p_kind text, p_reason text, p_evidence_ref text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_founder();
  o sim.revenue_entries%rowtype;
  v_id bigint;
begin
  if p_delta_cents is null or p_delta_cents = 0 or p_kind not in ('refund', 'invalid_activity', 'correction', 'restoration')
     or (p_kind in ('refund', 'invalid_activity') and p_delta_cents > 0) or (p_kind = 'restoration' and p_delta_cents < 0) then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  if char_length(pg_catalog.btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'reason_required' using errcode = 'P0001';
  end if;
  select * into o from sim.revenue_entries r where r.id = p_entry and r.corrects is null;
  if not found then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  insert into sim.revenue_entries (month, kind, creator_id, post_id, net_cents, note, recorded_by, corrects, correction_kind, evidence_ref)
  values (o.month, o.kind, o.creator_id, o.post_id, p_delta_cents, pg_catalog.left(pg_catalog.btrim(p_reason), 200), 'founder:' || v_uid,
          o.id, p_kind, nullif(pg_catalog.btrim(coalesce(p_evidence_ref, '')), ''))
  returning id into v_id;
  return v_id;
end;
$$;
comment on function public.app_founder_correct_revenue(bigint, bigint, text, text, text) is 'Founder: a SIMULATED compensating revenue entry (refund, invalid activity, correction or restoration) against an entry. The original is never changed.';

create function public.app_founder_correct_allocation(p_settlement bigint, p_member uuid, p_delta_cents bigint, p_kind text, p_reason text, p_evidence_ref text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_founder();
  v_id bigint;
begin
  if p_delta_cents is null or p_delta_cents = 0 or p_kind not in ('invalid_activity', 'correction', 'restoration')
     or (p_kind = 'invalid_activity' and p_delta_cents > 0) or (p_kind = 'restoration' and p_delta_cents < 0) then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  if char_length(pg_catalog.btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'reason_required' using errcode = 'P0001';
  end if;
  insert into sim.allocation_corrections (settlement_id, member_id, delta_cents, kind, reason, evidence_ref, recorded_by)
  values (p_settlement, p_member, p_delta_cents, p_kind, pg_catalog.btrim(p_reason), nullif(pg_catalog.btrim(coalesce(p_evidence_ref, '')), ''), 'founder:' || v_uid)
  returning id into v_id;
  return v_id;
end;
$$;
comment on function public.app_founder_correct_allocation(bigint, uuid, bigint, text, text, text) is 'Founder: a SIMULATED compensating correction to a member''s month-close allocation; value removed returns to the open pool.';

-- The progression scorecard (PRG-07): aggregates with their definitions and
-- denominators. Test accounts (the tester cohort) are excluded.
create function public.app_founder_progression_report()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_founder();
  v_creator jsonb := (select g.targets from sim.goal_versions g where g.audience = 'creator' order by g.id desc limit 1);
  v_consumer jsonb := (select g.targets from sim.goal_versions g where g.audience = 'consumer' order by g.id desc limit 1);
  v_referrals bigint;
  v_out jsonb;
begin
  perform v_uid;
  select count(*) into v_referrals from sim.points_ledger l
  where l.action = 'qualified_referral' and l.reverses is null and sim.award_state(l.id) in ('approved', 'settled');
  with mem as (
    select a.user_id as id,
           exists (select 1 from social.posts s where s.author_id = a.user_id and s.deleted_at is null and s.hidden_at is null) as publishes
    from ops.member_access a
    where a.status = 'active' and (a.expires_at is null or a.expires_at > pg_catalog.now()) and a.cohort <> 'tester'),
  vals as (
    select m.id, m.publishes, sim.goal_values(m.id, 'creator') as cv, sim.goal_values(m.id, 'consumer') as fv from mem m)
  select pg_catalog.jsonb_build_object(
    'kind', 'actual',
    'definitions', pg_catalog.jsonb_build_object(
      'creator_denominator', 'Active pilot members, testers excluded, who have published at least one eligible original post (no approved creator activation definition exists yet; see SP-PRG-001 8.5)',
      'consumer_denominator', 'Active pilot members, testers excluded',
      'milestone', 'Members whose current value meets the target in force, measured now'),
    'creator', pg_catalog.jsonb_build_object(
      'denominator', (select count(*) from vals v where v.publishes),
      'milestones', coalesce((select pg_catalog.jsonb_object_agg(m, (select count(*) from vals v
                                where v.publishes and v_creator ? m and (v.cv ->> m)::bigint >= (v_creator ->> m)::bigint))
                              from pg_catalog.unnest(sim.goal_metrics('creator')) m), '{}'::jsonb)),
    'consumer', pg_catalog.jsonb_build_object(
      'denominator', (select count(*) from vals),
      'milestones', coalesce((select pg_catalog.jsonb_object_agg(m, (select count(*) from vals v
                                where v_consumer ? m and (v.fv ->> m)::bigint >= (v_consumer ->> m)::bigint))
                              from pg_catalog.unnest(sim.goal_metrics('consumer')) m), '{}'::jsonb)),
    'statuses', (select pg_catalog.jsonb_object_agg(a.audience, coalesce((
                   select pg_catalog.jsonb_object_agg(s.st, s.n) from (
                     select sim.qualification_status(q.member_id, q.audience) as st, count(*) as n
                     from sim.qualifications q where q.audience = a.audience group by 1) s), '{}'::jsonb))
                 from (values ('creator'), ('consumer')) a(audience)),
    'referrals', pg_catalog.jsonb_build_object(
      'qualified_referrals', v_referrals,
      'members_with_target', (select count(*) from vals v where (v.fv ->> 'qualified_referrals')::bigint >= coalesce((v_consumer ->> 'qualified_referrals')::bigint, 1)),
      'theoretical_max_qualifying_consumers', v_referrals / greatest(coalesce((v_consumer ->> 'qualified_referrals')::bigint, 1), 1),
      'note', 'Each referral counts for one referrer, so the referral goal caps how many consumers can qualify.'),
    'integrity', pg_catalog.jsonb_build_object(
      'open_holds', (select count(*) from sim.financial_holds h where not exists (select 1 from sim.financial_hold_releases x where x.hold_id = h.id)),
      'account_holds', (select count(*) from sim.financial_holds h where h.scope = 'account' and not exists (select 1 from sim.financial_hold_releases x where x.hold_id = h.id)),
      'revocations', (select count(*) from sim.qualification_decisions d where d.decision = 'revoked'),
      'restorations', (select count(*) from sim.qualification_decisions d where d.decision = 'restored'),
      'revenue_corrections', (select count(*) from sim.revenue_entries r where r.corrects is not null),
      'allocation_corrections', (select count(*) from sim.allocation_corrections)),
    'money', pg_catalog.jsonb_build_object(
      'kind', 'simulated',
      'held_creator_cents', coalesce((select sum((sim.split(r.kind, r.net_cents)).creator_cents) from sim.revenue_entries r
                                      where r.kind = 'content_ad' and sim.entry_held(r.id)
                                        and not exists (select 1 from sim.creator_share_states s where s.revenue_entry_id = r.id and s.state = 'settled')), 0),
      'open_pool_cents', sim.open_pool_cents()))
  into v_out;
  return v_out;
end;
$$;
comment on function public.app_founder_progression_report() is 'Founder: the progression scorecard (SP-PRG-001 PRG-07). Milestone and status counts with definitions and denominators, referral feasibility, integrity counts and SIMULATED held amounts. Aggregates only; testers excluded.';

do $$
declare
  f text;
begin
  foreach f in array array['public.app_founder_progression_queue()',
                           'public.app_founder_decide_qualification(uuid, text, text, text, text, text)',
                           'public.app_founder_place_hold(uuid, text, bigint, bigint, text, text, text, text)',
                           'public.app_founder_release_hold(bigint, text)',
                           'public.app_founder_correct_revenue(bigint, bigint, text, text, text)',
                           'public.app_founder_correct_allocation(bigint, uuid, bigint, text, text, text)',
                           'public.app_founder_progression_report()'] loop
    execute pg_catalog.format('revoke all on function %s from public, anon', f);
    execute pg_catalog.format('grant execute on function %s to authenticated', f);
  end loop;
end;
$$;
