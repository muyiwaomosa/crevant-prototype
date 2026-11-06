-- Phase 1A (PR 2) guarantees for profiles and the private ops schema.
--
-- STAGING-SAFE: read-only. Every check here only inspects privileges,
-- policies, functions, triggers and counts, so the staging deploy workflow
-- can run it against staging after an apply. Tests that create identities
-- live in supabase/tests-local and never run against staging.
-- Each block raises an exception on failure.

-- 1. ops is private: members and anonymous visitors cannot use it; server code can.
do $$
declare
  r text;
begin
  if not exists (select 1 from pg_namespace where nspname = 'ops') then
    raise exception 'FAIL: schema ops is missing';
  end if;
  foreach r in array array['anon', 'authenticated'] loop
    if has_schema_privilege(r, 'ops', 'USAGE') or has_schema_privilege(r, 'ops', 'CREATE') then
      raise exception 'FAIL: role % can use schema ops', r;
    end if;
  end loop;
  if not has_schema_privilege('service_role', 'ops', 'USAGE') then
    raise exception 'FAIL: service_role lacks USAGE on schema ops';
  end if;
  raise notice 'PASS: only server code can use the ops schema';
end $$;

-- 2. ops tables: row level security on, no policies, no member privileges.
do $$
declare
  t text;
  r text;
begin
  foreach t in array array['ops.admins', 'ops.invitations'] loop
    if not (select relrowsecurity from pg_class where oid = t::regclass) then
      raise exception 'FAIL: row level security is off on %', t;
    end if;
    if exists (select 1 from pg_policy where polrelid = t::regclass) then
      raise exception 'FAIL: % has policies; only service_role may access it', t;
    end if;
    foreach r in array array['anon', 'authenticated'] loop
      if has_table_privilege(r, t, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') then
        raise exception 'FAIL: role % has privileges on %', r, t;
      end if;
    end loop;
  end loop;
  raise notice 'PASS: ops tables are locked to server code';
end $$;

-- 3. Nothing outside ops depends on ops tables (no view, policy or function
--    exposes them), and no function outside ops mentions invitation labels.
do $$
begin
  if exists (
    select 1
    from pg_depend d
    join pg_rewrite rw on rw.oid = d.objid
    join pg_class v on v.oid = rw.ev_class
    join pg_namespace vn on vn.oid = v.relnamespace
    where d.refobjid in ('ops.admins'::regclass, 'ops.invitations'::regclass)
      and vn.nspname <> 'ops'
  ) then
    raise exception 'FAIL: a view outside ops reads an ops table';
  end if;
  if exists (
    select 1 from pg_policy p
    where pg_get_expr(p.polqual, p.polrelid) ~* 'ops\.|invitations'
       or pg_get_expr(p.polwithcheck, p.polrelid) ~* 'ops\.|invitations'
  ) then
    raise exception 'FAIL: a row level security policy refers to ops or invitations';
  end if;
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname not in ('ops', 'pg_catalog', 'information_schema')
      and p.prokind in ('f', 'p')
      and p.prosrc ~* 'ops\.invitations'
  ) then
    raise exception 'FAIL: a function outside ops reads ops.invitations';
  end if;
  raise notice 'PASS: ops data is not exposed, and invitation labels decide nothing';
end $$;

-- 4. profiles: row level security on; anonymous visitors have no privileges;
--    signed-in members may only read, and update username and display_name.
do $$
declare
  c text;
