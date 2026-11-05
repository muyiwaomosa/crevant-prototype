-- Phase 0 guarantees for the four data areas. Each block raises an exception
-- on failure, so psql with ON_ERROR_STOP fails the run.

-- 1. The private schemas exist.
do $$
begin
  if (select count(*) from pg_namespace where nspname in ('finance', 'sim', 'analytics')) <> 3 then
    raise exception 'FAIL: finance, sim and analytics schemas must all exist';
  end if;
  raise notice 'PASS: finance, sim and analytics schemas exist';
end $$;

-- 2. Members and anonymous visitors cannot use the private schemas; server code can.
do $$
declare
  s text;
  r text;
begin
  foreach s in array array['finance', 'sim', 'analytics'] loop
    foreach r in array array['anon', 'authenticated'] loop
      if has_schema_privilege(r, s, 'USAGE') then
        raise exception 'FAIL: role % has USAGE on schema %', r, s;
      end if;
    end loop;
    if not has_schema_privilege('service_role', s, 'USAGE') then
      raise exception 'FAIL: service_role lacks USAGE on schema %', s;
    end if;
  end loop;
  raise notice 'PASS: only service_role can use finance, sim and analytics';
end $$;

-- 3. Tables created later in these schemas start locked down (default privileges).
begin;
create table finance._probe (id int);
create table sim._probe (id int);
create table analytics._probe (id int);
do $$
declare
  t text;
begin
  foreach t in array array['finance._probe', 'sim._probe', 'analytics._probe'] loop
    if has_table_privilege('authenticated', t, 'SELECT') or has_table_privilege('anon', t, 'SELECT') then
      raise exception 'FAIL: % is readable by members by default', t;
    end if;
    if not has_table_privilege('service_role', t, 'SELECT,INSERT,UPDATE,DELETE') then
      raise exception 'FAIL: service_role cannot use %', t;
    end if;
  end loop;
  raise notice 'PASS: new tables in private schemas are locked down by default';
end $$;
rollback;

-- 4. No view, materialized view or function may read both finance and sim.
create or replace function pg_temp.finance_sim_violations()
returns table (kind text, name text)
language sql
as $$
  select 'view', schemaname || '.' || viewname
  from pg_views
  where definition ~* '\mfinance\.' and definition ~* '\msim\.'
  union all
  select 'materialized view', schemaname || '.' || matviewname
  from pg_matviews
  where definition ~* '\mfinance\.' and definition ~* '\msim\.'
  union all
  select 'function', n.nspname || '.' || p.proname
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname not in ('pg_catalog', 'information_schema')
    and p.prosrc ~* '\mfinance\.' and p.prosrc ~* '\msim\.'
$$;

do $$
declare
  v record;
  n int := 0;
begin
  for v in select * from pg_temp.finance_sim_violations() loop
    raise warning 'violation: % %', v.kind, v.name;
    n := n + 1;
  end loop;
  if n > 0 then
    raise exception 'FAIL: % object(s) read both finance and sim', n;
  end if;
  raise notice 'PASS: nothing reads both finance and sim';
end $$;

-- 5. The check itself works: a deliberate violation must be detected.
begin;
create table finance._probe_money (cents int);
create table sim._probe_illustrative (cents int);
create view public._probe_mixed as
  select m.cents + s.cents as total from finance._probe_money m, sim._probe_illustrative s;
do $$
begin
  if not exists (select 1 from pg_temp.finance_sim_violations() where name = 'public._probe_mixed') then
    raise exception 'FAIL: the separation check did not detect a view mixing finance and sim';
  end if;
  raise notice 'PASS: the separation check detects a mixed view';
end $$;
rollback;
