-- Staging only: undoes 20261217000000 (progression). Never run it against a Production project. Tested locally by
-- scripts/db/rollback-progression-test.sh.
--
--   psql "<url>" -X -q -v ON_ERROR_STOP=1 -v mode=check -v confirm= -f scripts/db/staging-rollback-progression.sql
--   psql "<url>" -X -q -v ON_ERROR_STOP=1 -v mode=apply -v confirm='REMOVE STAGING PROGRESSION' -f ...
--
-- Removes the goals, qualifications, simulated earnings states, their
-- functions and the progression switch, and restores public.app_features()
-- as 20261213000000 left it. Refuses, changing nothing, while the switch is
-- on, while any goal value, qualification or earnings state is recorded (that
-- history would be lost), if the record or an expected object is missing, or
-- a later migration exists. The switch's change history stays.

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
     and current_setting('crevant.rollback_confirm') <> 'REMOVE STAGING PROGRESSION' then
    raise exception 'apply needs the confirmation phrase: REMOVE STAGING PROGRESSION';
  end if;
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise exception 'refused: no Supabase migration history here (supabase_migrations.schema_migrations)';
  end if;
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20261217000000')
     or to_regclass('sim.goal_versions') is null or to_regclass('sim.allocation_states') is null then
    raise exception 'refused: expected objects are missing (20261217000000 progression), so the database is not in the state this rollback was written for';
  end if;
  if exists (select 1 from supabase_migrations.schema_migrations where version > '20261217000000') then
    raise exception 'refused, nothing changed: a later migration is recorded';
  end if;
end $$;

lock table ops.feature_switches, sim.goal_versions, sim.qualifications, sim.creator_share_states, sim.allocation_states in share row exclusive mode;

do $$
begin
  if ops.feature_on('progression') then
    raise exception 'refused, nothing changed: the progression switch is on; switch it off in Control Center first';
  end if;
  if exists (select 1 from sim.goal_versions) or exists (select 1 from sim.qualifications)
     or exists (select 1 from sim.creator_share_states) or exists (select 1 from sim.allocation_states) then
    raise exception 'refused, nothing changed: goal values, qualifications or simulated earnings states are recorded, and removing them would lose that history';
  end if;
end $$;

\echo 'Checks passed. Removing progression and the migration record.'

drop function public.app_my_progress();
drop function public.app_founder_set_goals(text, jsonb, text);
drop function public.app_founder_goals();
drop function public.app_founder_settle_eligible(text);
drop function sim.earnings_summary(uuid);
drop function sim.release_qualified(uuid);
drop table sim.allocation_states;
drop table sim.creator_share_states;
drop function sim.earnings_state_guard();
drop function sim.check_qualification(uuid, text);
drop function sim.goal_steps(uuid, text);
drop function sim.goal_values(uuid, text);
drop function sim.in_good_standing(uuid);
drop table sim.qualifications;
drop table sim.goal_versions;
drop function sim.goal_metrics(text);

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
    'photos', coalesce((select m.photos_enabled from ops.media_settings m where m.id), false),
    'rewards', not coalesce((select r.paused from sim.reward_settings r limit 1), false));
end;
$$;

delete from ops.feature_switches where feature = 'progression';
alter table ops.feature_switches drop constraint feature_switches_feature_check;
alter table ops.feature_switches add constraint feature_switches_feature_check
  check (feature in ('ads', 'sharing', 'video_posts', 'video_playback'));
delete from supabase_migrations.schema_migrations where version = '20261217000000';

select current_setting('crevant.rollback_mode') = 'apply' as apply \gset
\if :apply
  commit;
  \echo 'Applied: progression and the migration record were removed.'
\else
  rollback;
  \echo 'Check only: every check and the removal succeeded inside the transaction, and all of it was rolled back. Nothing changed.'
\endif
