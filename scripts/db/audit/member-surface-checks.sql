-- The checks of the member authorization surface audit (see
-- member-surface.sql, which runs them READ ONLY and rolls back). Kept
-- separate so CI can replay them inside its own rolled-back transaction after
-- a deliberate violation (scripts/db/test.sh, scripts/db/audit/violations/).
-- Catalog reads only: no table rows, no personal data, no changes.

-- 1. Member-callable functions in the owned schemas: exactly the allow-list.
do $$
declare
  expected text[] := array[
    'public.app_access_state()',
    'public.app_add_comment(uuid,text)',
    'public.app_add_comment(uuid,text,uuid)',
    'public.app_catch_up(uuid,timestamp with time zone,uuid)',
    'public.app_clique_add(uuid)',
    'public.app_clique_remove(uuid)',
    'public.app_clique_replace(uuid,uuid)',
    'public.app_comments(uuid)',
    'public.app_create_post(text)',
    'public.app_create_post(text,uuid)',
    'public.app_delete_comment(uuid)',
    'public.app_delete_post(uuid)',
    'public.app_discover(text,integer)',
    'public.app_feed(timestamp with time zone,integer)',
    'public.app_follow(uuid)',
    'public.app_following()',
    'public.app_like(uuid)',
    'public.app_mark_viewed(uuid[],text)',
    'public.app_me()',
    'public.app_member(text)',
    'public.app_member_posts(uuid,timestamp with time zone,integer)',
    'public.app_post(uuid)',
    'public.app_set_profile(text,text)',
    'public.app_unfollow(uuid)',
    'public.app_unlike(uuid)',
    'public.app_unseen_creators()'
  ];
  -- Profile details (20261123000000), once applied. Before it, exactly the
  -- list above; after it, exactly the list above plus these.
  details text[] := array[
    'public.app_discover_people(text,text,integer)',
    'public.app_member_details(uuid)',
    'public.app_my_details()',
    'public.app_set_profile_details(text,text,text,text[])',
    'public.app_suggested_creators(integer)',
    'public.app_topics()'
  ];
  -- Moderation (20261124000000), once applied.
  moderation text[] := array[
    'public.app_is_moderator()',
    'public.app_mod_dismiss(uuid,text)',
    'public.app_mod_hide(uuid,text)',
    'public.app_mod_queue(text)',
    'public.app_mod_report(uuid)',
    'public.app_mod_restore(uuid,text)',
    'public.app_report(text,uuid,text,text)'
  ];
  -- Profile pictures (20261125000000), once applied.
  avatars text[] := array[
    'public.app_avatar_begin()',
    'public.app_avatar_remove()',
    'public.app_avatars(uuid[])',
    'public.app_mod_storage_cleanup_finish(uuid)',
    'public.app_mod_storage_cleanup_start(uuid,text)',
    'public.app_mod_storage_preview()'
  ];
  actual text[];
  extra text[];
  missing text[];
  anon_fns text[];
begin
  if to_regclass('social.profile_details') is not null then
    expected := expected || details;
  end if;
  if to_regclass('ops.content_reports') is not null then
    expected := expected || moderation;
  end if;
  if to_regclass('social.avatars') is not null then
    expected := expected || avatars;
  end if;
  select coalesce(array_agg(n.nspname || '.' || p.proname || '(' || pg_catalog.oidvectortypes(p.proargtypes) || ')' order by 1), '{}')
    into actual
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'ops', 'social', 'waitlist_api')
    and pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE');
  -- Normalise argument lists to the same spelling as the allow-list (no spaces after commas).
  actual := (select coalesce(array_agg(replace(a, ', ', ',') order by 1), '{}') from unnest(actual) a);
  extra := (select coalesce(array_agg(a), '{}') from unnest(actual) a where a <> all (expected));
  missing := (select coalesce(array_agg(e), '{}') from unnest(expected) e where e <> all (actual));
  if cardinality(extra) > 0 then
    raise exception 'FAIL: signed-in accounts can run functions outside the allow-list: %', extra;
  end if;
  if cardinality(missing) > 0 then
    raise exception 'FAIL: expected member functions are missing or not callable: % (update the allow-list in the same pull request as the migration)', missing;
  end if;

  select coalesce(array_agg(n.nspname || '.' || p.proname || '(' || pg_catalog.oidvectortypes(p.proargtypes) || ')'), '{}')
    into anon_fns
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'ops', 'social', 'waitlist_api')
    and pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE');
  if cardinality(anon_fns) > 0 then
    raise exception 'FAIL: anonymous visitors can run functions: %', anon_fns;
  end if;
  raise notice 'PASS: exactly % member functions are callable by signed-in accounts, none by anonymous visitors', cardinality(expected);
