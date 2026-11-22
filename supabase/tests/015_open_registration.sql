-- Staging-safe, read-only: open registration (20261130000000).
-- Catalog reads only: no member data or account ids are read out.
-- Skipped until the migration is applied.

\set ON_ERROR_STOP on
select to_regprocedure('public.app_claim_access()') is not null
       or case when to_regclass('supabase_migrations.schema_migrations') is null then false
               else (xpath('/row/n/text()', query_to_xml(
                       'select count(*) as n from supabase_migrations.schema_migrations where version = ''20261130000000''',
                       false, true, '')))[1]::text::int > 0
          end as open_registration_applied \gset
\if :open_registration_applied

do $$
declare
  fn regprocedure := to_regprocedure('public.app_claim_access()');
  p record;
  f text;
begin
  if fn is null then
    raise exception 'FAIL: public.app_claim_access() is missing although 20261130000000 is recorded';
  end if;
  select prosecdef, proconfig, prosrc, provolatile into p from pg_proc where oid = fn;
  -- 1. Security definer with an empty search path.
  if not p.prosecdef or p.proconfig is null or not ('search_path=""' = any (p.proconfig)) then
    raise exception 'FAIL: app_claim_access must be security definer with search_path = ''''';
  end if;
  -- 2. Its rules: only the caller; never an existing row (revoked or expired stays so);
  --    only a verified email; only while external access is open; only the tester cohort.
  foreach f in array array[
    'v_uid uuid := auth.uid()',
    'select * into a from ops.member_access where user_id = v_uid;',
    'u.email_confirmed_at is not null',
    'select s.external_access_approved into v_open from ops.member_launch_settings s where s.id',
    'if not coalesce(v_open, false) then',
    'values (v_uid, ''tester'', ''active'', ''self-service'', ''open registration'')',
    'on conflict (user_id) do nothing'
  ] loop
    if position(f in p.prosrc) = 0 then
      raise exception 'FAIL: app_claim_access no longer contains: %', f;
    end if;
  end loop;
  if position('''founder''' in p.prosrc) > 0 or position('grant_member_access' in p.prosrc) > 0 then
    raise exception 'FAIL: app_claim_access must not name the founder cohort or call grant_member_access (which reopens revoked rows)';
  end if;
  -- 3. Signed-in accounts only: never anon or PUBLIC.
  if has_function_privilege('anon', fn, 'execute') then
    raise exception 'FAIL: anon can run app_claim_access';
  end if;
  if exists (select 1 from aclexplode((select proacl from pg_proc where oid = fn)) x where x.grantee = 0 and x.privilege_type = 'EXECUTE') then
    raise exception 'FAIL: PUBLIC can run app_claim_access';
  end if;
  if not has_function_privilege('authenticated', fn, 'execute') then
    raise exception 'FAIL: signed-in accounts cannot run app_claim_access';
  end if;
  raise notice 'PASS: open registration: app_claim_access is security definer, claims only for the caller, only with a verified email, only while external access is open, only the tester cohort, never reopens a membership, and is not callable by anon';
end $$;

\else
\echo 'Skipped 015: open registration (20261130000000) is not applied here.'
\endif
