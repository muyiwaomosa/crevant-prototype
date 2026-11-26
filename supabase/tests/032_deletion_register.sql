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
  recent integer;
  slowest numeric;
  quick integer;
begin
  select max(finished_at) into last_run from ops.media_drain_runs where source = 'scheduled';
  select count(*) into waiting from ops.deletion_register where reported_at is null and occurred_at < pg_catalog.now() - interval '30 minutes';
  -- How fast recent deletions reached the log: seconds only, for the latest 10.
  select count(*), round(coalesce(max(extract(epoch from (r.reported_at - r.occurred_at))), 0)),
         count(*) filter (where r.reported_at - r.occurred_at < interval '1 minute')
    into recent, slowest, quick
  from (select reported_at, occurred_at from ops.deletion_register where reported_at is not null order by id desc limit 10) r;
  raise notice 'INFO: deletion register: of the latest % logged deletion(s), % reached the log within a minute (immediate report); the slowest took % s', recent, quick, slowest;
  if last_run is null or last_run < pg_catalog.now() - interval '30 minutes' or waiting > 0 then
    raise notice 'NOTICE: deletion register: the scheduled drain last ran at %, and % deletion(s) have waited over 30 minutes to be logged. Check the photo cleanup schedule (docs/RECOVERY.md)', coalesce(last_run::text, 'never'), waiting;
  else
    raise notice 'PASS: deletion register: the scheduled drain ran at % and nothing is waiting to be logged', last_run;
  end if;
end $$;

-- Completeness, not just speed: every deletion completed since the register
-- started (within its 30-day window) has a register row, and every row has
-- been logged. Fails on any gap. Counts only.
do $$
declare
  started timestamptz;
  posts_missing integer;
  comments_missing integer;
  account_events integer;
  account_rows integer;
  unlogged integer;
begin
  select min(occurred_at) into started from ops.deletion_register;
  if started is null then
    raise notice 'PASS: deletion register completeness: nothing deleted since the register started, nothing to compare yet';
    return;
  end if;
  started := greatest(started, pg_catalog.now() - interval '29 days');
  select count(*) into posts_missing from social.posts p
  where p.deleted_at >= started
    and not exists (select 1 from ops.deletion_register r where r.kind = 'post' and r.target_id = p.id and r.event = 'deleted');
  select count(*) into comments_missing from social.comments c
  where c.deleted_at >= started
    and not exists (select 1 from ops.deletion_register r where r.kind = 'comment' and r.target_id = c.id and r.event = 'deleted');
  -- Accounts, one by one: the founder's deletion writes its 'account_deleted'
  -- event and (through the trigger) its register row in the same transaction,
  -- so both carry the same transaction time. Two deletions in different
  -- transactions can, rarely, share that time, so the match is counted per
  -- time: each time must have at least as many register rows as deletion
  -- events, so every event is matched to a row of its own. No new identifier
  -- is kept for this.
  select coalesce(sum(greatest(e.n - coalesce(r.n, 0), 0)), 0) into account_events
  from (select occurred_at, count(*) as n from ops.member_request_events
        where action = 'account_deleted' and occurred_at >= started group by occurred_at) e
  left join (select occurred_at, count(*) as n from ops.deletion_register
             where kind = 'account' and event = 'deleted' group by occurred_at) r on r.occurred_at = e.occurred_at;
  -- Register rows for accounts removed another way (the dashboard), for information.
  select count(*) into account_rows from ops.deletion_register r
  where r.kind = 'account' and r.event = 'deleted' and r.occurred_at >= started
    and not exists (select 1 from ops.member_request_events e where e.action = 'account_deleted' and e.occurred_at = r.occurred_at);
  select count(*) into unlogged from ops.deletion_register where reported_at is null and occurred_at < pg_catalog.now() - interval '30 minutes';
  if posts_missing > 0 or comments_missing > 0 or account_events > 0 or unlogged > 0 then
    raise exception 'FAIL: deletion register completeness: % post(s), % comment(s) and % founder account deletion(s) without their own register row; % row(s) not logged after 30 minutes',
      posts_missing, comments_missing, account_events, unlogged;
  end if;
  raise notice 'PASS: deletion register completeness: every post, comment and founder account deletion since % has its own register row (counted per transaction time, so a shared time cannot hide a missing row), and every row older than 30 minutes is logged; % account row(s) from deletions outside the founder function', started, account_rows;
end $$;

\else
\echo 'Skipped 032_deletion_register.sql: 20261216000000 is not applied here.'
\endif
