-- Phase 2: the Crevant waitlist (infrastructure only, switched OFF).
--
-- One unified waitlist. Nobody picks "creator" or "supporter": Crevant is one
-- network where everyone can create, discover, follow, engage and support.
-- Optional answers (interests, whether someone shares content, platform,
-- audience size, a public link) help choose pilot participants internally;
-- private selection notes per invitation wave never become account roles.
--
--   ops.settings               server-side switches; waitlist submissions OFF
--   ops.waitlist               one row per email address
--   ops.waitlist_consents      every consent given or withdrawn, with the
--                              privacy notice version shown at the time
--   ops.waitlist_selections    private notes per invitation wave
--   ops.waitlist_rate_limits   counters for server-side rate limiting
--                              (hashed keys only, never an IP address)
--   ops.join_waitlist()        validate, rate limit and store one submission
--   ops.waitlist_delete()      delete one person on request
--   ops.waitlist_purge_expired()  retention: delete entries with no confirmed
--                              interest for N months (proposed: 12)
--   public.waitlist_submit()   the only entry point the server function can
--                              call through the Data API; service_role only
--
-- Everything lives in the private ops schema, locked to server code exactly
-- like ops.invitations. Members and anonymous visitors can't read, write or
-- call any of it. Submissions stay closed until the founder approves the
-- privacy notice, legal operator, contact address, retention policy and
-- activation (docs/WAITLIST.md).
--
-- This migration changes no Supabase Auth configuration and sends no email.

-- ---------------------------------------------------------------------------
-- Server-side switches. Rows are changed only by server code; the waitlist
-- row starts (and must stay) disabled until activation is approved.

create table ops.settings (
  key        text primary key,
  enabled    boolean not null default false,
  updated_at timestamptz not null default now(),
  note       text,
  constraint settings_key_format check (key ~ '^[a-z0-9_]{1,60}$')
);
comment on table ops.settings is 'Server-side switches. waitlist_submissions stays false until the founder approves activation.';

insert into ops.settings (key, enabled, note)
values ('waitlist_submissions', false, 'Off until the privacy notice, legal operator, contact address, retention policy and activation are approved.');

-- ---------------------------------------------------------------------------
-- The waitlist.

create table ops.waitlist (
  id                        uuid primary key default gen_random_uuid(),
  email                     text not null,
  interests                 text[] not null default '{}',
  shares_content            text,
  platform                  text,
  audience_band             text,
  public_link               text,
  source                    text,
  campaign                  text,
  age_confirmed             boolean not null,
  waitlist_consent_version  text not null,
  waitlist_consented_at     timestamptz not null,
  marketing_consent         boolean not null default false,
  marketing_consent_version text,
  marketing_consented_at    timestamptz,
  first_joined_at           timestamptz not null default now(),
  last_confirmed_at         timestamptz not null default now(),
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
  constraint waitlist_link_format check (public_link is null or (public_link ~ '^https://[^\s<>"]+$' and length(public_link) <= 200)),
  constraint waitlist_creator_details_need_yes check (
    shares_content = 'yes' or (platform is null and audience_band is null and public_link is null)
  ),
  constraint waitlist_source_format check (source is null or source ~ '^[a-z0-9_-]{1,40}$'),
  constraint waitlist_campaign_format check (campaign is null or campaign ~ '^[a-z0-9_-]{1,60}$'),
  constraint waitlist_adults_only check (age_confirmed),
  constraint waitlist_consent_version_format check (waitlist_consent_version ~ '^[a-z0-9._-]{1,40}$'),
  constraint waitlist_marketing_consistent check (
    (marketing_consent and marketing_consent_version ~ '^[a-z0-9._-]{1,40}$' and marketing_consented_at is not null)
    or (not marketing_consent and marketing_consent_version is null and marketing_consented_at is null)
  ),
  constraint waitlist_status_allowed check (status in ('new', 'shortlisted', 'invited', 'not_selected'))
);
comment on table ops.waitlist is 'One row per email address. Optional answers are for internal pilot selection only and never decide account capabilities. Server code only.';
comment on column ops.waitlist.last_confirmed_at is 'Last time this person confirmed interest (by joining again). Retention is measured from here (proposed: 12 months).';
comment on column ops.waitlist.status is 'Internal recruitment status. Not a role and never copied to an account.';

