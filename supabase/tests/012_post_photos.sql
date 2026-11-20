-- Staging-safe, read-only: photo posts (20261127000000).
-- Catalog reads only (plus the bucket's own settings): no member data.
-- Before the migration is applied this file only confirms that nothing of it
-- exists yet; once it is recorded, every check below must pass.

\set ON_ERROR_STOP on
select to_regclass('social.post_media') is not null
       or case when to_regclass('supabase_migrations.schema_migrations') is null then false
               else (xpath('/row/n/text()', query_to_xml(
                       'select count(*) as n from supabase_migrations.schema_migrations where version = ''20261127000000''',
                       false, true, '')))[1]::text::int > 0
          end as photos_applied \gset
\if :photos_applied

-- 1. Photo data, the deletion queue and the settings are private.
do $$
declare
  t text;
begin
  foreach t in array array['social.media_uploads', 'social.post_media', 'ops.media_deletions', 'ops.media_drain_runs', 'ops.media_settings', 'ops.media_admin_events'] loop
    if to_regclass(t) is null then
      raise exception 'FAIL: % is missing', t;
    end if;
    if not (select relrowsecurity from pg_class where oid = t::regclass) then
      raise exception 'FAIL: row level security is off on %', t;
    end if;
    if has_table_privilege('anon', t, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
       or has_table_privilege('authenticated', t, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER') then
      raise exception 'FAIL: members or visitors have privileges on %', t;
    end if;
    if exists (select 1 from pg_policy where polrelid = t::regclass) then
      raise exception 'FAIL: % has a row level security policy', t;
    end if;
  end loop;
  raise notice 'PASS: uploads, post media, the deletion queue, its runs and the photo settings are private';
end $$;

-- 2. Storage: the private post-photos bucket with its limits; no member or
--    visitor storage policy (the audit and check 010 also cover policies).
do $$
declare
  ok boolean;
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'PASS: no Storage here (local throwaway database without it)';
    return;
  end if;
  execute $q$select exists (select 1 from storage.buckets where id = 'post-photos' and public is false
            and file_size_limit = 614400 and allowed_mime_types = array['image/jpeg'])$q$ into ok;
  if not ok then
    raise exception 'FAIL: the post-photos bucket is missing, public, or its limits changed';
  end if;
  if to_regclass('storage.objects') is not null and exists (
       select 1 from pg_policies where schemaname = 'storage'
       and (roles && array['anon', 'authenticated', 'public']::name[])) then
    raise exception 'FAIL: storage policies open to members or visitors exist';
  end if;
  raise notice 'PASS: one private post-photos bucket (JPEG only, 600 KB) and no storage policy for members or visitors';
end $$;

-- 3. Who can call what.
do $$
declare
  r record;
  bad text[] := '{}';
  f text;
begin
  -- Service-only and server-only functions.
  foreach f in array array[
    'public.svc_photo_upload_stored(uuid, integer, integer, integer, integer)', 'public.svc_photo_upload_failed(uuid, text)',
    'public.svc_media_drain_claim(integer)', 'public.svc_media_drain_done(text, bigint[], bigint[], text)',
    'public.svc_photo_check_record(text, integer, boolean, text)',
    'ops.set_media_settings(text, boolean, bigint, numeric, numeric)', 'ops.queue_hidden_media(text, text)',
    'ops.queue_media_deletion(text, text, text)', 'ops.photo_storage_used()', 'ops.photos_open()',
    'ops.post_media_on_delete()', 'ops.media_upload_removed()', 'social.post_media_json(uuid)'
  ] loop
    if has_function_privilege('anon', f, 'EXECUTE') or has_function_privilege('authenticated', f, 'EXECUTE') then
      bad := bad || (f || ': callable by members or visitors');
    end if;
  end loop;
  -- Member and moderator functions: owner rights, empty search path, the right check.
  for r in select p.proname, p.prosrc, p.prosecdef, p.proconfig, p.oid
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and (p.proname in ('app_photo_status', 'app_photo_upload_begin', 'app_post_photos', 'app_mod_report_media', 'app_mod_media_status')
                                          or p.oid = 'public.app_create_post(text, uuid, uuid, text)'::regprocedure) loop
    if not r.prosecdef or r.proconfig is null or not ('search_path=""' = any (r.proconfig) or 'search_path=' = any (r.proconfig)) then
      bad := bad || (r.proname || ': not security definer with an empty search path');
    end if;
    if has_function_privilege('anon', r.oid, 'EXECUTE') then
      bad := bad || (r.proname || ': callable by visitors');
    end if;
    if r.proname like 'app\_mod\_%' then
      if position('social.current_moderator()' in r.prosrc) = 0 then bad := bad || (r.proname || ': does not check social.current_moderator()'); end if;
    elsif position('social.current_member()' in r.prosrc) = 0 then
      bad := bad || (r.proname || ': does not check social.current_member()');
    end if;
  end loop;
  -- Publishing re-checks the upload is the member's own and stored; storing re-checks membership.
  if position('x.user_id = v_uid' in (select prosrc from pg_proc where oid = 'public.app_create_post(text, uuid, uuid, text)'::regprocedure)) = 0
     or position('ops.photos_open()' in (select prosrc from pg_proc where oid = 'public.app_create_post(text, uuid, uuid, text)'::regprocedure)) = 0 then
    bad := bad || 'app_create_post with a photo: does not require the member''s own stored upload and the switch'::text;
  end if;
  if position('ops.member_access_active(u.user_id)' in (select prosrc from pg_proc where oid = 'public.svc_photo_upload_stored(uuid, integer, integer, integer, integer)'::regprocedure)) = 0 then
    bad := bad || 'svc_photo_upload_stored: does not re-check membership'::text;
  end if;
  if cardinality(bad) > 0 then
    raise exception 'FAIL: photo functions without the expected safeguards: %', bad;
  end if;
  raise notice 'PASS: photo member functions check membership (moderator ones the moderator row); service and server steps are closed to members';
end $$;

-- 4. Posts: the text rule is unchanged, an empty caption only with media,
--    and the four post readers return the photo.
do $$
declare
  def text := (select pg_get_constraintdef(oid) from pg_constraint where conrelid = 'social.posts'::regclass and conname = 'posts_body_valid');
  f text;
begin
  if def is null or position('char_length(body) >= 1' in def) = 0 or position('char_length(body) <= 2000' in def) = 0
     or position('media_kind IS NOT NULL' in def) = 0 or position('body = ''''::text' in def) = 0 then
    raise exception 'FAIL: the post text rule changed: %', def;
  end if;
  foreach f in array array['public.app_feed(timestamptz, integer)', 'public.app_member_posts(uuid, timestamptz, integer)',
                           'public.app_post(uuid)', 'public.app_catch_up(uuid, timestamptz, uuid)'] loop
    if not ('media'::text = any ((select proargnames from pg_proc where oid = f::regprocedure)::text[])) then
      raise exception 'FAIL: % does not return the photo', f;
    end if;
    if not has_function_privilege('authenticated', f, 'EXECUTE') or has_function_privilege('anon', f, 'EXECUTE') then
      raise exception 'FAIL: % has the wrong grants', f;
    end if;
  end loop;
  raise notice 'PASS: the text rule is unchanged (an empty caption only with a photo) and the post readers return the photo';
end $$;

-- 5. Deletion is server controlled: the queue is filled by the database and
--    never deletes a live post's file or kept evidence; uploads stay off
--    until the founder's gate is met.
do $$
declare
  claim text := (select prosrc from pg_proc where oid = 'public.svc_media_drain_claim(integer)'::regprocedure);
  gate text := (select prosrc from pg_proc where oid = 'ops.set_media_settings(text, boolean, bigint, numeric, numeric)'::regprocedure);
begin
  if not exists (select 1 from pg_trigger where tgname = 'post_media_on_delete' and tgrelid = 'social.posts'::regclass and tgenabled <> 'D')
     or not exists (select 1 from pg_trigger where tgname = 'media_upload_removed' and tgrelid = 'social.media_uploads'::regclass and tgenabled <> 'D') then
    raise exception 'FAIL: a deletion queueing trigger is missing or disabled';
  end if;
  if position('r.snapshot is not null' in claim) = 0 or position('s.deleted_at is null' in claim) = 0 or position('q.attempts < 8' in claim) = 0 then
    raise exception 'FAIL: the deletion queue no longer holds evidence, protects live posts or limits retries';
  end if;
  if (select pg_get_expr(d.adbin, d.adrelid) from pg_attrdef d join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
      where d.adrelid = 'ops.media_settings'::regclass and a.attname = 'photos_enabled') <> 'false' then
    raise exception 'FAIL: photo uploads are not off by default';
  end if;
  if position('processing_check' in gate) = 0 or position('p_cap_bytes is null' in gate) = 0 or position('p_egress_pause_gb is null' in gate) = 0 then
    raise exception 'FAIL: turning photos on no longer requires the cap, the egress thresholds and the processing checks';
  end if;
  if (select count(*) from pg_trigger t where t.tgrelid = 'ops.media_drain_runs'::regclass and not t.tgisinternal and t.tgfoid = 'ops.history_append_only()'::regprocedure) < 1
     or (select count(*) from pg_trigger t where t.tgrelid = 'ops.media_admin_events'::regclass and not t.tgisinternal and t.tgfoid = 'ops.history_append_only()'::regprocedure) < 1 then
    raise exception 'FAIL: the drain runs or the photo settings record can be edited';
  end if;
  raise notice 'PASS: deletion is queued by the database, keeps evidence and live posts, and photos stay off until the founder''s gate is met';
end $$;

\else
do $$
begin
  if to_regclass('social.media_uploads') is not null or to_regclass('ops.media_deletions') is not null
     or to_regclass('ops.media_settings') is not null
     or exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                where n.nspname = 'public' and (p.proname like 'app\_photo\_%' or p.proname like 'svc\_media\_%' or p.proname = 'app_post_photos')) then
    raise exception 'FAIL: part of the photo posts migration exists although it is not recorded';
  end if;
  raise notice 'PASS: photo posts (20261127000000) are not applied yet, and none of it exists';
end $$;
\endif
