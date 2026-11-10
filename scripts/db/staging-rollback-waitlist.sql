-- Staging only: removes exactly what the two waitlist migrations created
-- (20261110000000_waitlist and 20261111000000_waitlist_admin_tools), so they
-- can be applied again cleanly. Run only through the "Waitlist rollback
-- (staging)" workflow, which first confirms the target is the staging
-- project. Never run it against Production.
--
--   psql "<url>" -X -q -v ON_ERROR_STOP=1 -v mode=check -v confirm= -f scripts/db/staging-rollback-waitlist.sql
--   psql "<url>" -X -q -v ON_ERROR_STOP=1 -v mode=apply -v confirm='DELETE THE STAGING WAITLIST' -f ...
--
-- mode=check   does everything below inside one transaction, including the
--              drops, and then rolls it all back: a dry run that proves the
--              real run would succeed. Changes nothing.
-- mode=apply   the same, then commits. Needs the confirmation phrase.
--
-- Refuses, changing nothing, if any of these is true:
--   * a registration, consent record, selection or rate limit record exists
--   * a privacy notice version is recorded, or submissions are switched on
--   * ops.settings holds anything but the two waitlist switches
--   * the two waitlist migrations aren't both recorded, or a later one is
--   * any expected object is missing, or waitlist_api holds anything else
--   * another object depends on these (Postgres's own dependency checks,
--     since every drop is explicit and none cascades), or a function outside
--     this list mentions them
--   * the two login roles own anything, hold any privilege outside
--     waitlist_api, belong to another role, or have an open session
--
-- It never uses DROP ... CASCADE or DROP OWNED. Everything happens in one
-- transaction with the waitlist tables locked, so nothing can be written
-- between the checks and the drops. It prints counts and object names only.

\set ON_ERROR_STOP on
\pset footer off

begin;
set local lock_timeout = '10s';
set local statement_timeout = '120s';

-- An unset -v mode or -v confirm stops here with a syntax error, by design.
select set_config('crevant.rollback_mode', :'mode', true) as mode,
       set_config('crevant.rollback_confirm', :'confirm', true) <> '' as confirmation_given;

do $$
begin
  if current_setting('crevant.rollback_mode') not in ('check', 'apply') then
    raise exception 'mode must be check or apply';
  end if;
  if current_setting('crevant.rollback_mode') = 'apply'
     and current_setting('crevant.rollback_confirm') <> 'DELETE THE STAGING WAITLIST' then
    raise exception 'apply needs the confirmation phrase: DELETE THE STAGING WAITLIST';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- The inventory: every object the two migrations created, in drop order.
-- Indexes, constraints, the identity sequence and row level security go
-- with their tables; grants go with their objects.

create temporary table rollback_inventory (
  step      integer primary key,
  kind      text not null,
  name      text not null,
  drop_sql  text not null
) on commit drop;

insert into rollback_inventory values
  ( 1, 'trigger',  'invitations_require_verified_waitlist_email on ops.invitations', 'drop trigger invitations_require_verified_waitlist_email on ops.invitations'),
  ( 2, 'trigger',  'waitlist_selections_require_verified on ops.waitlist_selections', 'drop trigger waitlist_selections_require_verified on ops.waitlist_selections'),
  ( 3, 'function', 'waitlist_api.submit(text,text[],text,text,text,text,boolean,boolean,text,text,text)', 'drop function waitlist_api.submit(text,text[],text,text,text,text,boolean,boolean,text,text,text)'),
  ( 4, 'function', 'waitlist_api.admin_summary()', 'drop function waitlist_api.admin_summary()'),
  ( 5, 'function', 'waitlist_api.admin_status()', 'drop function waitlist_api.admin_status()'),
  ( 6, 'function', 'waitlist_api.admin_delete(uuid)', 'drop function waitlist_api.admin_delete(uuid)'),
  ( 7, 'function', 'waitlist_api.admin_purge(integer)', 'drop function waitlist_api.admin_purge(integer)'),
  ( 8, 'function', 'waitlist_api.admin_set_notice_version(text)', 'drop function waitlist_api.admin_set_notice_version(text)'),
  ( 9, 'function', 'waitlist_api.admin_open()', 'drop function waitlist_api.admin_open()'),
  (10, 'function', 'waitlist_api.admin_close()', 'drop function waitlist_api.admin_close()'),
  (11, 'function', 'waitlist_api.admin_wave_preview(text)', 'drop function waitlist_api.admin_wave_preview(text)'),
  (12, 'function', 'waitlist_api.admin_wave_select(text,text,text[],integer)', 'drop function waitlist_api.admin_wave_select(text,text,text[],integer)'),
  (13, 'function', 'waitlist_api.admin_wave_summary(text)', 'drop function waitlist_api.admin_wave_summary(text)'),
  (14, 'function', 'waitlist_api.admin_wave_clear(text)', 'drop function waitlist_api.admin_wave_clear(text)'),
  (15, 'schema',   'waitlist_api', 'drop schema waitlist_api'),
  (16, 'view',     'ops.waitlist_summary', 'drop view ops.waitlist_summary'),
  (17, 'function', 'ops.join_waitlist(text,text[],text,text,text,text,boolean,boolean,text,text,text)', 'drop function ops.join_waitlist(text,text[],text,text,text,text,boolean,boolean,text,text,text)'),
  (18, 'function', 'ops.waitlist_rate_hit(text,interval,integer)', 'drop function ops.waitlist_rate_hit(text,interval,integer)'),
  (19, 'function', 'ops.waitlist_delete(uuid)', 'drop function ops.waitlist_delete(uuid)'),
  (20, 'function', 'ops.waitlist_purge_expired(integer)', 'drop function ops.waitlist_purge_expired(integer)'),
  (21, 'function', 'ops.invitations_require_verified_waitlist_email()', 'drop function ops.invitations_require_verified_waitlist_email()'),
  (22, 'function', 'ops.waitlist_selections_require_verified()', 'drop function ops.waitlist_selections_require_verified()'),
  (23, 'table',    'ops.waitlist_selections', 'drop table ops.waitlist_selections'),
  (24, 'table',    'ops.waitlist_consents', 'drop table ops.waitlist_consents'),
  (25, 'table',    'ops.waitlist_rate_limits', 'drop table ops.waitlist_rate_limits'),
  (26, 'table',    'ops.waitlist', 'drop table ops.waitlist'),
  (27, 'table',    'ops.settings', 'drop table ops.settings'),
  (28, 'role',     'waitlist_writer', 'drop role waitlist_writer'),
  (29, 'role',     'waitlist_admin', 'drop role waitlist_admin'),
  (30, 'migration record', '20261111000000 waitlist_admin_tools', $q$delete from supabase_migrations.schema_migrations where version = '20261111000000'$q$),
  (31, 'migration record', '20261110000000 waitlist', $q$delete from supabase_migrations.schema_migrations where version = '20261110000000'$q$);

