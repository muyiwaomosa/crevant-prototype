-- TEST ONLY (throwaway databases). Waitlist behaviour: the server switch,
-- the approved notice version, validation, consent records, duplicates,
-- marketing and invitations needing a verified address, rate limits,
-- deletion, retention and the summary. Runs as service_role, the only role allowed to call it.
-- Everything happens in one transaction that is rolled back.

begin;

-- 0. Members and visitors cannot call the entry point or read the waitlist.
do $$
declare
  r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    execute format('set local role %I', r);
    begin
      perform public.waitlist_submit('a@example.com', '{}', null, null, null, null, null, null, true, true, 'notice-2026-11', repeat('cd', 32));
      raise exception 'FAIL: % could call public.waitlist_submit', r;
    exception when insufficient_privilege then null;
    end;
    begin
      perform count(*) from ops.waitlist;
      raise exception 'FAIL: % could read ops.waitlist', r;
    exception when insufficient_privilege then null;
    end;
    reset role;
  end loop;
  raise notice 'PASS: members and visitors cannot submit to or read the waitlist';
end $$;

set local role service_role;

-- 1. Submissions are OFF by default: nothing is stored or counted.
do $$
begin
  if (select enabled from ops.settings where key = 'waitlist_submissions') then
    raise exception 'FAIL: waitlist submissions are on by default';
  end if;
  if public.waitlist_submit('closed@example.com', '{}', null, null, null, null, null, null, true, true, 'notice-2026-11', repeat('cd', 32)) <> 'closed' then
    raise exception 'FAIL: a submission was accepted while the switch is off';
  end if;
  if exists (select 1 from ops.waitlist) or exists (select 1 from ops.waitlist_rate_limits) then
    raise exception 'FAIL: something was stored while the switch is off';
  end if;
  if (select value from ops.settings where key = 'waitlist_notice_version') is not null then
    raise exception 'FAIL: a privacy notice version is approved by default';
  end if;
  raise notice 'PASS: submissions are off by default and store nothing';
end $$;

update ops.settings set enabled = true where key = 'waitlist_submissions';

-- 1b. Even with the switch on, nothing is accepted until a notice version is approved.
do $$
begin
  if public.waitlist_submit('early@example.com', '{}', null, null, null, null, null, null, true, true, 'notice-2026-11', repeat('cd', 32)) <> 'closed' then
    raise exception 'FAIL: a submission was accepted before any privacy notice was approved';
  end if;
  if exists (select 1 from ops.waitlist) or exists (select 1 from ops.waitlist_rate_limits) then
    raise exception 'FAIL: something was stored before a notice was approved';
  end if;
  raise notice 'PASS: no submissions until a privacy notice version is approved';
end $$;

update ops.settings set value = 'notice-2026-11' where key = 'waitlist_notice_version';

-- 1c. Only the approved notice version is accepted, so consent records can't
--     name a notice the person never saw.
do $$
begin
  if public.waitlist_submit('forged@example.com', '{}', null, null, null, null, null, null, true, true, 'never-shown', repeat('cd', 32)) <> 'notice_changed'
     or public.waitlist_submit('old@example.com', '{}', null, null, null, null, null, null, true, true, 'notice-2026-10', repeat('cd', 32)) <> 'notice_changed'
     or public.waitlist_submit('nover@example.com', '{}', null, null, null, null, null, null, true, true, null, repeat('cd', 32)) <> 'notice_changed' then
    raise exception 'FAIL: a submission with a different notice version was not refused';
  end if;
  if exists (select 1 from ops.waitlist) or exists (select 1 from ops.waitlist_consents) then
    raise exception 'FAIL: a submission with a different notice version was stored';
  end if;
  begin
    update ops.settings set value = 'Draft 1' where key = 'waitlist_notice_version';
    raise exception 'FAIL: a malformed notice version could be approved';
  exception when check_violation then null;
  end;
  raise notice 'PASS: only the approved privacy notice version is accepted';
end $$;

