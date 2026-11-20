-- Staging only: undoes 20261126000000 (member feedback), so the earlier
-- rollbacks, which refuse while a later migration is recorded, can run after
-- it. Never run it against Production. Tested locally by
-- scripts/db/rollback-feedback-test.sh.
--
--   psql "<url>" -X -q -v ON_ERROR_STOP=1 -v mode=check -v confirm= -f scripts/db/staging-rollback-feedback.sql
--   psql "<url>" -X -q -v ON_ERROR_STOP=1 -v mode=apply -v confirm='REMOVE THE STAGING FEEDBACK' -f ...
--
-- Removes the feedback and founder functions, social.current_founder, the
-- retention purge, the feedback, note and audit tables, and the migration
-- record. Nothing earlier is changed.
--
-- Refuses, changing nothing, if the record or an expected object is missing,
-- a later migration is recorded, or ANY feedback, note or audit entry exists:
-- members' messages and the founder's records are never dropped by a
-- rollback. Once any exist, fix forward instead (or delete them first with
-- ops.purge_feedback, which is recorded, if the founder decides to).

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
     and current_setting('crevant.rollback_confirm') <> 'REMOVE THE STAGING FEEDBACK' then
    raise exception 'apply needs the confirmation phrase: REMOVE THE STAGING FEEDBACK';
  end if;
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise exception 'refused: no Supabase migration history here (supabase_migrations.schema_migrations)';
  end if;
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20261126000000')
     or to_regclass('ops.feedback') is null
     or to_regclass('ops.feedback_notes') is null
     or to_regclass('ops.feedback_actions') is null
     or to_regprocedure('social.current_founder()') is null
     or to_regprocedure('public.app_feedback_submit(text, text, text, uuid)') is null then
    raise exception 'refused: expected objects are missing (20261126000000 feedback), so the database is not in the state this rollback was written for';
  end if;
  if exists (select 1 from supabase_migrations.schema_migrations where version > '20261126000000') then
    raise exception 'refused, nothing changed: a later migration is recorded';
  end if;
end $$;

lock table ops.feedback, ops.feedback_notes, ops.feedback_actions in share row exclusive mode;

do $$
declare
  f bigint := (select count(*) from ops.feedback);
  n bigint := (select count(*) from ops.feedback_notes);
  a bigint := (select count(*) from ops.feedback_actions);
begin
  if f > 0 or n > 0 or a > 0 then
    raise exception 'refused, nothing changed: % feedback entr(ies), % note(s) and % audit entr(ies) exist. Fix forward with a new migration instead.', f, n, a;
  end if;
end $$;

\echo 'Checks passed. Removing feedback and its migration record.'

drop function public.app_feedback_submit(text, text, text, uuid);
drop function public.app_is_founder();
drop function public.app_founder_feedback_list(text, text, text, timestamptz, uuid, integer);
drop function public.app_founder_feedback(uuid);
drop function public.app_founder_feedback_set_status(uuid, text);
drop function public.app_founder_feedback_add_note(uuid, text);
drop function social.current_founder();
drop function ops.purge_feedback(integer, text, text);
drop table ops.feedback_actions;
drop table ops.feedback_notes;
drop table ops.feedback;

delete from supabase_migrations.schema_migrations where version = '20261126000000';

select current_setting('crevant.rollback_mode') = 'apply' as apply \gset
\if :apply
  commit;
  \echo 'Applied: feedback and its migration record were removed.'
\else
  rollback;
  \echo 'Check only: every check and the removal succeeded inside the transaction, and all of it was rolled back. Nothing changed.'
\endif
