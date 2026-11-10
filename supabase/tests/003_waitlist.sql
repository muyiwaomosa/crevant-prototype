-- Phase 2 guarantees for the waitlist.
--
-- STAGING-SAFE: read-only. Every check only inspects privileges, policies,
-- roles, functions, constraints and settings, so the staging deploy workflow
-- can run it after an apply. Behaviour tests that write rows live in
-- supabase/tests-local and never run against staging.
-- Each block raises an exception on failure.

-- 1. Waitlist tables: row level security on, no policies, no API or login
--    role can touch them directly.
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
      raise exception 'FAIL: % has policies; no API role may access it', t;
    end if;
    foreach r in array array['anon', 'authenticated', 'waitlist_writer', 'waitlist_admin'] loop
      if has_table_privilege(r, t, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') then
        raise exception 'FAIL: role % has privileges on %', r, t;
      end if;
    end loop;
  end loop;
  foreach r in array array['anon', 'authenticated', 'waitlist_writer', 'waitlist_admin'] loop
    if has_table_privilege(r, 'ops.waitlist_summary', 'SELECT') then
      raise exception 'FAIL: role % can read ops.waitlist_summary', r;
    end if;
  end loop;
  if not coalesce((select 'security_invoker=true' = any (reloptions) from pg_class where oid = 'ops.waitlist_summary'::regclass), false) then
    raise exception 'FAIL: ops.waitlist_summary does not use security_invoker';
  end if;
  if to_regprocedure('public.waitlist_submit(text, text[], text, text, text, text, text, text, boolean, boolean, text, text)') is not null then
    raise exception 'FAIL: the old Data API entry point public.waitlist_submit still exists';
  end if;
  raise notice 'PASS: waitlist tables are locked to server code';
end $$;

-- 2. Internal ops functions: service_role only, fixed empty search path, and
--    none runs with its owner's rights.
do $$
declare
  f regprocedure;
  r text;
begin
  foreach f in array array[
    'ops.waitlist_rate_hit(text, interval, integer)'::regprocedure,
    'ops.join_waitlist(text, text[], text, text, text, text, boolean, boolean, text, text, text)'::regprocedure,
    'ops.waitlist_delete(uuid)'::regprocedure,
    'ops.waitlist_purge_expired(integer)'::regprocedure,
    'ops.invitations_require_verified_waitlist_email()'::regprocedure
  ] || coalesce((select array_agg(p.oid::regprocedure) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'ops' and p.proname = 'waitlist_selections_require_verified'), '{}') loop
    if exists (select 1 from aclexplode((select proacl from pg_proc where oid = f)) a where a.grantee = 0) then
      raise exception 'FAIL: everyone (PUBLIC) can execute %', f;
    end if;
    foreach r in array array['anon', 'authenticated', 'waitlist_writer', 'waitlist_admin'] loop
      if has_function_privilege(r, f, 'EXECUTE') then
        raise exception 'FAIL: % can execute %', r, f;
      end if;
    end loop;
    if not exists (select 1 from pg_proc where oid = f and ('search_path=""' = any (coalesce(proconfig, '{}')) or 'search_path=' = any (coalesce(proconfig, '{}')))) then
      raise exception 'FAIL: % has no fixed empty search path', f;
    end if;
    if (select prosecdef from pg_proc where oid = f) then
      raise exception 'FAIL: % runs with its owner''s rights (security definer)', f;
    end if;
  end loop;
  raise notice 'PASS: internal waitlist functions are server code only';
end $$;

-- 3. The two login roles have no special powers and belong to no other role.
do $$
declare
  r text;
begin
  foreach r in array array['waitlist_writer', 'waitlist_admin'] loop
    if not exists (select 1 from pg_roles where rolname = r) then
      raise exception 'FAIL: role % is missing', r;
    end if;
    if exists (
      select 1 from pg_roles where rolname = r
        and (rolsuper or rolcreaterole or rolcreatedb or rolreplication or rolbypassrls or rolinherit or not rolcanlogin)
    ) then
      raise exception 'FAIL: role % has special powers (superuser, create role or database, replication, bypass RLS or inherit)', r;
    end if;
    if exists (select 1 from pg_auth_members m join pg_roles g on g.oid = m.roleid join pg_roles u on u.oid = m.member where u.rolname = r) then
      raise exception 'FAIL: role % is a member of another role', r;
    end if;
  end loop;
  raise notice 'PASS: the waitlist login roles have no special powers';
end $$;

-- 4. Each login role can run exactly its own entry points: no table anywhere,
--    no other function in an application schema, and no schema but
--    waitlist_api (plus the default public schema, which holds nothing they
--    can use).
do $$
declare
  r text;
  allowed text[];
  bad text;
begin
  foreach r in array array['waitlist_writer', 'waitlist_admin'] loop
    allowed := case r
      when 'waitlist_writer' then array['waitlist_api.submit']
      else array['waitlist_api.admin_summary', 'waitlist_api.admin_status', 'waitlist_api.admin_delete', 'waitlist_api.admin_purge',
                 'waitlist_api.admin_set_notice_version', 'waitlist_api.admin_open', 'waitlist_api.admin_close',
                 'waitlist_api.admin_wave_preview', 'waitlist_api.admin_wave_select', 'waitlist_api.admin_wave_summary',
                 'waitlist_api.admin_wave_clear']
    end;

    select string_agg(n.nspname || '.' || c.relname, ', ') into bad
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where c.relkind in ('r', 'v', 'm', 'p', 'f')
      and n.nspname not in ('pg_catalog', 'information_schema') and n.nspname not like 'pg_toast%'
      and has_schema_privilege(r, n.oid, 'USAGE')
      and has_table_privilege(r, c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER');
    if bad is not null then
      raise exception 'FAIL: % has privileges on tables or views: %', r, bad;
    end if;

    select string_agg(p.oid::regprocedure::text, ', ') into bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'ops', 'waitlist_api', 'auth', 'storage')
      and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')
      and has_function_privilege(r, p.oid, 'EXECUTE')
      and has_schema_privilege(r, n.oid, 'USAGE')
      and (n.nspname || '.' || p.proname) <> all (allowed);
    if bad is not null then
      raise exception 'FAIL: % can run functions it should not: %', r, bad;
    end if;

    if exists (select 1 from unnest(allowed) a where not exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname || '.' || p.proname = a and has_function_privilege(r, p.oid, 'EXECUTE')
    )) then
      raise exception 'FAIL: % cannot run all of its own entry points', r;
    end if;

    select string_agg(nspname, ', ') into bad from pg_namespace
    where nspname not in ('pg_catalog', 'information_schema', 'waitlist_api', 'public') and nspname not like 'pg_toast%' and nspname not like 'pg_temp%'
      and has_schema_privilege(r, oid, 'USAGE');
    if bad is not null then
      raise exception 'FAIL: % can use schemas it should not: %', r, bad;
    end if;
    if has_schema_privilege(r, 'public', 'CREATE') or has_schema_privilege(r, 'waitlist_api', 'CREATE') then
      raise exception 'FAIL: % can create objects', r;
    end if;
  end loop;
  raise notice 'PASS: each waitlist login role can run only its own entry points';
