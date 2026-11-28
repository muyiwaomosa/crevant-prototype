-- BL-009 (SP-BACKLOG-001), waitlist side. Founder decision D1, option A
-- (Nov 28, 2026): the waitlist stays the authoritative record of prospective
-- members. Verified, consenting applicants are copied into the member project
-- only when the founder imports them for review in Control Center, through one
-- narrow, server-side handoff interface. Nothing else in the waitlist becomes
-- reachable.
--
-- 1. Email verification. The join function asks for a single-use link for an
--    unverified entry right after a submission and emails it; opening the link
--    sets email_verified_at. Only a hash of the link's token is stored. A link
--    lasts 48 hours, at most 3 are issued per entry per day, and a new link
--    replaces the previous one.
--      waitlist_api.verification_issue(email)  -> token or null   (waitlist_writer)
--      waitlist_api.verify_email(token)        -> verified | invalid | expired
--
-- 2. Handoff, for one new login, waitlist_handoff, used only by the member
--    project's waitlist-bridge function (never a browser, never a member).
--    It can run exactly these six functions and touch no table:
--      handoff_export(limit)      verified, consenting entries not yet handed
--                                 off: the minimum fields for cohort review and
--                                 an invitation. Marks them exported.
--      handoff_recheck(ids)       which of these are still verified, consenting,
--                                 within retention and undecided (checked again
--                                 just before an invitation is sent)
--      handoff_record(id, outcome) invited or declined
--      handoff_withdrawals(since) entries removed after they were handed off
--                                 (withdrawal, deletion request or retention):
--                                 ids and times only, never an address
--      handoff_forget(ids)        delete entries on request, from Control
--                                 Center (an applicant's deletion request, or a
--                                 member deleting their account)
--      handoff_forget_email(email) delete the entry with this address (a
--                                 deletion request received by email for
--                                 someone never handed off)
--
-- Registration, invitations and the waitlist stay closed: this migration
-- switches nothing on. Submissions stay off (ops.settings), and the new login
-- has no password until the founder sets one (docs/WAITLIST-HANDOFF.md).

-- ---------------------------------------------------------------------------
-- 1. Email verification.

create table ops.waitlist_email_verifications (
  waitlist_id   uuid primary key references ops.waitlist (id) on delete cascade,
  token_hash    text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at    timestamptz not null,
  issued_today  integer not null default 1 check (issued_today between 1 and 3),
  day_started   timestamptz not null default now(),
  issued_at     timestamptz not null default now()
);
comment on table ops.waitlist_email_verifications is 'One open verification link per unverified entry: a SHA-256 hash of the token (never the token), its expiry and a daily issue count. Deleted when used and with the entry.';
alter table ops.waitlist_email_verifications enable row level security;
revoke all on table ops.waitlist_email_verifications from public, anon, authenticated;

-- A new link for an unverified entry, or null (no such entry, already
-- verified, or 3 links already issued in the last 24 hours). The same null
-- whatever the reason, so nobody can learn who is on the list.
create function waitlist_api.verification_issue(p_email text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id    uuid;
  v_token text := pg_catalog.replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  v_hash  text;
  v       ops.waitlist_email_verifications;
begin
  select w.id into v_id from ops.waitlist w
  where w.email = pg_catalog.lower(pg_catalog.btrim(coalesce(p_email, ''))) and w.email_verified_at is null;
  if v_id is null then
    return null;
  end if;
  v_hash := pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(v_token, 'UTF8')), 'hex');
  select * into v from ops.waitlist_email_verifications where waitlist_id = v_id for update;
  if not found then
    insert into ops.waitlist_email_verifications (waitlist_id, token_hash, expires_at)
    values (v_id, v_hash, pg_catalog.now() + interval '48 hours');
  elsif v.day_started <= pg_catalog.now() - interval '24 hours' then
    update ops.waitlist_email_verifications
    set token_hash = v_hash, expires_at = pg_catalog.now() + interval '48 hours', issued_today = 1,
        day_started = pg_catalog.now(), issued_at = pg_catalog.now()
    where waitlist_id = v_id;
  elsif v.issued_today < 3 then
    update ops.waitlist_email_verifications
    set token_hash = v_hash, expires_at = pg_catalog.now() + interval '48 hours', issued_today = v.issued_today + 1,
        issued_at = pg_catalog.now()
    where waitlist_id = v_id;
  else
    return null;
  end if;
  return v_token;
end;
$$;

