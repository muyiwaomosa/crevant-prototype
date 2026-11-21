-- Staging only: removes the pg_net extension once the photo cleanup runs on
-- the synchronous http extension (scripts/db/staging-schedule-media-drain.sql).
-- Tested locally by scripts/db/schedule-media-drain-test.sh. Never run it
-- against Production (it refuses: Production has no photo migration).
--
-- Why: pg_net's own install grants PUBLIC usage of schema net and all rights
-- on its request queue and responses, and those grants belong to
-- supabase_admin, so postgres can't revoke them. Every database role,
-- including the waitlist roles, could then read queued requests (which carry
-- the drain key while they wait) or add their own. Security check 003 fails
-- for exactly that reason. Removing pg_net removes the grants with it.
--
-- It changes nothing unless every one of these holds (check shows each one):
--   1. photo posts (20261127000000) are applied here (staging after Build 5.3);
--   2. exactly one post-media-drain job exists, active, every 15 minutes, and
--      it uses the http extension, not pg_net;
--   3. that job has at least one succeeded run with its current command;
--   4. no cron job at all mentions net. (no other job relies on pg_net);
--   5. pg_net's request queue is empty (nothing waiting to be sent);
--   6. no trigger calls supabase_functions.http_request (Supabase database
--      webhooks, which are built on pg_net);
--   7. no function, view or other object outside pg_net depends on it or
--      mentions net. in its body (any pg_net function, its queue or its
--      responses; trigger and event trigger functions included), other than Supabase's own
--      supabase_functions.http_request (covered by 6) and
--      extensions.grant_pg_net_access (it only runs when pg_net is created).
-- Then it runs drop extension pg_net (without cascade, so anything missed by
-- the checks above still stops it). check does the drop inside a transaction
-- and rolls it back, which also proves the permission to drop it.
--
--   psql "<url>" -X -q -v ON_ERROR_STOP=1 -v mode=check -v confirm= -f scripts/db/staging-remove-pg-net.sql
--   psql "<url>" -X -q -v ON_ERROR_STOP=1 -v mode=apply -v confirm='REMOVE PG_NET FROM STAGING' -f scripts/db/staging-remove-pg-net.sql
--
-- Undo (only if something else turns out to need pg_net): create extension
-- pg_net with schema extensions; that brings the PUBLIC grants (and the
-- check 003 failure) back, so it needs its own approval.

\set ON_ERROR_STOP on
\pset footer off

begin;
set local lock_timeout = '10s';
set local statement_timeout = '60s';

-- An unset -v mode or -v confirm stops here with a syntax error, by design.
select set_config('crevant.pgnet_mode', :'mode', true) as mode,
       set_config('crevant.pgnet_confirm', :'confirm', true) <> '' as confirmation_given;

do $$
declare
  m text := current_setting('crevant.pgnet_mode');
begin
  if m not in ('check', 'apply') then
    raise exception 'mode must be check or apply';
  end if;
  if m = 'apply' and current_setting('crevant.pgnet_confirm') <> 'REMOVE PG_NET FROM STAGING' then
    raise exception 'apply needs the confirmation phrase: REMOVE PG_NET FROM STAGING';
  end if;
  if to_regclass('supabase_migrations.schema_migrations') is null
     or not exists (select 1 from supabase_migrations.schema_migrations where version = '20261127000000') then
    raise exception 'refused: photo posts (20261127000000) are not applied here. This is not staging after Build 5.3.';
  end if;
end $$;

select exists (select 1 from pg_extension where extname = 'pg_net') as has_pg_net \gset
\if :has_pg_net
\else
  rollback;
  \echo 'pg_net is not installed here. Nothing to remove, nothing changed.'
  \quit
\endif

create temp table pgnet_checks (n int primary key, what text not null, ok boolean not null, detail text not null) on commit drop;

do $$
declare
  cron_ok boolean := to_regclass('cron.job') is not null and to_regclass('cron.job_run_details') is not null;
  jobs int := 0;
  good_job boolean := false;
  runs int := 0;
  net_jobs int := 0;
  queued bigint := 0;
  hooks int := 0;
  deps text;
  bodies text;
