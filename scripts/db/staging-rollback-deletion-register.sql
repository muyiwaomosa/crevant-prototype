-- Staging only: undoes 20261216000000 (the deletion register). Never run it against a Production project. Tested locally by
-- scripts/db/rollback-deletion-register-test.sh.
--
--   psql "<url>" -X -q -v ON_ERROR_STOP=1 -v mode=check -v confirm= -f scripts/db/staging-rollback-deletion-register.sql
--   psql "<url>" -X -q -v ON_ERROR_STOP=1 -v mode=apply -v confirm='REMOVE THE STAGING DELETION REGISTER' -f ...
--
-- Removes the register, its triggers and its functions. Refuses, changing
-- nothing, while any deletion has not yet been written to the function log
-- (it would be lost to recovery), if the record or an expected object is
-- missing, or a later migration exists.

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
     and current_setting('crevant.rollback_confirm') <> 'REMOVE THE STAGING DELETION REGISTER' then
    raise exception 'apply needs the confirmation phrase: REMOVE THE STAGING DELETION REGISTER';
  end if;
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise exception 'refused: no Supabase migration history here (supabase_migrations.schema_migrations)';
  end if;
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20261216000000')
     or to_regclass('ops.deletion_register') is null then
    raise exception 'refused: expected objects are missing (20261216000000 deletion register), so the database is not in the state this rollback was written for';
  end if;
  if exists (select 1 from supabase_migrations.schema_migrations where version > '20261216000000') then
    raise exception 'refused, nothing changed: a later migration is recorded';
  end if;
end $$;

lock table ops.deletion_register in share row exclusive mode;

do $$
declare
  n bigint;
begin
  n := (select count(*) from ops.deletion_register where reported_at is null);
  if n > 0 then
    raise exception 'refused, nothing changed: % deletions are not yet in the function log; run the drain first, or they are lost to recovery', n;
  end if;
end $$;

\echo 'Checks passed. Removing the deletion register and the migration record.'

drop trigger register_account_deletion on auth.users;
drop trigger register_post_deletion on social.posts;
drop trigger register_comment_deletion on social.comments;
drop function public.svc_deletion_register_unreported(integer);
drop function public.svc_deletion_register_reported(bigint[]);
drop function ops.reapply_deletions(jsonb, timestamptz);
drop function ops.register_account_deletion();
drop function ops.register_content_deletion();
drop table ops.deletion_register;
drop function ops.deletion_register_guard();
delete from supabase_migrations.schema_migrations where version = '20261216000000';

select current_setting('crevant.rollback_mode') = 'apply' as apply \gset
\if :apply
  commit;
  \echo 'Applied: the deletion register and the migration record were removed.'
\else
  rollback;
  \echo 'Check only: every check and the removal succeeded inside the transaction, and all of it was rolled back. Nothing changed.'
\endif
