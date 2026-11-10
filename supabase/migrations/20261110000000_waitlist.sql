-- Phase 2: the Crevant waitlist (infrastructure only, switched OFF).
--
-- One unified waitlist. Nobody picks "creator" or "supporter": Crevant is one
-- network where everyone can create, discover, follow, engage and support.
-- Only the email, the 18+ confirmation and waitlist consent are required. A
-- few optional research answers (interests, whether someone shares content,
-- platform, rough audience size) help choose pilot participants internally.
--
--   ops.settings               server-side switches: submissions OFF, and the
--                              approved privacy notice version (none yet)
--   ops.waitlist               one row per email address
--   ops.waitlist_consents      the waitlist consent, with the privacy notice
--                              version shown at the time
--   ops.waitlist_selections    fixed selection labels per invitation wave
--   ops.waitlist_rate_limits   rate limit counters (salted hashes only)
--   waitlist_api.*             the only entry points, each callable by one
--                              dedicated login role (see the end of this file)
--
-- A repeat submission for an address already on the list changes nothing:
-- not the answers, not the consent, not the retention date. Nothing proves
-- yet that a visitor owns the address they typed, so an unverified visitor
-- must never be able to edit an existing entry. Entries stay "unverified"
-- (email_verified_at empty) until a later, reviewed change adds email
-- verification; until then no entry can be invited, and there is no
-- marketing consent at all.
--
-- Everything lives in the private ops schema, locked to server code exactly
-- like ops.invitations. Members and anonymous visitors can't read, write or
-- call any of it. Submissions stay closed until the founder approves the
-- privacy notice, legal operator, contact address, retention policy and
-- activation (docs/WAITLIST.md).
--
-- This migration changes no Supabase Auth configuration, sets no passwords
-- and sends no email.

-- ---------------------------------------------------------------------------
-- Server-side switches. Rows are changed only by server code.

create table ops.settings (
  key        text primary key,
  enabled    boolean not null default false,
  updated_at timestamptz not null default now(),
  value      text,
  note       text,
  constraint settings_key_format check (key ~ '^[a-z0-9_]{1,60}$'),
  constraint settings_value_format check (value is null or value ~ '^[a-z0-9._-]{1,40}$')
);
comment on table ops.settings is 'Server-side switches. waitlist_submissions stays false until the founder approves activation.';

insert into ops.settings (key, enabled, note)
values ('waitlist_submissions', false, 'Off until the privacy notice, legal operator, contact address, retention policy and activation are approved.');

-- The privacy notice version people must have been shown. Set when the notice
-- is approved and published; until then every submission is refused, and so
-- is any submission quoting a different version.
insert into ops.settings (key, enabled, value, note)
values ('waitlist_notice_version', false, null, 'The approved privacy notice version. Empty until the notice is approved.');

-- ---------------------------------------------------------------------------
-- The waitlist.

