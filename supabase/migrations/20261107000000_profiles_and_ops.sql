-- Phase 1A, PR 2: the database foundation for real accounts.
--
--   ops               private admin data (like intent, sim, analytics):
--                     server code only, never reachable through the Data API
--   ops.admins        who may send invitations
--   ops.invitations   one row per invitation, with neutral, optional
--                     source and campaign labels used only for analysis
--   public.profiles   one profile per confirmed login identity
--
-- Unified accounts: there is no role, account type or "creator" flag.
-- Everyone can create and support. Invitation labels never decide what an
-- account can do.
--
-- Email and password live only in Supabase Auth (auth.users). Profiles never
-- store email, so nothing private can leak when profiles become visible to
-- other members in a later phase.
--
-- Deleting a login identity deletes its profile (Phase 1A). Before any
-- Connection Points or financial records exist, a separate privacy and
-- retention design must decide how accounts are anonymized and which records
-- are kept (docs/PHASE-1A.md).
--
-- This migration changes no Supabase Auth configuration.

-- ---------------------------------------------------------------------------
-- ops: private schema, locked exactly like the Phase 0 private schemas.

create schema if not exists ops;
comment on schema ops is 'Private admin and invitation data. Server code (service_role) only. Never exposed through the Data API.';

revoke all on schema ops from public;
revoke all on schema ops from anon, authenticated;
grant usage on schema ops to service_role;

alter default privileges in schema ops revoke all on tables from public, anon, authenticated;
alter default privileges in schema ops revoke all on sequences from public, anon, authenticated;
alter default privileges in schema ops revoke all on functions from public, anon, authenticated;
alter default privileges in schema ops grant all on tables to service_role;
alter default privileges in schema ops grant all on sequences to service_role;
alter default privileges in schema ops grant execute on functions to service_role;

create table ops.admins (
  user_id  uuid primary key references auth.users (id) on delete cascade,
  added_at timestamptz not null default now(),
  note     text
);
comment on table ops.admins is 'Accounts allowed to send invitations. Added by hand, with the founder''s approval.';

create table ops.invitations (
  id               uuid primary key default gen_random_uuid(),
  email            text not null,
  source           text,
  campaign         text,
  invited_by       uuid references auth.users (id) on delete set null,
  expires_at       timestamptz not null,
  last_sent_at     timestamptz,
  revoked_at       timestamptz,
  accepted_user_id uuid references auth.users (id) on delete set null,
  accepted_at      timestamptz,
  created_at       timestamptz not null default now(),
  note             text,
  constraint invitations_email_normalized check (email = lower(btrim(email)) and email ~ '^[^@\s]+@[^@\s]+$'),
  constraint invitations_source_format check (source ~ '^[a-z0-9_-]{1,40}$'),
  constraint invitations_campaign_format check (campaign ~ '^[a-z0-9_-]{1,60}$'),
  constraint invitations_expiry_after_creation check (expires_at > created_at)
);
comment on table ops.invitations is 'One row per invitation. source and campaign are optional analysis labels and never decide account capabilities.';
comment on column ops.invitations.source is 'Optional, neutral recruitment source label, for example founder_outreach. Analysis only.';
comment on column ops.invitations.campaign is 'Optional, neutral campaign label, for example pilot_wave_1. Analysis only.';

-- At most one open (not accepted, not revoked) invitation per email address.
create unique index invitations_one_open_per_email
  on ops.invitations (email)
  where accepted_at is null and revoked_at is null;

alter table ops.admins enable row level security;
alter table ops.invitations enable row level security;
-- No policies on purpose: only service_role (which bypasses row level
-- security) can read or write these tables.

grant all on table ops.admins, ops.invitations to service_role;

-- ---------------------------------------------------------------------------
-- public.profiles