-- Every expected object must exist before anything is locked or checked.
do $$
declare
  missing text[] := '{}';
  r record;
begin
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise exception 'refused: no Supabase migration history here (supabase_migrations.schema_migrations)';
  end if;
  for r in select * from rollback_inventory order by step loop
    if (r.kind = 'function' and to_regprocedure(r.name) is null)
       or (r.kind in ('table', 'view') and to_regclass(r.name) is null)
       or (r.kind = 'schema' and to_regnamespace(r.name) is null)
       or (r.kind = 'role' and not exists (select 1 from pg_roles where rolname = r.name))
       or (r.kind = 'trigger' and not exists (
             select 1 from pg_trigger t
             where not t.tgisinternal and t.tgname = split_part(r.name, ' on ', 1)
               and t.tgrelid = to_regclass(split_part(r.name, ' on ', 2))))
       or (r.kind = 'migration record' and not exists (
             select 1 from supabase_migrations.schema_migrations where version = split_part(r.name, ' ', 1))) then
      missing := missing || r.name;
    end if;
  end loop;
  if cardinality(missing) > 0 then
    raise exception 'refused: expected objects are missing (%), so the database is not in the state this rollback was written for', array_to_string(missing, ', ');
  end if;
end $$;

-- Nothing can write to the waitlist tables until this transaction ends.
lock table ops.settings, ops.waitlist, ops.waitlist_consents, ops.waitlist_selections, ops.waitlist_rate_limits in access exclusive mode;
-- Dropping its trigger needs this lock anyway; take it now, before checking.
lock table ops.invitations in share row exclusive mode;

do $$
declare
  problems text[] := '{}';
  n bigint;
  roles text[] := array['waitlist_writer', 'waitlist_admin'];