-- 2. Required: valid email, 18+, waitlist consent and a client key.
do $$
begin
  if public.waitlist_submit('not-an-email', '{}', null, null, null, null, null, null, true, true, 'notice-2026-11', repeat('cd', 32)) <> 'invalid' then
    raise exception 'FAIL: an invalid email was accepted';
  end if;
  if public.waitlist_submit('kid@example.com', '{}', null, null, null, null, null, null, false, true, 'notice-2026-11', repeat('cd', 32)) <> 'invalid' then
    raise exception 'FAIL: a submission without 18+ confirmation was accepted';
  end if;
  if public.waitlist_submit('noconsent@example.com', '{}', null, null, null, null, null, null, true, false, 'notice-2026-11', repeat('cd', 32)) <> 'invalid' then
    raise exception 'FAIL: a submission without waitlist consent was accepted';
  end if;
  if public.waitlist_submit('nokey@example.com', '{}', null, null, null, null, null, null, true, true, 'notice-2026-11', null) <> 'invalid' then
    raise exception 'FAIL: a submission without a client key (skipping the per-client limit) was accepted';
  end if;
  if public.waitlist_submit('badinterest@example.com', array['get_rich'], null, null, null, null, null, null, true, true, 'notice-2026-11', repeat('cd', 32)) <> 'invalid' then
    raise exception 'FAIL: an unknown interest was accepted';
  end if;
  if public.waitlist_submit('nolinkwithoutyes@example.com', '{}', 'not_yet', 'youtube', null, null, null, null, true, true, 'notice-2026-11', repeat('cd', 32)) <> 'invalid' then
    raise exception 'FAIL: platform details were accepted without "shares content: yes"';
  end if;
  if public.waitlist_submit('http@example.com', '{}', 'yes', null, null, 'http://example.com', null, null, true, true, 'notice-2026-11', repeat('cd', 32)) <> 'invalid' then
    raise exception 'FAIL: a non-https link was accepted';
  end if;
  if exists (select 1 from ops.waitlist) then
    raise exception 'FAIL: an invalid submission was stored';
  end if;
  raise notice 'PASS: email, 18+, waitlist consent, a client key and known answers are required';
end $$;

-- 3. A minimal valid submission: email, 18+ and consent only. Email is stored
--    in one standard form; marketing consent is off and unrecorded.
do $$
declare
  w ops.waitlist%rowtype;
begin
  if public.waitlist_submit('  Maya@Example.COM ', null, null, null, null, null, 'Instagram', null, true, true, 'notice-2026-11', repeat('cd', 32)) <> 'ok' then
    raise exception 'FAIL: a minimal valid submission was refused';
  end if;
  select * into w from ops.waitlist;
  if w.email <> 'maya@example.com' or w.source <> 'instagram' or w.marketing_consent or w.marketing_consent_version is not null
     or w.waitlist_consent_version <> 'notice-2026-11' or w.status <> 'new' then
    raise exception 'FAIL: the stored row is not as expected: %', row_to_json(w);
  end if;
  if (select count(*) from ops.waitlist_consents where waitlist_id = w.id and kind = 'waitlist' and granted and notice_version = 'notice-2026-11') <> 1
     or exists (select 1 from ops.waitlist_consents where waitlist_id = w.id and kind = 'marketing') then
    raise exception 'FAIL: consent history is not as expected';
  end if;
  raise notice 'PASS: a minimal submission stores email, 18+ and waitlist consent with its notice version';
end $$;

-- 4. Joining again with the same address updates the answers, keeps the first
--    source, refreshes last_confirmed_at and still just says 'ok'. Marketing
--    stays off and unrecorded: it needs a verified address, and nothing can
--    verify one yet.
do $$
declare
  w ops.waitlist%rowtype;
