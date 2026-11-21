-- Staging only: schedules the photo deletion queue's drain (Build 5.3), so
-- deleted, abandoned and orphaned photo files are removed by the server every
-- 15 minutes, whether or not any browser is open. Never run it against
-- Production (it refuses: Production has no photo migration). Tested locally
-- by scripts/db/schedule-media-drain-test.sh.
--
-- Uses Supabase's pg_cron and the synchronous http extension (no new service)
-- to POST to the post-media function's drain route with the drain key, read
-- from Supabase Vault at each run (the key is never stored in this file, the
-- repository, GitHub or Vercel, and never printed). The request is made inside
-- the cron run itself, so nothing is queued in a table: unlike pg_net, the key
-- never sits in a table other roles can read. Each run either gets HTTP 200
-- from the drain within 20 seconds and is recorded as succeeded in
-- cron.job_run_details, or is recorded as failed with a short message (the
-- status code, "timed out" or "network error"; never the key or headers).
--
-- Applying replaces an older pg_net version of the job in the same
-- transaction (one job before, one job after, no gap). It does not remove
-- pg_net: that is scripts/db/staging-remove-pg-net.sql, run separately.
--
-- Before running it, the founder:
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
  other boolean;
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
  -- Scheduling needs the photo migration (Production never has it). Removing
  -- doesn't, so a schedule can always be taken down.
  if m in ('check', 'apply') and (to_regclass('supabase_migrations.schema_migrations') is null
     or not exists (select 1 from supabase_migrations.schema_migrations where version = '20261127000000')) then
    raise exception 'refused: photo posts (20261127000000) are not applied here. This is not staging after Build 5.3.';
  end if;
  if u !~ '^(https://kpudeppgokpjhvaqrprn\.supabase\.co|http://(kong|127\.0\.0\.1|localhost|host\.docker\.internal)(:\d+)?)/functions/v1/post-media/drain$' then
    raise exception 'refused: the drain address must be staging''s post-media function (or a local one in tests)';
  end if;
  if m in ('check', 'apply') and (not exists (select 1 from pg_available_extensions where name = 'pg_cron') or not exists (select 1 from pg_available_extensions where name = 'http')) then
    raise exception 'refused: pg_cron and http are not available here';
  end if;
  -- The job calls extensions.http, so an http installed elsewhere would make every run fail.
  if exists (select 1 from pg_extension e where e.extname = 'http' and e.extnamespace::regnamespace::text <> 'extensions') then
    raise exception 'refused: the http extension is installed outside the extensions schema here';
  end if;
  -- Never replace or remove a job of the same name that isn't this drain.
  -- (Dynamic, so this also works before pg_cron is installed.)
  if to_regclass('cron.job') is not null then
    execute $q$select exists (select 1 from cron.job j where j.jobname = 'post-media-drain'
                 and j.command !~ '/functions/v1/post-media/drain')$q$ into other;
    if other then
      raise exception 'refused, nothing changed: a job named post-media-drain exists that is not the photo cleanup. Rename or remove it by hand first.';
    end if;
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

select current_setting('crevant.schedule_mode') <> 'remove' as installing \gset
\if :installing
create extension if not exists pg_cron;
create extension if not exists http with schema extensions;
\endif

do $$
declare
  m text := current_setting('crevant.schedule_mode');
  u text := current_setting('crevant.drain_url');
begin
  if to_regclass('cron.job') is null then
    return;
  end if;
  if exists (select 1 from cron.job where jobname = 'post-media-drain') then
    perform cron.unschedule('post-media-drain');
  end if;
  if m in ('check', 'apply') then
    -- The job: one synchronous POST, 20 second limit, key from Vault at run
    -- time. Anything but HTTP 200 raises, so cron.job_run_details records the
    -- run as failed. The messages are fixed text plus the status code: the
    -- http extension's own error (which can quote the request) is not passed on.
    perform cron.schedule('post-media-drain', '*/15 * * * *', pg_catalog.format($job$
do $drain$
declare
  k text;
  r extensions.http_response;
begin
  select s.decrypted_secret into k from vault.decrypted_secrets s where s.name = 'media_drain_key';
  if k is null or pg_catalog.char_length(k) < 32 then
    raise exception 'photo cleanup failed: the drain key is missing from Vault';
  end if;
  perform pg_catalog.set_config('http.timeout_msec', '20000', true);
  begin
    r := extensions.http(('POST', %L,
           array[extensions.http_header('x-media-drain-key', k)],
           'application/json', '{}')::extensions.http_request);
  exception when others then
    if sqlerrm ~* 'time[ d]*out' then
      raise exception 'photo cleanup failed: the drain timed out after 20 seconds';
    end if;
    raise exception 'photo cleanup failed: network error reaching the drain';
  end;
  if r.status is distinct from 200 then
    raise exception 'photo cleanup failed: the drain answered HTTP %%', r.status;
  end if;
end
$drain$
    $job$, u));
  end if;
end $$;

select to_regclass('cron.job') is not null as has_cron \gset
\if :has_cron
select jobname, schedule, active,
       case when command ~ 'extensions\.http\(' then 'http (synchronous)'
            when command ~ 'net\.http_post' then 'pg_net (old)' else 'unknown' end as method
from cron.job where jobname = 'post-media-drain';
\endif

select current_setting('crevant.schedule_mode') <> 'check' as change \gset
\if :change
  commit;
  \echo 'Done: the photo cleanup schedule is now as shown above (no row means it was removed).'
\else
  rollback;
  \echo 'Check only: the schedule could be created (shown above), and all of it was rolled back. Nothing changed.'
\endif
