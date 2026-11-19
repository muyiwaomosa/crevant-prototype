-- The checks of the member authorization surface audit (see
-- member-surface.sql, which runs them READ ONLY and rolls back). Kept
-- separate so CI can replay them inside its own rolled-back transaction after
-- a deliberate violation (scripts/db/test.sh, scripts/db/audit/violations/).
-- Catalog reads only: no table rows, no personal data, no changes.

-- 1. Member-callable functions in the owned schemas: exactly the allow-list.
do $$
declare
  expected text[] := array[
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
    'public.app_unfollow(uuid)',
    'public.app_unlike(uuid)',
    'public.app_unseen_creators()'
  ];
  actual text[];
  extra text[];
  missing text[];
  anon_fns text[];
begin
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

-- 2. Every member function runs as its owner with an empty search path, and
--    every one except app_me (which returns only the caller's own row) checks
--    the caller through social.current_member().
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
    if r.proname <> 'app_me' and position('social.current_member()' in r.prosrc) = 0 then
      bad := bad || (r.proname || ': does not check social.current_member()');
    end if;
    if r.proname = 'app_me' and position('auth.uid()' in r.prosrc) = 0 then
      bad := bad || (r.proname || ': does not read the caller from auth.uid()');
    end if;
  end loop;
  if cardinality(bad) > 0 then
    raise exception 'FAIL: member functions without the expected safeguards: %', bad;
  end if;
  raise notice 'PASS: every member function runs as its owner with an empty search path and checks the caller';
end;
$$;

-- 3. Tables, views and sequences in the owned schemas: anonymous visitors
--    reach none; signed-in accounts reach only public.profiles (read, and
--    update username and display_name), and only through row level security.
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
    raise exception 'FAIL: signed-in accounts can insert, delete or otherwise change public.profiles beyond the two editable columns';
  end if;
  if not pg_catalog.has_table_privilege('authenticated', 'public.profiles', 'SELECT') then
    raise exception 'FAIL: signed-in accounts can no longer read their own profile (expected SELECT on public.profiles)';
  end if;
  select coalesce(array_agg(a.attname::text order by a.attname), '{}') into cols_update
  from pg_catalog.pg_attribute a
  where a.attrelid = 'public.profiles'::regclass and a.attnum > 0 and not a.attisdropped
    and pg_catalog.has_column_privilege('authenticated', 'public.profiles'::regclass, a.attnum, 'UPDATE');
  if cols_update <> array['display_name', 'username'] then
    raise exception 'FAIL: signed-in accounts can update these profile columns: % (expected only display_name and username)', cols_update;
  end if;
  select coalesce(array_agg(a.attname::text), '{}') into cols_insert
  from pg_catalog.pg_attribute a
  where a.attrelid = 'public.profiles'::regclass and a.attnum > 0 and not a.attisdropped
    and pg_catalog.has_column_privilege('authenticated', 'public.profiles'::regclass, a.attnum, 'INSERT,REFERENCES');
  if cardinality(cols_insert) > 0 then
    raise exception 'FAIL: signed-in accounts can insert or reference profile columns: %', cols_insert;
  end if;
  raise notice 'PASS: anonymous visitors reach no tables; signed-in accounts reach only public.profiles (read, and update username and display_name)';
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
    if pol.cmd not in ('SELECT', 'UPDATE') then
      raise exception 'FAIL: unexpected % policy "%" on public.profiles', pol.cmd, pol.policyname;
    end if;
    if pol.roles <> array['authenticated']::name[] then
      raise exception 'FAIL: policy "%" on public.profiles applies to %, expected only authenticated', pol.policyname, pol.roles;
    end if;
    if coalesce(pol.qual, '') !~ 'auth\.uid\(\)' or (pol.cmd = 'UPDATE' and coalesce(pol.with_check, '') !~ 'auth\.uid\(\)') then
      raise exception 'FAIL: policy "%" on public.profiles is not limited to the caller''s own row', pol.policyname;
    end if;
  end loop;
  if n <> 2 then
    raise exception 'FAIL: expected exactly 2 policies on public.profiles (read own, update own), found %', n;
  end if;
  raise notice 'PASS: public.profiles has row level security on, with only read-own and update-own policies';
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

-- 6. Storage: no buckets, and no storage policies for members or visitors,
--    until the photo and video workstream adds them in a reviewed migration
--    that uses the member access check.
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
    execute 'select count(*) from storage.buckets' into buckets;
    if buckets > 0 then
      raise exception 'FAIL: % storage bucket(s) exist; none are expected before the photo and video workstream', buckets;
    end if;
  end if;
  select coalesce(array_agg(tablename || ': ' || policyname), '{}') into pols
  from pg_catalog.pg_policies
  where schemaname = 'storage' and (roles && array['anon', 'authenticated', 'public']::name[]);
  if cardinality(pols) > 0 then
    raise exception 'FAIL: storage policies open to members or visitors: %', pols;
  end if;
  raise notice 'PASS: no storage buckets and no storage policies for members or visitors';
end;
$$;
