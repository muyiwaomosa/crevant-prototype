-- Progression (SP-REFINE-002, founder direction Nov 26): configurable goals,
-- creator and consumer qualification, and simulated locked earnings.
--
--   * A new operational switch, 'progression', OFF by default. While it is
--     off, members see nothing new and nobody qualifies.
--   * Goals: a fixed catalogue of measures read from existing data (posts,
--     follows, Cliques, active supporters, views, comments, saves, reposts,
--     shares, approved referrals). Target VALUES exist only as versioned,
--     append-only records the founder sets in Control Center, with a reason.
--     There are no default values: with none set, nothing qualifies.
--   * Qualification: recorded once, when every goal of the audience has a
--     target and is met and the member is in good standing (no restriction
--     or suspension in force). Once recorded it stays: later changes to the
--     targets never take it away.
--   * Simulated earnings states: a creator's share of each content
--     advertising entry, and a member's month-close allocation from the fan
--     pool (Option A: eligible points before qualification take their share
--     at the close, and the value stays locked), are LOCKED until the member
--     qualifies, then ELIGIBLE, then SETTLED. States are append-only rows; the
--     database refuses an eligible state for an unqualified member, a settled
--     state before an eligible one, or any state twice. Splitpost never takes
--     a locked amount. Nothing is paid: every amount is simulated.
--
-- Not here (founder decisions pending): goal values, the Connection Score,
-- account deletion, dormancy and disqualification treatment of balances.
-- Progression never influences distribution: no feed, discovery or
-- advertising function reads these tables (checked by 033).

-- ---------------------------------------------------------------------------
-- The switch

alter table ops.feature_switches drop constraint feature_switches_feature_check;
alter table ops.feature_switches add constraint feature_switches_feature_check
  check (feature in ('ads', 'sharing', 'video_posts', 'video_playback', 'progression'));
insert into ops.feature_switches (feature, enabled) values ('progression', false);

create or replace function public.app_features()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_member();
begin
  return pg_catalog.jsonb_build_object(
    'ads', ops.feature_on('ads'),
    'sharing', ops.feature_on('sharing'),
    'video_posts', ops.feature_on('video_posts'),
    'video_playback', ops.feature_on('video_playback'),
    'progression', ops.feature_on('progression'),
    'photos', coalesce((select m.photos_enabled from ops.media_settings m where m.id), false),
    'rewards', not coalesce((select r.paused from sim.reward_settings r limit 1), false));
end;
$$;

-- ---------------------------------------------------------------------------
-- Goals

-- The catalogue: which measures each journey has. Values are never here.
create function sim.goal_metrics(p_audience text)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select case p_audience
    when 'creator' then array['original_posts', 'posting_weeks', 'genuine_followers', 'active_supporters', 'clique_connections']
    when 'consumer' then array['clique_engagement_weeks', 'support_weeks', 'shares', 'verified_contributions']
  end;
$$;
revoke all on function sim.goal_metrics(text) from public, anon, authenticated;

create table sim.goal_versions (
  id        bigint generated always as identity primary key,
  audience  text not null check (audience in ('creator', 'consumer')),
  targets   jsonb not null check (pg_catalog.jsonb_typeof(targets) = 'object'),
  reason    text not null check (char_length(reason) between 3 and 300),
  set_by    text not null,
  set_at    timestamptz not null default pg_catalog.now()
);
comment on table sim.goal_versions is 'Goal target values set by the founder, one row per change, with the reason. The latest row per audience is in force. Append-only.';
alter table sim.goal_versions enable row level security;
revoke all on table sim.goal_versions from public, anon, authenticated;
create trigger goal_versions_append_only before update or delete on sim.goal_versions
for each row execute function ops.history_append_only();
create trigger goal_versions_no_truncate before truncate on sim.goal_versions
for each statement execute function ops.history_append_only();

create table sim.qualifications (
  member_id     uuid not null references auth.users (id) on delete cascade,
  audience      text not null check (audience in ('creator', 'consumer')),
  version_id    bigint not null references sim.goal_versions (id),
  qualified_at  timestamptz not null default pg_catalog.now(),
  primary key (member_id, audience)
);
comment on table sim.qualifications is 'Members who met every goal of a journey (creator or consumer) under the version in force, in good standing. Recorded once and never taken away by a later change to the goals. Append-only.';
alter table sim.qualifications enable row level security;
revoke all on table sim.qualifications from public, anon, authenticated;
-- Only an account deletion removes a qualification (with the account).
create trigger qualifications_append_only before update or delete on sim.qualifications
for each row when (pg_catalog.pg_trigger_depth() = 0) execute function ops.history_append_only();
create trigger qualifications_no_truncate before truncate on sim.qualifications
for each statement execute function ops.history_append_only();

