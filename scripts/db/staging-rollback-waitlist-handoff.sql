-- Staging only: undoes 20261223000000 (waitlist email verification and the
-- handoff). Never run it against a Production project.
-- Tested locally by scripts/db/rollback-waitlist-handoff-test.sh.
--
--   psql "<url>" -X -q -v ON_ERROR_STOP=1 -v mode=check -v confirm= -f scripts/db/staging-rollback-waitlist-handoff.sql
--   psql "<url>" -X -q -v ON_ERROR_STOP=1 -v mode=apply -v confirm='REMOVE STAGING WAITLIST HANDOFF' -f ...
--
-- Drops the verification links, the withdrawals, the handoff columns, the
-- seven functions and the waitlist_handoff login, and removes the migration
-- record. Verifications already recorded on entries stay (email_verified_at
-- existed before). Refuses, changing nothing, if the record is missing, a
-- later migration exists, or the handoff login has an open session.

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
     and current_setting('crevant.rollback_confirm') <> 'REMOVE STAGING WAITLIST HANDOFF' then
    raise exception 'apply needs the confirmation phrase: REMOVE STAGING WAITLIST HANDOFF';
  end if;
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise exception 'refused: no Supabase migration history here (supabase_migrations.schema_migrations)';
  end if;
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20261223000000')
     or to_regclass('ops.waitlist_withdrawals') is null then
    raise exception 'refused: expected objects are missing (20261223000000 waitlist handoff), so the database is not in the state this rollback was written for';
  end if;
  if exists (select 1 from supabase_migrations.schema_migrations where version > '20261223000000') then
    raise exception 'refused, nothing changed: a later migration is recorded';
  end if;
  if exists (select 1 from pg_stat_activity where usename = 'waitlist_handoff') then
    raise exception 'refused, nothing changed: the waitlist_handoff login has an open session';
  end if;
end $$;

drop function waitlist_api.verification_issue(text);
drop function waitlist_api.verify_email(text);
drop function waitlist_api.handoff_export(integer);
drop function waitlist_api.handoff_recheck(uuid[]);
drop function waitlist_api.handoff_record(uuid, text);
drop function waitlist_api.handoff_withdrawals(timestamptz);
drop function waitlist_api.handoff_forget(uuid[]);
drop function ops.waitlist_handoff_eligible(ops.waitlist);
drop trigger waitlist_record_withdrawal on ops.waitlist;
drop function ops.waitlist_record_withdrawal();
drop table ops.waitlist_withdrawals;
drop table ops.waitlist_email_verifications;
alter table ops.waitlist
  drop constraint waitlist_handoff_outcome_needs_export, drop constraint waitlist_handoff_outcome_allowed,
  drop column handoff_outcome_at, drop column handoff_outcome, drop column handoff_exported_at;
revoke usage on schema waitlist_api from waitlist_handoff;
drop role waitlist_handoff;
delete from supabase_migrations.schema_migrations where version = '20261223000000';

select current_setting('crevant.rollback_mode') = 'apply' as apply \gset
\if :apply
  commit;
  \echo 'Applied: waitlist verification links, the handoff functions and login were removed, and the migration record was removed.'
\else
  rollback;
  \echo 'Check only: every check and the removal succeeded inside the transaction, and all of it was rolled back. Nothing changed.'
\endif