end;
$$;

-- 2. Every member function runs as its owner with an empty search path and
--    checks the caller, including pilot membership:
--      * app_me and app_set_profile: social.current_access() (signed in AND an
--        active pilot membership; the profile may still be incomplete);
--      * app_access_state: auth.uid() only, returning the caller's own state;
--      * every other function: social.current_member() (signed in, active
--        membership, complete profile).
--    And the chain itself: current_member() goes through current_access(),
--    which requires ops.member_access_active(), which reads an active,
--    unexpired ops.member_access row.
do $$
declare
  r record;
  bad text[] := '{}';
begin
  for r in
    select p.oid, p.proname, p.prosecdef, p.proconfig, p.prosrc
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')
  loop
    if not r.prosecdef then bad := bad || (r.proname || ': not security definer'); end if;
    if r.proconfig is null or not ('search_path=""' = any (r.proconfig) or 'search_path=' = any (r.proconfig)) then
      bad := bad || (r.proname || ': search path not empty');
    end if;
    if r.proname in ('app_me', 'app_set_profile') then
      if position('social.current_access()' in r.prosrc) = 0 then
        bad := bad || (r.proname || ': does not check social.current_access()');
      end if;
    elsif r.proname like 'app\_mod\_%' then
      -- Moderators only: membership AND an active moderator row.
      if position('social.current_moderator()' in r.prosrc) = 0 then
        bad := bad || (r.proname || ': does not check social.current_moderator()');
      end if;
    elsif r.proname = 'app_access_state' then
      if position('auth.uid()' in r.prosrc) = 0 or position('ops.member_access a on a.user_id = v_uid' in r.prosrc) = 0 then
        bad := bad || (r.proname || ': does not read only the caller''s own membership');
      end if;
    elsif position('social.current_member()' in r.prosrc) = 0 then
      bad := bad || (r.proname || ': does not check social.current_member()');
    end if;
  end loop;
  -- The moderator check goes through the membership check.
  if pg_catalog.to_regprocedure('social.current_moderator()') is not null
     and (position('social.current_member()' in (select prosrc from pg_catalog.pg_proc where oid = pg_catalog.to_regprocedure('social.current_moderator()'))) = 0
          or position('ops.moderator_active(v_uid)' in (select prosrc from pg_catalog.pg_proc where oid = pg_catalog.to_regprocedure('social.current_moderator()'))) = 0) then
    bad := bad || 'social.current_moderator: does not require membership and an active moderator row'::text;
  end if;
  -- The membership chain.
  if position('social.current_access()' in coalesce((select prosrc from pg_catalog.pg_proc where oid = to_regprocedure('social.current_member()')), '')) = 0 then
    bad := bad || 'social.current_member: does not go through social.current_access()'::text;
  end if;
  if position('ops.member_access_active(v_uid)' in coalesce((select prosrc from pg_catalog.pg_proc where oid = to_regprocedure('social.current_access()')), '')) = 0 then
    bad := bad || 'social.current_access: does not require ops.member_access_active()'::text;
  end if;
  if coalesce((select prosrc from pg_catalog.pg_proc where oid = to_regprocedure('ops.member_access_active(uuid)')), '')
       !~ 'ops\.member_access a\s+where a\.user_id = p_user and a\.status = ''active'' and \(a\.expires_at is null or a\.expires_at > pg_catalog\.now\(\)\)' then
    bad := bad || 'ops.member_access_active: does not require an active, unexpired membership'::text;
  end if;
  if cardinality(bad) > 0 then
    raise exception 'FAIL: member functions without the expected safeguards: %', bad;
  end if;
  raise notice 'PASS: every member function runs as its owner with an empty search path and checks the caller and their pilot membership';
end;
$$;

-- 3. Tables, views and sequences in the owned schemas: anonymous visitors
--    reach none; signed-in accounts reach only public.profiles (read their own
--    row), and only through row level security. Profile changes go through
--    public.app_set_profile, which checks pilot membership.
do $$
declare
  rel_anon text[];
  rel_auth text[];
  cols_update text[];
  cols_insert text[];