-- Good standing: no restriction or suspension in force (warnings do not count).
create function sim.in_good_standing(p_member uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
    select 1 from ops.enforcements e
    where e.member_id = p_member and e.level in ('restriction', 'suspension')
      and e.starts_at <= pg_catalog.now() and (e.ends_at is null or e.ends_at > pg_catalog.now())
      and not exists (select 1 from ops.enforcement_lifts l where l.enforcement_id = e.id));
$$;
revoke all on function sim.in_good_standing(uuid) from public, anon, authenticated;

-- Each measure, from data that already exists. Week counts use calendar weeks.
-- Never from views or time spent; follows and likes count only as audience.
create function sim.goal_values(p_member uuid, p_audience text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case p_audience
  when 'creator' then pg_catalog.jsonb_build_object(
    'original_posts', (select count(*) from social.posts s where s.author_id = p_member and s.deleted_at is null and s.hidden_at is null),
    'posting_weeks', (select count(distinct pg_catalog.date_trunc('week', s.created_at)) from social.posts s
                      where s.author_id = p_member and s.deleted_at is null and s.hidden_at is null and s.created_at >= pg_catalog.now() - interval '6 weeks'),
    'genuine_followers', (select count(*) from social.follows f join social.visible_members v on v.id = f.follower_id
                          where f.creator_id = p_member),
    'active_supporters', (select count(*) from social.follows f
                          where f.creator_id = p_member and social.is_active_supporter(f.follower_id, p_member)),
    'clique_connections', (select count(*) from social.clique_members c join social.visible_members v on v.id = c.fan_id
                           where c.creator_id = p_member and c.removed_at is null))
  when 'consumer' then pg_catalog.jsonb_build_object(
    -- Views are never a reward signal (067), so the Clique step counts
    -- support for members of your Clique, not reading.
    'clique_engagement_weeks', (select count(distinct x.wk) from (
                        select pg_catalog.date_trunc('week', c.created_at) as wk from social.comments c
                        join social.posts s on s.id = c.post_id
                        join social.clique_members q on q.fan_id = p_member and q.creator_id = s.author_id and q.removed_at is null
                        where c.author_id = p_member and c.deleted_at is null
                          and c.created_at >= pg_catalog.now() - interval '4 weeks' and social.meaningful_comment(c.body)
                        union all
                        select pg_catalog.date_trunc('week', v.saved_at) from social.saves v
                        join social.posts s on s.id = v.post_id
                        join social.clique_members q on q.fan_id = p_member and q.creator_id = s.author_id and q.removed_at is null
                        where v.member_id = p_member and v.saved_at >= pg_catalog.now() - interval '4 weeks'
                        union all
                        select pg_catalog.date_trunc('week', r.created_at) from social.reposts r
                        join social.posts s on s.id = r.post_id
                        join social.clique_members q on q.fan_id = p_member and q.creator_id = s.author_id and q.removed_at is null
                        where r.reposter_id = p_member and r.created_at >= pg_catalog.now() - interval '4 weeks') x),
    'support_weeks', (select count(distinct x.wk) from (
                        select pg_catalog.date_trunc('week', c.created_at) as wk from social.comments c join social.posts s on s.id = c.post_id
                        where c.author_id = p_member and s.author_id <> p_member and c.deleted_at is null
                          and c.created_at >= pg_catalog.now() - interval '6 weeks' and social.meaningful_comment(c.body)
                        union all
                        select pg_catalog.date_trunc('week', v.saved_at) from social.saves v join social.posts s on s.id = v.post_id
                        where v.member_id = p_member and s.author_id <> p_member and v.saved_at >= pg_catalog.now() - interval '6 weeks'
                        union all
                        select pg_catalog.date_trunc('week', r.created_at) from social.reposts r join social.posts s on s.id = r.post_id
                        where r.reposter_id = p_member and s.author_id <> p_member and r.created_at >= pg_catalog.now() - interval '6 weeks') x),
    'shares', (select count(*) from social.shares h join social.posts s on s.id = h.post_id
               where h.member_id = p_member and s.author_id <> p_member and h.created_at >= pg_catalog.now() - interval '28 days'),
    'verified_contributions', (select count(*) from sim.points_ledger l
                               where l.member_id = p_member and l.action = 'qualified_referral' and l.reverses is null
                                 and sim.award_state(l.id) in ('approved', 'settled')))
  end;
$$;
revoke all on function sim.goal_values(uuid, text) from public, anon, authenticated;

-- A journey's steps against the targets in force (null target: not set).
create function sim.goal_steps(p_member uuid, p_audience text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with v as (select g.id, g.targets from sim.goal_versions g where g.audience = p_audience order by g.id desc limit 1),
       m as (select sim.goal_values(p_member, p_audience) as vals)
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
           'metric', k.metric,
           'value', (m.vals ->> k.metric)::bigint,
           'target', (v.targets ->> k.metric)::bigint) order by k.ord), '[]'::jsonb)
  from pg_catalog.unnest(sim.goal_metrics(p_audience)) with ordinality as k(metric, ord)
  cross join m
  left join v on true;