create table ops.waitlist (
  id                        uuid primary key default gen_random_uuid(),
  email                     text not null,
  interests                 text[] not null default '{}',
  shares_content            text,
  platform                  text,
  audience_band             text,
  source                    text,
  age_confirmed             boolean not null,
  waitlist_consent_version  text not null,
  waitlist_consented_at     timestamptz not null,
  joined_at                 timestamptz not null default now(),
  -- Set only by a future, reviewed email verification flow.
  email_verified_at         timestamptz,
  -- The last time a VERIFIED person confirmed their interest. Retention runs
  -- from here once it exists, otherwise from joined_at.
  interest_confirmed_at     timestamptz,
  verified                  boolean generated always as (email_verified_at is not null) stored,
  status                    text not null default 'new',
  invitation_id             uuid references ops.invitations (id) on delete set null,
  constraint waitlist_email_normalized check (email = lower(btrim(email)) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and length(email) <= 254),
  constraint waitlist_email_unique unique (email),
  constraint waitlist_interests_allowed check (
    interests <@ array['reach_followers', 'closer_community', 'support_creators', 'discover_creators', 'sustainable_income', 'shape_platform']::text[]
  ),
  constraint waitlist_shares_content_allowed check (shares_content is null or shares_content in ('yes', 'not_yet')),
  constraint waitlist_platform_allowed check (
    platform is null or platform in ('youtube', 'tiktok', 'instagram', 'twitch', 'x', 'facebook', 'podcast', 'newsletter', 'other')
  ),
  constraint waitlist_audience_allowed check (audience_band is null or audience_band in ('under_1k', '1k_10k', '10k_100k', 'over_100k')),
  constraint waitlist_creator_details_need_yes check (shares_content = 'yes' or (platform is null and audience_band is null)),
  constraint waitlist_source_format check (source is null or source ~ '^[a-z0-9_-]{1,40}$'),
  constraint waitlist_adults_only check (age_confirmed),
  constraint waitlist_consent_version_format check (waitlist_consent_version ~ '^[a-z0-9._-]{1,40}$'),
  constraint waitlist_status_allowed check (status in ('new', 'shortlisted', 'invited', 'not_selected')),
  constraint waitlist_confirmation_needs_verified_email check (interest_confirmed_at is null or email_verified_at is not null),
  constraint waitlist_invite_needs_verified_email check ((status <> 'invited' and invitation_id is null) or email_verified_at is not null)
);
comment on table ops.waitlist is 'One row per email address. Optional answers are for internal pilot selection only and never decide account capabilities. Server code only.';
comment on column ops.waitlist.email_verified_at is 'When the person proved they own the address. Nothing sets it yet; unverified entries cannot be invited.';
comment on column ops.waitlist.interest_confirmed_at is 'Last verified confirmation of interest. Retention runs from here, or from joined_at when empty (proposed: 12 months).';
comment on column ops.waitlist.status is 'Internal recruitment status. Not a role and never copied to an account.';

create index waitlist_retention_idx on ops.waitlist ((coalesce(interest_confirmed_at, joined_at)));

-- The waitlist consent, with the privacy notice version shown. One row per
-- person today; kind leaves room for consents a verified flow may add later.
create table ops.waitlist_consents (
  id              bigint generated always as identity primary key,
  waitlist_id     uuid not null references ops.waitlist (id) on delete cascade,
  kind            text not null,
  granted         boolean not null,
  notice_version  text not null,
  recorded_at     timestamptz not null default now(),
  constraint waitlist_consents_kind check (kind in ('waitlist')),
  constraint waitlist_consents_version_format check (notice_version ~ '^[a-z0-9._-]{1,40}$')
);
comment on table ops.waitlist_consents is 'Consent records: what was agreed, under which privacy notice version, and when. Deleted with the person.';

create index waitlist_consents_person_idx on ops.waitlist_consents (waitlist_id);

-- Selection per invitation wave, with a fixed label instead of free text, so
-- no opinion about a person is ever written down. Never shown to the person
-- or copied to an account.
create table ops.waitlist_selections (
  waitlist_id uuid not null references ops.waitlist (id) on delete cascade,
  wave        text not null,
  label       text not null,
  created_at  timestamptz not null default now(),
  primary key (waitlist_id, wave),
  constraint waitlist_selections_wave_format check (wave ~ '^[a-z0-9_-]{1,40}$'),
  constraint waitlist_selections_label_allowed check (label in ('active_creator', 'new_creator', 'supporter', 'platform_balance', 'feedback_focus'))
);
comment on table ops.waitlist_selections is 'Fixed selection labels per invitation wave. Not a role; never shown to the person or copied to an account.';

-- Rate limit counters. Keys are salted hashes made by the server function
-- (an HMAC of the email or client address with a secret salt), never the raw
-- value and never a plain hash that could be reversed for a known address.
create table ops.waitlist_rate_limits (
  bucket       text not null,
  window_start timestamptz not null,
  hits         integer not null default 0,
  primary key (bucket, window_start),
  constraint waitlist_rate_bucket_format check (bucket ~ '^(global|email:[0-9a-f]{64}|client:[0-9a-f]{64})$')
);
comment on table ops.waitlist_rate_limits is 'Rate limit counters keyed by salted hashes only. Rows older than two days are removed on each submission and each retention run.';

