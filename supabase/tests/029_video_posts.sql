-- Staging-safe, read-only: video posts (20261213000000).
-- Catalog reads only. Skipped until the migration is applied.

\set ON_ERROR_STOP on
select to_regclass('ops.video_device_tests') is not null
       or case when to_regclass('supabase_migrations.schema_migrations') is null then false
               else (xpath('/row/n/text()', query_to_xml(
                       'select count(*) as n from supabase_migrations.schema_migrations where version = ''20261213000000''',
                       false, true, '')))[1]::text::int > 0
          end as video_applied \gset
\if :video_applied

do $$
declare
  bad text[] := '{}';
  f text;
  sw text := (select prosrc from pg_proc where oid = 'public.app_founder_set_switch(text, boolean, text)'::regprocedure);
  begin_src text := (select prosrc from pg_proc where oid = 'public.app_video_upload_begin(integer, integer, text)'::regprocedure);
  post_src text := (select prosrc from pg_proc where oid = 'public.app_create_post(text, uuid, uuid, text)'::regprocedure);
  links_src text := (select prosrc from pg_proc where oid = 'public.app_post_videos(uuid[])'::regprocedure);
  stored_src text := (select prosrc from pg_proc where oid = 'public.svc_video_upload_stored(uuid, integer, integer, integer, integer, text)'::regprocedure);
begin
  -- The device tests are private and append-only.
  if not (select relrowsecurity from pg_class where oid = 'ops.video_device_tests'::regclass)
     or has_table_privilege('authenticated', 'ops.video_device_tests', 'SELECT,INSERT,UPDATE,DELETE')
     or has_table_privilege('anon', 'ops.video_device_tests', 'SELECT,INSERT,UPDATE,DELETE') then
    bad := bad || 'the device tests are reachable directly'::text;
  end if;
  if not exists (select 1 from pg_trigger g where not g.tgisinternal and g.tgfoid = 'ops.history_append_only()'::regprocedure
                 and g.tgrelid = 'ops.video_device_tests'::regclass) then
    bad := bad || 'the device tests can be edited'::text;
  end if;
  -- The switch still refuses, now unless both phone tests passed and the cap is set.
  if position('video_not_ready' in sw) = 0 or position('ops.video_ready()' in sw) = 0
     or position('iphone_safari' in (select prosrc from pg_proc where oid = 'ops.video_ready()'::regprocedure)) = 0
     or position('android_chrome' in (select prosrc from pg_proc where oid = 'ops.video_ready()'::regprocedure)) = 0
     or position('video_storage_cap_bytes' in (select prosrc from pg_proc where oid = 'ops.video_ready()'::regprocedure)) = 0 then
    bad := bad || 'video posts can be switched on without both device tests and the cap'::text;
  end if;
  -- Uploads, publishing and playback are refused by the server while the switch is off; tests are for the founder and testers only.
  if position('ops.videos_open()' in begin_src) = 0 or position('ops.video_tester(v_uid)' in begin_src) = 0
     or position('ops.videos_open()' in post_src) = 0 or position($s$u.purpose <> 'post'$s$ in post_src) = 0
     or position($s$ops.feature_on('video_posts')$s$ in links_src) = 0 then
    bad := bad || 'a video step is not closed by the switch'::text;
  end if;
  -- The approved limits: 5 minutes, 110 MB, 5 a day, 1 GB a member; H.264 within 1280 x 720.
  if position('300000' in begin_src) = 0 or position('115343360' in begin_src) = 0 or position('1073741824' in begin_src) = 0
     or position('>= 5' in post_src) = 0 or position('avc1' in stored_src) = 0 or position('1280' in stored_src) = 0 or position('720' in stored_src) = 0 then
    bad := bad || 'a video limit is missing'::text;
  end if;
  -- Every video file goes through the existing deletion queue, in its own bucket.
  if (select pg_get_constraintdef(oid) from pg_constraint where conname = 'media_deletions_bucket_path' and conrelid = 'ops.media_deletions'::regclass) !~ 'post-videos'
     or position('ops.media_bucket' in (select prosrc from pg_proc where oid = 'ops.post_media_on_delete()'::regprocedure)) = 0
     or position('ops.media_bucket' in (select prosrc from pg_proc where oid = 'ops.media_upload_removed()'::regprocedure)) = 0
     or position('post-videos' in (select prosrc from pg_proc where oid = 'public.svc_media_drain_claim(integer)'::regprocedure)) = 0 then
    bad := bad || 'video files can escape the deletion queue'::text;
  end if;
  -- Member and founder functions: owner rights, empty search path, members only; service steps closed to members.
  foreach f in array array['public.app_video_status()', 'public.app_video_upload_begin(integer, integer, text)', 'public.app_video_upload_paths(uuid)',
                           'public.app_post_videos(uuid[])', 'public.app_founder_record_device_test(text, boolean, text)',
                           'public.app_founder_set_video_cap(integer)', 'public.app_founder_video_status()'] loop
    if has_function_privilege('anon', f, 'EXECUTE') or not has_function_privilege('authenticated', f, 'EXECUTE')
       or not (select prosecdef from pg_proc where oid = f::regprocedure)
       or (select prosrc from pg_proc where oid = f::regprocedure) !~ (case when f like 'public.app\_founder\_%' then 'social\.current_founder\(\)' else 'social\.current_member\(\)' end) then
      bad := bad || (f || ' is not a members-only function checking the caller');
    end if;
  end loop;
  foreach f in array array['public.svc_video_upload_stored(uuid, integer, integer, integer, integer, text)', 'public.svc_video_poster_stored(uuid, integer)',
                           'ops.video_ready()', 'ops.videos_open()', 'ops.video_tester(uuid)', 'ops.video_storage_used()', 'ops.video_member_bytes(uuid)'] loop
    if has_function_privilege('authenticated', f, 'EXECUTE') or has_function_privilege('anon', f, 'EXECUTE') then
      bad := bad || (f || ' is callable by members or visitors');
    end if;
  end loop;
  if exists (select 1 from pg_catalog.pg_namespace where nspname = 'storage') and pg_catalog.to_regclass('storage.buckets') is not null then
    if (select count(*) from storage.buckets b where b.id = 'post-videos' and b.public is false and b.file_size_limit = 115343360) <> 1 then
      bad := bad || 'the private post-videos bucket is missing or changed'::text;
    end if;
  end if;
  if cardinality(bad) > 0 then
    raise exception 'FAIL: video posts: %', bad;
  end if;
  raise notice 'PASS: video posts: device tests are private and append-only; video turns on only after both phone tests and a cap; the server closes uploads, publishing and links while off; the approved limits hold; every file goes through the deletion queue';
end $$;

\else
\echo 'Skipped 029_video_posts.sql: 20261213000000 is not applied here.'
\endif
