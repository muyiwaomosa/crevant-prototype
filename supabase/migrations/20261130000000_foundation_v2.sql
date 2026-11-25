-- IP-1 Foundation (SP-TA-001 v2, section 10): controlled link registration,
-- adult-only eligibility, one event stream, and complete Home paging.
-- Review guide: docs/FOUNDATION-V2.md.
--
-- Safe defaults, on every database: registration is PAUSED, external member
-- access stays as the launch gate says (closed unless the owner approved it),
-- and nothing here grants membership by itself.
--
-- 1. Adult eligibility. ops.age_attestations records that an account
--    confirmed it is 18 or older (once, never edited). social.current_access()
--    now requires it, so every member function refuses an account without one
--    ('adult_attestation_required'). Existing members are not backfilled: they
--    confirm in the app (public.app_attest_adult), because an attestation must
--    be the person's own statement.
-- 2. Registration links and settings. Invitation links (issued by the founder)
--    and referral links (one personal link per member). Settings: paused,
--    overall cap, daily cap, per-referrer daily cap, all changed without a
--    deployment and every change recorded.
-- 3. Account creation hook. public.hook_before_user_created refuses a sign-up
--    unless it carries a valid registration code and the adult confirmation,
--    or the email has an open founder invitation. Supabase Auth calls it before
--    creating any account (configured in supabase/config.toml and, for hosted
--    projects, in the Auth settings: a founder-approved configuration change).
-- 4. Claiming membership. public.app_claim_access(code, adult, wording) runs
--    after email verification: it re-checks the link and every limit under one
--    lock, records the attestation, the registration and its attribution, and
--    grants membership. The launch gate trigger still decides last.
-- 5. Events. analytics.events, written by triggers on the authoritative
--    tables, so each action is recorded exactly once on the server, with its
--    data class (actual, founder, test). Viewed state (social.post_views) is
--    deliberately not read: it stays a UX signal inside the social core.
--    Qualifying consumption for the North Star gets its own signal later.
-- 6. Home paging. app_feed_page and app_member_posts_page page on
--    (created_at, id), so posts with identical timestamps are never skipped,
--    and app_feed_page can filter to My Clique. The earlier functions stay for
--    older pages.

-- ---------------------------------------------------------------------------
-- 1. Adult eligibility

create table ops.age_attestations (
  user_id          uuid primary key references auth.users (id) on delete cascade,
  attested_at      timestamptz not null default pg_catalog.now(),
  wording_version  text not null check (wording_version ~ '^[a-z0-9][a-z0-9._-]{0,31}$'),
  source           text not null check (source in ('registration', 'in_app', 'test'))
);
comment on table ops.age_attestations is 'Accounts that confirmed they are 18 or older, with the wording version shown. One row per account, never edited; removed only with the account.';
alter table ops.age_attestations enable row level security;
revoke all on table ops.age_attestations from public, anon, authenticated;

create function ops.age_attestations_permanent()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'age attestations cannot be changed' using errcode = 'P0001';
end;
$$;
revoke all on function ops.age_attestations_permanent() from public, anon, authenticated;
create trigger age_attestations_permanent
before update on ops.age_attestations
for each row execute function ops.age_attestations_permanent();

