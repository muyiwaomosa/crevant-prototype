-- Staging only: undoes 20261119000000 (publishing_request_ids), so the
-- earlier rollbacks (platform access, social core, creator acquisition,
-- waitlist), which refuse while a later migration is recorded, can run after
-- it. Never run it against Production (the social schema isn't there).
-- Tested locally by scripts/db/rollback-publishing-requests-test.sh.
--
--   psql "<url>" -X -q -v ON_ERROR_STOP=1 -v mode=check -v confirm= -f scripts/db/staging-rollback-publishing-requests.sql
--   psql "<url>" -X -q -v ON_ERROR_STOP=1 -v mode=apply -v confirm='REMOVE THE STAGING PUBLISHING REQUEST IDS' -f ...
--
-- Removes exactly what that migration added: the request id versions of
-- app_create_post and app_add_comment, the two unique indexes, the two
-- client_request_id columns, and the migration record. Every post and
-- comment stays, and the original app_create_post(text) and
-- app_add_comment(uuid, text) are untouched.
--
-- Refuses, changing nothing, if the record or an expected object is
-- missing, or a later migration is recorded.

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
     and current_setting('crevant.rollback_confirm') <> 'REMOVE THE STAGING PUBLISHING REQUEST IDS' then
    raise exception 'apply needs the confirmation phrase: REMOVE THE STAGING PUBLISHING REQUEST IDS';
  end if;
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise exception 'refused: no Supabase migration history here (supabase_migrations.schema_migrations)';
  end if;
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20261119000000')
     or to_regprocedure('public.app_create_post(text, uuid)') is null
     or to_regprocedure('public.app_add_comment(uuid, text, uuid)') is null
     or to_regclass('social.posts_request_once') is null
     or to_regclass('social.comments_request_once') is null then
    raise exception 'refused: expected objects are missing (20261119000000 publishing_request_ids), so the database is not in the state this rollback was written for';
  end if;
  if exists (select 1 from supabase_migrations.schema_migrations where version > '20261119000000') then
    raise exception 'refused, nothing changed: a later migration is recorded';
  end if;
end $$;

\echo 'Checks passed. To remove: app_create_post(text, uuid), app_add_comment(uuid, text, uuid), two indexes, two client_request_id columns, and the migration record. Posts and comments stay.'
drop function public.app_create_post(text, uuid);
drop function public.app_add_comment(uuid, text, uuid);
drop index social.posts_request_once;
drop index social.comments_request_once;
alter table social.posts drop column client_request_id;
alter table social.comments drop column client_request_id;
delete from supabase_migrations.schema_migrations where version = '20261119000000';

select current_setting('crevant.rollback_mode') = 'apply' as apply \gset
\if :apply
  commit;
  \echo 'Applied: the publishing request id versions, indexes, columns and migration record were removed. Posts, comments and the original functions remain.'
\else
  rollback;
  \echo 'Check only: every check and the removal succeeded inside the transaction, and all of it was rolled back. Nothing changed.'
\endif