alter table ops.settings enable row level security;
alter table ops.waitlist enable row level security;
alter table ops.waitlist_consents enable row level security;
alter table ops.waitlist_selections enable row level security;
alter table ops.waitlist_rate_limits enable row level security;
-- No policies on purpose: no API role can read or write these tables. Only
-- the waitlist_api functions below (which run as the table owner) and
-- service_role can.

-- ---------------------------------------------------------------------------
-- Rate limiting helper: counts a hit in a fixed window and reports whether the
-- bucket is over its limit.

create function ops.waitlist_rate_hit(p_bucket text, p_window interval, p_limit integer)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  w timestamptz := to_timestamp(floor(extract(epoch from now()) / extract(epoch from p_window)) * extract(epoch from p_window));
  n integer;
begin
  insert into ops.waitlist_rate_limits as r (bucket, window_start, hits)
  values (p_bucket, w, 1)
  on conflict (bucket, window_start) do update set hits = r.hits + 1
  returning r.hits into n;
  return n > p_limit;
end;
$$;

-- ---------------------------------------------------------------------------
-- One submission. Returns only 'ok', 'closed', 'invalid', 'notice_changed' or
-- 'rate_limited', and the same 'ok' whether the address is new or already on
-- the list, so nobody can find out who has joined. An address already on the
-- list is left exactly as it was.

create function ops.join_waitlist(
  p_email               text,
  p_interests           text[],
  p_shares_content      text,
  p_platform            text,
  p_audience_band       text,
  p_source              text,
  p_age_confirmed       boolean,
  p_waitlist_consent    boolean,
  p_notice_version      text,
  p_email_key           text,
  p_client_key          text
)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_email     text := lower(btrim(coalesce(p_email, '')));
  v_interests text[] := coalesce(p_interests, '{}');
  v_shares    text := nullif(btrim(coalesce(p_shares_content, '')), '');
  v_platform  text := nullif(btrim(coalesce(p_platform, '')), '');
  v_audience  text := nullif(btrim(coalesce(p_audience_band, '')), '');
  v_source    text := nullif(lower(btrim(coalesce(p_source, ''))), '');
  v_notice    text;
  v_id        uuid := gen_random_uuid();
  v_inserted  integer;
begin
  -- Server-side switch: closed means nothing is stored or counted.
  if not coalesce((select enabled from ops.settings where key = 'waitlist_submissions'), false) then
    return 'closed';
  end if;

  -- No approved privacy notice yet: closed, whatever the switch says.
  v_notice := (select value from ops.settings where key = 'waitlist_notice_version');
  if v_notice is null then
    return 'closed';
  end if;

  -- Required: a valid email, 18+ and waitlist consent.
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(v_email) > 254
     or coalesce(p_age_confirmed, false) is false
     or coalesce(p_waitlist_consent, false) is false then
    return 'invalid';
  end if;
  -- Consent only counts under the approved notice. A page showing an older
  -- (or made up) version is refused, and the person is asked to reload.
  if p_notice_version is distinct from v_notice then
    return 'notice_changed';
  end if;

  -- Optional answers must use known values; unknown or unused ones are rejected.
  if not (v_interests <@ array['reach_followers', 'closer_community', 'support_creators', 'discover_creators', 'sustainable_income', 'shape_platform']::text[])
     or cardinality(v_interests) > 6
     or (v_shares is not null and v_shares not in ('yes', 'not_yet'))
     or (v_platform is not null and v_platform not in ('youtube', 'tiktok', 'instagram', 'twitch', 'x', 'facebook', 'podcast', 'newsletter', 'other'))
     or (v_audience is not null and v_audience not in ('under_1k', '1k_10k', '10k_100k', 'over_100k'))
     or (coalesce(v_shares, '') <> 'yes' and (v_platform is not null or v_audience is not null)) then
    return 'invalid';
  end if;
  -- An unknown source label is dropped rather than refused, so a bad link still works.
  if v_source is not null and v_source !~ '^[a-z0-9_-]{1,40}$' then v_source := null; end if;

  -- The server function always sends both salted keys; without them a limit
  -- could be skipped, so refuse.
  if coalesce(p_email_key, '') !~ '^[0-9a-f]{64}$' or coalesce(p_client_key, '') !~ '^[0-9a-f]{64}$' then
    return 'invalid';
  end if;

  -- Rate limits: the whole service, each client and each email address.
  delete from ops.waitlist_rate_limits where window_start < now() - interval '2 days';
  if ops.waitlist_rate_hit('global', interval '1 minute', 60) then
    return 'rate_limited';
  end if;
  if ops.waitlist_rate_hit('client:' || p_client_key, interval '1 hour', 10) then
    return 'rate_limited';
  end if;
  if ops.waitlist_rate_hit('email:' || p_email_key, interval '1 day', 3) then
    return 'rate_limited';
  end if;

  -- New addresses only. An address already on the list is not touched.
  insert into ops.waitlist (
    id, email, interests, shares_content, platform, audience_band, source,
    age_confirmed, waitlist_consent_version, waitlist_consented_at
  )
  values (
    v_id, v_email, v_interests, v_shares, v_platform, v_audience, v_source,
    true, v_notice, now()
  )
  on conflict (email) do nothing;
  get diagnostics v_inserted = row_count;

  if v_inserted = 1 then
    insert into ops.waitlist_consents (waitlist_id, kind, granted, notice_version)
    values (v_id, 'waitlist', true, v_notice);
  end if;

  return 'ok';
