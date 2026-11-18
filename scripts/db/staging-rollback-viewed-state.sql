-- Staging only: undoes 20261121000000 (viewed_state), so the earlier
-- rollbacks (Inner Clique, publishing request ids, platform access, social
-- core, creator acquisition, waitlist), which refuse while a later migration
-- is recorded, can run after it. Never run it against Production (the social
-- schema isn't there). Tested locally by scripts/db/rollback-viewed-state-test.sh.
--
--   psql "<url>" -X -q -v ON_ERROR_STOP=1 -v mode=check -v confirm= -f scripts/db/staging-rollback-viewed-state.sql
--   psql "<url>" -X -q -v ON_ERROR_STOP=1 -v mode=apply -v confirm='REMOVE THE STAGING VIEWED STATE' -f ...
--
-- Removes exactly what that migration added: app_mark_viewed,
-- app_unseen_creators, app_catch_up, the post_views table (with its indexes
-- and trigger), social.post_views_are_permanent, and the migration record.
-- Nothing else changes.
--
-- Refuses, changing nothing, if the record or an expected object is missing,
-- a later migration is recorded, or ANY viewed-state row exists. Viewed
-- state is member data: once members have viewed posts, problems are fixed
-- forward (a new migration), never by deleting it.

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
     and current_setting('crevant.rollback_confirm') <> 'REMOVE THE STAGING VIEWED STATE' then
    raise exception 'apply needs the confirmation phrase: REMOVE THE STAGING VIEWED STATE';
  end if;
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise exception 'refused: no Supabase migration history here (supabase_migrations.schema_migrations)';
  end if;
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20261121000000')
     or to_regclass('social.post_views') is null
     or to_regprocedure('public.app_mark_viewed(uuid[], text)') is null
     or to_regprocedure('public.app_unseen_creators()') is null
     or to_regprocedure('public.app_catch_up(uuid, timestamptz, uuid)') is null
     or to_regprocedure('social.post_views_are_permanent()') is null then
    raise exception 'refused: expected objects are missing (20261121000000 viewed_state), so the database is not in the state this rollback was written for';
  end if;
  if exists (select 1 from supabase_migrations.schema_migrations where version > '20261121000000') then
    raise exception 'refused, nothing changed: a later migration is recorded';
  end if;
end $$;

-- Hold the table still while checking and removing.
lock table social.post_views in access exclusive mode;

do $$
declare
  n bigint := (select count(*) from social.post_views);
begin
  if n > 0 then
    raise exception 'refused, nothing changed: % viewed-state row(s) exist (member data). Fix forward with a new migration instead.', n;
  end if;
end $$;

\echo 'Checks passed. To remove: app_mark_viewed, app_unseen_creators, app_catch_up, social.post_views (empty), social.post_views_are_permanent and the migration record.'
drop function public.app_mark_viewed(uuid[], text);
drop function public.app_unseen_creators();
drop function public.app_catch_up(uuid, timestamptz, uuid);
drop table social.post_views;
drop function social.post_views_are_permanent();
delete from supabase_migrations.schema_migrations where version = '20261121000000';

select current_setting('crevant.rollback_mode') = 'apply' as apply \gset
\if :apply
  commit;
  \echo 'Applied: viewed state and its migration record were removed. Nothing else changed.'
\else
  rollback;
  \echo 'Check only: every check and the removal succeeded inside the transaction, and all of it was rolled back. Nothing changed.'
\endif