create index waitlist_last_confirmed_idx on ops.waitlist (last_confirmed_at);

-- Every consent given or withdrawn, with the privacy notice version shown.
create table ops.waitlist_consents (
  id              bigint generated always as identity primary key,
  waitlist_id     uuid not null references ops.waitlist (id) on delete cascade,
  kind            text not null,
  granted         boolean not null,
  notice_version  text not null,
  recorded_at     timestamptz not null default now(),
  constraint waitlist_consents_kind check (kind in ('waitlist', 'marketing')),
  constraint waitlist_consents_version_format check (notice_version ~ '^[a-z0-9._-]{1,40}$')
);
comment on table ops.waitlist_consents is 'Consent history: what was agreed or withdrawn, under which privacy notice version, and when. Deleted with the person.';

create index waitlist_consents_person_idx on ops.waitlist_consents (waitlist_id);

-- Private notes per invitation wave. Never shown to the person, never copied
-- to an account, and cleared when a wave is done.
create table ops.waitlist_selections (
  waitlist_id uuid not null references ops.waitlist (id) on delete cascade,
  wave        text not null,
  note        text,
  created_at  timestamptz not null default now(),
  primary key (waitlist_id, wave),
  constraint waitlist_selections_wave_format check (wave ~ '^[a-z0-9_-]{1,40}$'),
  constraint waitlist_selections_note_length check (note is null or length(note) <= 500)
);
comment on table ops.waitlist_selections is 'Private selection notes per invitation wave. Not a role; never shown to the person or copied to an account.';

-- Rate limit counters. Keys are hashes (of an email, or of a client address
-- salted by the server function), never the raw value.
create table ops.waitlist_rate_limits (
  bucket       text not null,
  window_start timestamptz not null,
  hits         integer not null default 0,
  primary key (bucket, window_start),
  constraint waitlist_rate_bucket_format check (bucket ~ '^(global|email:[0-9a-f]{32}|client:[0-9a-f]{64})$')
);
comment on table ops.waitlist_rate_limits is 'Server-side rate limit counters keyed by hashes only. Rows older than two days are removed on each submission.';

alter table ops.settings enable row level security;
alter table ops.waitlist enable row level security;
alter table ops.waitlist_consents enable row level security;
alter table ops.waitlist_selections enable row level security;
alter table ops.waitlist_rate_limits enable row level security;
-- No policies on purpose: only service_role (which bypasses row level
-- security) can read or write these tables.

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
-- One submission. Returns only 'ok', 'closed', 'invalid' or 'rate_limited',
-- and the same 'ok' whether the address is new or already on the list, so
-- nobody can find out who has joined.