end;
$$;

-- ---------------------------------------------------------------------------
-- Deletion on request, by waitlist id (found in the Supabase dashboard), so an
-- email address never has to be typed into GitHub. Removes the waitlist row,
-- its consent record and selection labels, and any invitation for that address
-- that hasn't been accepted. Accepted invitations belong to an account and
-- follow account deletion instead. Rate limit counters are salted hashes that
-- can't be linked to the address without the server function's secret salt;
-- they expire within two days.

create function ops.waitlist_delete(p_id uuid)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_email       text;
  n_waitlist    integer;
  n_invitations integer;
begin
  select email into v_email from ops.waitlist where id = p_id;
  if v_email is null then
    return jsonb_build_object('waitlist', 0, 'open_invitations', 0);
  end if;
  delete from ops.invitations where email = v_email and accepted_at is null;
  get diagnostics n_invitations = row_count;
  delete from ops.waitlist where id = p_id;
  get diagnostics n_waitlist = row_count;
  return jsonb_build_object('waitlist', n_waitlist, 'open_invitations', n_invitations);
end;
$$;

-- Retention: delete everyone whose last verified confirmation, or failing
-- that their signup, is older than the given number of months (proposed
-- policy: 12, subject to legal review), with any invitation for their address
-- that hasn't been accepted, exactly as deletion on request does.
create function ops.waitlist_purge_expired(p_months integer default 12)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  n_waitlist    integer;
  n_invitations integer;
begin
  if p_months is null or p_months < 1 then
    raise exception 'retention must be at least one month';
  end if;
  with expired as (
    delete from ops.waitlist
    where coalesce(interest_confirmed_at, joined_at) < now() - make_interval(months => p_months)
    returning email
  ), open_invitations as (
    delete from ops.invitations i using expired e where i.email = e.email and i.accepted_at is null
    returning i.id
  )
  select (select count(*) from expired), (select count(*) from open_invitations) into n_waitlist, n_invitations;
  delete from ops.waitlist_rate_limits where window_start < now() - interval '2 days';
  return jsonb_build_object('waitlist', n_waitlist, 'open_invitations', n_invitations);
end;
$$;

