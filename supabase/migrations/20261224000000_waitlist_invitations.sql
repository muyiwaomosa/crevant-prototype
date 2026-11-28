-- BL-009 (SP-BACKLOG-001), member side. Founder decision D1, option A (Nov 28,
-- 2026), with the founder's safeguards:
--
--   * The waitlist project stays authoritative. Verified, consenting
--     applicants are copied here only when the founder imports them in Control
--     Center, through the member waitlist-bridge function (the only holder of
--     the restricted waitlist_handoff login). Browsers and members never reach
--     the waitlist.
--   * A copy holds the minimum for cohort review and an invitation, expires
--     after 30 days, and is deleted as soon as the applicant is invited or
--     declined. One copy per applicant and per address.
--   * At most one open invitation per applicant and per address, and at most
--     one accepted. An invitation that expired or whose email failed can be
--     replaced, only by the founder, after a fresh check with the waitlist:
--     the old one and its link are revoked first. Each invitation is a
--     single-use personal link (ops.registration_links, max_uses 1).
--   * Delivery is tracked honestly: "sent" means only that the email
--     provider accepted the message. Delivered, bounced and complained come
--     from the provider's signed delivery events, never assumed.
--   * Nothing the waitlist must learn is lost when it can't be reached: an
--     "invited" outcome not yet recorded there stays pending and is carried
--     on the next import or send, like deletions and declines.
--   * Before anything is sent the bridge rechecks verification, consent,
--     retention and withdrawal with the waitlist, and this database refuses to
--     create an invitation while external access is not approved or
--     registration is paused: nothing can be sent in Production before PB-4.
--   * Registering through the link marks the invitation accepted. Sent,
--     failed, accepted, expired and onboarded counts are kept for Control
--     Center, with the waitlist source and creator link carried as attribution.
--   * Withdrawals and deletion requests cross both ways: a withdrawal on the
--     waitlist removes the copy and any open invitation here; a deletion
--     request recorded in Control Center, or a member deleting an account that
--     came from the waitlist, is queued for the bridge to delete the waitlist
--     entry.
--
-- Nothing here opens registration, invitations, previews or the waitlist.

-- ---------------------------------------------------------------------------
-- 1. Review copies.

create table ops.waitlist_review (
  waitlist_id           uuid primary key,
  email                 text not null,
  joined_at             timestamptz not null,
  verified_at           timestamptz not null,
  consent_version       text not null,
  consented_at          timestamptz not null,
  groups                text[] not null default '{}',
  intent                text,
  platform              text,
  audience_band         text,
  introduced_by_creator boolean,
  source                text,
  creator_ref           text,
  imported_at           timestamptz not null default pg_catalog.now(),
  expires_at            timestamptz not null default pg_catalog.now() + interval '30 days',
  decision              text not null default 'pending',
  cohort                text,
  decided_at            timestamptz,
  constraint waitlist_review_email_normalized check (email = lower(btrim(email)) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and length(email) <= 254),
  constraint waitlist_review_email_unique unique (email),
  constraint waitlist_review_decision_allowed check (decision in ('pending', 'approved', 'declined')),
  constraint waitlist_review_cohort_allowed check (cohort is null or cohort in ('creator', 'fan', 'tester')),
  constraint waitlist_review_approved_has_cohort check ((decision = 'approved') = (cohort is not null)),
  constraint waitlist_review_decided check ((decision = 'pending') = (decided_at is null)),
  constraint waitlist_review_groups_allowed check (groups <@ array['active_creator', 'aspiring_creator', 'supporter']::text[]),
  constraint waitlist_review_intent_allowed check (intent is null or intent in ('create', 'discover', 'both')),
  constraint waitlist_review_platform_allowed check (platform is null or platform in ('youtube', 'tiktok', 'instagram', 'twitch', 'x', 'facebook', 'podcast', 'newsletter', 'other')),
  constraint waitlist_review_audience_allowed check (audience_band is null or audience_band in ('under_1k', '1k_10k', '10k_100k', 'over_100k')),
  constraint waitlist_review_source_format check (source is null or source ~ '^[a-z0-9_-]{1,40}$'),
  constraint waitlist_review_creator_ref_format check (creator_ref is null or creator_ref ~ '^[0-9a-f]{20}$'),
  constraint waitlist_review_consent_version_format check (consent_version ~ '^[a-z0-9._-]{1,40}$'),
  constraint waitlist_review_expiry check (expires_at > imported_at and expires_at <= imported_at + interval '30 days')
);
comment on table ops.waitlist_review is 'Temporary copies of verified, consenting waitlist applicants for the founder''s cohort review (BL-009). The waitlist project stays authoritative. Expire after 30 days; deleted once invited or declined. Server code only.';
alter table ops.waitlist_review enable row level security;
revoke all on table ops.waitlist_review from public, anon, authenticated;

