-- Staging only: undoes 20261128000000 (who may post photos), so the earlier
-- rollbacks, which refuse while a later migration is recorded, can run after
-- it. Never run it against Production. Tested locally by
-- scripts/db/rollback-photo-audience-test.sh.
--
--   psql "<url>" -X -q -v ON_ERROR_STOP=1 -v mode=check -v confirm= -f scripts/db/staging-rollback-photo-audience.sql
--   psql "<url>" -X -q -v ON_ERROR_STOP=1 -v mode=apply -v confirm='REMOVE THE STAGING PHOTO AUDIENCE' -f ...
--
-- Restores ops.photos_open to its 20261127000000 definition (the switch
-- alone, for every member), removes ops.set_photo_audience and the audience
-- column, and restores the settings record's action list.
--
-- Because the restored switch would let EVERY active member post photos, it
-- refuses, changing nothing, while photos are switched on: turn them off
-- first (ops.set_media_settings). It also refuses if the record or an
-- expected object is missing, a later migration is recorded, or any audience
-- change was ever recorded (an audit record: fix forward instead).

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
     and current_setting('crevant.rollback_confirm') <> 'REMOVE THE STAGING PHOTO AUDIENCE' then
    raise exception 'apply needs the confirmation phrase: REMOVE THE STAGING PHOTO AUDIENCE';
  end if;
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise exception 'refused: no Supabase migration history here (supabase_migrations.schema_migrations)';
  end if;
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20261128000000')
     or to_regprocedure('ops.set_photo_audience(text, text, text)') is null
     or not exists (select 1 from information_schema.columns where table_schema = 'ops' and table_name = 'media_settings' and column_name = 'photos_audience') then
    raise exception 'refused: expected objects are missing (20261128000000 photo audience), so the database is not in the state this rollback was written for';
  end if;
  if exists (select 1 from supabase_migrations.schema_migrations where version > '20261128000000') then
    raise exception 'refused, nothing changed: a later migration is recorded';
  end if;
end $$;

lock table ops.media_settings, ops.media_admin_events in share row exclusive mode;

do $$
begin
  if (select photos_enabled from ops.media_settings where id) then
    raise exception 'refused, nothing changed: photos are switched on, and removing the audience would let every member post photos. Turn photos off first with ops.set_media_settings.';
  end if;
  if exists (select 1 from ops.media_admin_events where action = 'audience_changed') then
    raise exception 'refused, nothing changed: an audience change is recorded (an audit record). Fix forward with a new migration instead.';
  end if;
end $$;

\echo 'Checks passed. Restoring the photo switch, then removing the audience and its migration record.'

create or replace function ops.photos_open()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select s.photos_enabled and s.photo_storage_cap_bytes is not null from ops.media_settings s where s.id;
$$;
revoke all on function ops.photos_open() from public, anon, authenticated;
drop function ops.set_photo_audience(text, text, text);
alter table ops.media_admin_events drop constraint media_admin_events_action_check;
alter table ops.media_admin_events add constraint media_admin_events_action_check
  check (action in ('settings_changed', 'processing_check', 'hidden_media_queued'));
alter table ops.media_settings drop column photos_audience;

delete from supabase_migrations.schema_migrations where version = '20261128000000';

select current_setting('crevant.rollback_mode') = 'apply' as apply \gset
\if :apply
  commit;
  \echo 'Applied: the photo audience and its migration record were removed; photos are off.'
\else
  rollback;
  \echo 'Check only: every check and the removal succeeded inside the transaction, and all of it was rolled back. Nothing changed.'
\endif
