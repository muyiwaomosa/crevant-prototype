-- TEST ONLY. Never applied to a real Supabase project.
--
-- Makes a plain PostgreSQL database behave like a Supabase project in the
-- ways our migrations and tests depend on:
--
--   1. An auth schema with a minimal auth.users table and auth.uid(), which
--      reads the signed-in user's id from request.jwt.claims, as Supabase does.
--   2. Supabase's default privileges: anon and authenticated get everything
--      on new public tables, functions and sequences. Our migrations must
--      revoke what they don't want, and the tests prove they do.
--   3. The supabase_auth_admin role, which owns and writes auth.users on a
--      real project.
--
-- scripts/db/test.sh refuses to run against a database that already has an
-- auth schema, so this can never touch a real project.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    create role supabase_auth_admin nologin;
  end if;
end
$$;

create schema auth authorization supabase_auth_admin;
grant usage on schema auth to anon, authenticated, service_role;

create table auth.users (
  id                 uuid primary key default gen_random_uuid(),
  email              text,
  email_confirmed_at timestamptz,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now()
);
alter table auth.users owner to supabase_auth_admin;
grant all on auth.users to postgres, service_role;

create function auth.uid() returns uuid
language sql stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;
grant execute on function auth.uid() to anon, authenticated, service_role;

-- Supabase's default grants on the public schema.
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
