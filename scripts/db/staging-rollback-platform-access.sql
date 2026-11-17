-- Staging only: removes the migration record of 20261118000000
-- (platform_function_access), so the earlier rollbacks (social core, creator
-- acquisition, waitlist), which refuse while a later migration is recorded,
-- can run after it. Never run it against Production. Tested locally by
-- scripts/db/rollback-platform-access-test.sh.
--
--   psql "<url>" -X -q -v ON_ERROR_STOP=1 -v mode=check -v confirm= -f scripts/db/staging-rollback-platform-access.sql
--   psql "<url>" -X -q -v ON_ERROR_STOP=1 -v mode=apply -v confirm='REMOVE THE STAGING PLATFORM ACCESS RECORD' -f ...
--
-- That migration created nothing; it only took EXECUTE on
-- public.rls_auto_enable() away from members and the waitlist logins. This
-- rollback deliberately does NOT give those grants back: nothing needs them,
-- and restoring them would reopen what the migration closed. Applying the
-- migration again later is harmless (it is idempotent).
--
-- Refuses, changing nothing, if the record is missing or a later migration
-- is recorded.

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
     and current_setting('crevant.rollback_confirm') <> 'REMOVE THE STAGING PLATFORM ACCESS RECORD' then
    raise exception 'apply needs the confirmation phrase: REMOVE THE STAGING PLATFORM ACCESS RECORD';
  end if;
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise exception 'refused: no Supabase migration history here (supabase_migrations.schema_migrations)';
  end if;
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20261118000000') then
    raise exception 'refused: expected objects are missing (20261118000000 platform_function_access), so the database is not in the state this rollback was written for';
  end if;
  if exists (select 1 from supabase_migrations.schema_migrations where version > '20261118000000') then
    raise exception 'refused, nothing changed: a later migration is recorded';
  end if;
end $$;

\echo 'Checks passed. To remove: the migration record 20261118000000 platform_function_access (no objects, no grants).'
delete from supabase_migrations.schema_migrations where version = '20261118000000';

select current_setting('crevant.rollback_mode') = 'apply' as apply \gset
\if :apply
  commit;
  \echo 'Applied: the platform function access migration record was removed. The grants it removed stay removed.'
\else
  rollback;
  \echo 'Check only: every check and the removal succeeded inside the transaction, and all of it was rolled back. Nothing changed.'
\endif
