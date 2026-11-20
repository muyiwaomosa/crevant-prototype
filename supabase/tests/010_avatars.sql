-- Staging-safe, read-only: profile pictures (20261125000000).
-- Catalog reads only (plus the bucket's own settings): no member data.
-- Before the migration is applied this file only confirms that nothing of it
-- exists yet; once it is recorded, every check below must pass.

\set ON_ERROR_STOP on
select to_regclass('social.avatars') is not null
       or case when to_regclass('supabase_migrations.schema_migrations') is null then false
               else (xpath('/row/n/text()', query_to_xml(
                       'select count(*) as n from supabase_migrations.schema_migrations where version = ''20261125000000''',
                       false, true, '')))[1]::text::int > 0
          end as avatars_applied \gset
\if :avatars_applied

-- 1. Picture data is private.
do $$
declare
  t text;
begin
  foreach t in array array['social.avatars', 'social.avatar_uploads', 'social.avatar_events', 'ops.storage_orphans', 'ops.storage_cleanup_plans'] loop
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
  raise notice 'PASS: pictures, uploads, their history, orphans and cleanup plans are private';
end $$;

-- 2. Storage: the one private bucket with the approved limits, and members
--    and visitors can't touch Storage at all (everything goes through the
--    avatar Edge Function).
do $$
declare
  b record;
begin
  if to_regclass('storage.buckets') is null then
    raise exception 'FAIL: Supabase Storage is not installed, but profile pictures are applied';
  end if;
  execute $q$select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'avatars'$q$ into b;
  if b is null or b.public is distinct from false or b.file_size_limit is distinct from 204800 or b.allowed_mime_types is distinct from array['image/jpeg'] then
    raise exception 'FAIL: the avatars bucket is missing, public, or not limited to JPEG and 200 KB';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'storage' and roles && array['anon', 'authenticated', 'public']::name[]) then
    raise exception 'FAIL: a storage policy lets members or visitors reach Storage directly';
  end if;
  raise notice 'PASS: one private avatars bucket (JPEG only, 200 KB), and no storage policy for members or visitors';
end $$;

-- 3. The service steps are for the service role only; member steps check membership; cleanup checks moderation.
do $$
declare
  f text;
  bad text[] := '{}';
begin
  foreach f in array array['public.svc_avatar_commit(text)', 'public.svc_avatar_orphan(text, text)'] loop
    if has_function_privilege('anon', f, 'EXECUTE') or has_function_privilege('authenticated', f, 'EXECUTE')
       or not has_function_privilege('service_role', f, 'EXECUTE') then
      bad := bad || f;
    end if;
  end loop;
  if position('ops.member_access_active(u.user_id)' in (select prosrc from pg_proc where oid = 'public.svc_avatar_commit(text)'::regprocedure)) = 0
     or position('interval ''15 minutes''' in (select prosrc from pg_proc where oid = 'public.svc_avatar_commit(text)'::regprocedure)) = 0 then
    bad := bad || 'svc_avatar_commit does not re-check membership and the 15-minute window'::text;
  end if;
  foreach f in array array['public.app_avatar_begin()', 'public.app_avatar_remove()', 'public.app_avatars(uuid[])'] loop
    if position('social.current_member()' in (select prosrc from pg_proc where oid = f::regprocedure)) = 0 then bad := bad || f; end if;
  end loop;
  foreach f in array array['public.app_mod_storage_preview()', 'public.app_mod_storage_cleanup_start(uuid, text)', 'public.app_mod_storage_cleanup_finish(uuid)'] loop
    if position('social.current_moderator()' in (select prosrc from pg_proc where oid = f::regprocedure)) = 0 then bad := bad || f; end if;
  end loop;
  if position('social.avatar_rate_check(v_uid)' in (select prosrc from pg_proc where oid = 'public.app_avatar_begin()'::regprocedure)) = 0 then
    bad := bad || 'app_avatar_begin has no daily limit'::text;
  end if;
  if position('d.hidden_at is null' in (select prosrc from pg_proc where oid = 'public.app_avatars(uuid[])'::regprocedure)) = 0
     or position('social.visible_members' in (select prosrc from pg_proc where oid = 'public.app_avatars(uuid[])'::regprocedure)) = 0 then
    bad := bad || 'app_avatars shows revoked or hidden members'::text;
  end if;
  if cardinality(bad) > 0 then
    raise exception 'FAIL: picture functions without the expected safeguards: %', bad;
  end if;
  raise notice 'PASS: service steps are service-role only and re-check membership; member steps need membership (10 a day); cleanup needs a moderator; hidden and revoked members'' pictures are never handed out';
end $$;

-- 4. Cleanup never deletes what is in use, recent or still uploading; the history is append-only.
do $$
declare
  src text := (select prosrc from pg_proc where oid = 'ops.storage_cleanup_candidates()'::regprocedure);
begin
  if src !~ 'interval ''24 hours''' or src !~ 'social\.avatars a where a\.path = o\.name' or src !~ 'interval ''1 hour''' or src !~ 'bucket_id = ''avatars''' then
    raise exception 'FAIL: storage cleanup could delete current pictures, recent files, live uploads or other buckets';
  end if;
  if position('confirm_phrase' in (select prosrc from pg_proc where oid = 'public.app_mod_storage_cleanup_start(uuid, text)'::regprocedure)) = 0
     or position('ops.storage_cleanup_candidates()' in (select prosrc from pg_proc where oid = 'public.app_mod_storage_cleanup_start(uuid, text)'::regprocedure)) = 0 then
    raise exception 'FAIL: confirming cleanup does not require the phrase and a recheck';
  end if;
  if (select count(*) from pg_trigger g join pg_proc p on p.oid = g.tgfoid
      where g.tgrelid = 'social.avatar_events'::regclass and not g.tgisinternal and p.proname = 'history_append_only') <> 2 then
    raise exception 'FAIL: the picture history can be edited';
  end if;
  raise notice 'PASS: cleanup is limited to old, unused files in the avatars bucket, needs the phrase and a recheck; the history is append-only';
end $$;

\else
do $$
begin
  if to_regclass('social.avatar_uploads') is not null or to_regclass('ops.storage_orphans') is not null
     or exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                where n.nspname = 'public' and p.proname in ('app_avatar_begin', 'app_avatar_remove', 'app_avatars', 'svc_avatar_commit', 'svc_avatar_orphan',
                                                             'app_mod_storage_preview', 'app_mod_storage_cleanup_start', 'app_mod_storage_cleanup_finish')) then
    raise exception 'FAIL: part of the profile pictures migration exists, but not all of it';
  end if;
  raise notice 'SKIP: profile pictures (20261125000000) are not applied here yet, and none of it exists';
end $$;
\endif
