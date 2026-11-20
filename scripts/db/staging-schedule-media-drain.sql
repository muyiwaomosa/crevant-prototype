-- Staging only: schedules the photo deletion queue's drain (Build 5.3), so
-- deleted, abandoned and orphaned photo files are removed by the server every
-- 15 minutes, whether or not any browser is open. Never run it against
-- Production (it refuses: Production has no photo migration). Tested locally
-- by scripts/db/schedule-media-drain-test.sh.
--
-- Uses Supabase's own pg_cron and pg_net (no new service) to POST to the
-- post-media function's drain route with the drain key, read from Supabase
-- Vault at each run (the key is never stored in this file, the repository,
-- GitHub or Vercel, and never printed). Before running it, the founder:
--   1. sets the Edge Function secret MEDIA_DRAIN_KEY (at least 32 random
--      characters) for post-media, in the dashboard;
--   2. stores the same value in Vault under the name media_drain_key
--      (dashboard: Project Settings > Vault, or select vault.create_secret(...)).
--
--   psql "<url>" -X -q -v ON_ERROR_STOP=1 -v mode=check  -v confirm= -f scripts/db/staging-schedule-media-drain.sql
--   psql "<url>" -X -q -v ON_ERROR_STOP=1 -v mode=apply  -v confirm='SCHEDULE THE STAGING PHOTO CLEANUP' -f ...
--   psql "<url>" -X -q -v ON_ERROR_STOP=1 -v mode=remove -v confirm='UNSCHEDULE THE STAGING PHOTO CLEANUP' -f ...
-- Optional: -v drain_url=<url> (local tests only; defaults to staging's function).

\set ON_ERROR_STOP on
\pset footer off
\if :{?drain_url}
\else
  \set drain_url 'https://kpudeppgokpjhvaqrprn.supabase.co/functions/v1/post-media/drain'
\endif

begin;
set local lock_timeout = '10s';
set local statement_timeout = '60s';

-- An unset -v mode or -v confirm stops here with a syntax error, by design.
select set_config('crevant.schedule_mode', :'mode', true) as mode,
       set_config('crevant.schedule_confirm', :'confirm', true) <> '' as confirmation_given,
       set_config('crevant.drain_url', :'drain_url', true) <> '' as url_given;

do $$
declare
  m text := current_setting('crevant.schedule_mode');
  u text := current_setting('crevant.drain_url');
begin
  if m not in ('check', 'apply', 'remove') then
    raise exception 'mode must be check, apply or remove';
  end if;
  if m = 'apply' and current_setting('crevant.schedule_confirm') <> 'SCHEDULE THE STAGING PHOTO CLEANUP' then
    raise exception 'apply needs the confirmation phrase: SCHEDULE THE STAGING PHOTO CLEANUP';
  end if;
  if m = 'remove' and current_setting('crevant.schedule_confirm') <> 'UNSCHEDULE THE STAGING PHOTO CLEANUP' then
    raise exception 'remove needs the confirmation phrase: UNSCHEDULE THE STAGING PHOTO CLEANUP';
  end if;
  if to_regclass('supabase_migrations.schema_migrations') is null
     or not exists (select 1 from supabase_migrations.schema_migrations where version = '20261127000000') then
    raise exception 'refused: photo posts (20261127000000) are not applied here. This is not staging after Build 5.3.';
  end if;
  if u !~ '^(https://kpudeppgokpjhvaqrprn\.supabase\.co|http://(kong|127\.0\.0\.1|localhost|host\.docker\.internal)(:\d+)?)/functions/v1/post-media/drain$' then
    raise exception 'refused: the drain address must be staging''s post-media function (or a local one in tests)';
  end if;
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron') or not exists (select 1 from pg_available_extensions where name = 'pg_net') then
    raise exception 'refused: pg_cron and pg_net are not available here';
  end if;
  if m in ('check', 'apply') then
    if to_regclass('vault.decrypted_secrets') is null then
      raise exception 'refused: Supabase Vault is not available here';
    end if;
    -- The key itself is never selected into anything that is printed.
    if not exists (select 1 from vault.decrypted_secrets s where s.name = 'media_drain_key' and char_length(s.decrypted_secret) >= 32) then
      raise exception 'refused: store the drain key (at least 32 characters) in Vault as media_drain_key first, and set the same value as the post-media secret MEDIA_DRAIN_KEY';
    end if;
  end if;
end $$;

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

do $$
declare
  m text := current_setting('crevant.schedule_mode');
  u text := current_setting('crevant.drain_url');
begin
  if exists (select 1 from cron.job where jobname = 'post-media-drain') then
    perform cron.unschedule('post-media-drain');
  end if;
  if m in ('check', 'apply') then
    perform cron.schedule('post-media-drain', '*/15 * * * *', pg_catalog.format($job$
      select net.http_post(
        url := %L,
        headers := pg_catalog.jsonb_build_object(
          'Content-Type', 'application/json',
          'x-media-drain-key', (select s.decrypted_secret from vault.decrypted_secrets s where s.name = 'media_drain_key')),
        body := '{}'::jsonb,
        timeout_milliseconds := 20000)
    $job$, u));
  end if;
end $$;

select jobname, schedule, active from cron.job where jobname = 'post-media-drain';

select current_setting('crevant.schedule_mode') <> 'check' as change \gset
\if :change
  commit;
  \echo 'Done: the photo cleanup schedule is now as shown above (no row means it was removed).'
\else
  rollback;
  \echo 'Check only: the schedule could be created (shown above), and all of it was rolled back. Nothing changed.'
\endif