begin
  select coalesce(array_agg(c.oid::regclass::text), '{}') into rel_anon
  from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('public', 'ops', 'social', 'waitlist_api') and c.relkind in ('r', 'v', 'm', 'f', 'p', 'S')
    and (pg_catalog.has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      or exists (select 1 from pg_catalog.pg_attribute a where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
                 and pg_catalog.has_column_privilege('anon', c.oid, a.attnum, 'SELECT,INSERT,UPDATE,REFERENCES')));
  if cardinality(rel_anon) > 0 then
    raise exception 'FAIL: anonymous visitors have privileges on: %', rel_anon;
  end if;

  select coalesce(array_agg(c.oid::regclass::text), '{}') into rel_auth
  from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('public', 'ops', 'social', 'waitlist_api') and c.relkind in ('r', 'v', 'm', 'f', 'p', 'S')
    and c.oid <> 'public.profiles'::regclass
    and (pg_catalog.has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      or exists (select 1 from pg_catalog.pg_attribute a where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
                 and pg_catalog.has_column_privilege('authenticated', c.oid, a.attnum, 'SELECT,INSERT,UPDATE,REFERENCES')));
  if cardinality(rel_auth) > 0 then
    raise exception 'FAIL: signed-in accounts have privileges beyond public.profiles: %', rel_auth;
  end if;

  if pg_catalog.has_table_privilege('authenticated', 'public.profiles', 'INSERT,DELETE,TRUNCATE,REFERENCES,TRIGGER') then
    raise exception 'FAIL: signed-in accounts can insert, delete or otherwise change public.profiles';
  end if;
  if not pg_catalog.has_table_privilege('authenticated', 'public.profiles', 'SELECT') then
    raise exception 'FAIL: signed-in accounts can no longer read their own profile (expected SELECT on public.profiles)';
  end if;
  select coalesce(array_agg(a.attname::text order by a.attname), '{}') into cols_update
  from pg_catalog.pg_attribute a
  where a.attrelid = 'public.profiles'::regclass and a.attnum > 0 and not a.attisdropped
    and pg_catalog.has_column_privilege('authenticated', 'public.profiles'::regclass, a.attnum, 'UPDATE');
  if cardinality(cols_update) > 0 or pg_catalog.has_table_privilege('authenticated', 'public.profiles', 'UPDATE') then
    raise exception 'FAIL: signed-in accounts can update profile columns directly: % (profile changes must go through public.app_set_profile)', cols_update;
  end if;
  select coalesce(array_agg(a.attname::text), '{}') into cols_insert
  from pg_catalog.pg_attribute a
  where a.attrelid = 'public.profiles'::regclass and a.attnum > 0 and not a.attisdropped
    and pg_catalog.has_column_privilege('authenticated', 'public.profiles'::regclass, a.attnum, 'INSERT,REFERENCES');
  if cardinality(cols_insert) > 0 then
    raise exception 'FAIL: signed-in accounts can insert or reference profile columns: %', cols_insert;
  end if;
  raise notice 'PASS: anonymous visitors reach no tables; signed-in accounts reach only public.profiles (read own row)';
end;
$$;

-- 4. Profiles row level security: on, and limited to the account's own row.
do $$
declare
  pol record;
  n int := 0;
begin
  if not (select relrowsecurity from pg_catalog.pg_class where oid = 'public.profiles'::regclass) then
    raise exception 'FAIL: row level security is off on public.profiles';
  end if;
  for pol in select policyname, cmd, roles, qual, with_check, permissive from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'profiles' loop
    n := n + 1;
    if pol.cmd <> 'SELECT' then
      raise exception 'FAIL: unexpected % policy "%" on public.profiles', pol.cmd, pol.policyname;
    end if;
    if pol.roles <> array['authenticated']::name[] then
      raise exception 'FAIL: policy "%" on public.profiles applies to %, expected only authenticated', pol.policyname, pol.roles;
    end if;
    if coalesce(pol.qual, '') !~ 'auth\.uid\(\)' then
      raise exception 'FAIL: policy "%" on public.profiles is not limited to the caller''s own row', pol.policyname;
    end if;
  end loop;
  if n <> 1 then
    raise exception 'FAIL: expected exactly 1 policy on public.profiles (read own), found %', n;
  end if;
  raise notice 'PASS: public.profiles has row level security on, with only the read-own policy';
end;
$$;

-- 5. The private schemas stay private, with row level security on every table.
do $$
declare
  s text;
  r text;
  off text[];
begin
  foreach s in array array['ops', 'social', 'waitlist_api'] loop
    if exists (select 1 from pg_catalog.pg_namespace where nspname = s) then
      foreach r in array array['anon', 'authenticated'] loop
        if pg_catalog.has_schema_privilege(r, s, 'USAGE') then
          raise exception 'FAIL: role % can use schema %', r, s;
        end if;
      end loop;
    end if;
  end loop;
  select coalesce(array_agg(c.oid::regclass::text), '{}') into off
  from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('public', 'ops', 'social') and c.relkind in ('r', 'p') and not c.relrowsecurity;
  if cardinality(off) > 0 then
    raise exception 'FAIL: row level security is off on: %', off;
  end if;
  raise notice 'PASS: ops, social and waitlist_api are closed to members and visitors; row level security is on everywhere';
