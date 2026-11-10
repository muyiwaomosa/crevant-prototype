-- Phase 2 guarantees for the waitlist.
--
-- STAGING-SAFE: read-only. Every check only inspects privileges, policies,
-- functions, constraints and settings, so the staging deploy workflow can run
-- it after an apply. Behaviour tests that write rows live in
-- supabase/tests-local and never run against staging.
-- Each block raises an exception on failure.

-- 1. Waitlist tables: row level security on, no policies, no member access.
do $$
declare
  t text;
  r text;
begin
  foreach t in array array['ops.settings', 'ops.waitlist', 'ops.waitlist_consents', 'ops.waitlist_selections', 'ops.waitlist_rate_limits'] loop
    if to_regclass(t) is null then
      raise exception 'FAIL: % is missing', t;
    end if;
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
  foreach r in array array['anon', 'authenticated'] loop
    if has_table_privilege(r, 'ops.waitlist_summary', 'SELECT') then
      raise exception 'FAIL: role % can read ops.waitlist_summary', r;
    end if;
  end loop;
  raise notice 'PASS: waitlist tables are locked to server code';
end $$;

-- 2. Waitlist functions: only service_role may call them, each with a fixed
--    search path, and none runs with its owner's rights.
do $$
declare
  f regprocedure;
  r text;
begin
  foreach f in array array[
    'ops.waitlist_rate_hit(text, interval, integer)'::regprocedure,
    'ops.join_waitlist(text, text[], text, text, text, text, text, text, boolean, boolean, text, boolean, text)'::regprocedure,
    'ops.waitlist_delete(uuid)'::regprocedure,
    'ops.waitlist_purge_expired(integer)'::regprocedure,
    'public.waitlist_submit(text, text[], text, text, text, text, text, text, boolean, boolean, text, boolean, text)'::regprocedure
  ] loop
    foreach r in array array['anon', 'authenticated', 'public'] loop
      if (r = 'public' and exists (select 1 from aclexplode((select proacl from pg_proc where oid = f)) a where a.grantee = 0))
         or (r <> 'public' and has_function_privilege(r, f, 'EXECUTE')) then
        raise exception 'FAIL: % can execute %', r, f;
      end if;
    end loop;
    if not has_function_privilege('service_role', f, 'EXECUTE') then
      raise exception 'FAIL: service_role cannot execute %', f;
    end if;
    if not exists (select 1 from pg_proc where oid = f and ('search_path=""' = any (coalesce(proconfig, '{}')) or 'search_path=' = any (coalesce(proconfig, '{}')))) then
      raise exception 'FAIL: % has no fixed empty search path', f;
    end if;
    if (select prosecdef from pg_proc where oid = f) then
      raise exception 'FAIL: % runs with its owner''s rights (security definer)', f;
    end if;
  end loop;
  raise notice 'PASS: only server code can call the waitlist functions';
end $$;

-- 3. The server-side switch exists. (Whether it is on is the founder's
--    decision; the default is checked by the local tests.)
do $$
begin
  if not exists (select 1 from ops.settings where key = 'waitlist_submissions') then
    raise exception 'FAIL: the waitlist_submissions switch is missing';
  end if;
  raise notice 'PASS: the waitlist submission switch exists';
end $$;

-- 4. Required data and consent records are enforced by the table itself.
do $$
declare
  c text;
begin
  foreach c in array array['email', 'age_confirmed', 'waitlist_consent_version', 'waitlist_consented_at', 'marketing_consent', 'last_confirmed_at'] loop
    if not (select attnotnull from pg_attribute where attrelid = 'ops.waitlist'::regclass and attname = c) then
      raise exception 'FAIL: ops.waitlist.% may be empty', c;
    end if;
  end loop;
  foreach c in array array['waitlist_email_normalized', 'waitlist_email_unique', 'waitlist_adults_only', 'waitlist_consent_version_format', 'waitlist_marketing_consistent', 'waitlist_creator_details_need_yes', 'waitlist_link_format'] loop
    if not exists (select 1 from pg_constraint where conrelid = 'ops.waitlist'::regclass and conname = c) then
      raise exception 'FAIL: ops.waitlist is missing constraint %', c;
    end if;
  end loop;
  if exists (
    select 1 from pg_attribute
    where attrelid = 'ops.waitlist'::regclass and attnum > 0 and not attisdropped
      and attname ~* '(^ip|_ip$|address|role|account_type|creator|supporter|password)'
  ) then
    raise exception 'FAIL: ops.waitlist has a role, IP or password column';
  end if;
  if not (select attnotnull from pg_attribute where attrelid = 'ops.waitlist_consents'::regclass and attname = 'notice_version') then
    raise exception 'FAIL: consent records may lack a notice version';
  end if;
  raise notice 'PASS: required fields, consent versions and no roles are enforced';
end $$;