begin
  update ops.waitlist set last_confirmed_at = now() - interval '200 days' where email = 'maya@example.com';
  if public.waitlist_submit('maya@example.com', array['reach_followers', 'sustainable_income'], 'yes', 'youtube', '10k_100k', 'https://youtube.com/@maya', 'tiktok', 'launch', true, true, 'notice-2026-11', repeat('cd', 32)) <> 'ok' then
    raise exception 'FAIL: a repeat submission was refused';
  end if;
  select * into w from ops.waitlist where email = 'maya@example.com';
  if (select count(*) from ops.waitlist) <> 1 then
    raise exception 'FAIL: a duplicate row was created';
  end if;
  if w.source <> 'instagram' or w.campaign <> 'launch' or w.platform <> 'youtube' or w.audience_band <> '10k_100k'
     or w.marketing_consent or w.last_confirmed_at < now() - interval '1 minute' then
    raise exception 'FAIL: the repeat submission did not update as expected: %', row_to_json(w);
  end if;
  if public.waitlist_submit('maya@example.com', '{}', null, null, null, null, null, null, true, true, 'notice-2026-11', repeat('cd', 32)) <> 'ok' then
    raise exception 'FAIL: a third submission was refused';
  end if;
  select * into w from ops.waitlist where email = 'maya@example.com';
  if w.platform is not null then
    raise exception 'FAIL: old answers remained';
  end if;
  if exists (select 1 from ops.waitlist_consents where kind = 'marketing')
     or (select count(*) from ops.waitlist_consents where waitlist_id = w.id and kind = 'waitlist') <> 3 then
    raise exception 'FAIL: consent history is not as expected';
  end if;
  raise notice 'PASS: repeat submissions update one row and record each waitlist consent';
end $$;

-- 4b. An unverified address can't be opted in to marketing or invited, even
--     by server code writing to the table directly.
do $$
begin
  begin
    update ops.waitlist set marketing_consent = true, marketing_consent_version = 'notice-2026-11', marketing_consented_at = now()
    where email = 'maya@example.com';
    raise exception 'FAIL: an unverified address was opted in to marketing';
  exception when check_violation then null;
  end;
  begin
    update ops.waitlist set status = 'invited' where email = 'maya@example.com';
    raise exception 'FAIL: an unverified address was marked invited';
  exception when check_violation then null;
  end;
  begin
    insert into ops.invitations (email, expires_at, source) values ('maya@example.com', now() + interval '7 days', 'waitlist');
    raise exception 'FAIL: an invitation was created for an unverified waitlist address';
  exception when check_violation then null;
  end;
  -- Addresses not on the waitlist (for example founder outreach) are unaffected.
  insert into ops.invitations (email, expires_at, source) values ('outreach@example.com', now() + interval '7 days', 'founder_outreach');
  delete from ops.invitations where email = 'outreach@example.com';
  raise notice 'PASS: marketing and invitations need a verified address';
end $$;

-- 5. Rate limits: at most 3 submissions per address per day, and 10 per
--    client key per hour. Over the limit nothing changes.
do $$
declare
  k text := repeat('ab', 32);
  i integer;
begin
  if public.waitlist_submit('maya@example.com', '{}', null, null, null, null, null, null, true, true, 'notice-2026-11', repeat('cd', 32)) <> 'rate_limited' then
    raise exception 'FAIL: a fourth submission for the same address in a day was not rate limited';
  end if;
  for i in 1..10 loop
    if public.waitlist_submit(format('person%s@example.com', i), '{}', null, null, null, null, null, null, true, true, 'notice-2026-11', k) <> 'ok' then
      raise exception 'FAIL: submission % from one client was refused early', i;
    end if;
  end loop;
  if public.waitlist_submit('person11@example.com', '{}', null, null, null, null, null, null, true, true, 'notice-2026-11', k) <> 'rate_limited' then
    raise exception 'FAIL: an 11th submission from one client in an hour was not rate limited';
  end if;
  if exists (select 1 from ops.waitlist where email = 'person11@example.com') then
    raise exception 'FAIL: a rate limited submission was stored';
  end if;
  if public.waitlist_submit('x@example.com', '{}', null, null, null, null, null, null, true, true, 'notice-2026-11', 'not-a-hash') <> 'invalid' then
    raise exception 'FAIL: a malformed client key was accepted';
  end if;
  if exists (select 1 from ops.waitlist_rate_limits where bucket !~ '^(global|email:[0-9a-f]{32}|client:[0-9a-f]{64})$') then
    raise exception 'FAIL: a rate limit key is not a hash';
  end if;
  raise notice 'PASS: per-address and per-client rate limits hold, with hashed keys only';
end $$;

-- 6. Deletion on request removes the person, their consent history, notes,
--    rate counter and any unaccepted invitation, and nothing else.
do $$
declare
  v_id uuid;
  res jsonb;
