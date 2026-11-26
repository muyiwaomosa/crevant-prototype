-- Staging only: undoes 20261218000000 (progression rules, SP-PRG-001). Never run it against a Production project. Tested locally by
-- scripts/db/rollback-progression-rules-test.sh.
--
--   psql "<url>" -X -q -v ON_ERROR_STOP=1 -v mode=check -v confirm= -f scripts/db/staging-rollback-progression-rules.sql
--   psql "<url>" -X -q -v ON_ERROR_STOP=1 -v mode=apply -v confirm='REMOVE STAGING PROGRESSION RULES' -f ...
--
-- Restores the progression functions exactly as 20261217000000 left them
-- (and the open pool as 20261205000000 left it), removes the review,
-- holds, corrections and scorecard, and the two goal versions holding the
-- approved benchmarks. Refuses, changing nothing, while any qualification,
-- decision, hold, correction, earnings state or other goal version is
-- recorded (that history would be lost), if the record or an expected object
-- is missing, or a later migration exists.

\set ON_ERROR_STOP on
\pset footer off

begin;
set local lock_timeout = '10s';
set local statement_timeout = '60s';

select set_config('crevant.rollback_mode', :'mode', true) as mode,
       set_config('crevant.rollback_confirm', :'confirm', true) <> '' as confirmation_given;

do $$
begin
  if current_setting('crevant.rollback_mode') not in ('check', 'apply') then
    raise exception 'mode must be check or apply';
  end if;
  if current_setting('crevant.rollback_mode') = 'apply'
     and current_setting('crevant.rollback_confirm') <> 'REMOVE STAGING PROGRESSION RULES' then
    raise exception 'apply needs the confirmation phrase: REMOVE STAGING PROGRESSION RULES';
  end if;
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise exception 'refused: no Supabase migration history here (supabase_migrations.schema_migrations)';
  end if;
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20261218000000')
     or to_regclass('sim.qualification_decisions') is null or to_regclass('sim.allocation_corrections') is null then
    raise exception 'refused: expected objects are missing (20261218000000 progression rules), so the database is not in the state this rollback was written for';
  end if;
  if exists (select 1 from supabase_migrations.schema_migrations where version > '20261218000000') then
    raise exception 'refused, nothing changed: a later migration is recorded';
  end if;
end $$;

lock table sim.goal_versions, sim.qualifications, sim.qualification_decisions, sim.financial_holds, sim.allocation_corrections,
           sim.revenue_entries, sim.creator_share_states, sim.allocation_states in share row exclusive mode;

do $$
begin
  if exists (select 1 from sim.qualifications) or exists (select 1 from sim.qualification_decisions)
     or exists (select 1 from sim.financial_holds) or exists (select 1 from sim.allocation_corrections)
     or exists (select 1 from sim.revenue_entries where corrects is not null)
     or exists (select 1 from sim.creator_share_states) or exists (select 1 from sim.allocation_states)
     or exists (select 1 from sim.goal_versions where set_by not like 'founder-approved:SP-PRG-001 %') then
    raise exception 'refused, nothing changed: qualifications, decisions, holds, corrections, earnings states or goal changes are recorded, and removing them would lose that history';
  end if;
end $$;

\echo 'Checks passed. Removing the progression rules and the migration record.'

drop function public.app_founder_progression_queue();
drop function public.app_founder_decide_qualification(uuid, text, text, text, text, text);
drop function public.app_founder_place_hold(uuid, text, bigint, bigint, text, text, text, text);
drop function public.app_founder_release_hold(bigint, text);
drop function public.app_founder_correct_revenue(bigint, bigint, text, text, text);
drop function public.app_founder_correct_allocation(bigint, uuid, bigint, text, text, text);
drop function public.app_founder_progression_report();
drop function sim.member_notices(uuid);

-- The functions as 20261217000000 (and 20261205000000) left them.
create or replace function sim.goal_metrics(p_audience text)
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

create or replace function sim.goal_values(p_member uuid, p_audience text)
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

create or replace function sim.check_qualification(p_member uuid, p_audience text)
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

create or replace function sim.earnings_state_guard()
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

create or replace function sim.release_qualified(p_member uuid)
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

create or replace function sim.earnings_summary(p_member uuid)
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
      'qualified_at', (select q.qualified_at from sim.qualifications q where q.member_id = v_uid and q.audience = 'creator'),
      'steps', sim.goal_steps(v_uid, 'creator')),
    'consumer', pg_catalog.jsonb_build_object(
      'qualified_at', (select q.qualified_at from sim.qualifications q where q.member_id = v_uid and q.audience = 'consumer'),
      'steps', sim.goal_steps(v_uid, 'consumer')),
    'earnings', sim.earnings_summary(v_uid));
end;
$$;

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

create or replace function sim.open_pool_cents()
returns bigint
language sql
stable
set search_path = ''
as $$
  select coalesce((select sum((sim.split(r.kind, r.net_cents)).pool_cents) from sim.revenue_entries r), 0)
       - coalesce((select sum(sl.value_cents) from sim.settlement_lines sl), 0);
$$;

drop trigger allocation_correction_states_guard on sim.allocation_correction_states;
drop function sim.released(uuid, text);
drop function sim.qualification_status(uuid, text);
drop function sim.allocation_held(bigint, uuid);
drop function sim.entry_held(bigint);
drop function sim.account_held(uuid);
drop table sim.allocation_correction_states;
drop table sim.allocation_corrections;
drop function sim.allocation_correction_guard();
drop trigger revenue_correction_guard on sim.revenue_entries;
drop function sim.revenue_correction_guard();
alter table sim.revenue_entries drop constraint revenue_entries_net_cents_check;
alter table sim.revenue_entries drop column evidence_ref, drop column correction_kind, drop column corrects;
alter table sim.revenue_entries add constraint revenue_entries_net_cents_check check (net_cents >= 0);
drop table sim.financial_hold_releases;
drop table sim.financial_holds;
drop table sim.qualification_decisions;
drop function sim.goals_met(jsonb, jsonb, text[]);
drop function sim.meaningful_engagements(uuid);
drop function sim.utc_week(timestamptz);
drop function sim.eligible_member(uuid);
-- The two versions holding the approved benchmarks (only they exist: checked above).
alter table sim.goal_versions disable trigger goal_versions_append_only;
delete from sim.goal_versions where set_by like 'founder-approved:SP-PRG-001 %';
alter table sim.goal_versions enable trigger goal_versions_append_only;
delete from supabase_migrations.schema_migrations where version = '20261218000000';

select current_setting('crevant.rollback_mode') = 'apply' as apply \gset
\if :apply
  commit;
  \echo 'Applied: the progression rules and the migration record were removed.'
\else
  rollback;
  \echo 'Check only: every check and the removal succeeded inside the transaction, and all of it was rolled back. Nothing changed.'
\endif