create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  username     text,
  display_name text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  -- Lowercase letters, numbers and underscores, 3 to 30 characters. Only
  -- lowercase is allowed, so uniqueness is case-insensitive by construction.
  constraint profiles_username_format check (username ~ '^[a-z0-9_]{3,30}$'),

  -- Reserved names, kept inline so members never need access to anything
  -- private. Changing the list is a small reviewed migration.
  constraint profiles_username_not_reserved check (
    username <> all (array[
      'admin', 'administrator', 'crevant', 'support', 'help', 'staff',
      'moderator', 'official', 'root', 'system', 'api', 'app', 'auth',
      'tour', 'sign_in', 'settings', 'null'
    ])
  ),

  -- 1 to 50 Unicode code points, any language and emoji. Must contain at
  -- least one visible character, must not start or end with whitespace or
  -- invisible characters (the cleanup trigger trims them), and must not
  -- contain control characters.
  constraint profiles_display_name_valid check (
    display_name is null or (
      char_length(display_name) between 1 and 50
      and display_name ~ '[^\s\u0085  ᠎ -‏    ⁠　﻿]'
      and display_name !~ '^[\s\u0085  ᠎ -‏    ⁠　﻿]'
      and display_name !~ '[\s\u0085  ᠎ -‏    ⁠　﻿]$'
      and display_name !~ '[\u0001-\u001F\u007F-\u009F]'
    )
  ),

  constraint profiles_username_unique unique (username)
);
comment on table public.profiles is 'One profile per confirmed login identity. No email, no role: everyone can create and support.';

alter table public.profiles enable row level security;

-- Supabase grants anon and authenticated everything on new public tables by
-- default. Take it all back, then grant only what is needed.
revoke all on table public.profiles from public, anon, authenticated;
grant select on table public.profiles to authenticated;
grant update (username, display_name) on table public.profiles to authenticated;
grant all on table public.profiles to service_role;

-- Phase 1A: people can read and change only their own profile.
create policy "profiles: read own" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));

create policy "profiles: update own" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Profile cleanup: trims display names and keeps updated_at current.
--
-- Runs with the caller's own privileges (security invoker), with a fixed,
-- empty search path. It only edits the row being written: it trims
-- display_name and sets updated_at, and never touches id, username or
-- created_at. Members cannot change protected columns anyway, because they
-- are only granted UPDATE on username and display_name.

create function ops.profiles_before_write()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.display_name is not null then
    new.display_name := pg_catalog.regexp_replace(
      new.display_name,
      '^[\s\u0085  ᠎ -‏    ⁠　﻿]+|[\s\u0085  ᠎ -‏    ⁠　﻿]+$',
      '',
      'g'
    );
  end if;
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

revoke all on function ops.profiles_before_write() from public, anon, authenticated;

create trigger profiles_before_write
  before insert or update on public.profiles
  for each row execute function ops.profiles_before_write();

-- ---------------------------------------------------------------------------
-- Profile creation: one profile per identity, created only once the email
-- is confirmed. Copies only the id; information attached at sign-up is never
-- trusted. Idempotent, so repeated confirmations are harmless.
--
-- Security definer because Supabase Auth's own role writes auth.users and
-- has no privileges on public.profiles. Fixed, empty search path and fully
-- qualified names. Members cannot call it.

create function ops.create_profile_for_confirmed_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email_confirmed_at is not null then
    insert into public.profiles (id) values (new.id)
    on conflict (id) do nothing;
  end if;
  return new;
end;
$$;

revoke all on function ops.create_profile_for_confirmed_user() from public, anon, authenticated;

create trigger on_auth_user_confirmed
  after insert or update of email_confirmed_at on auth.users
  for each row execute function ops.create_profile_for_confirmed_user();

-- ---------------------------------------------------------------------------
-- Backfill: confirmed identities that existed before this migration get
-- their profile. Idempotent.

insert into public.profiles (id)
select u.id from auth.users u
where u.email_confirmed_at is not null
on conflict (id) do nothing;
