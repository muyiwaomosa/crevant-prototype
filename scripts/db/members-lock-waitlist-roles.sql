-- MEMBER PRODUCTION ONLY: makes the two waitlist login roles unable to open
-- any connection, with CONNECTION LIMIT 0. The waitlist migration
-- (20261110000000) creates them on every project that has the full chain,
-- but member Production never runs the waitlist: it lives in its own
-- project (hmrliwoychnqrbbydorg).
--
-- Why not NOLOGIN: supabase/tests/003_waitlist.sql, which is shared with
-- staging and the waitlist project and must not change, requires both roles
-- to be able to log in. CONNECTION LIMIT 0 keeps rolcanlogin true (003 still
-- passes) but Postgres refuses every new session for the role, directly or
-- through the pooler ("too many connections for role"). Neither role has a
-- password here either, so this is a second, independent lock. It does NOT
-- stop a superuser or a member of the role from SET ROLE inside an existing
-- session; docs/MEMBER-PRODUCTION.md lists that bypass.
--
-- Run by .github/workflows/deploy-db-members-production.yml (apply-foundation),
-- after the identity marker is verified. Idempotent; one transaction; checks
-- its own result and refuses on anything unexpected.

\set ON_ERROR_STOP on
begin;
set local lock_timeout = '10s';

do $$
begin
  -- (nested: the marker table is only referenced once it is known to exist)
  if to_regclass('env_identity.marker') is null then
    raise exception 'refused, nothing changed: no member Production identity marker here';
  end if;
  if (select count(*) from env_identity.marker where label = 'splitpost-members-production') <> 1 then
    raise exception 'refused, nothing changed: no member Production identity marker here';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'waitlist_writer')
     or not exists (select 1 from pg_roles where rolname = 'waitlist_admin') then
    raise exception 'refused, nothing changed: the waitlist roles do not exist yet (apply the foundation migrations first)';
  end if;
  if exists (select 1 from ops.settings where key = 'waitlist_submissions' and enabled) then
    raise exception 'refused, nothing changed: waitlist submissions are switched on in member Production; investigate first';
  end if;
end $$;

alter role waitlist_writer connection limit 0;
alter role waitlist_admin connection limit 0;
-- The BL-009 handoff login (20261223000000) exists here too, unused: the
-- waitlist-bridge function connects to the waitlist project's login only.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'waitlist_handoff') then
    execute 'alter role waitlist_handoff connection limit 0';
  end if;
end $$;

do $$
begin
  if (select rolconnlimit from pg_roles where rolname = 'waitlist_writer') <> 0
     or (select rolconnlimit from pg_roles where rolname = 'waitlist_admin') <> 0 then
    raise exception 'FAIL: the connection limits did not take effect';
  end if;
  if not (select rolcanlogin from pg_roles where rolname = 'waitlist_writer')
     or not (select rolcanlogin from pg_roles where rolname = 'waitlist_admin') then
    raise exception 'FAIL: a waitlist role lost LOGIN, which check 003 requires';
  end if;
  -- The limit stops NEW sessions only. A session already open would survive
  -- it, so refuse (rolling the limit back too) if one exists: member
  -- Production should never have had one, and it needs investigating.
  if exists (select 1 from pg_roles where rolname = 'waitlist_handoff' and rolconnlimit <> 0) then
    raise exception 'FAIL: the waitlist_handoff connection limit did not take effect';
  end if;
  if exists (select 1 from pg_stat_activity where usename in ('waitlist_writer', 'waitlist_admin', 'waitlist_handoff')) then
    raise exception 'refused, nothing changed: a waitlist login has an open session on member Production; investigate before locking';
  end if;
  raise notice 'PASS: waitlist_writer and waitlist_admin have connection limit 0 and no open sessions (they still have LOGIN, as check 003 requires)';
end $$;

commit;
