-- Staging-safe, read-only: the member launch gate (20261129000000).
-- Catalog reads and counts only: no member data or account ids are read out.
-- Skipped until the migration is applied.

\set ON_ERROR_STOP on
select to_regclass('ops.member_launch_settings') is not null
       or case when to_regclass('supabase_migrations.schema_migrations') is null then false
               else (xpath('/row/n/text()', query_to_xml(
                       'select count(*) as n from supabase_migrations.schema_migrations where version = ''20261129000000''',
                       false, true, '')))[1]::text::int > 0
          end as gate_applied \gset
\if :gate_applied

do $$
declare
  src text := (select prosrc from pg_proc where oid = to_regprocedure('ops.member_launch_gate()'));
  t record;
  f text;
  r text;
begin
  if src is null then
    raise exception 'FAIL: the launch gate function ops.member_launch_gate is missing';
  end if;
  -- 1. The gate's rules are all present: founder cohort for the launch founder only; nobody else while not approved; widening detected.
  foreach f in array array[
    'new.cohort = ''founder'' and (s.founder_user_id is null or new.user_id <> s.founder_user_id)',
    'not s.external_access_approved and (s.founder_user_id is null or new.user_id <> s.founder_user_id)',
    'tg_op = ''INSERT''', 'old.status <> ''active''', 'old.cohort is distinct from new.cohort',
    'new.expires_at > old.expires_at', 'if new.status <> ''active'' then'
  ] loop
    if position(f in src) = 0 then
      raise exception 'FAIL: the launch gate function no longer contains: %', f;
    end if;
  end loop;
  -- 2. The trigger exists on ops.member_access, is ENABLED, row level, before insert and update.
  select tg.tgenabled, tg.tgtype, tg.tgfoid into t
  from pg_trigger tg where tg.tgrelid = 'ops.member_access'::regclass and tg.tgname = 'member_access_launch_gate' and not tg.tgisinternal;
  if t is null then
    raise exception 'FAIL: the launch gate trigger is missing from ops.member_access';
  end if;
  if t.tgenabled <> 'O' then
    raise exception 'FAIL: the launch gate trigger is disabled (tgenabled %)', t.tgenabled;
  end if;
  -- tgtype bits: 1 row, 2 before, 4 insert, 16 update.
  if (t.tgtype & 1) = 0 or (t.tgtype & 2) = 0 or (t.tgtype & 4) = 0 or (t.tgtype & 16) = 0 then
    raise exception 'FAIL: the launch gate trigger is not row level, before insert and update (tgtype %)', t.tgtype;
  end if;
  if t.tgfoid <> 'ops.member_launch_gate()'::regprocedure then
    raise exception 'FAIL: the launch gate trigger calls another function';
  end if;
  -- 3. The audit trail is append only.
  if not exists (select 1 from pg_trigger tg where tg.tgrelid = 'ops.member_launch_events'::regclass and tg.tgname = 'member_launch_events_no_update'
                 and tg.tgenabled = 'O' and tg.tgfoid = 'ops.history_append_only()'::regprocedure) then
    raise exception 'FAIL: the launch gate records can be edited (append-only trigger missing or disabled)';
  end if;
  -- 4. Nobody can write the settings or records directly; members can't even read them.
  foreach r in array array['anon', 'authenticated', 'service_role'] loop
    if has_table_privilege(r, 'ops.member_launch_settings', 'INSERT, UPDATE, DELETE, TRUNCATE')
       or has_table_privilege(r, 'ops.member_launch_events', 'INSERT, UPDATE, DELETE, TRUNCATE') then
      raise exception 'FAIL: % may write the launch gate settings or records directly', r;
    end if;
  end loop;
  foreach r in array array['anon', 'authenticated'] loop
    if has_table_privilege(r, 'ops.member_launch_settings', 'SELECT') or has_table_privilege(r, 'ops.member_launch_events', 'SELECT') then
      raise exception 'FAIL: % may read the launch gate', r;
    end if;
  end loop;
  -- 5. The two changes are server only, and need their exact phrases.
  foreach f in array array['ops.set_external_access(text, boolean, text)', 'ops.set_launch_founder(text, uuid, text)'] loop
    foreach r in array array['anon', 'authenticated'] loop
      if has_function_privilege(r, f, 'EXECUTE') then
        raise exception 'FAIL: % may run %', r, f;
      end if;
    end loop;
    if exists (select 1 from information_schema.routine_privileges where specific_schema = 'ops' and routine_name = split_part(split_part(f, '(', 1), '.', 2) and grantee = 'PUBLIC') then
      raise exception 'FAIL: % is executable by PUBLIC', f;
    end if;
  end loop;
  if position('''APPROVE EXTERNAL MEMBER ACCESS''' in (select prosrc from pg_proc where oid = 'ops.set_external_access(text, boolean, text)'::regprocedure)) = 0 then
    raise exception 'FAIL: opening external access no longer needs its exact phrase';
  end if;
  if position('''SET THE LAUNCH FOUNDER''' in (select prosrc from pg_proc where oid = 'ops.set_launch_founder(text, uuid, text)'::regprocedure)) = 0
     or position('a launch founder is already set' in (select prosrc from pg_proc where oid = 'ops.set_launch_founder(text, uuid, text)'::regprocedure)) = 0 then
    raise exception 'FAIL: setting the launch founder no longer needs its phrase, or can replace an existing founder';
  end if;
  raise notice 'PASS: the launch gate trigger is enabled and complete, its settings and records are server only, and its changes need their phrases';
end $$;

-- 6. The settings are sound (counts only).
do $$
declare
  rows int := (select count(*) from ops.member_launch_settings);
  founder_set boolean := (select founder_user_id is not null from ops.member_launch_settings where id);
  approved boolean := (select external_access_approved from ops.member_launch_settings where id);
  other_founders int;
begin
  if rows <> 1 then
    raise exception 'FAIL: the launch gate has % settings rows (exactly one expected)', rows;
  end if;
  if founder_set then
    select count(*) into other_founders from ops.member_access a, ops.member_launch_settings s
    where s.id and a.cohort = 'founder' and a.status = 'active' and (a.expires_at is null or a.expires_at > now()) and a.user_id <> s.founder_user_id;
    if other_founders > 0 then
      raise exception 'FAIL: % active founder-cohort account(s) besides the launch founder', other_founders;
    end if;
  else
    raise notice 'NOTE: no launch founder is set, so no membership can be given or widened until ops.set_launch_founder is run (fail closed)';
  end if;
  raise notice 'PASS: one launch settings row; external member access is %', case when approved then 'APPROVED' else 'not approved (founder only)' end;
end $$;

\endif