create function waitlist_api.verify_email(p_token text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v ops.waitlist_email_verifications;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    return 'invalid';
  end if;
  select * into v from ops.waitlist_email_verifications
  where token_hash = pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_token, 'UTF8')), 'hex')
  for update;
  if not found then
    return 'invalid';
  end if;
  if v.expires_at <= pg_catalog.now() then
    return 'expired';
  end if;
  update ops.waitlist
  set email_verified_at = coalesce(email_verified_at, pg_catalog.now()), interest_confirmed_at = pg_catalog.now()
  where id = v.waitlist_id;
  delete from ops.waitlist_email_verifications where waitlist_id = v.waitlist_id;
  return 'verified';
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Handoff.

alter table ops.waitlist
  add column handoff_exported_at timestamptz,
  add column handoff_outcome     text,
  add column handoff_outcome_at  timestamptz,
  add constraint waitlist_handoff_outcome_allowed check (handoff_outcome is null or handoff_outcome in ('invited', 'declined')),
  add constraint waitlist_handoff_outcome_needs_export check (handoff_outcome is null or (handoff_exported_at is not null and handoff_outcome_at is not null));
comment on column ops.waitlist.handoff_exported_at is 'When this entry was last copied to the member project for review (BL-009). Null: never.';
comment on column ops.waitlist.handoff_outcome is 'invited or declined, recorded by the member project after review. Never a role.';

-- Entries removed after they were handed off: the id and time only, so the
-- member project can remove its review copy and revoke an open invitation.
-- Kept 13 months, then purged.
create table ops.waitlist_withdrawals (
  waitlist_id  uuid primary key,
  withdrawn_at timestamptz not null default now()
);
comment on table ops.waitlist_withdrawals is 'Ids (never addresses) of handed-off entries that were later removed, so the member project can remove its copy and revoke any open invitation. Purged after 13 months.';
alter table ops.waitlist_withdrawals enable row level security;
revoke all on table ops.waitlist_withdrawals from public, anon, authenticated;
create index waitlist_withdrawals_by_time on ops.waitlist_withdrawals (withdrawn_at);

create function ops.waitlist_record_withdrawal()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.handoff_exported_at is not null then
    insert into ops.waitlist_withdrawals (waitlist_id) values (old.id) on conflict (waitlist_id) do nothing;
  end if;
  return old;
end;
$$;
revoke all on function ops.waitlist_record_withdrawal() from public, anon, authenticated;
create trigger waitlist_record_withdrawal
after delete on ops.waitlist
for each row execute function ops.waitlist_record_withdrawal();

-- Eligible for review or an invitation: verified, with a granted waitlist
-- consent, inside the 12-month retention window, and not yet decided.
create function ops.waitlist_handoff_eligible(w ops.waitlist)
returns boolean
language sql
stable
set search_path = ''
as $$
  select w.email_verified_at is not null
    and w.handoff_outcome is null
    and w.status in ('new', 'shortlisted')
    and coalesce(w.interest_confirmed_at, w.joined_at) > pg_catalog.now() - interval '12 months'
    and exists (select 1 from ops.waitlist_consents c where c.waitlist_id = w.id and c.kind = 'waitlist' and c.granted);
$$;
revoke all on function ops.waitlist_handoff_eligible(ops.waitlist) from public, anon, authenticated;

create function waitlist_api.handoff_export(p_limit integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_out jsonb;
begin
  if p_limit is null or p_limit not between 1 and 500 then
    raise exception 'invalid_limit' using errcode = 'P0001';
  end if;
  -- Not exported yet, or exported more than 30 days ago (the member copy has
  -- expired by then) and still undecided.
  with picked as (
    select w.id from ops.waitlist w
    where ops.waitlist_handoff_eligible(w)
      and (w.handoff_exported_at is null or w.handoff_exported_at < pg_catalog.now() - interval '30 days')
    order by w.joined_at
    limit p_limit
    for update skip locked
  ), marked as (
    update ops.waitlist w set handoff_exported_at = pg_catalog.now()
    from picked where w.id = picked.id
    returning w.*
  )
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'waitlist_id', m.id,
    'email', m.email,
    'joined_at', m.joined_at,
    'verified_at', m.email_verified_at,
    'consent_version', m.waitlist_consent_version,
    'consented_at', m.waitlist_consented_at,
    'groups', pg_catalog.to_jsonb(m.participant_groups),
    'intent', m.intent,
    'platform', m.platform,
    'audience_band', m.audience_band,
    'introduced_by_creator', m.introduced_by_creator,
    'source', m.source,
    'creator_ref', (select l.code from ops.creator_links l where l.id = m.creator_link_id)
  ) order by m.joined_at), '[]'::jsonb)
  into v_out
  from marked m;
  return v_out;
