-- Staging-safe, read-only: the deletion register (20261216000000). Catalog reads,
-- plus two counts (the last scheduled drain, rows waiting to be logged) reported, never failed.
-- Skipped until the migration is applied.

\set ON_ERROR_STOP on
select to_regclass('ops.deletion_register') is not null
       or case when to_regclass('supabase_migrations.schema_migrations') is null then false
            else (xpath('/row/n/text()', query_to_xml(
                    'select count(*) as n from supabase_migrations.schema_migrations where version = ''20261216000000''',
                    false, true, '')))[1]::text::int > 0
       end as register_applied \gset
\if :register_applied

do $$
declare
  bad text[] := '{}';
begin
  -- Written in the same transaction as each deletion: the three triggers, enabled.
  if (select count(*) from pg_trigger t
      where not t.tgisinternal and t.tgenabled <> 'D'
        and ((t.tgrelid = 'auth.users'::regclass and t.tgname = 'register_account_deletion')
          or (t.tgrelid = 'social.posts'::regclass and t.tgname = 'register_post_deletion')
          or (t.tgrelid = 'social.comments'::regclass and t.tgname = 'register_comment_deletion'))) <> 3 then
    bad := bad || 'a deletion register trigger is missing or disabled'::text;
  end if;
  -- Append-only, private, ids and times only.
  if not exists (select 1 from pg_trigger where tgrelid = 'ops.deletion_register'::regclass and tgname = 'deletion_register_guard' and tgenabled <> 'D') then
    bad := bad || 'the register is not append-only'::text;
  end if;
  if not (select relrowsecurity from pg_class where oid = 'ops.deletion_register'::regclass)
     or has_table_privilege('authenticated', 'ops.deletion_register', 'select')
     or has_table_privilege('anon', 'ops.deletion_register', 'select') then
    bad := bad || 'members can read the register'::text;
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'ops' and table_name = 'deletion_register'
             and column_name not in ('id', 'kind', 'target_id', 'event', 'occurred_at', 'reported_at')) then
    bad := bad || 'the register holds more than ids and times'::text;
  end if;
  -- The drain's functions are for the service key only; recovery is for the founder only.
  if has_function_privilege('authenticated', 'public.svc_deletion_register_unreported(integer)', 'execute')
     or has_function_privilege('authenticated', 'public.svc_deletion_register_reported(bigint[])', 'execute')
     or not has_function_privilege('service_role', 'public.svc_deletion_register_unreported(integer)', 'execute')
     or has_function_privilege('authenticated', 'ops.reapply_deletions(jsonb, timestamptz)', 'execute')
     or has_function_privilege('service_role', 'ops.reapply_deletions(jsonb, timestamptz)', 'execute') then
    bad := bad || 'register function grants are wrong'::text;
  end if;
  if cardinality(bad) > 0 then
    raise exception 'FAIL: deletion register: %', bad;
  end if;
  raise notice 'PASS: deletion register: written with every account, post and comment deletion; append-only, ids and times only; service and founder functions only';
end $$;

-- Reported, never failed: the register reaches the function log only while
-- the scheduled drain runs (every 15 minutes). Counts and times only.
do $$
declare
  last_run timestamptz;
  waiting integer;
begin
  select max(finished_at) into last_run from ops.media_drain_runs where source = 'scheduled';
  select count(*) into waiting from ops.deletion_register where reported_at is null and occurred_at < pg_catalog.now() - interval '30 minutes';
  if last_run is null or last_run < pg_catalog.now() - interval '30 minutes' or waiting > 0 then
    raise notice 'NOTICE: deletion register: the scheduled drain last ran at %, and % deletion(s) have waited over 30 minutes to be logged. Check the photo cleanup schedule (docs/RECOVERY.md)', coalesce(last_run::text, 'never'), waiting;
  else
    raise notice 'PASS: deletion register: the scheduled drain ran at % and nothing is waiting to be logged', last_run;
  end if;
end $$;

\else
\echo 'Skipped 032_deletion_register.sql: 20261216000000 is not applied here.'
\endif
