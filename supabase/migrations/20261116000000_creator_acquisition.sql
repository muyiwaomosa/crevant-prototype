-- Creator–fan acquisition: waitlist attribution, accepted-creator invitation
-- links and acquisition measurement. Infrastructure only, everything OFF.
--
--   ops.waitlist (new columns)   intent (create / discover / both), whether a
--                                creator introduced the person (yes / no only:
--                                no name or handle is ever asked for or
--                                stored), and a server-resolved creator link
--   ops.pilot_creators           creators accepted into the pilot. A pilot
--                                programme record, not an account role.
--   ops.creator_links            creator-specific invitation links: opaque
--                                random codes, expiry and revocation
--   ops.creator_link_redemptions an account that joined through a link; its
--                                follow decision stays 'pending' until
--                                real-account follows exist
--   ops.acquisition_events       counts for measurement: no email, no
--                                account id, no address, no free text
--   waitlist_api.submit_v2       the waitlist entry point with the new fields
--   waitlist_api.invite_preview  for the public site: whether a link is usable
--                                and the creator's agreed public name, nothing
--                                else; counts an estimated link visit
--   waitlist_api.admin_*         founder/admin only: accept creators, set the
--                                public name they agreed to, issue links
--                                (90 days by default) and revoke them
--   waitlist_api.admin_acquisition_summary   counts only
--   waitlist_api.admin_purge_acquisition_events  manual retention purge of
--                                the hourly counts (proposed 90 days)
--
-- Nothing existing is redefined: ops.join_waitlist and waitlist_api.submit
-- stay exactly as the waitlist migrations made them, so this migration can be
-- removed on its own (scripts/db/staging-rollback-acquisition.sql).
--
-- Four concepts stay separate, by design:
--   1. Self-reported attribution. "A creator introduced me" (yes / no) is what a
--      visitor said. It names nobody, and never creates a
--      verified referral, a follow, Connection Points or any entitlement.
--   2. Verified invitation. A link issued to an ACCEPTED pilot creator,
--      resolved by the server. Unknown, expired or revoked codes, or a
--      creator who is no longer accepted, resolve to nothing and the signup
--      carries on unattributed.
--   3. Following. Only ever the person's own explicit choice. A redemption
--      stays 'pending' (enforced); nothing here follows anyone or records a
--      follow, because real-account follows don't exist yet.
--   4. Connection Points and any future monetary eligibility. Nothing here
--      creates, references or implies either.
--
-- Nothing in this migration turns anything on: the waitlist switch, the
-- notice version and the function switch are unchanged, no link exists until
-- one is created by hand, and no email is sent. This migration changes no
-- Supabase Auth configuration and creates no login role.

-- ---------------------------------------------------------------------------
-- Pilot creators.

create table ops.pilot_creators (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  status      text not null default 'accepted',
  -- The creator's primary content categories, from a fixed list. At most three.
  categories  text[] not null default '{}',
  accepted_at timestamptz not null default now(),
  accepted_by uuid references auth.users (id) on delete set null,
  -- The name shown to someone holding one of this creator's links ("Priya
  -- invited you"). Set by an admin only once the creator has agreed to it;
  -- with no name, a valid link shows a generic invitation instead. Never the
  -- creator's email, username or account id.
  public_name           text,
  public_name_agreed_at timestamptz,
  constraint pilot_creators_status_allowed check (status in ('accepted', 'paused', 'removed')),
  constraint pilot_creators_categories_allowed check (
    cardinality(categories) <= 3
    and categories <@ array['food', 'money', 'travel', 'tech', 'music', 'art', 'fitness', 'books', 'wellness']::text[]
  ),
  constraint pilot_creators_public_name_agreed check ((public_name is null) = (public_name_agreed_at is null)),
  -- A display name: letters, numbers, spaces and @ . _ ' -. No links, email
  -- addresses or phone numbers.
  constraint pilot_creators_public_name_format check (
    public_name is null or (
      char_length(public_name) between 1 and 40
      and public_name = btrim(public_name)
      and public_name ~ '^[[:alnum:]@._''’ -]+$'
      and public_name !~* '(https?|www\.|\.(com|net|org|io|co|app|me|tv|gg|ly)\M)'
      and public_name !~ '[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+'
      and public_name !~ '[0-9]{7,}'
    )
  )
);
comment on table ops.pilot_creators is 'Creators accepted into the pilot. A programme record, never an account role: it decides only who may hold active invitation links.';