create function ops.join_waitlist(
  p_email               text,
  p_interests           text[],
  p_shares_content      text,
  p_platform            text,
  p_audience_band       text,
  p_public_link         text,
  p_source              text,
  p_campaign            text,
  p_age_confirmed       boolean,
  p_waitlist_consent    boolean,
  p_notice_version      text,
  p_marketing_consent   boolean,
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
  v_link      text := nullif(btrim(coalesce(p_public_link, '')), '');
  v_source    text := nullif(lower(btrim(coalesce(p_source, ''))), '');
  v_campaign  text := nullif(lower(btrim(coalesce(p_campaign, ''))), '');
  v_marketing boolean := coalesce(p_marketing_consent, false);
  v_previous  ops.waitlist%rowtype;
  v_id        uuid;
begin
  -- Server-side switch: closed means nothing is stored or counted.
  if not coalesce((select enabled from ops.settings where key = 'waitlist_submissions'), false) then
    return 'closed';
  end if;

  -- Required: a valid email, 18+ and waitlist consent under a known notice version.
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(v_email) > 254
     or coalesce(p_age_confirmed, false) is false
     or coalesce(p_waitlist_consent, false) is false
     or coalesce(p_notice_version, '') !~ '^[a-z0-9._-]{1,40}$' then
    return 'invalid';
  end if;

  -- Optional answers must use known values; unknown or unused ones are rejected.
  if not (v_interests <@ array['reach_followers', 'closer_community', 'support_creators', 'discover_creators', 'sustainable_income', 'shape_platform']::text[])
     or cardinality(v_interests) > 6
     or (v_shares is not null and v_shares not in ('yes', 'not_yet'))
     or (v_platform is not null and v_platform not in ('youtube', 'tiktok', 'instagram', 'twitch', 'x', 'facebook', 'podcast', 'newsletter', 'other'))
     or (v_audience is not null and v_audience not in ('under_1k', '1k_10k', '10k_100k', 'over_100k'))
     or (v_link is not null and (v_link !~ '^https://[^\s<>"]+$' or length(v_link) > 200))
     or (coalesce(v_shares, '') <> 'yes' and (v_platform is not null or v_audience is not null or v_link is not null)) then
    return 'invalid';
  end if;
  -- Unknown labels are dropped rather than refused, so a bad link still works.
  if v_source is not null and v_source !~ '^[a-z0-9_-]{1,40}$' then v_source := null; end if;
  if v_campaign is not null and v_campaign !~ '^[a-z0-9_-]{1,60}$' then v_campaign := null; end if;
  if p_client_key is not null and p_client_key !~ '^[0-9a-f]{64}$' then
    return 'invalid';
  end if;

  -- Rate limits: the whole service, each client (hashed by the server
  -- function) and each email address.
  delete from ops.waitlist_rate_limits where window_start < now() - interval '2 days';
  if ops.waitlist_rate_hit('global', interval '1 minute', 60) then
    return 'rate_limited';
  end if;
  if p_client_key is not null and ops.waitlist_rate_hit('client:' || p_client_key, interval '1 hour', 10) then
    return 'rate_limited';
  end if;
  if ops.waitlist_rate_hit('email:' || md5(v_email), interval '1 day', 3) then
    return 'rate_limited';
  end if;

  select * into v_previous from ops.waitlist where email = v_email;

  insert into ops.waitlist as w (
    email, interests, shares_content, platform, audience_band, public_link, source, campaign,
    age_confirmed, waitlist_consent_version, waitlist_consented_at,
    marketing_consent, marketing_consent_version, marketing_consented_at
  )
  values (
    v_email, v_interests, v_shares, v_platform, v_audience, v_link, v_source, v_campaign,
    true, p_notice_version, now(),
    v_marketing, case when v_marketing then p_notice_version end, case when v_marketing then now() end
  )
  on conflict (email) do update set
    interests                 = excluded.interests,
    shares_content            = excluded.shares_content,
    platform                  = excluded.platform,
    audience_band             = excluded.audience_band,
    public_link               = excluded.public_link,
    -- Keep where someone first came from.
    source                    = coalesce(w.source, excluded.source),
    campaign                  = coalesce(w.campaign, excluded.campaign),
    age_confirmed             = true,
    waitlist_consent_version  = excluded.waitlist_consent_version,
    waitlist_consented_at     = excluded.waitlist_consented_at,
    marketing_consent         = excluded.marketing_consent,
    marketing_consent_version = excluded.marketing_consent_version,
    marketing_consented_at    = excluded.marketing_consented_at,
    last_confirmed_at         = now()
  returning w.id into v_id;

  -- Consent history: waitlist consent every time; marketing when given, or
  -- when someone who had given it now leaves it unticked (withdrawal).
  insert into ops.waitlist_consents (waitlist_id, kind, granted, notice_version)
  values (v_id, 'waitlist', true, p_notice_version);
  if v_marketing or coalesce(v_previous.marketing_consent, false) then
    insert into ops.waitlist_consents (waitlist_id, kind, granted, notice_version)
    values (v_id, 'marketing', v_marketing, p_notice_version);
  end if;

  return 'ok';
end;
$$;

-- The server function's entry point through the Data API (ops itself is not
-- exposed). Callable by service_role only.
create function public.waitlist_submit(
  p_email               text,
  p_interests           text[],
  p_shares_content      text,
  p_platform            text,
  p_audience_band       text,
  p_public_link         text,
  p_source              text,
  p_campaign            text,
  p_age_confirmed       boolean,
  p_waitlist_consent    boolean,
  p_notice_version      text,
  p_marketing_consent   boolean,
  p_client_key          text
)
returns text
language sql
set search_path = ''
as $$
  select ops.join_waitlist(
    p_email, p_interests, p_shares_content, p_platform, p_audience_band, p_public_link, p_source, p_campaign,
    p_age_confirmed, p_waitlist_consent, p_notice_version, p_marketing_consent, p_client_key
  );