end $$;

-- 5. The entry points: owned by the table owner, run with that owner's rights
--    under a fixed empty search path, and callable by no API role.
do $$
declare
  f record;
  r text;
begin
  if has_schema_privilege('anon', 'waitlist_api', 'USAGE') or has_schema_privilege('authenticated', 'waitlist_api', 'USAGE')
     or has_schema_privilege('service_role', 'waitlist_api', 'USAGE') then
    raise exception 'FAIL: an API role can use the waitlist_api schema';
  end if;
  for f in select p.oid, p.oid::regprocedure::text as sig, p.prosecdef, p.proconfig, p.proowner, p.proacl
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'waitlist_api' loop
    if not f.prosecdef then
      raise exception 'FAIL: % must run with its owner''s rights', f.sig;
    end if;
    if not ('search_path=""' = any (coalesce(f.proconfig, '{}')) or 'search_path=' = any (coalesce(f.proconfig, '{}'))) then
      raise exception 'FAIL: % has no fixed empty search path', f.sig;
    end if;
    if f.proowner <> (select relowner from pg_class where oid = 'ops.waitlist'::regclass) then
      raise exception 'FAIL: % is not owned by the owner of ops.waitlist', f.sig;
    end if;
    if exists (select 1 from aclexplode(f.proacl) a where a.grantee = 0) then
      raise exception 'FAIL: everyone (PUBLIC) can execute %', f.sig;
    end if;
    foreach r in array array['anon', 'authenticated', 'service_role'] loop
      if has_function_privilege(r, f.oid, 'EXECUTE') then
        raise exception 'FAIL: % can execute %', r, f.sig;
      end if;
    end loop;
  end loop;
  raise notice 'PASS: the waitlist entry points are locked to their login roles';