-- Deletions to carry to the waitlist project: an applicant's deletion request
-- recorded in Control Center, or a member deleting an account that came from
-- the waitlist. An id only. Removed once the waitlist confirms.
create table ops.waitlist_forget_queue (
  waitlist_id uuid primary key,
  reason      text not null check (reason in ('applicant_request', 'member_deleted')),
  queued_at   timestamptz not null default pg_catalog.now()
);
comment on table ops.waitlist_forget_queue is 'Waitlist ids (never addresses) whose waitlist entry must be deleted; the bridge carries them over and removes them. Server code only.';
alter table ops.waitlist_forget_queue enable row level security;
revoke all on table ops.waitlist_forget_queue from public, anon, authenticated;

-- Where the bridge has read waitlist withdrawals up to.
create table ops.waitlist_bridge_state (
  id                boolean primary key default true check (id),
  withdrawals_since timestamptz not null default '-infinity',
  last_import_at    timestamptz,
  last_send_at      timestamptz
);
insert into ops.waitlist_bridge_state (id) values (true);
comment on table ops.waitlist_bridge_state is 'One row: how far the bridge has read the waitlist withdrawals, and when it last imported and sent. Server code only.';
alter table ops.waitlist_bridge_state enable row level security;
revoke all on table ops.waitlist_bridge_state from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Invitation tracking.

alter table ops.invitations
  add column waitlist_id     uuid,
  add column link_id         uuid references ops.registration_links (id) on delete set null,
  add column cohort          text,
  add column creator_ref     text,
  add column delivery_status text,
  add column delivery_error  text,
  add column provider_id     text,
  add column send_attempts   integer not null default 0,
  add column delivered_at    timestamptz,
  add column delivery_event_at timestamptz,
  add column replaces_id     uuid references ops.invitations (id) on delete set null,
  add column outcome_synced_at timestamptz,
  add constraint invitations_cohort_allowed check (cohort is null or cohort in ('creator', 'fan', 'tester')),
  add constraint invitations_creator_ref_format check (creator_ref is null or creator_ref ~ '^[0-9a-f]{20}$'),
  add constraint invitations_delivery_allowed check (delivery_status is null or delivery_status in ('sending', 'sent', 'delayed', 'delivered', 'failed', 'bounced', 'complained')),
  add constraint invitations_delivered_has_time check ((delivery_status = 'delivered') <= (delivered_at is not null)),
  add constraint invitations_delivery_error_format check (delivery_error is null or delivery_error ~ '^[a-z0-9_]{1,40}$'),
  add constraint invitations_provider_id_format check (provider_id is null or provider_id ~ '^[A-Za-z0-9_-]{1,100}$'),
  add constraint invitations_send_attempts_range check (send_attempts between 0 and 5);
comment on column ops.invitations.waitlist_id is 'The waitlist applicant this personal invitation was sent to (BL-009). At most one open and one accepted invitation per applicant.';
comment on column ops.invitations.delivery_status is 'sending (not yet with the provider), sent (the provider accepted it; not proof of delivery), delayed, delivered (the provider confirmed delivery), failed (the provider refused it or could not be reached, with a fixed error code), bounced or complained. Delivered, delayed, bounced and complained come only from the provider''s signed delivery events.';
comment on column ops.invitations.replaces_id is 'The expired or failed invitation this one replaced (revoked when it was replaced).';
comment on column ops.invitations.outcome_synced_at is 'When the waitlist recorded this applicant as invited. Null: still to carry over (retried on every import and send).';
create unique index invitations_one_open_per_applicant on ops.invitations (waitlist_id) where waitlist_id is not null and accepted_at is null and revoked_at is null;
create unique index invitations_one_accepted_per_applicant on ops.invitations (waitlist_id) where waitlist_id is not null and accepted_at is not null;
create unique index invitations_one_per_link on ops.invitations (link_id) where link_id is not null;

-- Registering through an invitation's link marks the invitation accepted.
create function ops.invitation_accept_on_registration()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.link_id is not null then
    update ops.invitations
    set accepted_at = coalesce(accepted_at, pg_catalog.now()), accepted_user_id = coalesce(accepted_user_id, new.user_id)
    where link_id = new.link_id and accepted_at is null and revoked_at is null;
  end if;
  return new;
end;
$$;
revoke all on function ops.invitation_accept_on_registration() from public, anon, authenticated;
create trigger registrations_accept_invitation
after insert on ops.registrations
for each row execute function ops.invitation_accept_on_registration();

-- A member who came from the waitlist deletes their account: their accepted
-- invitation is removed (ops.forget_member_invitations), and the waitlist
-- entry is queued for deletion too.
create function ops.invitation_forget_waitlist_entry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.waitlist_id is not null and old.accepted_at is not null then
    insert into ops.waitlist_forget_queue (waitlist_id, reason) values (old.waitlist_id, 'member_deleted')
    on conflict (waitlist_id) do nothing;
  end if;
  return old;
