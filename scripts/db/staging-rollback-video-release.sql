-- Staging only: undoes 20261220000000 (the video release decision). Never run it against a Production project.
-- Tested locally by scripts/db/rollback-video-release-test.sh.
--
--   psql "<url>" -X -q -v ON_ERROR_STOP=1 -v mode=check -v confirm= -f scripts/db/staging-rollback-video-release.sql
--   psql "<url>" -X -q -v ON_ERROR_STOP=1 -v mode=apply -v confirm='REMOVE STAGING VIDEO RELEASE DECISION' -f ...
--
-- Restores ops.video_ready() and the device test table's description as
-- 20261213000000 left them (both phone tests and the cap needed to switch
-- video on). It does not switch video off if it is already on: the switch
-- is the founder's, recorded with a reason. Refuses, changing nothing, if
-- the record is missing or a later migration exists.

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
     and current_setting('crevant.rollback_confirm') <> 'REMOVE STAGING VIDEO RELEASE DECISION' then
    raise exception 'apply needs the confirmation phrase: REMOVE STAGING VIDEO RELEASE DECISION';
  end if;
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise exception 'refused: no Supabase migration history here (supabase_migrations.schema_migrations)';
  end if;
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20261220000000')
     or to_regclass('ops.video_device_tests') is null then
    raise exception 'refused: expected objects are missing (20261220000000 video release decision), so the database is not in the state this rollback was written for';
  end if;
  if exists (select 1 from supabase_migrations.schema_migrations where version > '20261220000000') then
    raise exception 'refused, nothing changed: a later migration is recorded';
  end if;
end $$;

create or replace function ops.video_ready()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select ops.video_device_passed('iphone_safari') and ops.video_device_passed('android_chrome')
     and coalesce((select s.video_storage_cap_bytes is not null from ops.media_settings s where s.id), false);
$$;
revoke all on function ops.video_ready() from public, anon, authenticated;
comment on function ops.video_ready() is null;
comment on table ops.video_device_tests is 'The founder''s recorded video device tests (docs/video/DEVICE-TEST.md). Append-only. Video posts can be switched on only when the latest iPhone Safari and Android Chrome results passed.';
delete from supabase_migrations.schema_migrations where version = '20261220000000';

select current_setting('crevant.rollback_mode') = 'apply' as apply \gset
\if :apply
  commit;
  \echo 'Applied: the video gate needs both phone tests and the cap again, and the migration record was removed.'
\else
  rollback;
  \echo 'Check only: every check and the removal succeeded inside the transaction, and all of it was rolled back. Nothing changed.'
\endif