$$;
revoke all on function sim.goal_steps(uuid, text) from public, anon, authenticated;

-- Records a qualification when every goal has a target and is met and the
-- member is in good standing. Never qualifies on an unset goal. Idempotent.
create function sim.check_qualification(p_member uuid, p_audience text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version sim.goal_versions%rowtype;
  v_vals jsonb;
  k text;
begin
  if exists (select 1 from sim.qualifications q where q.member_id = p_member and q.audience = p_audience) then
    return true;
  end if;
  select * into v_version from sim.goal_versions g where g.audience = p_audience order by g.id desc limit 1;
  if not found or not sim.in_good_standing(p_member) then
    return false;
  end if;
  v_vals := sim.goal_values(p_member, p_audience);
  foreach k in array sim.goal_metrics(p_audience) loop
    if (v_version.targets ->> k) is null or (v_vals ->> k)::bigint < (v_version.targets ->> k)::bigint then
      return false;
    end if;
  end loop;
  insert into sim.qualifications (member_id, audience, version_id) values (p_member, p_audience, v_version.id)
  on conflict (member_id, audience) do nothing;
  return true;
end;
$$;
revoke all on function sim.check_qualification(uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Simulated earnings states (locked until qualified)

create table sim.creator_share_states (
  id                bigint generated always as identity primary key,
  revenue_entry_id  bigint not null references sim.revenue_entries (id),
  state             text not null check (state in ('eligible', 'settled')),
  set_by            text not null,
  set_at            timestamptz not null default pg_catalog.now(),
  unique (revenue_entry_id, state)
);
comment on table sim.creator_share_states is 'SIMULATED: the creator share of a content advertising entry is locked until its creator qualifies, then eligible, then settled. Append-only; never money.';

create table sim.allocation_states (
  id             bigint generated always as identity primary key,
  settlement_id  bigint not null references sim.settlements (id),
  member_id      uuid references auth.users (id) on delete set null,
  state          text not null check (state in ('eligible', 'settled')),
  set_by         text not null,
  set_at         timestamptz not null default pg_catalog.now(),
  unique (settlement_id, member_id, state)
);
comment on table sim.allocation_states is 'SIMULATED: a member''s fan pool allocation at a month close is locked until they qualify as a consumer, then eligible, then settled. Append-only; never money.';

do $$
declare
  t text;
begin
  foreach t in array array['sim.creator_share_states', 'sim.allocation_states'] loop
    execute pg_catalog.format('alter table %s enable row level security', t);
    execute pg_catalog.format('revoke all on table %s from public, anon, authenticated', t);
    -- An account deletion may clear the member link (as on settlement lines); nothing else changes a row.
    execute pg_catalog.format('create trigger %s before update or delete on %s for each row when (pg_catalog.pg_trigger_depth() = 0) execute function ops.history_append_only()',
                              pg_catalog.replace(t, 'sim.', '') || '_append_only', t);
    execute pg_catalog.format('create trigger %s before truncate on %s for each statement execute function ops.history_append_only()',
                              pg_catalog.replace(t, 'sim.', '') || '_no_truncate', t);
  end loop;
end;
$$;

-- The database enforces the order: eligible only once qualified, settled only after eligible.
create function sim.earnings_state_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member uuid;
  v_audience text;
begin
  if tg_table_name = 'creator_share_states' then
    select r.creator_id into v_member from sim.revenue_entries r where r.id = new.revenue_entry_id and r.kind = 'content_ad';
    v_audience := 'creator';
    if new.state = 'settled' and not exists (select 1 from sim.creator_share_states s where s.revenue_entry_id = new.revenue_entry_id and s.state = 'eligible') then
      raise exception 'not_eligible' using errcode = 'P0001';
    end if;
  else
    select l.member_id into v_member from sim.settlement_lines l where l.settlement_id = new.settlement_id and l.member_id = new.member_id;
    v_audience := 'consumer';
    if new.state = 'settled' and not exists (select 1 from sim.allocation_states s where s.settlement_id = new.settlement_id and s.member_id = new.member_id and s.state = 'eligible') then
      raise exception 'not_eligible' using errcode = 'P0001';
    end if;
  end if;
  if v_member is null or not exists (select 1 from sim.qualifications q where q.member_id = v_member and q.audience = v_audience) then
    raise exception 'not_qualified' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke all on function sim.earnings_state_guard() from public, anon, authenticated;
create trigger creator_share_states_guard before insert on sim.creator_share_states for each row execute function sim.earnings_state_guard();
create trigger allocation_states_guard before insert on sim.allocation_states for each row execute function sim.earnings_state_guard();

-- Releases everything a qualified member in good standing has accumulated
-- (idempotent). Under a restriction or suspension, nothing new is released.
create function sim.release_qualified(p_member uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not sim.in_good_standing(p_member) then
    return;
  end if;
  if exists (select 1 from sim.qualifications q where q.member_id = p_member and q.audience = 'creator') then
    insert into sim.creator_share_states (revenue_entry_id, state, set_by)
    select r.id, 'eligible', 'qualification' from sim.revenue_entries r
    where r.creator_id = p_member and r.kind = 'content_ad'
    on conflict (revenue_entry_id, state) do nothing;
  end if;
  if exists (select 1 from sim.qualifications q where q.member_id = p_member and q.audience = 'consumer') then
    insert into sim.allocation_states (settlement_id, member_id, state, set_by)
    select l.settlement_id, l.member_id, 'eligible', 'qualification' from sim.settlement_lines l
    where l.member_id = p_member
    on conflict (settlement_id, member_id, state) do nothing;
  end if;
end;
$$;
revoke all on function sim.release_qualified(uuid) from public, anon, authenticated;

-- A member's simulated totals by state, in cents.
create function sim.earnings_summary(p_member uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with c as (
    select (sim.split(r.kind, r.net_cents)).creator_cents as cents,
           exists (select 1 from sim.creator_share_states s where s.revenue_entry_id = r.id and s.state = 'eligible') as eligible,
           exists (select 1 from sim.creator_share_states s where s.revenue_entry_id = r.id and s.state = 'settled') as settled
    from sim.revenue_entries r where r.creator_id = p_member and r.kind = 'content_ad'),
  a as (
    select l.value_cents as cents,
           exists (select 1 from sim.allocation_states s where s.settlement_id = l.settlement_id and s.member_id = l.member_id and s.state = 'eligible') as eligible,
           exists (select 1 from sim.allocation_states s where s.settlement_id = l.settlement_id and s.member_id = l.member_id and s.state = 'settled') as settled
    from sim.settlement_lines l where l.member_id = p_member)
  select pg_catalog.jsonb_build_object(
    'creator', pg_catalog.jsonb_build_object(
      'accumulated_cents', coalesce((select sum(cents) from c), 0),
      'locked_cents', coalesce((select sum(cents) from c where not eligible), 0),
      'eligible_cents', coalesce((select sum(cents) from c where eligible and not settled), 0),
      'settled_cents', coalesce((select sum(cents) from c where settled), 0)),
    'consumer', pg_catalog.jsonb_build_object(
      'accumulated_cents', coalesce((select sum(cents) from a), 0),
      'locked_cents', coalesce((select sum(cents) from a where not eligible), 0),
      'eligible_cents', coalesce((select sum(cents) from a where eligible and not settled), 0),
      'settled_cents', coalesce((select sum(cents) from a where settled), 0)));
$$;
revoke all on function sim.earnings_summary(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Member and founder functions

-- The member's progress. Off while the switch is off; then nothing is checked.
create function public.app_my_progress()
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
      'qualified_at', (select q.qualified_at from sim.qualifications q where q.member_id = v_uid and q.audience = 'creator'),
      'steps', sim.goal_steps(v_uid, 'creator')),
    'consumer', pg_catalog.jsonb_build_object(
      'qualified_at', (select q.qualified_at from sim.qualifications q where q.member_id = v_uid and q.audience = 'consumer'),
      'steps', sim.goal_steps(v_uid, 'consumer')),
    'earnings', sim.earnings_summary(v_uid));
end;
$$;
comment on function public.app_my_progress() is 'The member''s own goals, qualification and SIMULATED earnings by state. While the progression switch is off: {enabled: false}, and nothing is checked or released.';

-- The founder sets a journey's goal values: every measure, whole numbers of 1 or more, with a reason.
create function public.app_founder_set_goals(p_audience text, p_targets jsonb, p_reason text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_founder();
  v_reason text := pg_catalog.btrim(coalesce(p_reason, ''));
  v_metrics text[] := sim.goal_metrics(p_audience);
  k text;
  v_id bigint;
begin
  if v_metrics is null or p_targets is null or pg_catalog.jsonb_typeof(p_targets) <> 'object' then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  if char_length(v_reason) < 3 then
    raise exception 'reason_required' using errcode = 'P0001';
  end if;
  if exists (select 1 from pg_catalog.jsonb_object_keys(p_targets) x where x <> all (v_metrics)) then
    raise exception 'unknown_goal' using errcode = 'P0001';
  end if;
  foreach k in array v_metrics loop
    if pg_catalog.jsonb_typeof(p_targets -> k) is distinct from 'number'
       or (p_targets ->> k) !~ '^[0-9]+$' or (p_targets ->> k)::bigint < 1 or (p_targets ->> k)::bigint > 100000 then
      raise exception 'every_goal_needs_a_value' using errcode = 'P0001';
    end if;
  end loop;
  insert into sim.goal_versions (audience, targets, reason, set_by) values (p_audience, p_targets, v_reason, 'founder:' || v_uid)
  returning id into v_id;
  return v_id;
end;
$$;
comment on function public.app_founder_set_goals(text, jsonb, text) is 'Founder: sets every goal value of a journey (creator or consumer), with a reason. Recorded as a new version; members already qualified stay qualified.';

create function public.app_founder_goals()
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
    'catalogue', pg_catalog.jsonb_build_object('creator', pg_catalog.to_jsonb(sim.goal_metrics('creator')), 'consumer', pg_catalog.to_jsonb(sim.goal_metrics('consumer'))),
    'versions', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id', g.id, 'audience', g.audience, 'targets', g.targets,
                                                                                   'reason', g.reason, 'set_at', g.set_at) order by g.id desc)
                          from sim.goal_versions g), '[]'::jsonb),
    'qualified', pg_catalog.jsonb_build_object(
      'creator', (select count(*) from sim.qualifications q where q.audience = 'creator'),
      'consumer', (select count(*) from sim.qualifications q where q.audience = 'consumer')));