end;
$$;
revoke all on function ops.invitation_forget_waitlist_entry() from public, anon, authenticated;
create trigger invitations_forget_waitlist_entry
after delete on ops.invitations
for each row execute function ops.invitation_forget_waitlist_entry();

-- Removes copies whose 30 days are up.
create function ops.waitlist_review_expire()
returns integer
language sql
volatile
security definer
set search_path = ''
as $$
  with gone as (delete from ops.waitlist_review where expires_at <= pg_catalog.now() returning 1)
  select count(*)::integer from gone;
$$;
revoke all on function ops.waitlist_review_expire() from public, anon, authenticated;

-- Whether invitations may be created now: external access approved and
-- registration not paused (the same conditions an invitation link needs).
create function ops.invites_may_send()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select m.external_access_approved from ops.member_launch_settings m where m.id), false)
     and not coalesce((select s.paused from ops.registration_settings s where s.id), true);
$$;
revoke all on function ops.invites_may_send() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. The bridge's steps (service_role only: the waitlist-bridge function).

-- Stores exported applicants. Skips anyone already copied, invited, a member,
-- or queued for deletion. Returns how many were stored and skipped.
create function ops.bridge_import(p_rows jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  r jsonb;
  v_email text;
  n_in integer := 0;
  n_skip integer := 0;
begin
  if p_rows is null or pg_catalog.jsonb_typeof(p_rows) <> 'array' or pg_catalog.jsonb_array_length(p_rows) > 500 then
    raise exception 'invalid_rows' using errcode = 'P0001';
  end if;
  perform ops.waitlist_review_expire();
  for r in select * from pg_catalog.jsonb_array_elements(p_rows) loop
    v_email := pg_catalog.lower(pg_catalog.btrim(r ->> 'email'));
    if exists (select 1 from ops.waitlist_review w where w.waitlist_id = (r ->> 'waitlist_id')::uuid or w.email = v_email)
       or exists (select 1 from ops.invitations i where i.waitlist_id = (r ->> 'waitlist_id')::uuid or (i.email = v_email and i.revoked_at is null))
       or exists (select 1 from auth.users u where pg_catalog.lower(u.email) = v_email)
       or exists (select 1 from ops.waitlist_forget_queue q where q.waitlist_id = (r ->> 'waitlist_id')::uuid) then
      n_skip := n_skip + 1;
      continue;
    end if;
    insert into ops.waitlist_review (waitlist_id, email, joined_at, verified_at, consent_version, consented_at, groups, intent,
                                     platform, audience_band, introduced_by_creator, source, creator_ref)
    values ((r ->> 'waitlist_id')::uuid, v_email, (r ->> 'joined_at')::timestamptz, (r ->> 'verified_at')::timestamptz,
            r ->> 'consent_version', (r ->> 'consented_at')::timestamptz,
            coalesce((select pg_catalog.array_agg(g) from pg_catalog.jsonb_array_elements_text(r -> 'groups') g), '{}'),
            r ->> 'intent', r ->> 'platform', r ->> 'audience_band', (r ->> 'introduced_by_creator')::boolean,
            r ->> 'source', r ->> 'creator_ref');
    n_in := n_in + 1;
  end loop;
  update ops.waitlist_bridge_state set last_import_at = pg_catalog.now() where id;
  return pg_catalog.jsonb_build_object('imported', n_in, 'skipped', n_skip);
end;
$$;

-- Applies waitlist withdrawals (ids, oldest first): removes the copy, and
-- removes any open invitation and its link. Accepted invitations belong to an
-- account and follow account deletion. Advances the read position.
create function ops.bridge_withdraw(p_rows jsonb)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  r jsonb;
  v_id uuid;
  n integer := 0;
  v_last timestamptz;
begin
  if p_rows is null or pg_catalog.jsonb_typeof(p_rows) <> 'array' or pg_catalog.jsonb_array_length(p_rows) > 1000 then
    raise exception 'invalid_rows' using errcode = 'P0001';
  end if;
  for r in select * from pg_catalog.jsonb_array_elements(p_rows) loop
    v_id := (r ->> 'waitlist_id')::uuid;
    v_last := greatest(v_last, (r ->> 'withdrawn_at')::timestamptz);
    delete from ops.waitlist_review where waitlist_id = v_id;
    update ops.registration_links l set revoked_at = pg_catalog.now()
    from ops.invitations i where i.waitlist_id = v_id and i.accepted_at is null and l.id = i.link_id and l.revoked_at is null;
    with gone as (delete from ops.invitations where waitlist_id = v_id and accepted_at is null returning 1)
    select n + count(*)::integer into n from gone;
    delete from ops.waitlist_forget_queue where waitlist_id = v_id;
  end loop;
  if v_last is not null then
    update ops.waitlist_bridge_state set withdrawals_since = greatest(withdrawals_since, v_last) where id;
  end if;
  return n;
end;
$$;

-- Applicants whose "invited" outcome the waitlist has not recorded yet.
create function ops.waitlist_outcomes_pending()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(pg_catalog.jsonb_agg(x.waitlist_id), '[]'::jsonb)
  from (select distinct i.waitlist_id from ops.invitations i
        where i.waitlist_id is not null and i.outcome_synced_at is null limit 200) x;
$$;
revoke all on function ops.waitlist_outcomes_pending() from public, anon, authenticated;

-- The waitlist recorded these applicants as invited.
create function ops.waitlist_outcomes_done(p_ids uuid[])
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  update ops.invitations set outcome_synced_at = pg_catalog.now()
  where waitlist_id = any (coalesce(p_ids, '{}')) and outcome_synced_at is null;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function ops.waitlist_outcomes_done(uuid[]) from public, anon, authenticated;

-- Where to read withdrawals from, and the queued deletions to carry over.
create function public.svc_waitlist_bridge_pending()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    -- Read again from an hour before the last withdrawal seen (applying one twice
    -- changes nothing), so one committed late is never skipped.
    'withdrawals_since', (select case when withdrawals_since = '-infinity' then withdrawals_since else withdrawals_since - interval '1 hour' end
                          from ops.waitlist_bridge_state where id),
    'outcomes', ops.waitlist_outcomes_pending(),
    'forget', coalesce((select pg_catalog.jsonb_agg(q.waitlist_id order by q.queued_at) from (select * from ops.waitlist_forget_queue order by queued_at limit 500) q), '[]'::jsonb),
    'declined', coalesce((select pg_catalog.jsonb_agg(w.waitlist_id) from ops.waitlist_review w where w.decision = 'declined'), '[]'::jsonb),
    'approved', coalesce((select pg_catalog.jsonb_agg(w.waitlist_id order by w.decided_at) from (
        select * from ops.waitlist_review where decision = 'approved' and expires_at > pg_catalog.now() order by decided_at limit 50) w), '[]'::jsonb),
    'may_send', ops.invites_may_send()
  );