$$;
comment on function public.waitlist_submit is 'Waitlist entry point for the join-waitlist server function. service_role only; members and visitors cannot call it.';

-- ---------------------------------------------------------------------------
-- Deletion on request, by waitlist id (found in the Supabase dashboard), so an
-- email address never has to be typed into GitHub. Removes the waitlist row,
-- its consent history and selection notes, its rate limit counter, and any
-- invitation for that address that hasn't been accepted. Accepted invitations
-- belong to an account and follow account deletion instead.

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
  delete from ops.waitlist_rate_limits where bucket = 'email:' || md5(v_email);
  delete from ops.waitlist where id = p_id;
  get diagnostics n_waitlist = row_count;
  return jsonb_build_object('waitlist', n_waitlist, 'open_invitations', n_invitations);
end;
$$;

-- Retention: delete everyone whose last confirmed interest is older than the
-- given number of months (proposed policy: 12, subject to legal review).
create function ops.waitlist_purge_expired(p_months integer default 12)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  n integer;
begin
  if p_months is null or p_months < 1 then
    raise exception 'retention must be at least one month';
  end if;
  delete from ops.waitlist where last_confirmed_at < now() - make_interval(months => p_months);
  get diagnostics n = row_count;
  delete from ops.waitlist_rate_limits where window_start < now() - interval '2 days';
  return n;
end;
$$;

-- Demand measurement without email addresses: counts only.
create view ops.waitlist_summary as
select
  date_trunc('day', first_joined_at)::date as joined_on,
  coalesce(source, 'unknown')              as source,
  coalesce(shares_content, 'unanswered')   as shares_content,
  coalesce(audience_band, 'unanswered')    as audience_band,
  count(*)                                 as people,
  count(*) filter (where marketing_consent) as marketing_opt_in
from ops.waitlist
group by 1, 2, 3, 4;
comment on view ops.waitlist_summary is 'Daily counts by source and answers, with no email addresses. Server code only.';

-- ---------------------------------------------------------------------------
-- Privileges. ops tables and functions are server-only by the schema's default
-- privileges; state it explicitly too. public.waitlist_submit would otherwise
-- inherit Supabase's default grant to anon and authenticated, so revoke it.

revoke all on ops.settings, ops.waitlist, ops.waitlist_consents, ops.waitlist_selections, ops.waitlist_rate_limits, ops.waitlist_summary
  from public, anon, authenticated;
grant all on ops.settings, ops.waitlist, ops.waitlist_consents, ops.waitlist_selections, ops.waitlist_rate_limits, ops.waitlist_summary
  to service_role;

revoke all on function ops.waitlist_rate_hit(text, interval, integer) from public, anon, authenticated;
revoke all on function ops.join_waitlist(text, text[], text, text, text, text, text, text, boolean, boolean, text, boolean, text) from public, anon, authenticated;
revoke all on function ops.waitlist_delete(uuid) from public, anon, authenticated;
revoke all on function ops.waitlist_purge_expired(integer) from public, anon, authenticated;
revoke all on function public.waitlist_submit(text, text[], text, text, text, text, text, text, boolean, boolean, text, boolean, text) from public, anon, authenticated;

grant execute on function ops.waitlist_rate_hit(text, interval, integer) to service_role;
grant execute on function ops.join_waitlist(text, text[], text, text, text, text, text, text, boolean, boolean, text, boolean, text) to service_role;
grant execute on function ops.waitlist_delete(uuid) to service_role;
grant execute on function ops.waitlist_purge_expired(integer) to service_role;
grant execute on function public.waitlist_submit(text, text[], text, text, text, text, text, text, boolean, boolean, text, boolean, text) to service_role;