begin
  -- Data: any of these means real or test registrations exist.
  select count(*) into n from ops.waitlist;
  if n > 0 then problems := problems || format('%s registration(s)', n); end if;
  select count(*) into n from ops.waitlist_consents;
  if n > 0 then problems := problems || format('%s consent record(s)', n); end if;
  select count(*) into n from ops.waitlist_selections;
  if n > 0 then problems := problems || format('%s selection(s)', n); end if;
  select count(*) into n from ops.waitlist_rate_limits;
  if n > 0 then problems := problems || format('%s rate limit record(s)', n); end if;

  -- Switches: a recorded notice version or open submissions.
  if exists (select 1 from ops.settings where key = 'waitlist_notice_version' and (value is not null or enabled)) then
    problems := problems || 'an active privacy notice version is recorded'::text;
  end if;
  if exists (select 1 from ops.settings where key = 'waitlist_submissions' and enabled) then
    problems := problems || 'submissions are switched on'::text;
  end if;
  if exists (select 1 from ops.settings where key not in ('waitlist_submissions', 'waitlist_notice_version'))
     or (select count(*) from ops.settings) <> 2 then
    problems := problems || 'ops.settings holds something other than the two waitlist switches'::text;
  end if;

  -- Migration history: nothing later may build on these two.
  if exists (select 1 from supabase_migrations.schema_migrations where version > '20261111000000') then
    problems := problems || 'a later migration is recorded'::text;
  end if;

  -- waitlist_api must hold exactly the inventory's functions and nothing else.
  select count(*) into n from pg_proc p
  where p.pronamespace = 'waitlist_api'::regnamespace
    and p.oid::regprocedure::text not in (select name from rollback_inventory where kind = 'function');
  if n > 0 then problems := problems || format('%s unexpected function(s) in waitlist_api', n); end if;
  select count(*) into n from pg_class where relnamespace = 'waitlist_api'::regnamespace;
  if n > 0 then problems := problems || format('%s unexpected table(s), view(s) or sequence(s) in waitlist_api', n); end if;
  select count(*) into n from pg_type t
  where t.typnamespace = 'waitlist_api'::regnamespace and t.typrelid = 0 and t.typelem = 0;
  if n > 0 then problems := problems || format('%s unexpected type(s) in waitlist_api', n); end if;

  -- Functions outside the inventory whose code mentions these objects
  -- (function bodies aren't tracked as dependencies by Postgres).
  select count(*) into n from pg_proc p
  where p.oid::regprocedure::text not in (select name from rollback_inventory where kind = 'function')
    and p.pronamespace not in ('pg_catalog'::regnamespace, 'information_schema'::regnamespace)
    and p.prosrc ~ '(waitlist_api\.|ops\.waitlist|ops\.settings|ops\.join_waitlist|waitlist_writer|waitlist_admin)';
  if n > 0 then problems := problems || format('%s other function(s) refer to the waitlist', n); end if;

  -- The login roles: nothing owned, no privilege outside waitlist_api, no
  -- membership of another role, no open session.
  select count(*) into n from pg_shdepend d join pg_roles r on r.oid = d.refobjid
  where r.rolname = any (roles) and d.deptype = 'o';
  if n > 0 then problems := problems || format('the login roles own %s object(s)', n); end if;
  select count(*) into n from pg_shdepend d join pg_roles r on r.oid = d.refobjid
  where r.rolname = any (roles) and d.deptype <> 'o'
    and not (
      d.dbid = (select oid from pg_database where datname = current_database())
      and (
        (d.classid = 'pg_namespace'::regclass and d.objid = 'waitlist_api'::regnamespace)
        or (d.classid = 'pg_proc'::regclass and d.objid in (
              select to_regprocedure(name)::oid from rollback_inventory where kind = 'function' and name like 'waitlist_api.%'))
      )
    );
  if n > 0 then problems := problems || format('the login roles hold %s privilege(s) outside waitlist_api', n); end if;
  if exists (select 1 from pg_auth_members a join pg_roles m on m.oid = a.member where m.rolname = any (roles)) then
    problems := problems || 'a login role belongs to another role'::text;
  end if;
  select count(*) into n from pg_stat_activity where usename = any (roles);
  if n > 0 then problems := problems || format('%s open session(s) as a login role', n); end if;

  if cardinality(problems) > 0 then
    raise exception 'refused, nothing changed: %', array_to_string(problems, '; ');
  end if;
end $$;

\echo 'Checks passed. Objects to remove, in order:'
select step, kind, name from rollback_inventory order by step;

-- The drops, each by its exact name, none cascading: if anything outside the
-- inventory still depends on an object, Postgres refuses and the whole
-- transaction is rolled back.
do $$
declare
  r record;
begin
  for r in select * from rollback_inventory order by step loop
    execute r.drop_sql;
  end loop;
end $$;

-- Afterwards: everything in the inventory is gone, and what the earlier
-- migrations made is untouched.
do $$
declare
  left_over text[] := '{}';
  r record;
begin
  for r in select * from rollback_inventory order by step loop
    if (r.kind = 'function' and to_regprocedure(r.name) is not null)
       or (r.kind in ('table', 'view') and to_regclass(r.name) is not null)
       or (r.kind = 'schema' and to_regnamespace(r.name) is not null)
       or (r.kind = 'role' and exists (select 1 from pg_roles where rolname = r.name))
       or (r.kind = 'migration record' and exists (
             select 1 from supabase_migrations.schema_migrations where version = split_part(r.name, ' ', 1))) then
      left_over := left_over || r.name;
    end if;
  end loop;
  if exists (select 1 from pg_trigger where tgname in ('invitations_require_verified_waitlist_email', 'waitlist_selections_require_verified')) then
    left_over := left_over || 'a waitlist trigger'::text;
  end if;
  if cardinality(left_over) > 0 then
    raise exception 'rollback incomplete, nothing changed: % still present', array_to_string(left_over, ', ');
  end if;
  if to_regclass('ops.invitations') is null or to_regclass('ops.admins') is null or to_regnamespace('ops') is null
     or not exists (select 1 from supabase_migrations.schema_migrations where version = '20261107000000') then
    raise exception 'rollback would have touched objects from earlier migrations, nothing changed';
  end if;
end $$;

select current_setting('crevant.rollback_mode') = 'apply' as apply \gset
\if :apply
  commit;
  \echo 'Applied: the waitlist objects and their two migration records were removed. The migrations can now be applied again.'
\else
  rollback;
  \echo 'Check only: every check and drop succeeded inside the transaction, and all of it was rolled back. Nothing changed.'
\endif
