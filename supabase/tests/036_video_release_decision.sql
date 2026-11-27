-- Staging-safe, read-only: the video release decision (20261220000000).
-- Catalog reads, plus the device test count reported, never failed. Skipped until applied.

\set ON_ERROR_STOP on
select case when to_regclass('supabase_migrations.schema_migrations') is null then false
            else (xpath('/row/n/text()', query_to_xml(
                    'select count(*) as n from supabase_migrations.schema_migrations where version = ''20261220000000''',
                    false, true, '')))[1]::text::int > 0
       end
       or coalesce(obj_description(to_regprocedure('ops.video_ready()'), 'pg_proc'), '') ~ '20261220000000' as release_applied \gset
\if :release_applied

do $$
declare
  bad text[] := '{}';
  ready text := (select prosrc from pg_proc where oid = 'ops.video_ready()'::regprocedure);
  sw text := (select prosrc from pg_proc where oid = 'public.app_founder_set_switch(text, boolean, text)'::regprocedure);
begin
  -- The switch for New video uploads still refuses without the storage cap.
  if position('video_not_ready' in sw) = 0 or position('ops.video_ready()' in sw) = 0
     or position('video_storage_cap_bytes' in ready) = 0 then
    bad := bad || 'video posts can be switched on without the storage cap'::text;
  end if;
  -- Device tests no longer gate it, and are still kept: private and append-only.
  if position('video_device' in ready) > 0 or position('iphone_safari' in ready) > 0 or position('android_chrome' in ready) > 0 then
    bad := bad || 'the video gate still reads the device tests'::text;
  end if;
  if not (select relrowsecurity from pg_class where oid = 'ops.video_device_tests'::regclass)
     or has_table_privilege('authenticated', 'ops.video_device_tests', 'SELECT,INSERT,UPDATE,DELETE')
     or not exists (select 1 from pg_trigger g where not g.tgisinternal and g.tgfoid = 'ops.history_append_only()'::regprocedure
                    and g.tgrelid = 'ops.video_device_tests'::regclass) then
    bad := bad || 'the device test records are no longer private and append-only'::text;
  end if;
  -- The gate is server code only.
  if has_function_privilege('authenticated', 'ops.video_ready()', 'EXECUTE') or has_function_privilege('anon', 'ops.video_ready()', 'EXECUTE')
     or not (select prosecdef from pg_proc where oid = 'ops.video_ready()'::regprocedure) then
    bad := bad || 'the video gate is callable by members or visitors'::text;
  end if;
  if cardinality(bad) > 0 then
    raise exception 'FAIL: video release decision: %', bad;
  end if;
  raise notice 'PASS: video release decision: New video uploads need the storage cap, not device tests; device tests are kept, private and append-only; the gate is server code only';
end $$;

do $$
begin
  raise notice 'INFO: video: cap set %, uploads switch %, playback switch %, % device test record(s)',
    coalesce((select (s.video_storage_cap_bytes is not null)::text from ops.media_settings s where s.id), 'false'),
    ops.feature_on('video_posts'), ops.feature_on('video_playback'), (select count(*) from ops.video_device_tests);
end $$;

\else
\echo 'Skipped 036_video_release_decision.sql: 20261220000000 is not applied here.'
\endif