-- ---------------------------------------------------------------------------
-- Creator invitation links.
--
-- The code is random (80 bits, from two random UUIDs), so it reveals nothing
-- about the creator: not their id, username or email. Only an admin issues
-- links (waitlist_api.admin_issue_creator_link): 90 days by default, a year
-- at most, revoked explicitly and never un-revoked.

create table ops.creator_links (
  id          uuid primary key default gen_random_uuid(),
  creator_id  uuid not null references ops.pilot_creators (user_id) on delete cascade,
  code        text not null,
  campaign    text,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  revoked_at  timestamptz,
  constraint creator_links_code_format check (code ~ '^[0-9a-f]{20}$'),
  constraint creator_links_code_unique unique (code),
  constraint creator_links_campaign_format check (campaign is null or campaign ~ '^[a-z0-9_-]{1,60}$'),
  constraint creator_links_expiry_after_creation check (expires_at > created_at),
  constraint creator_links_expiry_within_a_year check (expires_at <= created_at + interval '366 days')
);
comment on table ops.creator_links is 'Invitation links for accepted pilot creators. Random codes; expire; can be revoked. Server code only.';

create index creator_links_creator_idx on ops.creator_links (creator_id);

-- Only an ACCEPTED creator can hold an active link: creating a link, or
-- un-revoking or extending one, is refused otherwise.
create function ops.creator_links_require_accepted_creator()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and old.revoked_at is not null and new.revoked_at is null then
    raise exception 'a revoked link stays revoked; issue a new one instead'
      using errcode = 'check_violation';
  end if;
  if new.revoked_at is null and not exists (
    select 1 from ops.pilot_creators c where c.user_id = new.creator_id and c.status = 'accepted'
  ) then
    raise exception 'only creators accepted into the pilot can hold an active invitation link'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger creator_links_require_accepted_creator
  before insert or update of creator_id, revoked_at, expires_at on ops.creator_links
  for each row execute function ops.creator_links_require_accepted_creator();