create function ops.adult_attested(p_user uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (select 1 from ops.age_attestations t where t.user_id = p_user);
$$;
revoke all on function ops.adult_attested(uuid) from public, anon, authenticated;

create or replace function social.current_access()
returns uuid
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = 'P0001';
  end if;
  if not ops.member_access_active(v_uid) then
    raise exception 'no_pilot_access' using errcode = 'P0001', detail = 'Your pilot access is not active.';
  end if;
  if not ops.adult_attested(v_uid) then
    raise exception 'adult_attestation_required' using errcode = 'P0001', detail = 'Confirm that you are 18 or older to continue.';
  end if;
  return v_uid;
end;
$$;

-- The caller's own state, now including 'attestation_required' (active
-- membership, no adult confirmation yet).
create or replace function public.app_access_state()
returns table (status text, expires_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = 'P0001';
  end if;
  return query
  select case
           when a.user_id is null then 'none'
           when a.status = 'revoked' then 'revoked'
           when a.expires_at is not null and a.expires_at <= pg_catalog.now() then 'expired'
           when not ops.adult_attested(v_uid) then 'attestation_required'
           else 'active'
         end,
         case when a.status = 'active' then a.expires_at end
  from (select 1) one
  left join ops.member_access a on a.user_id = v_uid;
end;
$$;

-- A member with active access confirms they are 18 or older. Idempotent.
create function public.app_attest_adult(p_wording_version text)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_at timestamptz;
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = 'P0001';
  end if;
  if not ops.member_access_active(v_uid) then
    raise exception 'no_pilot_access' using errcode = 'P0001';
  end if;
  if p_wording_version is null or p_wording_version !~ '^[a-z0-9][a-z0-9._-]{0,31}$' then
    raise exception 'invalid_wording_version' using errcode = 'P0001';
  end if;
  insert into ops.age_attestations (user_id, wording_version, source)
  values (v_uid, p_wording_version, 'in_app')
  on conflict (user_id) do nothing;
  select t.attested_at into v_at from ops.age_attestations t where t.user_id = v_uid;
  return v_at;
end;
$$;
revoke all on function public.app_attest_adult(text) from public, anon;
grant execute on function public.app_attest_adult(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Registration settings and links

create table ops.registration_settings (
  id                      boolean primary key default true check (id),
  paused                  boolean not null default true,
  total_cap               integer not null default 200 check (total_cap between 0 and 100000),
  daily_cap               integer not null default 25 check (daily_cap between 0 and 10000),
  per_referrer_daily_cap  integer not null default 5 check (per_referrer_daily_cap between 0 and 1000),
  updated_at              timestamptz not null default pg_catalog.now(),
  updated_by              text not null default 'migration'
);
comment on table ops.registration_settings is 'Controlled registration (one row). Paused by default. Changed only through ops.set_registration_settings or the founder app function, always recorded.';
insert into ops.registration_settings (id) values (true);
alter table ops.registration_settings enable row level security;
revoke all on table ops.registration_settings from public, anon, authenticated;

create table ops.registration_setting_events (
  id          bigint generated always as identity primary key,
  changed_at  timestamptz not null default pg_catalog.now(),
  changed_by  text not null,
  reason      text,
  before      jsonb not null,
  after       jsonb not null
);
comment on table ops.registration_setting_events is 'Every change to the registration settings. Append-only.';
alter table ops.registration_setting_events enable row level security;
revoke all on table ops.registration_setting_events from public, anon, authenticated;
create trigger registration_setting_events_no_update
before update or delete on ops.registration_setting_events
for each row execute function ops.history_append_only();

create table ops.registration_links (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique check (code ~ '^[0-9a-f]{16}$'),
  kind        text not null check (kind in ('invitation', 'referral')),
  owner_id    uuid references auth.users (id) on delete cascade,
  creator_id  uuid references auth.users (id) on delete set null,
  cohort      text not null default 'fan' check (cohort in ('creator', 'fan', 'tester')),
  max_uses    integer check (max_uses is null or max_uses between 1 and 10000),
  uses        integer not null default 0 check (uses >= 0),
  expires_at  timestamptz,
  revoked_at  timestamptz,
  created_at  timestamptz not null default pg_catalog.now(),
  created_by  text not null,
  constraint registration_links_referral_owner check (kind <> 'referral' or (owner_id is not null and cohort = 'fan')),
  constraint registration_links_uses_within_max check (max_uses is null or uses <= max_uses)
);
comment on table ops.registration_links is 'Invitation links (founder) and referral links (one personal link per member). Codes are 64-bit random. Server code only.';
create unique index registration_links_one_referral_per_member on ops.registration_links (owner_id) where kind = 'referral' and revoked_at is null;
alter table ops.registration_links enable row level security;
revoke all on table ops.registration_links from public, anon, authenticated;

create table ops.registrations (
  user_id        uuid primary key references auth.users (id) on delete cascade,
  link_id        uuid references ops.registration_links (id) on delete set null,
  kind           text not null check (kind in ('invitation', 'referral')),
  referrer_id    uuid references auth.users (id) on delete set null,
  creator_id     uuid references auth.users (id) on delete set null,
  cohort         text not null,
  account_created_at timestamptz not null,
  claimed_at     timestamptz not null default pg_catalog.now()
);
comment on table ops.registrations is 'Accounts that joined through a registration link: the link, its kind, the referrer (first touch: the link the browser first opened and carried to sign-up) and the creator. One row per account, never changed. No points are awarded here.';
create index registrations_by_day on ops.registrations (claimed_at);
create index registrations_by_referrer on ops.registrations (referrer_id, claimed_at);
alter table ops.registrations enable row level security;
revoke all on table ops.registrations from public, anon, authenticated;
-- Registrations are never edited, except that deleting the referrer, the
-- creator or the link clears that reference (on delete set null), so deleting
-- an account is never blocked.
create function ops.registrations_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.user_id is distinct from old.user_id or new.kind is distinct from old.kind
     or new.cohort is distinct from old.cohort or new.account_created_at is distinct from old.account_created_at
     or new.claimed_at is distinct from old.claimed_at
     or (new.referrer_id is distinct from old.referrer_id and new.referrer_id is not null)
     or (new.creator_id is distinct from old.creator_id and new.creator_id is not null)
     or (new.link_id is distinct from old.link_id and new.link_id is not null) then
    raise exception 'registrations cannot be changed' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke all on function ops.registrations_guard() from public, anon, authenticated;
create trigger registrations_guard
before update on ops.registrations
for each row execute function ops.registrations_guard();

create table ops.blocked_email_domains (
  domain text primary key check (domain ~ '^[a-z0-9.-]+\.[a-z]{2,}$')
);
comment on table ops.blocked_email_domains is 'Disposable email domains refused at registration. Edited by the founder.';
insert into ops.blocked_email_domains (domain) values
  ('mailinator.com'), ('guerrillamail.com'), ('10minutemail.com'), ('tempmail.com'),
  ('temp-mail.org'), ('yopmail.com'), ('sharklasers.com'), ('trashmail.com'),
  ('getnada.com'), ('dispostable.com'), ('maildrop.cc'), ('throwawaymail.com');
alter table ops.blocked_email_domains enable row level security;
revoke all on table ops.blocked_email_domains from public, anon, authenticated;

-- Changes the settings (server code, the founder in the SQL editor, or the
-- founder app function below). Null leaves a value unchanged.
create function ops.set_registration_settings(
  p_actor text, p_reason text,
  p_paused boolean default null, p_total_cap integer default null,
  p_daily_cap integer default null, p_per_referrer_daily_cap integer default null
)
returns ops.registration_settings
language plpgsql
security definer
set search_path = ''
as $$
declare
  b ops.registration_settings;
  a ops.registration_settings;
begin
  if p_actor is null or pg_catalog.btrim(p_actor) = '' then
    raise exception 'actor_required' using errcode = 'P0001';
  end if;
  select * into b from ops.registration_settings where id for update;
  update ops.registration_settings s set
    paused = coalesce(p_paused, s.paused),
    total_cap = coalesce(p_total_cap, s.total_cap),
    daily_cap = coalesce(p_daily_cap, s.daily_cap),
    per_referrer_daily_cap = coalesce(p_per_referrer_daily_cap, s.per_referrer_daily_cap),
    updated_at = pg_catalog.now(),
    updated_by = p_actor
  where s.id
  returning * into a;
  insert into ops.registration_setting_events (changed_by, reason, before, after)
  values (p_actor, nullif(pg_catalog.btrim(coalesce(p_reason, '')), ''), pg_catalog.to_jsonb(b), pg_catalog.to_jsonb(a));
  return a;
end;
$$;
revoke all on function ops.set_registration_settings(text, text, boolean, integer, integer, integer) from public, anon, authenticated;

create function ops.new_link_code()
returns text
language sql
volatile
set search_path = ''
as $$
  select substr(replace(gen_random_uuid()::text, '-', ''), 1, 8) || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
$$;
revoke all on function ops.new_link_code() from public, anon, authenticated;

-- Creates an invitation link (server code or the founder). Returns the code.
create function ops.create_invitation_link(
  p_actor text, p_cohort text default 'fan', p_max_uses integer default 1,
  p_expires_in interval default interval '14 days', p_creator uuid default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text := ops.new_link_code();
begin
  if p_actor is null or pg_catalog.btrim(p_actor) = '' then
    raise exception 'actor_required' using errcode = 'P0001';
  end if;
  if p_expires_in is null or p_expires_in <= interval '0' or p_expires_in > interval '366 days' then
    raise exception 'invalid_expiry' using errcode = 'P0001';
  end if;
  insert into ops.registration_links (code, kind, cohort, max_uses, expires_at, creator_id, created_by)
  values (v_code, 'invitation', p_cohort, p_max_uses, pg_catalog.now() + p_expires_in, p_creator, p_actor);
  return v_code;
end;
$$;
revoke all on function ops.create_invitation_link(text, text, integer, interval, uuid) from public, anon, authenticated;

-- The single eligibility check used by the account creation hook and the
-- claim. Anonymous visitors can call nothing: the sign-up itself reports a
-- refused link through the hook's message. Status values: 'valid', 'invalid', 'paused',
-- 'closed' (external access not approved), 'full' (overall or daily cap),
-- 'referrer_limit'.
create function ops.registration_check(p_code text, out status text, out link ops.registration_links)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s ops.registration_settings;
  v_open boolean;
  v_today date := (pg_catalog.now() at time zone 'America/Toronto')::date;
begin
  status := 'invalid';
  select * into s from ops.registration_settings where id;
  select l.* into link from ops.registration_links l
  where l.code = lower(pg_catalog.btrim(coalesce(p_code, '')))
    and l.revoked_at is null
    and (l.expires_at is null or l.expires_at > pg_catalog.now())
    and (l.max_uses is null or l.uses < l.max_uses);
  if link.id is null then
    return;
  end if;
  if link.kind = 'referral' and not ops.member_access_active(link.owner_id) then
    link := null;
    return;
  end if;
  if s.paused then
    status := 'paused'; return;
  end if;
  select m.external_access_approved into v_open from ops.member_launch_settings m where m.id;
  if not coalesce(v_open, false) then
    status := 'closed'; return;
  end if;
  if (select count(*) from ops.registrations) >= s.total_cap
     or (select count(*) from ops.registrations r where (r.claimed_at at time zone 'America/Toronto')::date = v_today) >= s.daily_cap then
    status := 'full'; return;
  end if;
  if link.kind = 'referral' and (
       select count(*) from ops.registrations r
       where r.referrer_id = link.owner_id and (r.claimed_at at time zone 'America/Toronto')::date = v_today
     ) >= s.per_referrer_daily_cap then
    status := 'referrer_limit'; return;
  end if;
  status := 'valid';
end;
$$;
revoke all on function ops.registration_check(text) from public, anon, authenticated;


-- ---------------------------------------------------------------------------
-- 3. Account creation hook (Supabase Auth "before user created").
-- Allows an account when the email has an open founder invitation
-- (ops.invitations), or when the sign-up carries a valid registration code and
-- the adult confirmation and the email domain is not blocked.

-- Whether an email has an open founder invitation (kept in ops: only ops
-- code reads ops.invitations).
create function ops.open_invitation_exists(p_email text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from ops.invitations i
    where i.email = lower(pg_catalog.btrim(p_email)) and i.revoked_at is null
      and i.accepted_at is null and i.expires_at > pg_catalog.now()
  );
$$;
revoke all on function ops.open_invitation_exists(text) from public, anon, authenticated;

create function public.hook_before_user_created(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(pg_catalog.btrim(coalesce(event -> 'user' ->> 'email', '')));
  v_meta jsonb := coalesce(event -> 'user' -> 'user_metadata', '{}'::jsonb);
  v_status text;
  refuse constant text := '{"error":{"http_code":403,"message":"%s"}}';
begin
  if v_email <> '' and ops.open_invitation_exists(v_email) then
    return '{}'::jsonb;
  end if;
  if coalesce(v_meta ->> 'adult_attested', '') <> 'true' then
    return pg_catalog.format(refuse, 'Registration needs confirmation that you are 18 or older.')::jsonb;
  end if;
  if v_email = '' or exists (
    select 1 from ops.blocked_email_domains d where v_email like '%@' || d.domain
  ) then
    return pg_catalog.format(refuse, 'Please use a permanent email address.')::jsonb;
  end if;
  v_status := (ops.registration_check(v_meta ->> 'registration_code')).status;
  if v_status = 'valid' then
    return '{}'::jsonb;
  end if;
  return pg_catalog.format(refuse, case v_status
    when 'paused' then 'Registration is paused right now. Please join the waitlist.'
    when 'closed' then 'The pilot is not open to new members yet. Please join the waitlist.'
    when 'full' then 'The pilot is full for now. Please join the waitlist.'
    when 'referrer_limit' then 'This invitation link has been used a lot today. Please try again tomorrow.'
    else 'This invitation or referral link is not valid.'
  end)::jsonb;
end;
$$;
revoke all on function public.hook_before_user_created(jsonb) from public, anon, authenticated;
grant usage on schema public to supabase_auth_admin;
grant execute on function public.hook_before_user_created(jsonb) to supabase_auth_admin;

-- ---------------------------------------------------------------------------
-- 4. Claiming membership through a link (after email verification).
-- Results: 'active' (already a member, or granted now), 'link_required',
-- 'adult_required', 'not_confirmed', 'invalid', 'paused', 'closed', 'full',
-- 'referrer_limit', 'revoked', 'expired'. Errors: 'not_signed_in'.

create function public.app_claim_access(p_code text, p_adult_attested boolean, p_wording_version text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  a ops.member_access;
  u record;
  c record;
  v_code text;
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = 'P0001';
  end if;

  select * into a from ops.member_access where user_id = v_uid;
  if found then
    return case
      when a.status = 'revoked' then 'revoked'
      when a.expires_at is not null and a.expires_at <= pg_catalog.now() then 'expired'
      else 'active'
    end;
  end if;

  select x.email_confirmed_at, x.created_at, x.raw_user_meta_data into u from auth.users x where x.id = v_uid;
  if u.email_confirmed_at is null then
    return 'not_confirmed';
  end if;
  v_code := coalesce(nullif(pg_catalog.btrim(coalesce(p_code, '')), ''), u.raw_user_meta_data ->> 'registration_code');
  if v_code is null then
    return 'link_required';
  end if;
  if p_adult_attested is not true then
    return 'adult_required';
  end if;
  if p_wording_version is null or p_wording_version !~ '^[a-z0-9][a-z0-9._-]{0,31}$' then
    raise exception 'invalid_wording_version' using errcode = 'P0001';
  end if;

  -- One claim at a time, so the caps can't be passed by simultaneous claims.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('splitpost:registration_claim'));
  if exists (select 1 from ops.member_access where user_id = v_uid) then
    return 'active';
  end if;

  select * into c from ops.registration_check(v_code);
  if c.status <> 'valid' then
    return c.status;
  end if;

  begin
    insert into ops.age_attestations (user_id, wording_version, source)
    values (v_uid, p_wording_version, 'registration')
    on conflict (user_id) do nothing;
    insert into ops.registrations (user_id, link_id, kind, referrer_id, creator_id, cohort, account_created_at)
    values (v_uid, (c.link).id, (c.link).kind, case when (c.link).kind = 'referral' then (c.link).owner_id end,
            (c.link).creator_id, (c.link).cohort, u.created_at);
    update ops.registration_links set uses = uses + 1 where id = (c.link).id;
    insert into ops.member_access (user_id, cohort, status, updated_by, reason)
    values (v_uid, (c.link).cohort, 'active', 'self-service', (c.link).kind || ' link registration');
  exception when check_violation then
    -- The launch gate refused (external access closed meanwhile); nothing was kept.
    return 'closed';
  end;
  return 'active';
end;
$$;
comment on function public.app_claim_access(text, boolean, text) is 'Controlled registration: after email verification, the account claims membership through a valid invitation or referral link, within the registration limits, with its adult confirmation. Idempotent; never reopens a revoked or expired membership.';
revoke all on function public.app_claim_access(text, boolean, text) from public, anon;
grant execute on function public.app_claim_access(text, boolean, text) to authenticated;

-- A member's personal referral link (created on first request).
create function public.app_my_referral_link()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_member();
  v_code text;
begin
  select l.code into v_code from ops.registration_links l
  where l.owner_id = v_uid and l.kind = 'referral' and l.revoked_at is null;
  if v_code is null then
    insert into ops.registration_links (code, kind, owner_id, cohort, created_by)
    values (ops.new_link_code(), 'referral', v_uid, 'fan', 'member')
    on conflict do nothing;
    select l.code into v_code from ops.registration_links l
    where l.owner_id = v_uid and l.kind = 'referral' and l.revoked_at is null;
  end if;
  return v_code;
end;
$$;
revoke all on function public.app_my_referral_link() from public, anon;
grant execute on function public.app_my_referral_link() to authenticated;

-- Founder: read and change the registration settings, and create invitation links.
create function public.app_founder_registration()
returns table (paused boolean, total_cap integer, daily_cap integer, per_referrer_daily_cap integer,
               registered_total bigint, registered_today bigint, external_access_approved boolean,
               updated_at timestamptz, updated_by text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_founder();
begin
  return query
  select s.paused, s.total_cap, s.daily_cap, s.per_referrer_daily_cap,
         (select count(*) from ops.registrations),
         (select count(*) from ops.registrations r
          where (r.claimed_at at time zone 'America/Toronto')::date = (pg_catalog.now() at time zone 'America/Toronto')::date),
         coalesce((select m.external_access_approved from ops.member_launch_settings m where m.id), false),
         s.updated_at, s.updated_by
  from ops.registration_settings s where s.id;
end;
$$;
revoke all on function public.app_founder_registration() from public, anon;
grant execute on function public.app_founder_registration() to authenticated;

create function public.app_founder_set_registration(
  p_paused boolean, p_total_cap integer, p_daily_cap integer, p_per_referrer_daily_cap integer, p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_founder();
begin
  perform ops.set_registration_settings('founder:' || v_uid::text, p_reason, p_paused, p_total_cap, p_daily_cap, p_per_referrer_daily_cap);
end;
$$;
revoke all on function public.app_founder_set_registration(boolean, integer, integer, integer, text) from public, anon;
grant execute on function public.app_founder_set_registration(boolean, integer, integer, integer, text) to authenticated;

create function public.app_founder_create_invitation_link(p_cohort text, p_max_uses integer, p_days integer)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_founder();
begin
  if p_days is null or p_days not between 1 and 366 then
    raise exception 'invalid_expiry' using errcode = 'P0001';
  end if;
  return ops.create_invitation_link('founder:' || v_uid::text, coalesce(p_cohort, 'fan'), p_max_uses, pg_catalog.make_interval(days => p_days));
end;
$$;
revoke all on function public.app_founder_create_invitation_link(text, integer, integer) from public, anon;
grant execute on function public.app_founder_create_invitation_link(text, integer, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Events: one table, written by the server.

create table analytics.events (
  id           bigint generated always as identity primary key,
  name         text not null check (name ~ '^[a-z][a-z_]{2,40}$'),
  occurred_at  timestamptz not null default pg_catalog.now(),
  actor_id     uuid references auth.users (id) on delete set null,
  creator_id   uuid references auth.users (id) on delete set null,
  post_id      uuid,
  data_class   text not null check (data_class in ('actual', 'founder', 'test', 'simulated')),
  props        jsonb not null default '{}'::jsonb check (pg_catalog.pg_column_size(props) <= 2048)
);
comment on table analytics.events is 'Unified event stream (INT-C01). Written only by server triggers on the authoritative tables, so each action is recorded once. data_class: actual, founder (genuine founder activity, reported separately), test (tester cohort), simulated. Environment separation is by database: staging events never reach Production.';
create index events_by_name_time on analytics.events (name, occurred_at);
create index events_by_actor_time on analytics.events (actor_id, occurred_at);
create index events_by_creator_time on analytics.events (creator_id, occurred_at);
alter table analytics.events enable row level security;
revoke all on table analytics.events from public, anon, authenticated;

create function analytics.class_for(p_user uuid)
returns text
language sql
stable
set search_path = ''
as $$
  select case (select a.cohort from ops.member_access a where a.user_id = p_user)
           when 'tester' then 'test'
           when 'founder' then 'founder'
           else 'actual'
         end;
$$;
revoke all on function analytics.class_for(uuid) from public, anon, authenticated;

create function analytics.record(p_name text, p_actor uuid, p_creator uuid, p_post uuid, p_props jsonb default '{}'::jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into analytics.events (name, actor_id, creator_id, post_id, data_class, props)
  values (p_name, p_actor, p_creator, p_post, analytics.class_for(p_actor), coalesce(p_props, '{}'::jsonb));
$$;
revoke all on function analytics.record(text, uuid, uuid, uuid, jsonb) from public, anon, authenticated;

create function analytics.capture()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_author uuid;
begin
  if tg_table_name = 'posts' then
    if tg_op = 'INSERT' then
      perform analytics.record('post_created', new.author_id, new.author_id, new.id,
        pg_catalog.jsonb_build_object('media', coalesce(to_jsonb(new) ->> 'media_kind', 'text')));
    elsif tg_op = 'UPDATE' and old.deleted_at is null and new.deleted_at is not null then
      perform analytics.record('post_deleted', new.author_id, new.author_id, new.id);
    end if;
  elsif tg_table_name = 'comments' then
    select p.author_id into v_author from social.posts p where p.id = coalesce(new.post_id, old.post_id);
    if tg_op = 'INSERT' then
      perform analytics.record('comment_added', new.author_id, v_author, new.post_id);
    elsif tg_op = 'UPDATE' and old.deleted_at is null and new.deleted_at is not null then
      perform analytics.record('comment_deleted', new.author_id, v_author, new.post_id);
    end if;
  elsif tg_table_name = 'likes' then
    if tg_op = 'INSERT' then
      select p.author_id into v_author from social.posts p where p.id = new.post_id;
      perform analytics.record('post_liked', new.user_id, v_author, new.post_id);
    else
      -- A like removed by an account or post deletion is not an "unlike":
      -- record nothing, so deleting an account is never blocked.
      select p.author_id into v_author from social.posts p where p.id = old.post_id;
      if v_author is not null and exists (select 1 from auth.users x where x.id = old.user_id) then
        perform analytics.record('post_unliked', old.user_id, v_author, old.post_id);
      end if;
    end if;
  elsif tg_table_name = 'follow_events' then
    perform analytics.record(new.action, new.follower_id, new.creator_id, null);
  elsif tg_table_name = 'clique_members' then
    if tg_op = 'INSERT' then
      perform analytics.record('clique_joined', new.fan_id, new.creator_id, null);
    elsif tg_op = 'UPDATE' and old.removed_at is null and new.removed_at is not null then
      perform analytics.record('clique_left', new.fan_id, new.creator_id, null,
        pg_catalog.jsonb_build_object('reason', new.removal_reason));
    end if;
  elsif tg_table_name = 'registrations' then
    perform analytics.record('registered', new.user_id, new.creator_id, null,
      pg_catalog.jsonb_build_object('kind', new.kind, 'referred', new.referrer_id is not null));
  end if;
  return null;
end;
$$;
revoke all on function analytics.capture() from public, anon, authenticated;

create trigger events_posts after insert or update of deleted_at on social.posts
for each row execute function analytics.capture();
create trigger events_comments after insert or update of deleted_at on social.comments
for each row execute function analytics.capture();
create trigger events_likes after insert or delete on social.likes
for each row execute function analytics.capture();
create trigger events_follow_events after insert on social.follow_events
for each row execute function analytics.capture();
create trigger events_clique_members after insert or update of removed_at on social.clique_members
for each row execute function analytics.capture();
create trigger events_registrations after insert on ops.registrations
for each row execute function analytics.capture();

-- ---------------------------------------------------------------------------
-- 6. Home paging on (created_at, id), with the My Clique filter.

create function public.app_feed_page(
  p_before_at timestamptz default null, p_before_id uuid default null,
  p_limit integer default 20, p_filter text default 'all'
)
returns table (
  id uuid, author_id uuid, author_username text, author_display_name text,
  body text, created_at timestamptz, like_count bigint, comment_count bigint,
  liked_by_me boolean, author_in_my_clique boolean, is_mine boolean, media jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_member();
begin
  if (p_before_at is null) <> (p_before_id is null) then
    raise exception 'invalid_cursor' using errcode = 'P0001';
  end if;
  if coalesce(p_filter, 'all') not in ('all', 'clique') then
    raise exception 'invalid_filter' using errcode = 'P0001';
  end if;
  return query
  select s.id, s.author_id, p.username, p.display_name, s.body, s.created_at,
         (select count(*) from social.likes l where l.post_id = s.id),
         (select count(*) from social.comments c where c.post_id = s.id and c.deleted_at is null),
         exists (select 1 from social.likes l where l.post_id = s.id and l.user_id = v_uid),
         exists (select 1 from social.clique_members m where m.fan_id = v_uid and m.creator_id = s.author_id and m.removed_at is null),
         s.author_id = v_uid,
         social.post_media_json(s.id)
  from social.posts s
  join social.visible_members p on p.id = s.author_id
  where s.deleted_at is null
    and case when coalesce(p_filter, 'all') = 'clique'
             then exists (select 1 from social.clique_members m where m.fan_id = v_uid and m.creator_id = s.author_id and m.removed_at is null)
             else (s.author_id = v_uid or exists (select 1 from social.follows f where f.follower_id = v_uid and f.creator_id = s.author_id))
        end
    and (p_before_at is null or (s.created_at, s.id) < (p_before_at, p_before_id))
  order by s.created_at desc, s.id desc
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
end;
$$;
revoke all on function public.app_feed_page(timestamptz, uuid, integer, text) from public, anon;
grant execute on function public.app_feed_page(timestamptz, uuid, integer, text) to authenticated;

create function public.app_member_posts_page(
  p_member uuid, p_before_at timestamptz default null, p_before_id uuid default null, p_limit integer default 20
)
returns table (
  id uuid, author_id uuid, author_username text, author_display_name text,
  body text, created_at timestamptz, like_count bigint, comment_count bigint,
  liked_by_me boolean, author_in_my_clique boolean, is_mine boolean, media jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_member();
begin
  if (p_before_at is null) <> (p_before_id is null) then
    raise exception 'invalid_cursor' using errcode = 'P0001';
  end if;
  return query
  select s.id, s.author_id, p.username, p.display_name, s.body, s.created_at,
         (select count(*) from social.likes l where l.post_id = s.id),
         (select count(*) from social.comments c where c.post_id = s.id and c.deleted_at is null),
         exists (select 1 from social.likes l where l.post_id = s.id and l.user_id = v_uid),
         exists (select 1 from social.clique_members m where m.fan_id = v_uid and m.creator_id = s.author_id and m.removed_at is null),
         s.author_id = v_uid,
         social.post_media_json(s.id)
  from social.posts s
  join social.visible_members p on p.id = s.author_id
  where s.deleted_at is null
    and s.author_id = p_member
    and (p_before_at is null or (s.created_at, s.id) < (p_before_at, p_before_id))
  order by s.created_at desc, s.id desc
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
end;
$$;
revoke all on function public.app_member_posts_page(uuid, timestamptz, uuid, integer) from public, anon;
grant execute on function public.app_member_posts_page(uuid, timestamptz, uuid, integer) to authenticated;