$$;

-- The waitlist confirmed these deletions.
create function public.svc_waitlist_forget_done(p_ids uuid[])
returns integer
language sql
volatile
security definer
set search_path = ''
as $$
  with gone as (delete from ops.waitlist_forget_queue where waitlist_id = any (coalesce(p_ids, '{}')) returning 1)
  select count(*)::integer from gone;
$$;

-- The waitlist recorded these declines: the copies go.
create function public.svc_waitlist_declined_done(p_ids uuid[])
returns integer
language sql
volatile
security definer
set search_path = ''
as $$
  with gone as (delete from ops.waitlist_review where decision = 'declined' and waitlist_id = any (coalesce(p_ids, '{}')) returning 1)
  select count(*)::integer from gone;
$$;

-- Approved applicants the waitlist no longer confirms (withdrawn, consent or
-- verification gone, retention passed, decided elsewhere): the copies go and
-- nobody is invited.
create function public.svc_waitlist_not_confirmed(p_ids uuid[])
returns integer
language sql
volatile
security definer
set search_path = ''
as $$
  with gone as (delete from ops.waitlist_review where waitlist_id = any (coalesce(p_ids, '{}')) returning 1)
  select count(*)::integer from gone;
$$;

-- Creates the personal invitation for an approved, rechecked applicant: a
-- single-use link for the approved cohort, valid 14 days, and the invitation
-- row. Removes the copy. Refused while invitations may not be sent, or if the
-- applicant already has an invitation (then the copy goes, and the answer is
-- already_invited). Returns the address and link code for the email, once.
create function ops.bridge_invitation_create(p_waitlist_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  w ops.waitlist_review;
  v_code text;
  v_link uuid;
  v_inv uuid;
begin
  if not ops.invites_may_send() then
    raise exception 'invitations_closed' using errcode = 'P0001';
  end if;
  select * into w from ops.waitlist_review where waitlist_id = p_waitlist_id and decision = 'approved' and expires_at > pg_catalog.now() for update;
  if not found then
    raise exception 'not_approved' using errcode = 'P0001';
  end if;
  if exists (select 1 from ops.invitations i where i.waitlist_id = p_waitlist_id)
     or exists (select 1 from ops.invitations i where i.email = w.email and i.accepted_at is null and i.revoked_at is null)
     or exists (select 1 from auth.users u where pg_catalog.lower(u.email) = w.email) then
    delete from ops.waitlist_review where waitlist_id = p_waitlist_id;
    return pg_catalog.jsonb_build_object('status', 'already_invited');
  end if;
  v_code := ops.create_invitation_link('waitlist-bridge', w.cohort, 1, interval '14 days', null);
  select id into v_link from ops.registration_links where code = v_code;
  insert into ops.invitations (email, source, campaign, expires_at, waitlist_id, link_id, cohort, creator_ref, delivery_status)
  values (w.email, 'waitlist', 'cohort_' || w.cohort, pg_catalog.now() + interval '14 days', w.waitlist_id, v_link, w.cohort, w.creator_ref, 'sending')
  returning id into v_inv;
  delete from ops.waitlist_review where waitlist_id = p_waitlist_id;
  update ops.waitlist_bridge_state set last_send_at = pg_catalog.now() where id;
  return pg_catalog.jsonb_build_object('status', 'created', 'invitation_id', v_inv, 'email', w.email, 'code', v_code, 'cohort', w.cohort);
end;
$$;

-- Records what the email provider said: sent (with its message id) or failed
-- (with a fixed error code).
create function ops.bridge_invitation_delivery(p_invitation uuid, p_status text, p_provider_id text, p_error text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_status is null or p_status not in ('sent', 'failed') then
    raise exception 'invalid_status' using errcode = 'P0001';
  end if;
  update ops.invitations
  set delivery_status = p_status,
      provider_id = case when p_status = 'sent' then p_provider_id end,
      delivery_error = case when p_status = 'failed' then coalesce(p_error, 'unknown') end,
      last_sent_at = case when p_status = 'sent' then pg_catalog.now() else last_sent_at end,
      delivered_at = null, delivery_event_at = null,
      send_attempts = least(send_attempts + 1, 5)
  where id = p_invitation and waitlist_id is not null;
  return found;
end;
$$;

-- A signed delivery event from the email provider (checked by the
-- waitlist-bridge function): delivered, delivery delayed, bounced or
-- complained, for the message it identifies. Older events never overwrite
-- newer ones, and a delay never replaces a final state. Repeats change nothing.
create function ops.bridge_delivery_event(p_provider_id text, p_event text, p_at timestamptz)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_status text := case p_event when 'email.delivered' then 'delivered' when 'email.delivery_delayed' then 'delayed'
                                 when 'email.bounced' then 'bounced' when 'email.complained' then 'complained' end;
begin
  if v_status is null or p_provider_id is null or p_provider_id !~ '^[A-Za-z0-9_-]{1,100}$' or p_at is null then
    return false;
  end if;
  update ops.invitations
  set delivery_status = v_status,
      delivered_at = case when v_status = 'delivered' then p_at else delivered_at end,
      delivery_event_at = p_at
  where provider_id = p_provider_id and waitlist_id is not null
    and delivery_status in ('sent', 'delayed', 'delivered', 'bounced', 'complained')
    and (delivery_event_at is null or p_at >= delivery_event_at)
    and not (v_status = 'delayed' and delivery_status in ('delivered', 'bounced', 'complained'));
  return found;
end;
$$;

-- Invitations still open whose email the provider refused or never received
-- (failed, or still sending after 10 minutes), for another attempt (at most
-- 5 in all). Bounces and complaints are never retried.
create function ops.bridge_invitation_retry_list()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('invitation_id', i.id, 'email', i.email, 'code', l.code, 'cohort', i.cohort)), '[]'::jsonb)
  from ops.invitations i join ops.registration_links l on l.id = i.link_id
  where i.waitlist_id is not null and i.send_attempts < 5
    and (i.delivery_status = 'failed' or (i.delivery_status = 'sending' and i.created_at < pg_catalog.now() - interval '10 minutes'))
    and i.accepted_at is null and i.revoked_at is null and i.expires_at > pg_catalog.now()
    and l.revoked_at is null and ops.invites_may_send();