-- Pilot invitations need a verified address. If an address is on the
-- waitlist but not verified, no invitation can be created for it (or moved
-- to it, or resent). Invitations for addresses not on the waitlist are unaffected.
create function ops.invitations_require_verified_waitlist_email()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.accepted_at is null and new.revoked_at is null and exists (
    select 1 from ops.waitlist w where w.email = new.email and w.email_verified_at is null
  ) then
    raise exception 'this address is on the waitlist but not verified, so it cannot be invited yet'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger invitations_require_verified_waitlist_email
  before insert or update of email, last_sent_at, accepted_at, revoked_at on ops.invitations
  for each row execute function ops.invitations_require_verified_waitlist_email();

-- Demand measurement without email addresses: counts only, with unverified
-- entries counted separately from verified ones.
-- security_invoker: the view reads with the caller's rights, not its owner's,
-- so it can never become a way around the table's row level security.
create view ops.waitlist_summary with (security_invoker = true) as
select
  date_trunc('day', joined_at)::date      as joined_on,
  coalesce(source, 'unknown')             as source,
  coalesce(shares_content, 'unanswered')  as shares_content,
  coalesce(audience_band, 'unanswered')   as audience_band,
  verified,
  count(*)                                as people
from ops.waitlist
group by 1, 2, 3, 4, 5;
comment on view ops.waitlist_summary is 'Daily counts by source, answers and verification, with no email addresses. Server code only.';

-- ---------------------------------------------------------------------------
-- Privileges on ops: server code only.

revoke all on ops.settings, ops.waitlist, ops.waitlist_consents, ops.waitlist_selections, ops.waitlist_rate_limits, ops.waitlist_summary
  from public, anon, authenticated;
grant all on ops.settings, ops.waitlist, ops.waitlist_consents, ops.waitlist_selections, ops.waitlist_rate_limits, ops.waitlist_summary
  to service_role;

revoke all on function ops.waitlist_rate_hit(text, interval, integer) from public, anon, authenticated;
revoke all on function ops.join_waitlist(text, text[], text, text, text, text, boolean, boolean, text, text, text) from public, anon, authenticated;
revoke all on function ops.waitlist_delete(uuid) from public, anon, authenticated;
revoke all on function ops.waitlist_purge_expired(integer) from public, anon, authenticated;
revoke all on function ops.invitations_require_verified_waitlist_email() from public, anon, authenticated;

grant execute on function ops.waitlist_rate_hit(text, interval, integer) to service_role;
grant execute on function ops.join_waitlist(text, text[], text, text, text, text, boolean, boolean, text, text, text) to service_role;
grant execute on function ops.waitlist_delete(uuid) to service_role;
grant execute on function ops.waitlist_purge_expired(integer) to service_role;

-- ---------------------------------------------------------------------------
-- Dedicated login roles and their only entry points.
--
--   waitlist_writer  used by the join-waitlist server function. Can call
--                    waitlist_api.submit and nothing else.
--   waitlist_admin   used by the waitlist admin workflow. Can call the
--                    waitlist_api.admin_* functions (counts, delete by id,
--                    retention, open, close, notice version) and nothing else.
--
-- Neither role can read or write any table directly, in ops or anywhere else.
-- The waitlist_api functions run as their owner (security definer), with an
-- empty search path and fully qualified names, so they can do exactly their
-- one job. waitlist_api is not exposed through the Data API, and no API role
-- (anon, authenticated, service_role) can use it.
--
-- No passwords are set here. A role without a password cannot log in. The
-- founder sets each password directly in the database when activation is
-- approved (docs/WAITLIST.md); passwords never appear in the repository.

-- New roles get no special powers (no superuser, create role or database,
-- replication or bypassing row level security). On Supabase the migration
-- runs as a role that isn't a superuser and can't restate those attributes
-- on an existing role, so supabase/tests/003_waitlist.sql checks them instead
-- and fails if either role ever has one.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'waitlist_writer') then
    create role waitlist_writer login noinherit nocreatedb nocreaterole connection limit 20;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'waitlist_admin') then
    create role waitlist_admin login noinherit nocreatedb nocreaterole connection limit 5;
  end if;
end $$;

alter role waitlist_writer set statement_timeout = '5s';
alter role waitlist_admin set statement_timeout = '30s';
alter role waitlist_writer set idle_in_transaction_session_timeout = '10s';
alter role waitlist_admin set idle_in_transaction_session_timeout = '30s';