begin
  if not (select relrowsecurity from pg_class where oid = 'public.profiles'::regclass) then
    raise exception 'FAIL: row level security is off on public.profiles';
  end if;
  if has_table_privilege('anon', 'public.profiles', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') then
    raise exception 'FAIL: anon has privileges on public.profiles';
  end if;
  foreach c in array array['id', 'username', 'display_name', 'created_at', 'updated_at'] loop
    if has_column_privilege('anon', 'public.profiles', c, 'SELECT,INSERT,UPDATE,REFERENCES') then
      raise exception 'FAIL: anon has privileges on public.profiles.%', c;
    end if;
  end loop;
  if not has_table_privilege('authenticated', 'public.profiles', 'SELECT') then
    raise exception 'FAIL: authenticated cannot read public.profiles';
  end if;
  if has_table_privilege('authenticated', 'public.profiles', 'INSERT,DELETE,TRUNCATE,REFERENCES,TRIGGER') then
    raise exception 'FAIL: authenticated may insert, delete or truncate public.profiles';
  end if;
  foreach c in array array['username', 'display_name'] loop
    if not has_column_privilege('authenticated', 'public.profiles', c, 'UPDATE') then
      raise exception 'FAIL: authenticated cannot update public.profiles.%', c;
    end if;
  end loop;
  foreach c in array array['id', 'created_at', 'updated_at'] loop
    if has_column_privilege('authenticated', 'public.profiles', c, 'UPDATE') then
      raise exception 'FAIL: authenticated can update protected column public.profiles.%', c;
    end if;
  end loop;
  raise notice 'PASS: profile privileges are as approved';
end $$;

-- 5. profiles policies: exactly the two own-row policies, for signed-in members only.
do $$
declare
  n int;
begin
  select count(*) into n from pg_policies where schemaname = 'public' and tablename = 'profiles';
  if n <> 2 then
    raise exception 'FAIL: expected 2 policies on public.profiles, found %', n;
  end if;
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'profiles'
      and (roles <> '{authenticated}'::name[]
           or cmd not in ('SELECT', 'UPDATE')
           or coalesce(qual, '') !~ 'auth\.uid\(\)'
           or (cmd = 'UPDATE' and coalesce(with_check, '') !~ 'auth\.uid\(\)'))
  ) then
    raise exception 'FAIL: a profiles policy is not limited to the signed-in member''s own row';
  end if;
  raise notice 'PASS: profiles policies allow own-row read and update only';
end $$;

-- 6. Trigger functions: fixed empty search path, minimum privileges, not
--    callable by members.
do $$
declare
  f record;
begin
  for f in
    select p.oid, p.proname, p.prosecdef, p.proconfig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'ops' and p.proname in ('profiles_before_write', 'create_profile_for_confirmed_user')
  loop
    if not ('search_path=""' = any (coalesce(f.proconfig, '{}')) or 'search_path=' = any (coalesce(f.proconfig, '{}'))) then
      raise exception 'FAIL: ops.% does not pin an empty search_path (%)', f.proname, f.proconfig;
    end if;
    if has_function_privilege('anon', f.oid, 'EXECUTE') or has_function_privilege('authenticated', f.oid, 'EXECUTE') then
      raise exception 'FAIL: members can execute ops.%', f.proname;
    end if;
    if f.proname = 'profiles_before_write' and f.prosecdef then
      raise exception 'FAIL: ops.profiles_before_write must run with the caller''s privileges';
    end if;
    if f.proname = 'create_profile_for_confirmed_user' and not f.prosecdef then
      raise exception 'FAIL: ops.create_profile_for_confirmed_user must be security definer';
    end if;
  end loop;
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'ops' and p.proname in ('profiles_before_write', 'create_profile_for_confirmed_user')) <> 2 then
    raise exception 'FAIL: expected both ops trigger functions to exist';
  end if;
  raise notice 'PASS: trigger functions use a fixed search path and are not callable by members';
end $$;

-- 7. Triggers are in place and enabled.
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'on_auth_user_confirmed'
                 and tgrelid = 'auth.users'::regclass and tgenabled <> 'D') then
    raise exception 'FAIL: profile creation trigger on auth.users is missing or disabled';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'profiles_before_write'
                 and tgrelid = 'public.profiles'::regclass and tgenabled <> 'D') then
    raise exception 'FAIL: profile cleanup trigger is missing or disabled';
  end if;
  raise notice 'PASS: profile triggers are in place';
end $$;

-- 8. No profile column stores email or a role.
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'profiles'
               and column_name ~* '(email|role|creator|supporter|type|is_admin)') then
    raise exception 'FAIL: public.profiles has an email, role or account type column';
  end if;
  raise notice 'PASS: profiles hold no email and no role (unified accounts)';
end $$;

-- 9. Every confirmed identity has a profile (counts only, never emails).
do $$
declare
  confirmed int;
  missing int;
  profiles int;
begin
  select count(*) into confirmed from auth.users where email_confirmed_at is not null;
  select count(*) into missing from auth.users u
    where u.email_confirmed_at is not null
      and not exists (select 1 from public.profiles p where p.id = u.id);
  select count(*) into profiles from public.profiles;
  if missing <> 0 then
    raise exception 'FAIL: % confirmed identities have no profile', missing;
  end if;
  raise notice 'PASS: every confirmed identity has a profile (% confirmed, % profiles)', confirmed, profiles;
end $$;