$$;

-- A deletion request by address (BL-009): the review copy, and any open
-- waitlist invitation and its link, for this address. Accepted invitations
-- belong to an account and follow account deletion. Returns how many rows went.
create function ops.waitlist_forget_address(p_email text)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_email text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_email, '')));
  n integer := 0;
  m integer;
begin
  delete from ops.waitlist_review where email = v_email;
  get diagnostics n = row_count;
  update ops.registration_links l set revoked_at = pg_catalog.now()
  from ops.invitations i where i.email = v_email and i.waitlist_id is not null and i.accepted_at is null and l.id = i.link_id and l.revoked_at is null;
  delete from ops.invitations where email = v_email and waitlist_id is not null and accepted_at is null;
  get diagnostics m = row_count;
  return n + m;
end;
$$;
revoke all on function ops.waitlist_forget_address(text) from public, anon, authenticated;

-- A replacement for an invitation that expired or whose email failed or
-- bounced. Checks only; the waitlist is asked next. Returns the applicant.
create function ops.bridge_invitation_replace_check(p_invitation uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  i ops.invitations;
begin
  select * into i from ops.invitations where id = p_invitation and waitlist_id is not null;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if exists (select 1 from ops.invitations x where x.waitlist_id = i.waitlist_id and x.accepted_at is not null) then
    raise exception 'already_accepted' using errcode = 'P0001';
  end if;
  if i.revoked_at is not null then
    raise exception 'already_replaced' using errcode = 'P0001';
  end if;
  if not (i.expires_at <= pg_catalog.now() or i.delivery_status in ('failed', 'bounced')) then
    raise exception 'still_open' using errcode = 'P0001';
  end if;
  if not ops.invites_may_send() then
    raise exception 'invitations_closed' using errcode = 'P0001';
  end if;
  return pg_catalog.jsonb_build_object('waitlist_id', i.waitlist_id);
end;
$$;
revoke all on function ops.bridge_invitation_replace_check(uuid) from public, anon, authenticated;

-- Replaces it (after the waitlist confirmed the applicant): the old invitation
-- and its link are revoked, then a new single-use link for the same cohort,
-- valid 14 days, is created. Returns the address and link for the email.
create function ops.bridge_invitation_replace(p_invitation uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  i ops.invitations;
  v_code text;
  v_link uuid;
  v_inv uuid;
begin
  perform ops.bridge_invitation_replace_check(p_invitation);
  select * into i from ops.invitations where id = p_invitation for update;
  update ops.invitations set revoked_at = pg_catalog.now() where id = i.id;
  update ops.registration_links set revoked_at = pg_catalog.now() where id = i.link_id and revoked_at is null;
  v_code := ops.create_invitation_link('waitlist-bridge', i.cohort, 1, interval '14 days', null);
  select id into v_link from ops.registration_links where code = v_code;
  insert into ops.invitations (email, source, campaign, expires_at, waitlist_id, link_id, cohort, creator_ref, delivery_status, replaces_id, outcome_synced_at)
  values (i.email, i.source, i.campaign, pg_catalog.now() + interval '14 days', i.waitlist_id, v_link, i.cohort, i.creator_ref, 'sending', i.id,
          coalesce(i.outcome_synced_at, null))
  returning id into v_inv;
  return pg_catalog.jsonb_build_object('status', 'created', 'invitation_id', v_inv, 'email', i.email, 'code', v_code, 'cohort', i.cohort);
end;
$$;
revoke all on function ops.bridge_invitation_replace(uuid) from public, anon, authenticated;

-- The service_role entry points (public, so the function can call them with
-- the service key): thin wrappers, so that only ops code touches ops.invitations.
create function public.svc_waitlist_import(p_rows jsonb) returns jsonb language sql volatile security definer set search_path = ''
as $$ select ops.bridge_import(p_rows) $$;
create function public.svc_waitlist_withdraw(p_rows jsonb) returns integer language sql volatile security definer set search_path = ''
as $$ select ops.bridge_withdraw(p_rows) $$;
create function public.svc_invitation_create(p_waitlist_id uuid) returns jsonb language sql volatile security definer set search_path = ''
as $$ select ops.bridge_invitation_create(p_waitlist_id) $$;
create function public.svc_invitation_delivery(p_invitation uuid, p_status text, p_provider_id text, p_error text) returns boolean
language sql volatile security definer set search_path = ''
as $$ select ops.bridge_invitation_delivery(p_invitation, p_status, p_provider_id, p_error) $$;
create function public.svc_invitation_retry_list() returns jsonb language sql stable security definer set search_path = ''
as $$ select ops.bridge_invitation_retry_list() $$;
create function public.svc_waitlist_forget_address(p_email text) returns integer language sql volatile security definer set search_path = ''
as $$ select ops.waitlist_forget_address(p_email) $$;
create function public.svc_invitation_delivery_event(p_provider_id text, p_event text, p_at timestamptz) returns boolean
language sql volatile security definer set search_path = ''
as $$ select ops.bridge_delivery_event(p_provider_id, p_event, p_at) $$;
create function public.svc_invitation_replace_check(p_invitation uuid) returns jsonb language sql stable security definer set search_path = ''
as $$ select ops.bridge_invitation_replace_check(p_invitation) $$;
create function public.svc_invitation_replace(p_invitation uuid) returns jsonb language sql volatile security definer set search_path = ''
as $$ select ops.bridge_invitation_replace(p_invitation) $$;
create function public.svc_waitlist_outcomes_done(p_ids uuid[]) returns integer language sql volatile security definer set search_path = ''
as $$ select ops.waitlist_outcomes_done(p_ids) $$;
revoke all on function ops.bridge_import(jsonb) from public, anon, authenticated;
revoke all on function ops.bridge_withdraw(jsonb) from public, anon, authenticated;
revoke all on function ops.bridge_invitation_create(uuid) from public, anon, authenticated;
revoke all on function ops.bridge_invitation_delivery(uuid, text, text, text) from public, anon, authenticated;
revoke all on function ops.bridge_invitation_retry_list() from public, anon, authenticated;

revoke all on function public.svc_waitlist_import(jsonb) from public, anon, authenticated;
revoke all on function public.svc_waitlist_withdraw(jsonb) from public, anon, authenticated;
revoke all on function public.svc_waitlist_bridge_pending() from public, anon, authenticated;
revoke all on function public.svc_waitlist_forget_done(uuid[]) from public, anon, authenticated;
revoke all on function public.svc_waitlist_declined_done(uuid[]) from public, anon, authenticated;
revoke all on function public.svc_waitlist_not_confirmed(uuid[]) from public, anon, authenticated;
revoke all on function public.svc_invitation_create(uuid) from public, anon, authenticated;
revoke all on function public.svc_invitation_delivery(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.svc_invitation_retry_list() from public, anon, authenticated;
revoke all on function public.svc_waitlist_forget_address(text) from public, anon, authenticated;
revoke all on function public.svc_invitation_delivery_event(text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.svc_invitation_replace_check(uuid) from public, anon, authenticated;
revoke all on function public.svc_invitation_replace(uuid) from public, anon, authenticated;
revoke all on function public.svc_waitlist_outcomes_done(uuid[]) from public, anon, authenticated;
revoke all on function ops.bridge_delivery_event(text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.svc_waitlist_import(jsonb) to service_role;
grant execute on function public.svc_waitlist_withdraw(jsonb) to service_role;
grant execute on function public.svc_waitlist_bridge_pending() to service_role;
grant execute on function public.svc_waitlist_forget_done(uuid[]) to service_role;
grant execute on function public.svc_waitlist_declined_done(uuid[]) to service_role;
grant execute on function public.svc_waitlist_not_confirmed(uuid[]) to service_role;
grant execute on function public.svc_invitation_create(uuid) to service_role;
grant execute on function public.svc_invitation_delivery(uuid, text, text, text) to service_role;
grant execute on function public.svc_invitation_retry_list() to service_role;
grant execute on function public.svc_waitlist_forget_address(text) to service_role;
grant execute on function public.svc_invitation_delivery_event(text, text, timestamptz) to service_role;
grant execute on function public.svc_invitation_replace_check(uuid) to service_role;
grant execute on function public.svc_invitation_replace(uuid) to service_role;
grant execute on function public.svc_waitlist_outcomes_done(uuid[]) to service_role;

-- Invitation counts and the latest 50 invitations, for the founder's overview.
create function ops.waitlist_invitation_summary()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'invitations', (
      select pg_catalog.jsonb_build_object(
        -- Accepted by the email provider (not proof of delivery).
        'provider_accepted', count(*) filter (where i.delivery_status in ('sent', 'delayed', 'delivered', 'bounced', 'complained')),
        -- Confirmed by the provider's delivery event.
        'delivered', count(*) filter (where i.delivery_status in ('delivered', 'complained')),
        'awaiting_confirmation', count(*) filter (where i.delivery_status in ('sent', 'delayed')),
        'sending', count(*) filter (where i.delivery_status = 'sending'),
        'failed', count(*) filter (where i.delivery_status = 'failed'),
        'bounced', count(*) filter (where i.delivery_status = 'bounced'),
        'complained', count(*) filter (where i.delivery_status = 'complained'),
        'replaced', count(*) filter (where i.revoked_at is not null and exists (select 1 from ops.invitations r where r.replaces_id = i.id)),
        'accepted', count(*) filter (where i.accepted_at is not null),
        'expired', count(*) filter (where i.accepted_at is null and i.revoked_at is null and i.expires_at <= pg_catalog.now()),
        'open', count(*) filter (where i.accepted_at is null and i.revoked_at is null and i.expires_at > pg_catalog.now()),
        'from_creator_links', count(*) filter (where i.creator_ref is not null))
      from ops.invitations i where i.waitlist_id is not null),
    'recent', coalesce((select pg_catalog.jsonb_agg(x order by x ->> 'created_at' desc) from (
        select pg_catalog.jsonb_build_object('id', i.id, 'email', i.email, 'cohort', i.cohort, 'created_at', i.created_at,
          'status', case when i.accepted_at is not null then 'accepted'
                         when i.revoked_at is not null then 'replaced'
                         when i.expires_at <= pg_catalog.now() then 'expired'
                         else coalesce(i.delivery_status, 'sending') end,
          'delivery', i.delivery_status,
          'replaceable', i.accepted_at is null and i.revoked_at is null and (i.expires_at <= pg_catalog.now() or i.delivery_status in ('failed', 'bounced'))
                         and not exists (select 1 from ops.invitations x where x.waitlist_id = i.waitlist_id and x.accepted_at is not null),
          'error', i.delivery_error) as x
        from ops.invitations i where i.waitlist_id is not null order by i.created_at desc limit 50) r), '[]'::jsonb)
  );
$$;
revoke all on function ops.waitlist_invitation_summary() from public, anon, authenticated;

-- The accounts that accepted a waitlist invitation (ids only), so the founder's
-- overview can count how many finished onboarding without ops code reading
-- profile details (check 008).
create function ops.waitlist_accepted_members()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(pg_catalog.array_agg(i.accepted_user_id), '{}')
  from ops.invitations i where i.waitlist_id is not null and i.accepted_user_id is not null;
$$;
revoke all on function ops.waitlist_accepted_members() from public, anon, authenticated;

-- An applicant's deletion request: the copy, any open invitation and its link
-- go now; the waitlist entry is queued for the bridge.
create function ops.waitlist_forget_applicant(p_waitlist_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  delete from ops.waitlist_review where waitlist_id = p_waitlist_id;
  update ops.registration_links l set revoked_at = pg_catalog.now()
  from ops.invitations i where i.waitlist_id = p_waitlist_id and i.accepted_at is null and l.id = i.link_id and l.revoked_at is null;
  delete from ops.invitations where waitlist_id = p_waitlist_id and accepted_at is null;
  insert into ops.waitlist_forget_queue (waitlist_id, reason) values (p_waitlist_id, 'applicant_request')
  on conflict (waitlist_id) do nothing;
end;
$$;
revoke all on function ops.waitlist_forget_applicant(uuid) from public, anon, authenticated;


-- Records the founder's decision on review copies (checked by the caller).
create function ops.waitlist_decide(p_ids uuid[], p_decision text, p_cohort text)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  update ops.waitlist_review
  set decision = p_decision,
      cohort = case when p_decision = 'approved' then p_cohort end,
      decided_at = case when p_decision = 'pending' then null else pg_catalog.now() end
  where waitlist_id = any (p_ids) and expires_at > pg_catalog.now();
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function ops.waitlist_decide(uuid[], text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Control Center (the founder only).

-- The applicants under review and the invitation counts (for the founder's
-- overview below; kept in ops because it handles addresses).
create function ops.waitlist_founder_overview()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform ops.waitlist_review_expire();
  return pg_catalog.jsonb_build_object(
    'applicants', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'waitlist_id', w.waitlist_id, 'email', w.email, 'joined_at', w.joined_at, 'verified_at', w.verified_at,
        'groups', pg_catalog.to_jsonb(w.groups), 'intent', w.intent, 'platform', w.platform, 'audience_band', w.audience_band,
        'introduced_by_creator', w.introduced_by_creator, 'source', w.source, 'from_creator_link', w.creator_ref is not null,
        'decision', w.decision, 'cohort', w.cohort, 'expires_at', w.expires_at) order by w.joined_at)
      from ops.waitlist_review w), '[]'::jsonb),
    'invitations', ops.waitlist_invitation_summary() -> 'invitations',
    'recent', ops.waitlist_invitation_summary() -> 'recent',
    'may_send', ops.invites_may_send(),
    'last_import_at', (select last_import_at from ops.waitlist_bridge_state where id),
    'pending_deletions', (select count(*) from ops.waitlist_forget_queue),
    'pending_outcomes', pg_catalog.jsonb_array_length(ops.waitlist_outcomes_pending())
  );
end;
$$;

revoke all on function ops.waitlist_founder_overview() from public, anon, authenticated;

-- The applicants under review, and the invitation counts.
create function public.app_founder_waitlist_overview()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_founder();
  v jsonb := ops.waitlist_founder_overview();
  n bigint;
begin
  select count(*) into n from social.profile_details d
  where d.user_id = any (ops.waitlist_accepted_members()) and d.onboarded_at is not null;
  return pg_catalog.jsonb_set(v, '{invitations,onboarded}', pg_catalog.to_jsonb(n));
end;
$$;

-- Approve applicants into a cohort, or decline them. Only undecided or
-- approved (not yet invited) copies can change.
create function public.app_founder_waitlist_decide(p_ids uuid[], p_decision text, p_cohort text)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_founder();
begin
  if p_decision is null or p_decision not in ('approved', 'declined', 'pending') then
    raise exception 'invalid_decision' using errcode = 'P0001';
  end if;
  if p_decision = 'approved' and (p_cohort is null or p_cohort not in ('creator', 'fan', 'tester')) then
    raise exception 'invalid_cohort' using errcode = 'P0001';
  end if;
  if pg_catalog.cardinality(coalesce(p_ids, '{}')) not between 1 and 500 then
    raise exception 'invalid_selection' using errcode = 'P0001';
  end if;
  return ops.waitlist_decide(p_ids, p_decision, p_cohort);
end;
$$;

-- An applicant asked to be deleted: the copy and any open invitation go now,
-- and the waitlist entry is deleted by the bridge's next run.
create function public.app_founder_waitlist_forget(p_waitlist_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_founder();
begin
  if p_waitlist_id is null then
    raise exception 'invalid_selection' using errcode = 'P0001';
  end if;
  perform ops.waitlist_forget_applicant(p_waitlist_id);
  return true;
end;
$$;

revoke all on function public.app_founder_waitlist_overview() from public, anon;
revoke all on function public.app_founder_waitlist_decide(uuid[], text, text) from public, anon;
revoke all on function public.app_founder_waitlist_forget(uuid) from public, anon;
grant execute on function public.app_founder_waitlist_overview() to authenticated;
grant execute on function public.app_founder_waitlist_decide(uuid[], text, text) to authenticated;
grant execute on function public.app_founder_waitlist_forget(uuid) to authenticated;
