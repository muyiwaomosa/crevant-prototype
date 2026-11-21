-- MEMBER PRODUCTION ONLY. Run ONCE, by the founder, in the Supabase dashboard
-- SQL editor of the NEW member Production project (splitpost-members-production),
-- BEFORE any migration. Never run it anywhere else. docs/MEMBER-PRODUCTION.md
-- ("Identity marker") has the full procedure.
--
-- It records an identity marker that every member workflow checks before it
-- changes or reads anything (scripts/db/verify-members-identity.sh), so a
-- connection string that points at the wrong database is refused even when
-- the URL itself looks right.
--
-- Only the SHA-256 of the marker is stored here. The marker itself lives
-- only in the GitHub "members-production" environment secret
-- MEMBERS_DB_IDENTITY_MARKER. Before running this file, replace
-- PASTE_THE_MARKER_SHA256_HERE (once, below) with the 64 lowercase hex
-- characters of the marker's SHA-256. Never paste the marker itself.
--
-- It refuses, changing nothing:
--   * if the placeholder was not replaced, or the value is not 64 lowercase hex;
--   * if this project already has app schemas or a migration history
--     (staging and the waitlist project both do, so it can't be run there);
--   * if the marker already exists (it is created once and never replaced).
-- The row can't be updated or deleted afterwards (a trigger refuses), and only
-- the database owner can read it.

begin;

do $$
declare
  v_sha text := 'PASTE_THE_MARKER_SHA256_HERE';
begin
  if v_sha !~ '^[0-9a-f]{64}$' then
    raise exception 'refused, nothing changed: replace PASTE_THE_MARKER_SHA256_HERE with the 64 lowercase hex characters of the marker''s SHA-256';
  end if;
  if to_regnamespace('env_identity') is not null then
    raise exception 'refused, nothing changed: the identity marker already exists, and is never replaced';
  end if;
  if exists (select 1 from pg_namespace where nspname in ('ops', 'social', 'waitlist_api', 'intent', 'sim', 'analytics')) then
    raise exception 'refused, nothing changed: this project already has app schemas or migrations. The marker goes only into the NEW, empty member Production project';
  end if;
  -- (nested: the history table is only referenced once it is known to exist)
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    if exists (select 1 from supabase_migrations.schema_migrations) then
      raise exception 'refused, nothing changed: this project already has app schemas or migrations. The marker goes only into the NEW, empty member Production project';
    end if;
  end if;
  perform set_config('crevant.marker_sha256', v_sha, true);
end $$;

create schema env_identity;
comment on schema env_identity is 'Member Production identity marker (hash only). Checked by every member workflow. Never exposed through the Data API.';
revoke all on schema env_identity from public;

create table env_identity.marker (
  id            boolean primary key default true check (id),
  label         text not null check (label = 'splitpost-members-production'),
  marker_sha256 text not null check (marker_sha256 ~ '^[0-9a-f]{64}$'),
  created_at    timestamptz not null default now()
);
comment on table env_identity.marker is 'One row, never changed: the SHA-256 of the MEMBERS_DB_IDENTITY_MARKER secret.';
revoke all on table env_identity.marker from public;

create function env_identity.marker_immutable() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'the member Production identity marker can''t be changed or removed';
end $$;
revoke all on function env_identity.marker_immutable() from public;

create trigger marker_no_change before update or delete on env_identity.marker
for each row execute function env_identity.marker_immutable();
create trigger marker_no_truncate before truncate on env_identity.marker
for each statement execute function env_identity.marker_immutable();

insert into env_identity.marker (label, marker_sha256)
values ('splitpost-members-production', current_setting('crevant.marker_sha256'));

-- Supabase API roles get nothing (they may not exist on a plain Postgres).
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated', 'service_role'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on schema env_identity from %I', r);
      execute format('revoke all on all tables in schema env_identity from %I', r);
      execute format('revoke all on all functions in schema env_identity from %I', r);
    end if;
  end loop;
end $$;

select label, created_at, 'marker recorded (hash only)' as result from env_identity.marker;

commit;
