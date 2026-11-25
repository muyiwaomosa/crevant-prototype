-- Staging only: undoes 20261205000000 (rewards: simulated Connection Points,
-- referral review, simulated revenue and month close). Never run it against a
-- Production project. Tested locally by scripts/db/rollback-rewards-test.sh.
--
--   psql "<url>" -X -q -v ON_ERROR_STOP=1 -v mode=check -v confirm= -f scripts/db/staging-rollback-rewards.sql
--   psql "<url>" -X -q -v ON_ERROR_STOP=1 -v mode=apply -v confirm='REMOVE THE STAGING REWARDS' -f ...
--
-- Removes exactly the migration's objects and record. Refuses, changing
-- nothing, while any ledger entry, simulated revenue or settlement exists, if
-- the record or an expected object is missing, or a later migration exists.

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
     and current_setting('crevant.rollback_confirm') <> 'REMOVE THE STAGING REWARDS' then
    raise exception 'apply needs the confirmation phrase: REMOVE THE STAGING REWARDS';
  end if;
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise exception 'refused: no Supabase migration history here (supabase_migrations.schema_migrations)';
  end if;
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20261205000000')
     or to_regclass('sim.points_ledger') is null or to_regclass('sim.revenue_entries') is null
     or to_regprocedure('public.app_my_points()') is null then
    raise exception 'refused: expected objects are missing (20261205000000 rewards), so the database is not in the state this rollback was written for';
  end if;
  if exists (select 1 from supabase_migrations.schema_migrations where version > '20261205000000') then
    raise exception 'refused, nothing changed: a later migration is recorded';
  end if;
end $$;

lock table sim.points_ledger, sim.revenue_entries, sim.settlements in share row exclusive mode;

do $$
declare
  n bigint;
begin
  n := (select count(*) from sim.points_ledger) + (select count(*) from sim.revenue_entries) + (select count(*) from sim.settlements);
  if n > 0 then
    raise exception 'refused, nothing changed: % rows of data exist (points, simulated revenue or settlements). Fix forward instead.', n;
  end if;
end $$;

\echo 'Checks passed. Removing rewards and the migration record.'

drop function public.app_founder_set_rewards(boolean, integer);
drop function public.app_founder_rewards_overview();
drop function public.app_founder_close_month(date);
drop function public.app_founder_record_sim_revenue(date, text, uuid, uuid, bigint, text);
drop function public.app_founder_review_referral(bigint, boolean);
drop function public.app_founder_referral_queue();
drop function public.app_my_simulated_earnings();
drop function public.app_my_points_history(bigint, integer);
drop function public.app_my_points();
drop trigger rewards_comments on social.comments;
drop trigger rewards_saves on social.saves;
drop trigger rewards_reposts on social.reposts;
drop trigger rewards_shares on social.shares;
drop trigger rewards_follow_events on social.follow_events;
drop function sim.capture();
drop function sim.open_pool_cents();
drop function sim.outstanding();
drop table sim.settlement_lines;
drop table sim.settlements;
drop function sim.split(text, bigint);
drop table sim.revenue_entries;
drop function sim.reverse(text, text);
drop function sim.award(uuid, text, text, uuid, uuid);
drop function sim.award_state(bigint);
drop table sim.points_ledger;
drop function sim.ledger_is_append_only();
drop table sim.reward_settings;
drop table sim.point_rules;

delete from supabase_migrations.schema_migrations where version = '20261205000000';

select current_setting('crevant.rollback_mode') = 'apply' as apply \gset
\if :apply
  commit;
  \echo 'Applied: rewards and the migration record were removed.'
\else
  rollback;
  \echo 'Check only: every check and the removal succeeded inside the transaction, and all of it was rolled back. Nothing changed.'
\endif
