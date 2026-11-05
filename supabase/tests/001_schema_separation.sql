-- Phase 0 guarantees for the separated data areas. Each block raises an
-- exception on failure, so psql with ON_ERROR_STOP fails the run.

-- 1. The private schemas exist, and there is no finance schema in the pilot.
do $$
begin
  if (select count(*) from pg_namespace where nspname in ('intent', 'sim', 'analytics')) <> 3 then
    raise exception 'FAIL: intent, sim and analytics schemas must all exist';
  end if;
  raise notice 'PASS: intent, sim and analytics schemas exist';
end $$;

-- 2. Members and anonymous visitors cannot use the private schemas; server code can.
do $$
declare
  s text;
  r text;
begin
  foreach s in array array['intent', 'sim', 'analytics'] loop
    foreach r in array array['anon', 'authenticated'] loop
      if has_schema_privilege(r, s, 'USAGE') then
        raise exception 'FAIL: role % has USAGE on schema %', r, s;
      end if;
    end loop;
    if not has_schema_privilege('service_role', s, 'USAGE') then
      raise exception 'FAIL: service_role lacks USAGE on schema %', s;
    end if;
  end loop;
  raise notice 'PASS: only service_role can use intent, sim and analytics';
end $$;

-- 3. Tables created later in these schemas start locked down (default privileges).
begin;
create table intent._probe (id int);
create table sim._probe (id int);
create table analytics._probe (id int);
do $$
declare
  t text;
begin
  foreach t in array array['intent._probe', 'sim._probe', 'analytics._probe'] loop
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

-- 4. No view, materialized view or function may combine two amount schemas:
--    intent (hypothetical support), sim (illustrative ad earnings), and
--    finance (real money, if it is ever added).
create or replace function pg_temp.amount_schema_violations()
returns table (kind text, name text, schemas text)
language sql
as $$
  with objs as (
    select 'view' as kind, schemaname || '.' || viewname as name, definition as body from pg_views
    union all
    select 'materialized view', schemaname || '.' || matviewname, definition from pg_matviews
    union all
    select 'function', n.nspname || '.' || p.proname, p.prosrc
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname not in ('pg_catalog', 'information_schema')
  ),
  hits as (
    select o.kind, o.name, s.schema
    from objs o
    cross join (values ('intent'), ('sim'), ('finance')) as s(schema)
    where o.body ~* ('\m' || s.schema || '\.')
  )
  select kind, name, string_agg(schema, ', ' order by schema)
  from hits
  group by kind, name
  having count(*) > 1
$$;

do $$
declare
  v record;
  n int := 0;
begin
  for v in select * from pg_temp.amount_schema_violations() loop
    raise warning 'violation: % % combines %', v.kind, v.name, v.schemas;
    n := n + 1;
  end loop;
  if n > 0 then
    raise exception 'FAIL: % object(s) combine amount schemas', n;
  end if;
  raise notice 'PASS: nothing combines intent, sim or finance';
end $$;

-- 5. The check itself works: deliberate violations must be detected,
--    including one against a future finance schema.
begin;
create table intent._probe_support (cents int);
create table sim._probe_illustrative (cents int);
create view public._probe_mixed as
  select a.cents + b.cents as total from intent._probe_support a, sim._probe_illustrative b;
create schema finance;
create table finance._probe_money (cents int);
create view public._probe_mixed_finance as
  select a.cents + m.cents as total from intent._probe_support a, finance._probe_money m;
do $$
begin
  if not exists (select 1 from pg_temp.amount_schema_violations() where name = 'public._probe_mixed') then
    raise exception 'FAIL: the check did not detect a view combining intent and sim';
  end if;
  if not exists (select 1 from pg_temp.amount_schema_violations() where name = 'public._probe_mixed_finance') then
    raise exception 'FAIL: the check did not detect a view combining intent and finance';
  end if;
  raise notice 'PASS: the separation check detects combined views, including with a future finance schema';
end $$;
rollback;