end;
$$;

-- 6. Storage: no storage policies for members or visitors, ever (every
--    upload, removal and link goes through the avatar Edge Function). No
--    buckets before profile pictures (20261125000000); after, exactly the
--    private avatars bucket with its approved limits.
do $$
declare
  buckets int;
  pols text[];
begin
  if not exists (select 1 from pg_catalog.pg_namespace where nspname = 'storage') then
    raise notice 'PASS: Supabase Storage is not installed in this database (nothing to check)';
    return;
  end if;
  if pg_catalog.to_regclass('storage.buckets') is not null then
    if pg_catalog.to_regclass('social.avatars') is null then
      execute 'select count(*) from storage.buckets' into buckets;
      if buckets > 0 then
        raise exception 'FAIL: % storage bucket(s) exist; none are expected before profile pictures (20261125000000)', buckets;
      end if;
    else
      -- Profile pictures: exactly the one private avatars bucket, JPEG only, at most 200 KB.
      execute $q$select count(*) from storage.buckets where not (id = 'avatars' and name = 'avatars' and public is false
                 and file_size_limit = 204800 and allowed_mime_types = array['image/jpeg'])$q$ into buckets;
      if buckets > 0 then
        raise exception 'FAIL: a storage bucket other than the private avatars bucket exists, or its settings changed';
      end if;
      execute $q$select count(*) from storage.buckets where id = 'avatars'$q$ into buckets;
      if buckets <> 1 then
        raise exception 'FAIL: the private avatars bucket is missing';
      end if;
    end if;
  end if;
  select coalesce(array_agg(tablename || ': ' || policyname), '{}') into pols
  from pg_catalog.pg_policies
  where schemaname = 'storage' and (roles && array['anon', 'authenticated', 'public']::name[]);
  if cardinality(pols) > 0 then
    raise exception 'FAIL: storage policies open to members or visitors: %', pols;
  end if;
  raise notice 'PASS: storage has only the approved private bucket (if any) and no storage policies for members or visitors';
end;
$$;

-- 7. Pilot membership (20261122000000_member_access): the tables are private
--    with row level security; only server code can grant or revoke; every
--    change is recorded by a trigger; the history can't be edited or erased.
do $$
declare
  bad text[] := '{}';
  f text;
begin
  if pg_catalog.to_regclass('ops.member_access') is null or pg_catalog.to_regclass('ops.member_access_events') is null then
    raise exception 'FAIL: the pilot membership tables are missing';
  end if;
  foreach f in array array['ops.grant_member_access(uuid,text,text,timestamp with time zone,text)', 'ops.revoke_member_access(uuid,text,text)', 'ops.member_access_active(uuid)'] loop
    if to_regprocedure(f) is null then
      bad := bad || (f || ': missing');
    elsif pg_catalog.has_function_privilege('authenticated', to_regprocedure(f), 'EXECUTE')
       or pg_catalog.has_function_privilege('anon', to_regprocedure(f), 'EXECUTE') then
      bad := bad || (f || ': callable by members or visitors');
    end if;
  end loop;
  if not exists (select 1 from pg_catalog.pg_trigger where tgrelid = 'ops.member_access'::regclass and tgname = 'member_access_record' and tgenabled <> 'D') then
    bad := bad || 'ops.member_access: changes are not recorded (trigger member_access_record missing or disabled)'::text;
  end if;
  if not exists (select 1 from pg_catalog.pg_trigger where tgrelid = 'ops.member_access_events'::regclass and tgname = 'member_access_events_no_update' and tgenabled <> 'D') then
    bad := bad || 'ops.member_access_events: the history can be edited or deleted'::text;
  end if;
  if not exists (select 1 from pg_catalog.pg_trigger where tgrelid = 'ops.member_access_events'::regclass and tgname = 'member_access_events_no_truncate' and tgenabled <> 'D') then
    bad := bad || 'ops.member_access_events: the history can be truncated'::text;
  end if;
  if position('ops.member_access a on a.user_id = p.id' in coalesce(pg_catalog.pg_get_viewdef('social.visible_members'::regclass), '')) = 0
     and position('JOIN ops.member_access a ON' in coalesce(pg_catalog.pg_get_viewdef('social.visible_members'::regclass), '')) = 0 then
    bad := bad || 'social.visible_members: not limited to active pilot members'::text;
  end if;
  if cardinality(bad) > 0 then
    raise exception 'FAIL: pilot membership safeguards missing: %', bad;
  end if;
  raise notice 'PASS: pilot membership is private, server-granted only, fully recorded, and its history is append-only';
end;
$$;