begin
  select id into v_id from ops.waitlist where email = 'maya@example.com';
  insert into ops.waitlist_selections (waitlist_id, wave, note) values (v_id, 'wave_1', 'publishing creator');
  -- Stands in for the future verification flow, so an invitation can exist.
  update ops.waitlist set email_verified_at = now() where id = v_id;
  insert into ops.invitations (email, expires_at, source) values ('maya@example.com', now() + interval '7 days', 'waitlist');
  res := ops.waitlist_delete(v_id);
  if res <> '{"waitlist": 1, "open_invitations": 1}'::jsonb then
    raise exception 'FAIL: deletion reported %', res;
  end if;
  if exists (select 1 from ops.waitlist where id = v_id)
     or exists (select 1 from ops.waitlist_consents where waitlist_id = v_id)
     or exists (select 1 from ops.waitlist_selections where waitlist_id = v_id)
     or exists (select 1 from ops.invitations where email = 'maya@example.com')
     or exists (select 1 from ops.waitlist_rate_limits where bucket = 'email:' || md5('maya@example.com')) then
    raise exception 'FAIL: something about the deleted person remains';
  end if;
  if (select count(*) from ops.waitlist) <> 10 then
    raise exception 'FAIL: deletion touched other people';
  end if;
  if ops.waitlist_delete(v_id) <> '{"waitlist": 0, "open_invitations": 0}'::jsonb then
    raise exception 'FAIL: deleting twice did not report zero';
  end if;
  raise notice 'PASS: deletion on request removes the person and everything linked to them';
end $$;

-- 7. Retention: entries with no confirmed interest for 12 months are purged;
--    newer ones stay.
do $$
begin
  update ops.waitlist set last_confirmed_at = now() - interval '13 months' where email in ('person1@example.com', 'person2@example.com');
  update ops.waitlist set last_confirmed_at = now() - interval '11 months' where email = 'person3@example.com';
  update ops.waitlist set email_verified_at = now() where email in ('person1@example.com', 'person3@example.com');
  insert into ops.invitations (email, expires_at, source) values
    ('person1@example.com', now() + interval '7 days', 'waitlist'),
    ('person3@example.com', now() + interval '7 days', 'waitlist');
  if ops.waitlist_purge_expired(12) <> '{"waitlist": 2, "open_invitations": 1}'::jsonb then
    raise exception 'FAIL: retention did not purge exactly the two expired entries and one pending invitation';
  end if;
  if exists (select 1 from ops.waitlist where email in ('person1@example.com', 'person2@example.com'))
     or not exists (select 1 from ops.waitlist where email = 'person3@example.com') then
    raise exception 'FAIL: retention purged the wrong entries';
  end if;
  if exists (select 1 from ops.invitations where email = 'person1@example.com')
     or not exists (select 1 from ops.invitations where email = 'person3@example.com')
     or exists (select 1 from ops.waitlist_rate_limits where bucket in ('email:' || md5('person1@example.com'), 'email:' || md5('person2@example.com'))) then
    raise exception 'FAIL: retention left a pending invitation or counter behind, or removed a current one';
  end if;
  begin
    perform ops.waitlist_purge_expired(0);
    raise exception 'FAIL: a retention period of zero months was accepted';
  exception when raise_exception then
    if sqlerrm like 'FAIL:%' then raise; end if;
  end;
  raise notice 'PASS: retention purges only entries past the period, with their pending invitations';
end $$;

-- 8. The summary holds counts only, never an address.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'ops' and table_name = 'waitlist_summary' and column_name ~* 'email|link'
  ) then
    raise exception 'FAIL: the summary exposes an email or link';
  end if;
  if (select sum(people) from ops.waitlist_summary) <> (select count(*) from ops.waitlist) then
    raise exception 'FAIL: the summary does not count everyone';
  end if;
  -- It reads with the caller's rights, so with row level security forced and
  -- no policies, a caller who doesn't bypass it sees nothing through the view.
  reset role;
  alter table ops.waitlist force row level security;
  create role waitlist_probe;
  grant usage on schema ops to waitlist_probe;
  grant select on ops.waitlist, ops.waitlist_summary to waitlist_probe;
  set local role waitlist_probe;
  if (select count(*) from ops.waitlist_summary) <> 0 then
    raise exception 'FAIL: the summary view bypasses row level security';
  end if;
  reset role;
  set local role service_role;
  raise notice 'PASS: the summary counts people without addresses';
end $$;

rollback;