create schema waitlist_api;
comment on schema waitlist_api is 'Entry points for the waitlist login roles only. Not exposed through the Data API.';
revoke all on schema waitlist_api from public;
grant usage on schema waitlist_api to waitlist_writer, waitlist_admin;

-- The server function's only call.
create function waitlist_api.submit(
  p_email               text,
  p_interests           text[],
  p_shares_content      text,
  p_platform            text,
  p_audience_band       text,
  p_source              text,
  p_age_confirmed       boolean,
  p_waitlist_consent    boolean,
  p_notice_version      text,
  p_email_key           text,
  p_client_key          text
)
returns text
language sql
security definer
set search_path = ''
as $$
  select ops.join_waitlist(
    p_email, p_interests, p_shares_content, p_platform, p_audience_band, p_source,
    p_age_confirmed, p_waitlist_consent, p_notice_version, p_email_key, p_client_key
  );
$$;

-- Admin: counts only, never an address.
create function waitlist_api.admin_summary()
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'total',       (select count(*) from ops.waitlist),
    'unverified',  (select count(*) from ops.waitlist where not verified),
    'verified',    (select count(*) from ops.waitlist where verified),
    'by_source',   coalesce((select jsonb_object_agg(source, people) from (
                     select source, sum(people) as people from ops.waitlist_summary group by source) s), '{}'::jsonb),
    'shares_content', coalesce((select jsonb_object_agg(shares_content, people) from (
                     select shares_content, sum(people) as people from ops.waitlist_summary group by shares_content) s), '{}'::jsonb),
    'submissions', case when (select enabled from ops.settings where key = 'waitlist_submissions') then 'ON' else 'OFF' end,
    'notice_version', (select value from ops.settings where key = 'waitlist_notice_version')
  );
$$;

create function waitlist_api.admin_status()
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'submissions', case when (select enabled from ops.settings where key = 'waitlist_submissions') then 'ON' else 'OFF' end,
    'notice_version', (select value from ops.settings where key = 'waitlist_notice_version')
  );
$$;

create function waitlist_api.admin_delete(p_id uuid)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select ops.waitlist_delete(p_id);
$$;

create function waitlist_api.admin_purge(p_months integer)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select ops.waitlist_purge_expired(p_months);
$$;

-- Records the approved privacy notice version (the format is checked by the table).
create function waitlist_api.admin_set_notice_version(p_version text)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  update ops.settings set value = p_version, updated_at = now() where key = 'waitlist_notice_version';
  select waitlist_api.admin_status();
$$;

-- Opens submissions. Refused until an approved notice version is recorded.
create function waitlist_api.admin_open()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select value from ops.settings where key = 'waitlist_notice_version') is null then
    raise exception 'record the approved privacy notice version before opening the waitlist';
  end if;
  update ops.settings set enabled = true, updated_at = now() where key = 'waitlist_submissions';
  return waitlist_api.admin_status();
end;
$$;

-- Closes submissions at once. Always allowed.
create function waitlist_api.admin_close()
returns jsonb
language sql
security definer
set search_path = ''
as $$
  update ops.settings set enabled = false, updated_at = now() where key = 'waitlist_submissions';
  select waitlist_api.admin_status();
$$;

revoke all on all functions in schema waitlist_api from public, anon, authenticated, service_role;

grant execute on function waitlist_api.submit(text, text[], text, text, text, text, boolean, boolean, text, text, text) to waitlist_writer;

grant execute on function waitlist_api.admin_summary() to waitlist_admin;
grant execute on function waitlist_api.admin_status() to waitlist_admin;
grant execute on function waitlist_api.admin_delete(uuid) to waitlist_admin;
grant execute on function waitlist_api.admin_purge(integer) to waitlist_admin;
grant execute on function waitlist_api.admin_set_notice_version(text) to waitlist_admin;
grant execute on function waitlist_api.admin_open() to waitlist_admin;
grant execute on function waitlist_api.admin_close() to waitlist_admin;
