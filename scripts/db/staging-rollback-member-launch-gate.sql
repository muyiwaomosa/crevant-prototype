-- Staging only: undoes 20261129000000 (the member launch gate), so the
-- earlier rollbacks, which refuse while a later migration is recorded, can
-- run after it. Never run it against a Production project. Tested locally by
-- scripts/db/rollback-member-launch-gate-test.sh.
--
--   psql "<url>" -X -q -v ON_ERROR_STOP=1 -v mode=check -v confirm= -f scripts/db/staging-rollback-member-launch-gate.sql
--   psql "<url>" -X -q -v ON_ERROR_STOP=1 -v mode=apply -v confirm='REMOVE THE STAGING MEMBER LAUNCH GATE' -f ...
--
-- Removes the gate trigger and function, the two gate functions, and the
-- settings and records tables. Membership itself is untouched.
--
-- It refuses, changing nothing, while external access is NOT approved:
-- removing a closed gate would let any account be given membership again,
-- which is a widening, not a rollback. On such a database, approve external
-- access first (a separately approved, recorded operation) or fix forward.
-- It also refuses if the record or an expected object is missing, or a later
-- migration is recorded. Note: removing the gate removes its records
-- (ops.member_launch_events); export them first if they are needed.

\set ON_ERROR_STOP on
\pset footer off

begin;
set local lock_timeout = '10s';
set local statement_timeout = '60s';

-- An unset -v mode or -v confirm stops here with a syntax error, by design.
select set_config('crevant.rollback_mode', :'mode', true) as mode,
       set_config('crevant.rollback_confirm', :'confirm', true) <> '' as confirmation_given;

do $$
begin
  if current_setting('crevant.rollback_mode') not in ('check', 'apply') then
    raise exception 'mode must be check or apply';
  end if;
  if current_setting('crevant.rollback_mode') = 'apply'
     and current_setting('crevant.rollback_confirm') <> 'REMOVE THE STAGING MEMBER LAUNCH GATE' then
    raise exception 'apply needs the confirmation phrase: REMOVE THE STAGING MEMBER LAUNCH GATE';
  end if;
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise exception 'refused: no Supabase migration history here (supabase_migrations.schema_migrations)';
  end if;
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20261129000000')
     or to_regclass('ops.member_launch_settings') is null or to_regclass('ops.member_launch_events') is null
     or to_regprocedure('ops.member_launch_gate()') is null
     or to_regprocedure('ops.set_external_access(text, boolean, text)') is null
     or to_regprocedure('ops.set_launch_founder(text, uuid, text)') is null then
    raise exception 'refused: expected objects are missing (20261129000000 member launch gate), so the database is not in the state this rollback was written for';
  end if;
  if exists (select 1 from supabase_migrations.schema_migrations where version > '20261129000000') then
    raise exception 'refused, nothing changed: a later migration is recorded';
  end if;
end $$;

lock table ops.member_access, ops.member_launch_settings, ops.member_launch_events in share row exclusive mode;

do $$
begin
  if not coalesce((select external_access_approved from ops.member_launch_settings where id), false) then
    raise exception 'refused, nothing changed: external member access is not approved, so removing the gate would let any account be given membership. Approve it first (separately approved and recorded), or fix forward.';
  end if;
end $$;

select count(*) as launch_records_removed from ops.member_launch_events;
\echo 'Checks passed. Removing the member launch gate and its migration record.'

drop trigger member_access_launch_gate on ops.member_access;
drop function ops.member_launch_gate();
drop function ops.set_external_access(text, boolean, text);
drop function ops.set_launch_founder(text, uuid, text);
drop table ops.member_launch_events;
drop table ops.member_launch_settings;

delete from supabase_migrations.schema_migrations where version = '20261129000000';

select current_setting('crevant.rollback_mode') = 'apply' as apply \gset
\if :apply
  commit;
  \echo 'Applied: the member launch gate and its migration record were removed. Membership is unchanged.'
\else
  rollback;
  \echo 'Check only: every check and the removal succeeded inside the transaction, and all of it was rolled back. Nothing changed.'
\endif
