-- TEST ONLY (throwaway databases). Waitlist behaviour: the server switch,
-- validation, consent records, duplicates, rate limits, deletion and
-- retention. Runs as service_role, the only role allowed to call it.
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
      perform public.waitlist_submit('a@example.com', '{}', null, null, null, null, null, null, true, true, 'v1', false, null);
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
  if public.waitlist_submit('closed@example.com', '{}', null, null, null, null, null, null, true, true, 'v1', false, null) <> 'closed' then
    raise exception 'FAIL: a submission was accepted while the switch is off';
  end if;
  if exists (select 1 from ops.waitlist) or exists (select 1 from ops.waitlist_rate_limits) then
    raise exception 'FAIL: something was stored while the switch is off';
  end if;
  raise notice 'PASS: submissions are off by default and store nothing';
end $$;

update ops.settings set enabled = true where key = 'waitlist_submissions';

-- 2. Required: valid email, 18+, waitlist consent and a notice version.
do $$
begin
  if public.waitlist_submit('not-an-email', '{}', null, null, null, null, null, null, true, true, 'v1', false, null) <> 'invalid' then
    raise exception 'FAIL: an invalid email was accepted';
  end if;
  if public.waitlist_submit('kid@example.com', '{}', null, null, null, null, null, null, false, true, 'v1', false, null) <> 'invalid' then
    raise exception 'FAIL: a submission without 18+ confirmation was accepted';
  end if;
  if public.waitlist_submit('noconsent@example.com', '{}', null, null, null, null, null, null, true, false, 'v1', false, null) <> 'invalid' then
    raise exception 'FAIL: a submission without waitlist consent was accepted';
  end if;
  if public.waitlist_submit('noversion@example.com', '{}', null, null, null, null, null, null, true, true, null, false, null) <> 'invalid' then
    raise exception 'FAIL: a submission without a notice version was accepted';
  end if;
  if public.waitlist_submit('badinterest@example.com', array['get_rich'], null, null, null, null, null, null, true, true, 'v1', false, null) <> 'invalid' then
    raise exception 'FAIL: an unknown interest was accepted';
  end if;
  if public.waitlist_submit('nolinkwithoutyes@example.com', '{}', 'not_yet', 'youtube', null, null, null, null, true, true, 'v1', false, null) <> 'invalid' then
    raise exception 'FAIL: platform details were accepted without "shares content: yes"';
  end if;
  if public.waitlist_submit('http@example.com', '{}', 'yes', null, null, 'http://example.com', null, null, true, true, 'v1', false, null) <> 'invalid' then
    raise exception 'FAIL: a non-https link was accepted';
  end if;
  if exists (select 1 from ops.waitlist) then
    raise exception 'FAIL: an invalid submission was stored';
  end if;
  raise notice 'PASS: email, 18+, waitlist consent, notice version and known answers are required';
end $$;

-- 3. A minimal valid submission: email, 18+ and consent only. Email is stored
--    in one standard form; marketing consent is off and unrecorded.
do $$
declare
  w ops.waitlist%rowtype;
begin
  if public.waitlist_submit('  Maya@Example.COM ', null, null, null, null, null, 'Instagram', null, true, true, 'notice-2026-11', false, null) <> 'ok' then
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
--    source, refreshes last_confirmed_at, records marketing consent, and still
--    just says 'ok'. Withdrawing marketing consent is recorded too.
do $$
declare
  w ops.waitlist%rowtype;
begin
  update ops.waitlist set last_confirmed_at = now() - interval '200 days' where email = 'maya@example.com';
  if public.waitlist_submit('maya@example.com', array['reach_followers', 'sustainable_income'], 'yes', 'youtube', '10k_100k', 'https://youtube.com/@maya', 'tiktok', 'launch', true, true, 'notice-2026-11', true, null) <> 'ok' then
    raise exception 'FAIL: a repeat submission was refused';
  end if;
  select * into w from ops.waitlist where email = 'maya@example.com';
  if (select count(*) from ops.waitlist) <> 1 then
    raise exception 'FAIL: a duplicate row was created';
  end if;
  if w.source <> 'instagram' or w.campaign <> 'launch' or w.platform <> 'youtube' or w.audience_band <> '10k_100k'
     or not w.marketing_consent or w.marketing_consent_version <> 'notice-2026-11' or w.last_confirmed_at < now() - interval '1 minute' then
    raise exception 'FAIL: the repeat submission did not update as expected: %', row_to_json(w);
  end if;
  if public.waitlist_submit('maya@example.com', '{}', null, null, null, null, null, null, true, true, 'notice-2026-11', false, null) <> 'ok' then
    raise exception 'FAIL: a third submission was refused';
  end if;
  select * into w from ops.waitlist where email = 'maya@example.com';
  if w.marketing_consent or w.platform is not null then
    raise exception 'FAIL: leaving marketing unticked did not withdraw it, or old answers remained';
  end if;
  if (select string_agg(granted::text, ',' order by id) from ops.waitlist_consents where waitlist_id = w.id and kind = 'marketing') <> 'true,false' then
    raise exception 'FAIL: marketing consent and its withdrawal were not both recorded';
  end if;
  raise notice 'PASS: repeat submissions update one row and record consent changes';
end $$;

-- 5. Rate limits: at most 3 submissions per address per day, and 10 per
--    client key per hour. Over the limit nothing changes.
do $$
declare
  k text := repeat('ab', 32);
  i integer;
begin
  if public.waitlist_submit('maya@example.com', '{}', null, null, null, null, null, null, true, true, 'notice-2026-11', false, null) <> 'rate_limited' then
    raise exception 'FAIL: a fourth submission for the same address in a day was not rate limited';
  end if;
  for i in 1..10 loop
    if public.waitlist_submit(format('person%s@example.com', i), '{}', null, null, null, null, null, null, true, true, 'v1', false, k) <> 'ok' then
      raise exception 'FAIL: submission % from one client was refused early', i;
    end if;
  end loop;
  if public.waitlist_submit('person11@example.com', '{}', null, null, null, null, null, null, true, true, 'v1', false, k) <> 'rate_limited' then
    raise exception 'FAIL: an 11th submission from one client in an hour was not rate limited';
  end if;
  if exists (select 1 from ops.waitlist where email = 'person11@example.com') then
    raise exception 'FAIL: a rate limited submission was stored';
  end if;
  if public.waitlist_submit('x@example.com', '{}', null, null, null, null, null, null, true, true, 'v1', false, 'not-a-hash') <> 'invalid' then
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
  if ops.waitlist_purge_expired(12) <> 2 then
    raise exception 'FAIL: retention did not purge exactly the two expired entries';
  end if;
  if exists (select 1 from ops.waitlist where email in ('person1@example.com', 'person2@example.com'))
     or not exists (select 1 from ops.waitlist where email = 'person3@example.com') then
    raise exception 'FAIL: retention purged the wrong entries';
  end if;
  begin
    perform ops.waitlist_purge_expired(0);
    raise exception 'FAIL: a retention period of zero months was accepted';
  exception when raise_exception then
    if sqlerrm like 'FAIL:%' then raise; end if;
  end;
  raise notice 'PASS: retention purges only entries past the period';
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
  raise notice 'PASS: the summary counts people without addresses';
end $$;

rollback;