begin
  if cron_ok then
    execute $q$select count(*) from cron.job where jobname = 'post-media-drain'$q$ into jobs;
    execute $q$select coalesce(bool_and(active and schedule = '*/15 * * * *'
                   and command ~ 'extensions\.http\(' and command !~ '\mnet\.'
                   and command ~ '/functions/v1/post-media/drain'), false)
                from cron.job where jobname = 'post-media-drain'$q$ into good_job;
    execute $q$select count(*) from cron.job_run_details d join cron.job j on j.jobid = d.jobid
                where j.jobname = 'post-media-drain' and d.status = 'succeeded' and d.command = j.command$q$ into runs;
    execute $q$select count(*) from cron.job where command ~ '\mnet\.'$q$ into net_jobs;
  end if;
  insert into pgnet_checks values
    (2, 'one post-media-drain job, active, every 15 minutes, on the http extension', jobs = 1 and good_job,
        pg_catalog.format('%s job(s) named post-media-drain; http, active and every 15 minutes: %s', jobs, good_job)),
    (3, 'the http job has a succeeded run', runs > 0, pg_catalog.format('%s succeeded run(s) with the current command', runs)),
    (4, 'no cron job mentions net.', cron_ok and net_jobs = 0, pg_catalog.format('%s job(s) mention net.', net_jobs));

  execute $q$select count(*) from net.http_request_queue$q$ into queued;
  insert into pgnet_checks values (5, 'pg_net''s request queue is empty', queued = 0, pg_catalog.format('%s request(s) waiting', queued));

  if to_regprocedure('supabase_functions.http_request()') is not null then
    select count(*) into hooks from pg_trigger t where t.tgfoid = 'supabase_functions.http_request()'::regprocedure;
  end if;
  insert into pgnet_checks values (6, 'no database webhooks (triggers on supabase_functions.http_request)', hooks = 0, pg_catalog.format('%s trigger(s)', hooks));

  -- Objects recorded as depending on anything pg_net owns, other than pg_net's own.
  select string_agg(distinct pg_catalog.pg_describe_object(d.classid, d.objid, d.objsubid), '; ') into deps
  from pg_depend d
  join pg_depend m on m.classid = d.refclassid and m.objid = d.refobjid and m.deptype = 'e'
                  and m.refobjid = (select oid from pg_extension where extname = 'pg_net')
  where d.deptype in ('n', 'a')
    -- (pg_net's own columns, defaults, constraints and indexes live in schema net.)
    and (pg_catalog.pg_identify_object(d.classid, d.objid, d.objsubid)).schema is distinct from 'net'
    and not (d.classid = 'pg_attrdef'::regclass and exists (
               select 1 from pg_attrdef ad join pg_class c on c.oid = ad.adrelid
               where ad.oid = d.objid and c.relnamespace = 'net'::regnamespace))
    and not exists (select 1 from pg_depend me where me.classid = d.classid and me.objid = d.objid and me.deptype = 'e'
                    and me.refobjid = (select oid from pg_extension where extname = 'pg_net'));
  -- Function bodies that call pg_net (not recorded in pg_depend), other than Supabase's two.
  select string_agg(n.nspname || '.' || p.proname || '()', '; ') into bodies
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where p.prosrc ~ '\mnet\.[_a-z]'
    and p.oid not in (select objid from pg_depend where classid = 'pg_proc'::regclass and deptype = 'e'
                      and refobjid = (select oid from pg_extension where extname = 'pg_net'))
    and not (p.pronargs = 0 and (n.nspname, p.proname) in (('supabase_functions', 'http_request'), ('extensions', 'grant_pg_net_access')));
  insert into pgnet_checks values (7, 'nothing else depends on pg_net or calls it',
    deps is null and bodies is null, coalesce('depends: ' || deps || ' ', '') || coalesce('calls: ' || bodies, case when deps is null then 'none' else '' end));
  insert into pgnet_checks values (1, 'photo posts are applied here (staging after Build 5.3)', true, '20261127000000 applied');
end $$;

select n, case when ok then 'ok' else 'REFUSED' end as result, what, detail from pgnet_checks order by n;

do $$
begin
  if exists (select 1 from pgnet_checks where not ok) then
    raise exception 'refused, nothing changed: pg_net stays until every check above is ok';
  end if;
end $$;

drop extension pg_net;

select exists (select 1 from pg_extension where extname = 'pg_net') as pg_net_installed,
       to_regnamespace('net') is not null as net_schema_present;

select current_setting('crevant.pgnet_mode') = 'apply' as change \gset
\if :change
  commit;
  \echo 'Done: pg_net is removed. Next: run the staging workflow in check mode (security checks 001 to 013).'
\else
  rollback;
  \echo 'Check only: every check passed and pg_net could be dropped; all of it was rolled back. Nothing changed.'
\endif