-- Creates a link for an accepted creator. Called only through
-- waitlist_api.admin_issue_creator_link (the founder's admin login).
create function ops.create_creator_link(p_creator uuid, p_days integer default 90, p_campaign text default null)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_code text;
begin
  if p_days is null or p_days < 1 or p_days > 365 then
    raise exception 'a link must last between 1 and 365 days';
  end if;
  v_code := substr(replace(gen_random_uuid()::text, '-', ''), 1, 12) || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
  insert into ops.creator_links (creator_id, code, campaign, expires_at)
  values (p_creator, v_code, p_campaign, now() + make_interval(days => p_days));
  return v_code;
end;
$$;

-- What a code means right now. Never raises; anything unusable is a status.
--   valid             an active link of an accepted creator
--   unknown           not a well-formed code, or no such link
--   expired / revoked the link itself is no longer usable
--   creator_inactive  the creator is paused or removed from the pilot
create function ops.resolve_creator_link(p_code text)
returns table (status text, link_id uuid, creator_id uuid)
language sql
stable
set search_path = ''
as $$
  with l as (
    select l.id, l.creator_id, l.expires_at, l.revoked_at, c.status as creator_status
    from ops.creator_links l
    join ops.pilot_creators c on c.user_id = l.creator_id
    where p_code ~ '^[0-9a-f]{20}$' and l.code = p_code
  )
  select
    case
      when not exists (select 1 from l) then 'unknown'
      when (select revoked_at from l) is not null then 'revoked'
      when (select expires_at from l) <= now() then 'expired'
      when (select creator_status from l) <> 'accepted' then 'creator_inactive'
      else 'valid'
    end,
    case when (select revoked_at from l) is null and (select expires_at from l) > now() and (select creator_status from l) = 'accepted'
         then (select id from l) end,
    case when (select revoked_at from l) is null and (select expires_at from l) > now() and (select creator_status from l) = 'accepted'
         then (select creator_id from l) end;
$$;

-- ---------------------------------------------------------------------------
-- Waitlist: recruitment intent and attribution.

alter table ops.waitlist
  -- How someone plans to use Splitpost. Recruitment only: never a role,
  -- never copied to an account, never decides what anyone can do.
  add column intent text,
  -- Their answer to "Did a creator introduce you to Splitpost?" (null: skipped).
  add column introduced_by_creator boolean,
  -- A verified invitation link, resolved by the server at signup. Never taken
  -- from the visitor as an id.
  add column creator_link_id uuid references ops.creator_links (id) on delete set null,
  add constraint waitlist_intent_allowed check (intent is null or intent in ('create', 'discover', 'both'));

comment on column ops.waitlist.intent is 'create, discover or both: how the person plans to use Splitpost. Recruitment only, never a role.';
comment on column ops.waitlist.introduced_by_creator is 'Yes / no answer to "Did a creator introduce you?". Names nobody; never a verified referral, follow, Connection Points or entitlement.';
comment on column ops.waitlist.creator_link_id is 'Verified invitation link, resolved by the server at signup. Attribution only.';

-- ---------------------------------------------------------------------------
-- Acquisition events: counts for measurement. A row holds no email, account
-- id, network address, hash or free text: only what happened, the hour it
-- happened, the channel label and (for verified invitations) which link.
-- The time is kept to the hour, not the moment, so a signup event can't be
-- matched to its waitlist entry by timestamp. Not described as anonymous:
-- with few signups per link and hour, a row can still be narrowed down by
-- someone with database access; it is treated as personal data with the
-- same protections as the waitlist.

create table ops.acquisition_events (
  id                     bigint generated always as identity primary key,
  event                  text not null,
  occurred_at            timestamptz not null default date_trunc('hour', now()),
  source                 text,
  self_reported_referral boolean,
  creator_link_id        uuid references ops.creator_links (id) on delete set null,
  constraint acquisition_events_allowed check (event in (
    'creator_link_visit',       -- a valid link was opened (estimate: once per salted client key, link and UTC day)
    'waitlist_signup',          -- a new address joined the waitlist
    'invitation_accepted'       -- an invited person created their account
    -- No follow events yet: real-account follows don't exist, so nothing may
    -- record a follow decision (see ops.creator_link_redemptions).
  )),
  constraint acquisition_events_source_format check (source is null or source ~ '^[a-z0-9_-]{1,40}$')
);
comment on table ops.acquisition_events is 'Acquisition counts, timed to the hour: no email, account id, address, hash or free text. Server code only.';
-- The hour is enforced, so nothing can store a finer time later by mistake.
alter table ops.acquisition_events add constraint acquisition_events_hourly check (occurred_at = date_trunc('hour', occurred_at));

create index acquisition_events_link_idx on ops.acquisition_events (creator_link_id, event);

-- ---------------------------------------------------------------------------
-- The waitlist entry point, with the new optional fields. Everything the
-- first version (ops.join_waitlist, unchanged) checks is checked here in the
-- same order; the new fields
-- are validated after the required ones. An unusable creator link is ignored
-- (the signup still works, unattributed), so a bad link can't block anyone
-- and can't be probed: the reply is the same 'ok' either way.

create function ops.join_waitlist_v2(
  p_email                 text,
  p_interests             text[],
  p_shares_content        text,
  p_platform              text,
  p_audience_band         text,
  p_source                text,
  p_age_confirmed         boolean,
  p_waitlist_consent      boolean,
  p_notice_version        text,
  p_email_key             text,
  p_client_key            text,
  p_intent                text,
  p_introduced_by_creator boolean,
  p_creator_ref           text
)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_email      text := lower(btrim(coalesce(p_email, '')));
  v_interests  text[] := coalesce(p_interests, '{}');
  v_shares     text := nullif(btrim(coalesce(p_shares_content, '')), '');
  v_platform   text := nullif(btrim(coalesce(p_platform, '')), '');
  v_audience   text := nullif(btrim(coalesce(p_audience_band, '')), '');
  v_source     text := nullif(lower(btrim(coalesce(p_source, ''))), '');
  v_intent     text := nullif(btrim(coalesce(p_intent, '')), '');
  v_ref        text := nullif(lower(btrim(coalesce(p_creator_ref, ''))), '');
  v_link       uuid;
  v_notice     text;
  v_id         uuid := gen_random_uuid();
  v_inserted   integer;
begin
  if not coalesce((select enabled from ops.settings where key = 'waitlist_submissions'), false) then
    return 'closed';
  end if;
  v_notice := (select value from ops.settings where key = 'waitlist_notice_version');
  if v_notice is null then
    return 'closed';
  end if;

  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(v_email) > 254
     or coalesce(p_age_confirmed, false) is false
     or coalesce(p_waitlist_consent, false) is false then
    return 'invalid';
  end if;
  if p_notice_version is distinct from v_notice then
    return 'notice_changed';
  end if;

  if not (v_interests <@ array['reach_followers', 'closer_community', 'support_creators', 'discover_creators', 'sustainable_income', 'shape_platform']::text[])
     or cardinality(v_interests) > 6
     or (v_shares is not null and v_shares not in ('yes', 'not_yet'))
     or (v_platform is not null and v_platform not in ('youtube', 'tiktok', 'instagram', 'twitch', 'x', 'facebook', 'podcast', 'newsletter', 'other'))
     or (v_audience is not null and v_audience not in ('under_1k', '1k_10k', '10k_100k', 'over_100k'))
     or (coalesce(v_shares, '') <> 'yes' and (v_platform is not null or v_audience is not null)) then
    return 'invalid';
  end if;

  -- New optional answer: intent must be one of the three.
  if v_intent is not null and v_intent not in ('create', 'discover', 'both') then
    return 'invalid';
  end if;

  if v_source is not null and v_source !~ '^[a-z0-9_-]{1,40}$' then v_source := null; end if;

  if coalesce(p_email_key, '') !~ '^[0-9a-f]{64}$' or coalesce(p_client_key, '') !~ '^[0-9a-f]{64}$' then
    return 'invalid';
  end if;

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

  -- A verified link only if the server can resolve it right now.
  if v_ref is not null then
    select r.link_id into v_link from ops.resolve_creator_link(v_ref) r where r.status = 'valid';
  end if;

  insert into ops.waitlist (
    id, email, interests, shares_content, platform, audience_band, source,
    age_confirmed, waitlist_consent_version, waitlist_consented_at,
    intent, introduced_by_creator, creator_link_id
  )
  values (
    v_id, v_email, v_interests, v_shares, v_platform, v_audience, v_source,
    true, v_notice, now(),
    v_intent, p_introduced_by_creator, v_link
  )
  on conflict (email) do nothing;
  get diagnostics v_inserted = row_count;

  if v_inserted = 1 then
    insert into ops.waitlist_consents (waitlist_id, kind, granted, notice_version)
    values (v_id, 'waitlist', true, v_notice);
    insert into ops.acquisition_events (event, source, self_reported_referral, creator_link_id)
    values ('waitlist_signup', v_source, coalesce(p_introduced_by_creator, false), v_link);
  end if;

  return 'ok';
end;
$$;

-- ---------------------------------------------------------------------------
-- Attribution through invitation and signup.

alter table ops.invitations
  add column creator_link_id uuid references ops.creator_links (id) on delete set null;
comment on column ops.invitations.creator_link_id is 'The verified creator link this person arrived through, copied from their waitlist entry. Attribution only.';

-- An invitation for a waitlist address carries that entry's verified link.
create function ops.invitations_copy_creator_link()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.creator_link_id is null then
    new.creator_link_id := (select w.creator_link_id from ops.waitlist w where w.email = new.email);
  end if;
  return new;
end;
$$;

create trigger invitations_copy_creator_link
  before insert on ops.invitations
  for each row execute function ops.invitations_copy_creator_link();

-- One row per account that arrived through a verified link, with that
-- person's follow decision about the inviting creator.
--
-- The decision stays 'pending', enforced by the database, until real-account
-- follows exist: until then there is no follow relationship to create, so
-- nothing may record or show a completed follow (or a decline). The
-- migration that adds real follows drops creator_link_redemptions_pending_until_follows
-- and adds the function that records the person's own choice together with
-- the real follow. A decision never awards Connection Points or creates any
-- entitlement for anyone.
create table ops.creator_link_redemptions (
  user_id         uuid primary key references auth.users (id) on delete cascade,
  link_id         uuid references ops.creator_links (id) on delete set null,
  creator_id      uuid references auth.users (id) on delete set null,
  redeemed_at     timestamptz not null default now(),
  follow_decision text not null default 'pending',
  decided_at      timestamptz,
  constraint creator_link_redemptions_decision_allowed check (follow_decision in ('pending', 'followed', 'declined')),
  constraint creator_link_redemptions_decided_at check ((follow_decision = 'pending') = (decided_at is null)),
  constraint creator_link_redemptions_not_self check (creator_id is distinct from user_id),
  constraint creator_link_redemptions_pending_until_follows check (follow_decision = 'pending' and decided_at is null)
);
comment on table ops.creator_link_redemptions is 'Accounts that joined through a verified creator link. The follow decision stays pending until real-account follows exist. Never creates a follow, Connection Points or entitlement.';

create function ops.invitations_record_link_redemption()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_creator uuid;
begin
  if new.accepted_at is not null and old.accepted_at is null
     and new.accepted_user_id is not null and new.creator_link_id is not null then
    v_creator := (select creator_id from ops.creator_links where id = new.creator_link_id);
    -- A creator joining through their own link is not a redemption.
    if v_creator is distinct from new.accepted_user_id then
      insert into ops.creator_link_redemptions (user_id, link_id, creator_id)
      values (new.accepted_user_id, new.creator_link_id, v_creator)
      on conflict (user_id) do nothing;
      insert into ops.acquisition_events (event, creator_link_id) values ('invitation_accepted', new.creator_link_id);
    end if;
  end if;
  return new;
end;
$$;

create trigger invitations_record_link_redemption
  after update of accepted_at on ops.invitations
  for each row execute function ops.invitations_record_link_redemption();

-- ---------------------------------------------------------------------------
-- Measurement for the waitlist_admin login: counts only, never an address
-- or account id. Visits (an estimate), signups, accounts and follow
-- decisions are counted separately, overall and per link, so each step can
-- be read on its own. Conversion rates built from them are estimates.

create function waitlist_api.admin_acquisition_summary()
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'intent', coalesce((select jsonb_object_agg(coalesce(intent, 'unanswered'), n) from (
                select intent, count(*) as n from ops.waitlist group by intent) s), '{}'::jsonb),
    'introduced_by_creator', coalesce((select jsonb_object_agg(
                case introduced_by_creator when true then 'yes' when false then 'no' else 'unanswered' end, n) from (
                select introduced_by_creator, count(*) as n from ops.waitlist group by introduced_by_creator) s), '{}'::jsonb),
    'verified_link_signups',   (select count(*) from ops.waitlist where creator_link_id is not null),
    'events', coalesce((select jsonb_object_agg(event, n) from (
                select event, count(*) as n from ops.acquisition_events group by event) s), '{}'::jsonb),
    'active_links', (select count(*) from ops.creator_links l join ops.pilot_creators c on c.user_id = l.creator_id
                     where l.revoked_at is null and l.expires_at > now() and c.status = 'accepted'),
    'accepted_creators', (select count(*) from ops.pilot_creators where status = 'accepted'),
    -- Per link, by its first six characters only (enough to tell links apart,
    -- not enough to use one): its state and each step of the funnel.
    'links', coalesce((select jsonb_agg(jsonb_build_object(
                'link', left(l.code, 6),
                'campaign', l.campaign,
                'state', case when l.revoked_at is not null then 'revoked' when l.expires_at <= now() then 'expired'
                              when c.status <> 'accepted' then 'creator_' || c.status else 'active' end,
                'expires_on', l.expires_at::date,
                -- An estimate (see waitlist_api.invite_preview), so named.
                'visits_estimate',    (select count(*) from ops.acquisition_events e where e.creator_link_id = l.id and e.event = 'creator_link_visit'),
                'signups',            (select count(*) from ops.acquisition_events e where e.creator_link_id = l.id and e.event = 'waitlist_signup'),
                'accounts',           (select count(*) from ops.acquisition_events e where e.creator_link_id = l.id and e.event = 'invitation_accepted')
              ) order by l.created_at)
              from ops.creator_links l join ops.pilot_creators c on c.user_id = l.creator_id), '[]'::jsonb)
  );