end;
$$;
comment on function public.app_founder_goals() is 'Founder: the goal catalogue, every version of the values with its reason, and how many members qualified.';

-- SIMULATED settlement of everything eligible (a statement, never a payment). Idempotent.
create function public.app_founder_settle_eligible(p_reason text)
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
begin
  if char_length(v_reason) < 3 then
    raise exception 'reason_required' using errcode = 'P0001';
  end if;
  insert into sim.creator_share_states (revenue_entry_id, state, set_by)
  select s.revenue_entry_id, 'settled', 'founder:' || v_uid from sim.creator_share_states s
  join sim.revenue_entries r on r.id = s.revenue_entry_id
  where s.state = 'eligible' and r.creator_id is not null and sim.in_good_standing(r.creator_id)
  on conflict (revenue_entry_id, state) do nothing;
  get diagnostics v_creator = row_count;
  insert into sim.allocation_states (settlement_id, member_id, state, set_by)
  select s.settlement_id, s.member_id, 'settled', 'founder:' || v_uid from sim.allocation_states s
  where s.state = 'eligible' and s.member_id is not null and sim.in_good_standing(s.member_id)
  on conflict (settlement_id, member_id, state) do nothing;
  get diagnostics v_consumer = row_count;
  return pg_catalog.jsonb_build_object('creator_entries', v_creator, 'consumer_allocations', v_consumer);
end;
$$;
comment on function public.app_founder_settle_eligible(text) is 'Founder: SIMULATED settlement of every eligible creator share and consumer allocation whose member is in good standing. Nothing is paid.';

do $$
declare
  f text;
begin
  foreach f in array array['public.app_my_progress()', 'public.app_founder_set_goals(text, jsonb, text)',
                           'public.app_founder_goals()', 'public.app_founder_settle_eligible(text)'] loop
    execute pg_catalog.format('revoke all on function %s from public, anon', f);
    execute pg_catalog.format('grant execute on function %s to authenticated', f);
  end loop;
end;
$$;
