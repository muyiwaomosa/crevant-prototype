-- Staging only: undoes 20261123000000 (profile_details), so the earlier
-- rollbacks, which refuse while a later migration is recorded, can run after
-- it. Never run it against Production. Tested locally by
-- scripts/db/rollback-profile-details-test.sh.
--
--   psql "<url>" -X -q -v ON_ERROR_STOP=1 -v mode=check -v confirm= -f scripts/db/staging-rollback-profile-details.sql
--   psql "<url>" -X -q -v ON_ERROR_STOP=1 -v mode=apply -v confirm='REMOVE THE STAGING PROFILE DETAILS' -f ...
--
-- Removes the six profile detail functions, social.profile_details,
-- social.member_topics, social.topics and the migration record. The
-- migration changed nothing else, so nothing else is restored.
--
-- Refuses, changing nothing, if the record or an expected object is missing,
-- a later migration is recorded, or ANY member has saved details or
-- interests: those are members' own words, so once they exist problems are
-- fixed forward (a new migration), never by deleting them.

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
     and current_setting('crevant.rollback_confirm') <> 'REMOVE THE STAGING PROFILE DETAILS' then
    raise exception 'apply needs the confirmation phrase: REMOVE THE STAGING PROFILE DETAILS';
  end if;
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise exception 'refused: no Supabase migration history here (supabase_migrations.schema_migrations)';
  end if;
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20261123000000')
     or to_regclass('social.topics') is null
     or to_regclass('social.profile_details') is null
     or to_regclass('social.member_topics') is null
     or to_regprocedure('public.app_set_profile_details(text, text, text, text[])') is null
     or to_regprocedure('public.app_discover_people(text, text, integer)') is null then
    raise exception 'refused: expected objects are missing (20261123000000 profile_details), so the database is not in the state this rollback was written for';
  end if;
  if exists (select 1 from supabase_migrations.schema_migrations where version > '20261123000000') then
    raise exception 'refused, nothing changed: a later migration is recorded';
  end if;
end $$;

-- Hold the tables still while checking and removing.
lock table social.profile_details, social.member_topics, social.topics in access exclusive mode;

do $$
declare
  d bigint := (select count(*) from social.profile_details);
  t bigint := (select count(*) from social.member_topics);
begin
  if d > 0 or t > 0 then
    raise exception 'refused, nothing changed: % member detail row(s) and % interest row(s) exist (members'' own data). Fix forward with a new migration instead.', d, t;
  end if;
end $$;

\echo 'Checks passed. Removing the profile detail functions, tables and the migration record.'

drop function public.app_topics();
drop function public.app_my_details();
drop function public.app_set_profile_details(text, text, text, text[]);
drop function public.app_member_details(uuid);
drop function public.app_discover_people(text, text, integer);
drop function public.app_suggested_creators(integer);
drop table social.member_topics;
drop table social.profile_details;
drop table social.topics;

delete from supabase_migrations.schema_migrations where version = '20261123000000';

select current_setting('crevant.rollback_mode') = 'apply' as apply \gset
\if :apply
  commit;
  \echo 'Applied: the profile details and their migration record were removed.'
\else
  rollback;
  \echo 'Check only: every check and the removal succeeded inside the transaction, and all of it was rolled back. Nothing changed.'
\endif