end;
$$;

create function waitlist_api.handoff_recheck(p_ids uuid[])
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(pg_catalog.array_agg(w.id), '{}')
  from ops.waitlist w
  where w.id = any (coalesce(p_ids, '{}')) and pg_catalog.cardinality(p_ids) <= 500
    and w.handoff_exported_at is not null and ops.waitlist_handoff_eligible(w);
$$;

create function waitlist_api.handoff_record(p_id uuid, p_outcome text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_outcome is null or p_outcome not in ('invited', 'declined') then
    raise exception 'invalid_outcome' using errcode = 'P0001';
  end if;
  update ops.waitlist
  set handoff_outcome = p_outcome, handoff_outcome_at = pg_catalog.now(),
      status = case p_outcome when 'invited' then 'invited' else 'not_selected' end
  where id = p_id and handoff_exported_at is not null and handoff_outcome is null and email_verified_at is not null;
  return found;
end;
$$;

create function waitlist_api.handoff_withdrawals(p_since timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_out jsonb;
begin
  delete from ops.waitlist_withdrawals where withdrawn_at < pg_catalog.now() - interval '13 months';
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('waitlist_id', x.waitlist_id, 'withdrawn_at', x.withdrawn_at)
                  order by x.withdrawn_at), '[]'::jsonb)
  into v_out
  from (select * from ops.waitlist_withdrawals
        where withdrawn_at >= coalesce(p_since, '-infinity'::timestamptz)
        order by withdrawn_at limit 1000) x;
  return v_out;
end;
$$;

create function waitlist_api.handoff_forget(p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  n    integer := 0;
begin
  if pg_catalog.cardinality(coalesce(p_ids, '{}')) > 500 then
    raise exception 'too_many' using errcode = 'P0001';
  end if;
  foreach v_id in array coalesce(p_ids, '{}') loop
    n := n + ((ops.waitlist_delete(v_id)) ->> 'waitlist')::integer;
  end loop;
  return n;
end;
$$;

-- A deletion request received by email, carried out from Control Center: the
-- entry with this address, whether or not it was ever handed off. Returns 0
-- or 1 (no address is ever returned).
create function waitlist_api.handoff_forget_email(p_email text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  select w.id into v_id from ops.waitlist w where w.email = pg_catalog.lower(pg_catalog.btrim(coalesce(p_email, '')));
  if v_id is null then
    return 0;
  end if;
  return ((ops.waitlist_delete(v_id)) ->> 'waitlist')::integer;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. The handoff login: no special powers, no password (the founder sets one
--    when the handoff is approved), and only the six handoff functions.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'waitlist_handoff') then
    create role waitlist_handoff login noinherit nocreatedb nocreaterole connection limit 3;
  end if;
end $$;
alter role waitlist_handoff set statement_timeout = '15s';
alter role waitlist_handoff set idle_in_transaction_session_timeout = '15s';
grant usage on schema waitlist_api to waitlist_handoff;

revoke all on function waitlist_api.verification_issue(text) from public, anon, authenticated, service_role;
revoke all on function waitlist_api.verify_email(text) from public, anon, authenticated, service_role;
revoke all on function waitlist_api.handoff_export(integer) from public, anon, authenticated, service_role;
revoke all on function waitlist_api.handoff_recheck(uuid[]) from public, anon, authenticated, service_role;
revoke all on function waitlist_api.handoff_record(uuid, text) from public, anon, authenticated, service_role;
revoke all on function waitlist_api.handoff_withdrawals(timestamptz) from public, anon, authenticated, service_role;
revoke all on function waitlist_api.handoff_forget(uuid[]) from public, anon, authenticated, service_role;
revoke all on function waitlist_api.handoff_forget_email(text) from public, anon, authenticated, service_role;

grant execute on function waitlist_api.verification_issue(text) to waitlist_writer;
grant execute on function waitlist_api.verify_email(text) to waitlist_writer;
grant execute on function waitlist_api.handoff_export(integer) to waitlist_handoff;
grant execute on function waitlist_api.handoff_recheck(uuid[]) to waitlist_handoff;
grant execute on function waitlist_api.handoff_record(uuid, text) to waitlist_handoff;
grant execute on function waitlist_api.handoff_withdrawals(timestamptz) to waitlist_handoff;
grant execute on function waitlist_api.handoff_forget(uuid[]) to waitlist_handoff;
grant execute on function waitlist_api.handoff_forget_email(text) to waitlist_handoff;