end $$;

-- 6. The server-side switch and the approved notice version setting exist.
--    (Whether they are set is the founder's decision; the defaults are
--    checked by the local tests.)
do $$
begin
  if not exists (select 1 from ops.settings where key = 'waitlist_submissions') then
    raise exception 'FAIL: the waitlist_submissions switch is missing';
  end if;
  if not exists (select 1 from ops.settings where key = 'waitlist_notice_version') then
    raise exception 'FAIL: the approved notice version setting is missing';
  end if;
  raise notice 'PASS: the waitlist switch and approved notice version setting exist';
end $$;

-- 7. Required data, consent records, minimal fields, verification rules.
do $$
declare
  c text;
begin
  foreach c in array array['email', 'age_confirmed', 'waitlist_consent_version', 'waitlist_consented_at', 'joined_at'] loop
    if not (select attnotnull from pg_attribute where attrelid = 'ops.waitlist'::regclass and attname = c) then
      raise exception 'FAIL: ops.waitlist.% may be empty', c;
    end if;
  end loop;
  foreach c in array array['waitlist_email_normalized', 'waitlist_email_unique', 'waitlist_adults_only', 'waitlist_consent_version_format',
                           'waitlist_creator_details_need_yes', 'waitlist_confirmation_needs_verified_email', 'waitlist_invite_needs_verified_email'] loop
    if not exists (select 1 from pg_constraint where conrelid = 'ops.waitlist'::regclass and conname = c) then
      raise exception 'FAIL: ops.waitlist is missing constraint %', c;
    end if;
  end loop;
  if exists (
    select 1 from pg_attribute
    where attrelid = 'ops.waitlist'::regclass and attnum > 0 and not attisdropped
      and attname ~* '(^ip|_ip$|address|role|account_type|creator|supporter|password|link|url|campaign|marketing|name|phone|birth)'
  ) then
    raise exception 'FAIL: ops.waitlist has a column it should not (role, IP, link, campaign, marketing or other personal data)';
  end if;
  if exists (select 1 from pg_attribute where attrelid = 'ops.waitlist_selections'::regclass and attname = 'note' and not attisdropped) then
    raise exception 'FAIL: selections have a free text note';
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'ops.waitlist_selections'::regclass and conname = 'waitlist_selections_reasons_allowed') then
    raise exception 'FAIL: selection reasons are not a fixed list';
  end if;
  if not exists (select 1 from pg_attribute where attrelid = 'ops.waitlist'::regclass and attname = 'participant_groups' and attgenerated = 's') then
    raise exception 'FAIL: participant groups are not worked out from the person''s own answers';
  end if;
  if not (select attnotnull from pg_attribute where attrelid = 'ops.waitlist_consents'::regclass and attname = 'notice_version') then
    raise exception 'FAIL: consent records may lack a notice version';
  end if;
  if not exists (select 1 from pg_attribute where attrelid = 'ops.waitlist'::regclass and attname = 'verified' and attgenerated = 's') then
    raise exception 'FAIL: ops.waitlist has no generated verified flag';
  end if;
  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'ops.invitations'::regclass and tgname = 'invitations_require_verified_waitlist_email' and tgenabled <> 'D'
  ) then
    raise exception 'FAIL: invitations for unverified waitlist addresses are not blocked';
  end if;
  -- From B3: only verified entries may enter an invitation wave.
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'waitlist_api' and p.proname = 'admin_wave_select')
     and not exists (
       select 1 from pg_trigger
       where tgrelid = 'ops.waitlist_selections'::regclass and tgname = 'waitlist_selections_require_verified' and tgenabled <> 'D'
     ) then
    raise exception 'FAIL: unverified entries can be selected for an invitation wave';
  end if;
  raise notice 'PASS: required fields, minimal data and verification rules are enforced';
end $$;
