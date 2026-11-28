-- Staging only: undoes 20261221000000 (link in bio). Never run it against a Production project.
-- Tested locally by scripts/db/rollback-profile-link-test.sh.
--
--   psql "<url>" -X -q -v ON_ERROR_STOP=1 -v mode=check -v confirm= -f scripts/db/staging-rollback-profile-link.sql
--   psql "<url>" -X -q -v ON_ERROR_STOP=1 -v mode=apply -v confirm='REMOVE STAGING PROFILE LINK' -f ...
--
-- Drops the three link functions and the website column (staging test links
-- are deleted with it) and removes the migration record. Refuses, changing
-- nothing, if the record is missing or a later migration exists.

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
     and current_setting('crevant.rollback_confirm') <> 'REMOVE STAGING PROFILE LINK' then
    raise exception 'apply needs the confirmation phrase: REMOVE STAGING PROFILE LINK';
  end if;
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise exception 'refused: no Supabase migration history here (supabase_migrations.schema_migrations)';
  end if;
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20261221000000')
     or to_regprocedure('public.app_set_my_website(text)') is null then
    raise exception 'refused: expected objects are missing (20261221000000 link in bio), so the database is not in the state this rollback was written for';
  end if;
  if exists (select 1 from supabase_migrations.schema_migrations where version > '20261221000000') then
    raise exception 'refused, nothing changed: a later migration is recorded';
  end if;
end $$;

drop function public.app_set_my_website(text);
drop function public.app_my_website();
drop function public.app_member_website(uuid);
alter table social.profile_details drop column website;
delete from supabase_migrations.schema_migrations where version = '20261221000000';

select current_setting('crevant.rollback_mode') = 'apply' as apply \gset
\if :apply
  commit;
  \echo 'Applied: the link in bio functions and column were removed, and the migration record was removed.'
\else
  rollback;
  \echo 'Check only: every check and the removal succeeded inside the transaction, and all of it was rolled back. Nothing changed.'
\endif
