-- Pilot membership guarantees (20261122000000_member_access).
--
-- STAGING-SAFE: read-only. Every check inspects only the catalogs (tables,
-- privileges, triggers, function definitions), never membership rows, so the
-- staging deploy workflow can run it against staging after an apply.
-- Behaviour tests that grant, revoke and expire access live in
-- supabase/tests-local/070_member_access.sql and never run against staging.

-- 1. The membership tables: private, row level security on, no policies, and
--    no member or visitor privileges of any kind.
do $$
declare
  t text;
  r text;
begin
  foreach t in array array['ops.member_access', 'ops.member_access_events'] loop
    if to_regclass(t) is null then
      raise exception 'FAIL: % is missing', t;
    end if;
    if not (select relrowsecurity from pg_class where oid = t::regclass) then
      raise exception 'FAIL: row level security is off on %', t;
    end if;
    if exists (select 1 from pg_policies where schemaname || '.' || tablename = t) then
      raise exception 'FAIL: % has row level security policies (members must never read it)', t;
    end if;
    foreach r in array array['anon', 'authenticated'] loop
      if has_table_privilege(r, t, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') then
        raise exception 'FAIL: role % has privileges on %', r, t;
      end if;
    end loop;
  end loop;
  if to_regclass('social.visible_members') is null
     or has_table_privilege('authenticated', 'social.visible_members', 'SELECT')
     or has_table_privilege('anon', 'social.visible_members', 'SELECT') then
    raise exception 'FAIL: social.visible_members is missing or readable by members';
  end if;
  raise notice 'PASS: membership tables are private, with row level security and no member access';
end $$;

-- 2. Only server code can grant or revoke; the helpers aren't callable by members.
do $$
declare
  f text;
begin
  foreach f in array array[
    'ops.grant_member_access(uuid,text,text,timestamp with time zone,text)',
    'ops.revoke_member_access(uuid,text,text)',
    'ops.member_access_active(uuid)',
    'ops.member_access_record()',
    'ops.member_access_events_append_only()',
    'social.current_access()'
  ] loop
    if to_regprocedure(f) is null then
      raise exception 'FAIL: % is missing', f;
    end if;
    if has_function_privilege('anon', to_regprocedure(f), 'EXECUTE') or has_function_privilege('authenticated', to_regprocedure(f), 'EXECUTE') then
      raise exception 'FAIL: members or visitors can call %', f;
    end if;
  end loop;
  foreach f in array array['ops.grant_member_access(uuid,text,text,timestamp with time zone,text)', 'ops.revoke_member_access(uuid,text,text)'] loop
    if not (select prosecdef from pg_proc where oid = to_regprocedure(f))
       or not ('search_path=""' = any (coalesce((select proconfig from pg_proc where oid = to_regprocedure(f)), '{}'))
               or 'search_path=' = any (coalesce((select proconfig from pg_proc where oid = to_regprocedure(f)), '{}'))) then
      raise exception 'FAIL: % must run as its owner with an empty search path', f;
    end if;
  end loop;
  raise notice 'PASS: only server code can grant or revoke pilot membership';
end $$;

-- 3. Every change is recorded, with the database login and role that made
--    it, and the record can't be edited or erased.
do $$
begin
  if (select count(*) from information_schema.columns
      where table_schema = 'ops' and table_name = 'member_access_events'
        and column_name in ('db_session_user', 'db_role') and is_nullable = 'NO') <> 2 then
    raise exception 'FAIL: the membership history does not record the database login and role';
  end if;
  if position('session_user' in (select prosrc from pg_proc where oid = 'ops.member_access_record()'::regprocedure)) = 0 then
    raise exception 'FAIL: the membership history trigger does not record session_user';
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'ops.member_access'::regclass and tgname = 'member_access_record' and tgenabled <> 'D') then
    raise exception 'FAIL: changes to ops.member_access are not recorded';
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'ops.member_access_events'::regclass and tgname = 'member_access_events_no_update' and tgenabled <> 'D')
     or not exists (select 1 from pg_trigger where tgrelid = 'ops.member_access_events'::regclass and tgname = 'member_access_events_no_truncate' and tgenabled <> 'D') then
    raise exception 'FAIL: the membership history is not append-only';
  end if;
  raise notice 'PASS: every membership change is recorded, in an append-only history';
end $$;

-- 4. The gate itself: every member function checks pilot membership.
--    app_access_state reports only the caller's own state; app_me and
--    app_set_profile need membership (the profile may be incomplete); every
--    other function needs membership and a complete profile.
do $$
declare
  r record;
  bad text[] := '{}';
begin
  for r in
    select p.proname, p.prosrc
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'app\_%'
  loop
    if r.proname = 'app_access_state' then
      if position('ops.member_access a on a.user_id = v_uid' in r.prosrc) = 0 then bad := bad || r.proname; end if;
    elsif r.proname in ('app_me', 'app_set_profile') then
      if position('social.current_access()' in r.prosrc) = 0 then bad := bad || r.proname; end if;
    elsif position('social.current_member()' in r.prosrc) = 0 then
      bad := bad || r.proname;
    end if;
  end loop;
  if position('social.current_access()' in (select prosrc from pg_proc where oid = 'social.current_member()'::regprocedure)) = 0 then
    bad := bad || 'social.current_member'::text;
  end if;
  if position('ops.member_access_active(v_uid)' in (select prosrc from pg_proc where oid = 'social.current_access()'::regprocedure)) = 0 then
    bad := bad || 'social.current_access'::text;
  end if;
  if position('social.visible_members' in (select prosrc from pg_proc where oid = 'social.is_member(uuid)'::regprocedure)) = 0 then
    bad := bad || 'social.is_member'::text;
  end if;
  if cardinality(bad) > 0 then
    raise exception 'FAIL: these do not enforce pilot membership: %', bad;
  end if;
  raise notice 'PASS: every member function enforces pilot membership in the database';
end $$;