$$;

-- ---------------------------------------------------------------------------
-- Pilot invitation policy: founder/admin-controlled. Only the waitlist_admin
-- login (the founder's admin workflow) can accept creators, record the public
-- name a creator agreed to, issue links and revoke them. Nothing issues a
-- link automatically, and no creator can issue their own.

-- Accepts (or re-accepts) a creator into the pilot, with up to three categories.
create function waitlist_api.admin_accept_creator(p_user uuid, p_categories text[] default '{}')
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from auth.users where id = p_user) then
    return 'no_such_account';
  end if;
  insert into ops.pilot_creators (user_id, status, categories)
  values (p_user, 'accepted', coalesce(p_categories, '{}'))
  on conflict (user_id) do update set status = 'accepted', categories = excluded.categories, accepted_at = now();
  return 'accepted';
end;
$$;

-- Pauses or removes a creator (their links stop working at once), or accepts them again.
create function waitlist_api.admin_set_creator_status(p_user uuid, p_status text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_status not in ('accepted', 'paused', 'removed') then
    raise exception 'status must be accepted, paused or removed';
  end if;
  update ops.pilot_creators set status = p_status where user_id = p_user;
  return case when found then p_status else 'not_a_pilot_creator' end;
end;
$$;

-- Records the public name the creator agreed to show on their links, or
-- clears it (null) if they withdraw that agreement.
create function waitlist_api.admin_set_creator_public_name(p_user uuid, p_public_name text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := nullif(btrim(coalesce(p_public_name, '')), '');
begin
  update ops.pilot_creators
     set public_name = v_name, public_name_agreed_at = case when v_name is null then null else now() end
   where user_id = p_user;
  return case when not found then 'not_a_pilot_creator' when v_name is null then 'cleared' else 'set' end;
end;
$$;

-- Issues a link: 90 days unless the admin says otherwise (1 to 365). Returns
-- the code once; it is shared with the creator by the admin.
create function waitlist_api.admin_issue_creator_link(p_user uuid, p_days integer default 90, p_campaign text default null)
returns text
language sql
security definer
set search_path = ''
as $$
  select ops.create_creator_link(p_user, coalesce(p_days, 90), p_campaign);
$$;

-- Revokes a link for good. A revoked link can't be restored (the trigger
-- refuses); issue a new one instead.
create function waitlist_api.admin_revoke_creator_link(p_code text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_revoked timestamptz;
begin
  select revoked_at into v_revoked from ops.creator_links where code = lower(btrim(coalesce(p_code, '')));
  if not found then
    return 'unknown';
  end if;
  if v_revoked is not null then
    return 'already_revoked';
  end if;
  update ops.creator_links set revoked_at = now() where code = lower(btrim(p_code));
  return 'revoked';
end;
$$;

-- ---------------------------------------------------------------------------
-- Retention for the hourly acquisition counts (proposed: 90 days for the
-- pilot, subject to privacy and legal approval). Manual only: the founder
-- runs it through the admin workflow; nothing schedules it. It deletes
-- ONLY rows of ops.acquisition_events older than the given number of days
-- (30 to 400, so a typo can't empty the table), touches no other table, and
-- returns how many rows it removed.

create function waitlist_api.admin_purge_acquisition_events(p_days integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  if p_days is null or p_days < 30 or p_days > 400 then
    raise exception 'retention must be between 30 and 400 days';
  end if;
  delete from ops.acquisition_events
   where occurred_at < date_trunc('hour', now()) - make_interval(days => p_days);
  get diagnostics n = row_count;
  return n;
end;
$$;

-- ---------------------------------------------------------------------------
-- The public invitation preview, for the server function only (the
-- waitlist_writer login). Answers whether a link can be used right now and,
-- if so, the public name its creator agreed to show. Nothing else: never the
-- creator's account id, email, username, categories or status, never why a
-- link is unusable (unknown, expired, revoked or a paused creator all read
-- 'unavailable'), and nothing about the waitlist.
--
-- It follows the waitlist's switches: while the waitlist is closed it answers
-- 'closed' and records nothing. Its rate limits live in their own table,
-- keyed by the salted client key the server function already makes: an HMAC
-- of the visitor's network address (an IPv6 address reduced to its /64)
-- with a secret salt. That key is a temporary pseudonymous identifier, not
-- an anonymous one: anyone holding the salt could test whether a given
-- address made a request. It is never the address itself, the event rows
-- never hold it, and every record of it is deleted within two days.
--
-- A usable link's visit is counted once per client key, link and UTC day.
-- That is an estimate, not a count of people: several people behind one
-- network share a key (undercount), one person moving between networks
-- gets several (overcount), and a visitor whose address can't be trusted
-- shares one "unknown" key with everyone else in that situation.

create table ops.invite_preview_limits (
  bucket       text not null,
  window_start timestamptz not null,
  hits         integer not null default 1,
  primary key (bucket, window_start),
  -- 'preview' (everyone), 'client:<hash>' (one visitor), 'visit:<hash of link and visitor>'.
  constraint invite_preview_limits_bucket_format check (bucket ~ '^(preview|client:[0-9a-f]{64}|visit:[0-9a-f]{64})$')
);
comment on table ops.invite_preview_limits is 'Rate limits and visit de-duplication for the invitation preview. Salted hashes only; rows older than two days are deleted on each preview.';
-- Each preview deletes records older than two days; this keeps that cheap.
create index invite_preview_limits_window_idx on ops.invite_preview_limits (window_start);

create function ops.invite_preview_hit(p_bucket text, p_window interval, p_limit integer)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  w timestamptz := to_timestamp(floor(extract(epoch from now()) / extract(epoch from p_window)) * extract(epoch from p_window));
  n integer;
begin
  insert into ops.invite_preview_limits as r (bucket, window_start, hits)
  values (p_bucket, w, 1)
  on conflict (bucket, window_start) do update set hits = r.hits + 1
  returning r.hits into n;
  return n > p_limit;
end;
$$;

create function waitlist_api.invite_preview(p_code text, p_client_key text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text := lower(btrim(coalesce(p_code, '')));
  v_link uuid;
  v_creator uuid;
  v_name text;
begin
  if not coalesce((select enabled from ops.settings where key = 'waitlist_submissions'), false)
     or (select value from ops.settings where key = 'waitlist_notice_version') is null then
    return jsonb_build_object('status', 'closed');
  end if;
  if coalesce(p_client_key, '') !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('status', 'invalid');
  end if;

  delete from ops.invite_preview_limits where window_start < now() - interval '2 days';
  if ops.invite_preview_hit('preview', interval '1 minute', 300)
     or ops.invite_preview_hit('client:' || p_client_key, interval '1 hour', 30) then
    return jsonb_build_object('status', 'rate_limited');
  end if;

  select r.link_id, r.creator_id into v_link, v_creator from ops.resolve_creator_link(v_code) r where r.status = 'valid';
  if v_link is null then
    return jsonb_build_object('status', 'ok', 'invite', 'unavailable');
  end if;

  if not ops.invite_preview_hit('visit:' || encode(sha256(convert_to(v_link::text || ':' || p_client_key, 'UTF8')), 'hex'),
                                interval '1 day', 1) then
    insert into ops.acquisition_events (event, creator_link_id) values ('creator_link_visit', v_link);
  end if;

  v_name := (select public_name from ops.pilot_creators where user_id = v_creator);
  return jsonb_build_object('status', 'ok', 'invite', 'valid', 'name', v_name);
end;
$$;

-- ---------------------------------------------------------------------------
-- The server function's new entry point (the first one stays as it was).

create function waitlist_api.submit_v2(
  p_email                 text,
  p_interests             text[],
  p_shares_content        text,
  p_platform              text,
  p_audience_band         text,
  p_source                text,
  p_age_confirmed         boolean,
  p_waitlist_consent      boolean,
  p_notice_version        text,
  p_email_key             text,
  p_client_key            text,
  p_intent                text,
  p_introduced_by_creator boolean,
  p_creator_ref           text
)
returns text
language sql
security definer
set search_path = ''
as $$
  select ops.join_waitlist_v2(
    p_email, p_interests, p_shares_content, p_platform, p_audience_band, p_source,
    p_age_confirmed, p_waitlist_consent, p_notice_version, p_email_key, p_client_key,
    p_intent, p_introduced_by_creator, p_creator_ref
  );
$$;

-- ---------------------------------------------------------------------------
-- Privileges: server code only, exactly like the rest of ops.

alter table ops.pilot_creators enable row level security;
alter table ops.creator_links enable row level security;
alter table ops.creator_link_redemptions enable row level security;
alter table ops.acquisition_events enable row level security;
alter table ops.invite_preview_limits enable row level security;

revoke all on ops.pilot_creators, ops.creator_links, ops.creator_link_redemptions, ops.acquisition_events, ops.invite_preview_limits
  from public, anon, authenticated;
grant all on ops.pilot_creators, ops.creator_links, ops.creator_link_redemptions, ops.acquisition_events, ops.invite_preview_limits
  to service_role;

revoke all on function ops.creator_links_require_accepted_creator() from public, anon, authenticated;
-- Issuing links is the admin's alone, so not even server code may call this directly.
revoke all on function ops.create_creator_link(uuid, integer, text) from public, anon, authenticated, service_role;
revoke all on function ops.resolve_creator_link(text) from public, anon, authenticated;
revoke all on function ops.join_waitlist_v2(text, text[], text, text, text, text, boolean, boolean, text, text, text, text, boolean, text) from public, anon, authenticated;
revoke all on function ops.invitations_copy_creator_link() from public, anon, authenticated;
revoke all on function ops.invitations_record_link_redemption() from public, anon, authenticated;
revoke all on function ops.invite_preview_hit(text, interval, integer) from public, anon, authenticated, service_role;

grant execute on function ops.resolve_creator_link(text) to service_role;
grant execute on function ops.join_waitlist_v2(text, text[], text, text, text, text, boolean, boolean, text, text, text, text, boolean, text) to service_role;

revoke all on function waitlist_api.submit_v2(text, text[], text, text, text, text, boolean, boolean, text, text, text, text, boolean, text)
  from public, anon, authenticated, service_role;
revoke all on function waitlist_api.admin_acquisition_summary() from public, anon, authenticated, service_role;
revoke all on function waitlist_api.admin_accept_creator(uuid, text[]) from public, anon, authenticated, service_role;
revoke all on function waitlist_api.admin_set_creator_status(uuid, text) from public, anon, authenticated, service_role;
revoke all on function waitlist_api.admin_set_creator_public_name(uuid, text) from public, anon, authenticated, service_role;
revoke all on function waitlist_api.admin_issue_creator_link(uuid, integer, text) from public, anon, authenticated, service_role;
revoke all on function waitlist_api.admin_revoke_creator_link(text) from public, anon, authenticated, service_role;
revoke all on function waitlist_api.admin_purge_acquisition_events(integer) from public, anon, authenticated, service_role;
revoke all on function waitlist_api.invite_preview(text, text) from public, anon, authenticated, service_role;
grant execute on function waitlist_api.submit_v2(text, text[], text, text, text, text, boolean, boolean, text, text, text, text, boolean, text)
  to waitlist_writer;
grant execute on function waitlist_api.admin_acquisition_summary() to waitlist_admin;
grant execute on function waitlist_api.admin_accept_creator(uuid, text[]) to waitlist_admin;
grant execute on function waitlist_api.admin_set_creator_status(uuid, text) to waitlist_admin;
grant execute on function waitlist_api.admin_set_creator_public_name(uuid, text) to waitlist_admin;
grant execute on function waitlist_api.admin_issue_creator_link(uuid, integer, text) to waitlist_admin;
grant execute on function waitlist_api.admin_revoke_creator_link(text) to waitlist_admin;
grant execute on function waitlist_api.admin_purge_acquisition_events(integer) to waitlist_admin;
grant execute on function waitlist_api.invite_preview(text, text) to waitlist_writer;
