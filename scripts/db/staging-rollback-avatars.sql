-- Staging only: undoes 20261125000000 (avatars), so the earlier rollbacks,
-- which refuse while a later migration is recorded, can run after it. Never
-- run it against Production. Tested locally by scripts/db/rollback-avatars-test.sh.
--
--   psql "<url>" -X -q -v ON_ERROR_STOP=1 -v mode=check -v confirm= -f scripts/db/staging-rollback-avatars.sql
--   psql "<url>" -X -q -v ON_ERROR_STOP=1 -v mode=apply -v confirm='REMOVE THE STAGING AVATARS' -f ...
--
-- Removes the picture functions, tables and helpers, the (empty) avatars
-- bucket, the two storage cleanup action names, and the migration record.
-- Deploying or deleting the avatar Edge Function is separate (by hand).
--
-- Refuses, changing nothing, if the record or an expected object is missing,
-- a later migration is recorded, or ANY picture, upload, picture history,
-- orphan, cleanup plan, storage cleanup action or file in the bucket exists.
-- After that, problems are fixed forward.

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
     and current_setting('crevant.rollback_confirm') <> 'REMOVE THE STAGING AVATARS' then
    raise exception 'apply needs the confirmation phrase: REMOVE THE STAGING AVATARS';
  end if;
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise exception 'refused: no Supabase migration history here (supabase_migrations.schema_migrations)';
  end if;
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20261125000000')
     or to_regclass('social.avatars') is null
     or to_regclass('social.avatar_uploads') is null
     or to_regclass('ops.storage_cleanup_plans') is null
     or to_regprocedure('public.svc_avatar_commit(text)') is null
     or to_regclass('storage.buckets') is null then
    raise exception 'refused: expected objects are missing (20261125000000 avatars), so the database is not in the state this rollback was written for';
  end if;
  if exists (select 1 from supabase_migrations.schema_migrations where version > '20261125000000') then
    raise exception 'refused, nothing changed: a later migration is recorded';
  end if;
end $$;

lock table social.avatars, social.avatar_uploads, social.avatar_events, ops.storage_orphans, ops.storage_cleanup_plans in share row exclusive mode;

do $$
declare
  rows bigint := (select count(*) from social.avatars) + (select count(*) from social.avatar_uploads) + (select count(*) from social.avatar_events)
               + (select count(*) from ops.storage_orphans) + (select count(*) from ops.storage_cleanup_plans);
  actions bigint := (select count(*) from ops.moderation_actions where action like 'storage%');
  files bigint;
begin
  execute $q$select count(*) from storage.objects where bucket_id = 'avatars'$q$ into files;
  if rows > 0 or actions > 0 or files > 0 then
    raise exception 'refused, nothing changed: % picture record(s), % storage cleanup action(s) and % file(s) in the avatars bucket exist. Fix forward with a new migration instead.', rows, actions, files;
  end if;
end $$;

\echo 'Checks passed. Removing profile pictures, the empty avatars bucket and the migration record.'

drop function public.app_avatar_begin();
drop function public.app_avatar_remove();
drop function public.app_avatars(uuid[]);
drop function public.app_mod_storage_preview();
drop function public.app_mod_storage_cleanup_start(uuid, text);
drop function public.app_mod_storage_cleanup_finish(uuid);
drop function public.svc_avatar_commit(text);
drop function public.svc_avatar_orphan(text, text);
drop function ops.storage_cleanup_candidates();
drop function social.avatar_rate_check(uuid);
drop function social.avatar_lock(uuid);
drop table social.avatars;
drop table social.avatar_uploads;
drop table social.avatar_events;
drop table ops.storage_orphans;
drop table ops.storage_cleanup_plans;
alter table ops.moderation_actions drop constraint moderation_actions_action_check;
alter table ops.moderation_actions add constraint moderation_actions_action_check
  check (action in ('hide', 'restore', 'dismiss', 'hold_set', 'hold_cleared', 'retention_purge'));
-- The bucket is empty (checked above). Storage only allows removing it from
-- SQL when asked explicitly, for this transaction only.
set local storage.allow_delete_query = 'true';
delete from storage.buckets where id = 'avatars';

delete from supabase_migrations.schema_migrations where version = '20261125000000';

select current_setting('crevant.rollback_mode') = 'apply' as apply \gset
\if :apply
  commit;
  \echo 'Applied: profile pictures, the avatars bucket and the migration record were removed. Delete the avatar Edge Function separately if it was deployed.'
\else
  rollback;
  \echo 'Check only: every check and the removal succeeded inside the transaction, and all of it was rolled back. Nothing changed.'
\endif
