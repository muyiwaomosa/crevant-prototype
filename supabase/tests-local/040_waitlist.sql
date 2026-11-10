-- TEST ONLY (throwaway databases). Waitlist behaviour through the real entry
-- points, as the real login roles: the switch, the approved notice version,
-- validation, duplicates changing nothing, unverified versus verified,
-- invitations needing a verified address, salted rate limits, deletion,
-- retention, the summary, and what each role can NOT do.
-- Everything happens in one transaction that is rolled back.

begin;

-- Test helpers (temporary, gone after the rollback). Keys stand in for the
-- server function's salted HMACs: any 64 hex characters.
create function pg_temp.k(seed text) returns text language sql as $$ select encode(sha256(convert_to(seed, 'UTF8')), 'hex') $$;
create function pg_temp.submit(p_email text, p_notice text default 'notice-2026-11', p_client text default 'client-a',
                               p_interests text[] default '{}', p_shares text default null, p_platform text default null,
                               p_audience text default null, p_source text default null,
                               p_age boolean default true, p_consent boolean default true)
returns text language plpgsql as $$
declare
  r text;
  ek text := pg_temp.k('email:' || lower(btrim(p_email)));
  ck text := pg_temp.k(p_client);
begin
  set local role waitlist_writer;
  r := waitlist_api.submit(p_email, p_interests, p_shares, p_platform, p_audience, p_source, p_age, p_consent, p_notice, ek, ck);
  reset role;
  return r;
end $$;
create function pg_temp.admin(call text) returns jsonb language plpgsql as $$
declare r jsonb;
begin
  set local role waitlist_admin;
  execute 'select ' || call into r;
  reset role;
  return r;
end $$;

-- 0. Visitors, members and both login roles cannot read the waitlist, and
--    each login role can't do the other's job.
do $$
declare
  r text;
begin
  foreach r in array array['anon', 'authenticated', 'waitlist_writer', 'waitlist_admin'] loop
    execute format('set local role %I', r);
    begin
      perform count(*) from ops.waitlist;
      raise exception 'FAIL: % could read ops.waitlist', r;
    exception when insufficient_privilege then null;
    end;
    begin
      perform count(*) from public.profiles;
      if r in ('waitlist_writer', 'waitlist_admin') then
        raise exception 'FAIL: % could read public.profiles', r;
      end if;
    exception when insufficient_privilege then null;
    end;
    begin
      perform count(*) from auth.users;
      raise exception 'FAIL: % could read auth.users', r;
    exception when insufficient_privilege then null;
    end;
    begin
      perform count(*) from ops.invitations;
      raise exception 'FAIL: % could read ops.invitations', r;
    exception when insufficient_privilege then null;
    end;
    begin
      update ops.settings set enabled = true;
      raise exception 'FAIL: % could change the switch directly', r;
    exception when insufficient_privilege then null;
    end;
    reset role;
  end loop;

  foreach r in array array['anon', 'authenticated', 'waitlist_admin', 'service_role'] loop
    execute format('set local role %I', r);
    begin
      perform waitlist_api.submit('a@example.com', '{}', null, null, null, null, true, true, 'v1', repeat('a', 64), repeat('b', 64));
      raise exception 'FAIL: % could call waitlist_api.submit', r;
    exception when insufficient_privilege then null;
    end;
    reset role;
  end loop;

  foreach r in array array['anon', 'authenticated', 'waitlist_writer', 'service_role'] loop
    execute format('set local role %I', r);
    begin
      perform waitlist_api.admin_open();
      raise exception 'FAIL: % could open the waitlist', r;
    exception when insufficient_privilege then null;
    end;
    begin
      perform waitlist_api.admin_summary();
      raise exception 'FAIL: % could read the admin summary', r;
    exception when insufficient_privilege then null;
    end;
    reset role;
  end loop;

  set local role waitlist_writer;
  begin
    perform ops.join_waitlist('a@example.com', '{}', null, null, null, null, true, true, 'v1', repeat('a', 64), repeat('b', 64));
    raise exception 'FAIL: waitlist_writer could call the internal function directly';
  exception when insufficient_privilege then null;
  end;
  reset role;
  raise notice 'PASS: nobody can read the waitlist, and each login role can only do its own job';
end $$;

-- 1. Submissions are OFF by default: nothing is stored or counted.
do $$
begin
  if (select enabled from ops.settings where key = 'waitlist_submissions')
     or (select value from ops.settings where key = 'waitlist_notice_version') is not null then
    raise exception 'FAIL: submissions are on, or a notice version is approved, by default';
  end if;
  if pg_temp.submit('closed@example.com') <> 'closed' then
    raise exception 'FAIL: a submission was accepted while the switch is off';
  end if;
  if exists (select 1 from ops.waitlist) or exists (select 1 from ops.waitlist_rate_limits) then
    raise exception 'FAIL: something was stored while the switch is off';
  end if;
  if pg_temp.admin('waitlist_api.admin_status()') <> '{"submissions": "OFF", "notice_version": null}'::jsonb then
    raise exception 'FAIL: admin status is not OFF with no notice version';
  end if;
  raise notice 'PASS: submissions are off by default and store nothing';
end $$;

-- 2. The admin role can't open without an approved notice version, then can.
do $$
begin
  begin
    perform pg_temp.admin('waitlist_api.admin_open()');
    raise exception 'FAIL: the waitlist opened without an approved notice version';
  exception when raise_exception then
    if sqlerrm like 'FAIL:%' then raise; end if;
  end;
  begin
    perform pg_temp.admin($q$waitlist_api.admin_set_notice_version('Draft 1')$q$);
    raise exception 'FAIL: a malformed notice version was accepted';
  exception when check_violation then null;
  end;
  perform pg_temp.admin($q$waitlist_api.admin_set_notice_version('notice-2026-11')$q$);
  if pg_temp.admin('waitlist_api.admin_open()') <> '{"submissions": "ON", "notice_version": "notice-2026-11"}'::jsonb then
    raise exception 'FAIL: the admin role could not open the waitlist';
  end if;
  raise notice 'PASS: opening needs an approved notice version, and only the admin role can do it';
end $$;

-- 3. Only the approved notice version is accepted.
do $$
begin
  if pg_temp.submit('forged@example.com', 'never-shown') <> 'notice_changed'
     or pg_temp.submit('old@example.com', 'notice-2026-10') <> 'notice_changed'
     or pg_temp.submit('nover@example.com', null) <> 'notice_changed' then
    raise exception 'FAIL: a submission with a different notice version was not refused';
  end if;
  if exists (select 1 from ops.waitlist) then
    raise exception 'FAIL: a submission with a different notice version was stored';
  end if;
  raise notice 'PASS: only the approved privacy notice version is accepted';
end $$;

-- 4. Required: valid email, 18+, waitlist consent, both salted keys, known answers.
do $$
begin
  if pg_temp.submit('not-an-email') <> 'invalid'
     or pg_temp.submit('kid@example.com', p_age => false) <> 'invalid'
     or pg_temp.submit('noconsent@example.com', p_consent => false) <> 'invalid'
     or pg_temp.submit('badinterest@example.com', p_interests => array['get_rich']) <> 'invalid'
     or pg_temp.submit('nodetailswithoutyes@example.com', p_shares => 'not_yet', p_platform => 'youtube') <> 'invalid'
     or pg_temp.submit('badaudience@example.com', p_shares => 'yes', p_audience => 'a_lot') <> 'invalid' then
    raise exception 'FAIL: an invalid submission was accepted';
  end if;
  set local role waitlist_writer;
  if waitlist_api.submit('nokey@example.com', '{}', null, null, null, null, true, true, 'notice-2026-11', null, repeat('b', 64)) <> 'invalid'
     or waitlist_api.submit('nokey@example.com', '{}', null, null, null, null, true, true, 'notice-2026-11', repeat('a', 64), null) <> 'invalid'
     or waitlist_api.submit('nokey@example.com', '{}', null, null, null, null, true, true, 'notice-2026-11', repeat('a', 32), repeat('b', 64)) <> 'invalid' then
    raise exception 'FAIL: a submission without both salted keys was accepted';
  end if;
  reset role;
  if exists (select 1 from ops.waitlist) then
    raise exception 'FAIL: an invalid submission was stored';
  end if;
  raise notice 'PASS: email, 18+, waitlist consent, salted keys and known answers are required';
end $$;

-- 5. A valid submission is stored once, unverified, with its consent record.
do $$
declare
  w ops.waitlist%rowtype;
begin
  if pg_temp.submit('  Maya@Example.COM ', p_interests => array['reach_followers'], p_shares => 'yes', p_platform => 'youtube',
                    p_audience => '10k_100k', p_source => 'Instagram') <> 'ok' then
    raise exception 'FAIL: a valid submission was refused';
  end if;
  select * into w from ops.waitlist;
  if w.email <> 'maya@example.com' or w.source <> 'instagram' or w.platform <> 'youtube' or w.verified or w.email_verified_at is not null
     or w.interest_confirmed_at is not null or w.waitlist_consent_version <> 'notice-2026-11' or w.status <> 'new' then
    raise exception 'FAIL: the stored row is not as expected: %', row_to_json(w);
  end if;
  if (select count(*) from ops.waitlist_consents where waitlist_id = w.id and kind = 'waitlist' and granted and notice_version = 'notice-2026-11') <> 1 then
    raise exception 'FAIL: the consent record is not as expected';
  end if;
  raise notice 'PASS: a valid submission is stored once, unverified, with its consent record';
end $$;

-- 5b. Participant groups come from the person's own answers and can overlap.
do $$
declare
  g text[];
begin
  if (select participant_groups from ops.waitlist where email = 'maya@example.com') <> array['active_creator'] then
    raise exception 'FAIL: a person who shares content is not an active creator';
  end if;
  perform pg_temp.submit('both@example.com', p_shares => 'yes', p_interests => array['support_creators'], p_client => 'client-g');
  perform pg_temp.submit('aspiring@example.com', p_shares => 'not_yet', p_interests => array['sustainable_income', 'discover_creators'], p_client => 'client-g');
  perform pg_temp.submit('fan@example.com', p_interests => array['discover_creators'], p_client => 'client-g');
  perform pg_temp.submit('notyet@example.com', p_shares => 'not_yet', p_interests => array['shape_platform'], p_client => 'client-g');
  perform pg_temp.submit('quiet@example.com', p_client => 'client-g');
  for g in select participant_groups from ops.waitlist where email = 'both@example.com' loop
    if g <> array['active_creator', 'supporter'] then raise exception 'FAIL: groups did not overlap: %', g; end if;
  end loop;
  if (select participant_groups from ops.waitlist where email = 'aspiring@example.com') <> array['aspiring_creator', 'supporter']
     or (select participant_groups from ops.waitlist where email = 'fan@example.com') <> array['supporter']
     or (select participant_groups from ops.waitlist where email = 'notyet@example.com') <> '{}'::text[]
     or (select participant_groups from ops.waitlist where email = 'quiet@example.com') <> '{}'::text[] then
    raise exception 'FAIL: participant groups were not worked out as expected';
  end if;
  begin
    update ops.waitlist set participant_groups = array['supporter'] where email = 'quiet@example.com';
    raise exception 'FAIL: participant groups could be set by hand';
  exception when generated_always then null;
  end;
  delete from ops.waitlist where email in ('both@example.com', 'aspiring@example.com', 'fan@example.com', 'notyet@example.com', 'quiet@example.com');
  raise notice 'PASS: participant groups come from the person''s own answers and can overlap';
end $$;

-- 6. A repeat submission for the same address changes NOTHING, and still
--    just says 'ok' so nobody learns the address is on the list.
do $$
declare
  before_row jsonb;
  before_consents jsonb;
begin
  update ops.waitlist set joined_at = now() - interval '200 days', waitlist_consented_at = now() - interval '200 days' where email = 'maya@example.com';
  select to_jsonb(w) into before_row from ops.waitlist w where email = 'maya@example.com';
  select jsonb_agg(to_jsonb(c) order by id) into before_consents from ops.waitlist_consents c;
  if pg_temp.submit('MAYA@example.com', p_interests => array['sustainable_income'], p_shares => 'not_yet', p_source => 'tiktok', p_client => 'client-b') <> 'ok' then
    raise exception 'FAIL: a repeat submission did not answer ok';
  end if;
  if (select count(*) from ops.waitlist) <> 1
     or (select to_jsonb(w) from ops.waitlist w where email = 'maya@example.com') <> before_row
     or (select jsonb_agg(to_jsonb(c) order by id) from ops.waitlist_consents c) <> before_consents then
    raise exception 'FAIL: a repeat submission changed the existing entry, its consent or its retention date';
  end if;
  raise notice 'PASS: a repeat submission changes nothing about the existing entry';
end $$;

-- 7. Unverified entries can't be confirmed, invited or marked invited; a
--    verified entry can. Addresses not on the waitlist are unaffected.
do $$
begin
  begin
    update ops.waitlist set interest_confirmed_at = now() where email = 'maya@example.com';
    raise exception 'FAIL: an unverified entry recorded a confirmation of interest';
  exception when check_violation then null;
  end;
  begin
    update ops.waitlist set status = 'invited' where email = 'maya@example.com';
    raise exception 'FAIL: an unverified entry was marked invited';
  exception when check_violation then null;
  end;
  begin
    insert into ops.invitations (email, expires_at, source) values ('maya@example.com', now() + interval '7 days', 'waitlist');
    raise exception 'FAIL: an invitation was created for an unverified waitlist address';
  exception when check_violation then null;
  end;
  insert into ops.invitations (email, expires_at, source) values ('outreach@example.com', now() + interval '7 days', 'founder_outreach');
  delete from ops.invitations where email = 'outreach@example.com';
  -- Stands in for the future verification flow.
  update ops.waitlist set email_verified_at = now() where email = 'maya@example.com';
  if not (select verified from ops.waitlist where email = 'maya@example.com') then
    raise exception 'FAIL: a verified entry is not flagged as verified';
  end if;
  insert into ops.invitations (email, expires_at, source) values ('maya@example.com', now() + interval '7 days', 'waitlist');
  raise notice 'PASS: only verified entries can be confirmed or invited';
end $$;

-- 8. Rate limits: per address per day, per client per hour, with salted keys only.
do $$
declare
  i integer;
begin
  -- maya has used 2 of 3 daily attempts (steps 5 and 6).
  if pg_temp.submit('maya@example.com', p_client => 'client-c') <> 'ok' or pg_temp.submit('maya@example.com', p_client => 'client-c') <> 'rate_limited' then
    raise exception 'FAIL: the per-address daily limit did not hold';
  end if;
  for i in 1..10 loop
    if pg_temp.submit(format('person%s@example.com', i), p_client => 'client-d') <> 'ok' then
      raise exception 'FAIL: submission % from one client was refused early', i;
    end if;
  end loop;
  if pg_temp.submit('person11@example.com', p_client => 'client-d') <> 'rate_limited' then
    raise exception 'FAIL: an 11th submission from one client in an hour was not rate limited';
  end if;
  if exists (select 1 from ops.waitlist where email = 'person11@example.com') then
    raise exception 'FAIL: a rate limited submission was stored';
  end if;
  if exists (select 1 from ops.waitlist_rate_limits where bucket !~ '^(global|email:[0-9a-f]{64}|client:[0-9a-f]{64})$')
     or exists (select 1 from ops.waitlist_rate_limits where bucket = 'email:' || md5('maya@example.com')) then
    raise exception 'FAIL: a rate limit key is not a salted 64 character hash';
  end if;
  raise notice 'PASS: per-address and per-client rate limits hold, with salted keys only';
end $$;

-- 9. The admin summary: counts only, verified and unverified apart, no addresses.
do $$
declare
  s jsonb := pg_temp.admin('waitlist_api.admin_summary()');
begin
  if s::text ~* '@|example' then
    raise exception 'FAIL: the admin summary contains an address: %', s;
  end if;
  if (s->>'total')::int <> 11 or (s->>'verified')::int <> 1 or (s->>'unverified')::int <> 10 or s->>'submissions' <> 'ON' then
    raise exception 'FAIL: the admin summary counts are wrong: %', s;
  end if;
  if s->'participant_groups' <> '{"active_creator": 1, "aspiring_creator": 0, "supporter": 0, "none_answered": 10}'::jsonb then
    raise exception 'FAIL: the admin summary participant group counts are wrong: %', s->'participant_groups';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'ops' and table_name = 'waitlist_summary' and column_name ~* 'email|link'
  ) then
    raise exception 'FAIL: the summary view exposes an email or link';
  end if;
  raise notice 'PASS: the admin summary holds counts only, with verified and unverified apart';
end $$;

-- 10. Deletion on request (admin role, by id) removes the person, their
--     consent record, selection reasons and unaccepted invitation, and nothing else.
do $$
declare
  v_id uuid;
  res jsonb;
  r text;
begin
  select id into v_id from ops.waitlist where email = 'maya@example.com';
  insert into ops.waitlist_selections (waitlist_id, wave, reasons) values (v_id, 'wave_1', array['group_balance', 'targeted_feedback']);
  insert into ops.waitlist_selections (waitlist_id, wave, reasons) values (v_id, 'wave_2', array['targeted_feedback']);
  foreach r in array array['{"great vibes"}', '{active_creator}', '{}', '{group_balance,group_balance,targeted_feedback}'] loop
    begin
      insert into ops.waitlist_selections (waitlist_id, wave, reasons) values (v_id, 'wave_3', r::text[]);
      raise exception 'FAIL: selection reasons % were accepted', r;
    exception when check_violation then null;
    end;
  end loop;
  res := pg_temp.admin(format('waitlist_api.admin_delete(%L)', v_id));
  if res <> '{"waitlist": 1, "open_invitations": 1}'::jsonb then
    raise exception 'FAIL: deletion reported %', res;
  end if;
  if exists (select 1 from ops.waitlist where id = v_id)
     or exists (select 1 from ops.waitlist_consents where waitlist_id = v_id)
     or exists (select 1 from ops.waitlist_selections where waitlist_id = v_id)
     or exists (select 1 from ops.invitations where email = 'maya@example.com') then
    raise exception 'FAIL: something about the deleted person remains';
  end if;
  if (select count(*) from ops.waitlist) <> 10 then
    raise exception 'FAIL: deletion touched other people';
  end if;
  if pg_temp.admin(format('waitlist_api.admin_delete(%L)', v_id)) <> '{"waitlist": 0, "open_invitations": 0}'::jsonb then
    raise exception 'FAIL: deleting twice did not report zero';
  end if;
  raise notice 'PASS: deletion on request removes the person and everything linked to them';
end $$;

-- 11. Retention runs from signup, or from a verified confirmation when there
--     is one; unaccepted invitations go too.
do $$
begin
  update ops.waitlist set joined_at = now() - interval '13 months' where email in ('person1@example.com', 'person2@example.com', 'person4@example.com');
  update ops.waitlist set joined_at = now() - interval '11 months' where email = 'person3@example.com';
  -- person4 joined 13 months ago but, verified, confirmed interest last month: kept.
  update ops.waitlist set email_verified_at = now() - interval '2 months', interest_confirmed_at = now() - interval '1 month' where email = 'person4@example.com';
  update ops.waitlist set email_verified_at = now() where email in ('person1@example.com', 'person3@example.com');
  insert into ops.invitations (email, expires_at, source) values
    ('person1@example.com', now() + interval '7 days', 'waitlist'),
    ('person3@example.com', now() + interval '7 days', 'waitlist');
  if pg_temp.admin('waitlist_api.admin_purge(12)') <> '{"waitlist": 2, "open_invitations": 1}'::jsonb then
    raise exception 'FAIL: retention did not purge exactly the two expired entries and one pending invitation';
  end if;
  if exists (select 1 from ops.waitlist where email in ('person1@example.com', 'person2@example.com'))
     or not exists (select 1 from ops.waitlist where email = 'person3@example.com')
     or not exists (select 1 from ops.waitlist where email = 'person4@example.com') then
    raise exception 'FAIL: retention purged the wrong entries';
  end if;
  if exists (select 1 from ops.invitations where email = 'person1@example.com')
     or not exists (select 1 from ops.invitations where email = 'person3@example.com') then
    raise exception 'FAIL: retention left a pending invitation behind, or removed a current one';
  end if;
  begin
    perform pg_temp.admin('waitlist_api.admin_purge(0)');
    raise exception 'FAIL: a retention period of zero months was accepted';
  exception when raise_exception then
    if sqlerrm like 'FAIL:%' then raise; end if;
  end;
  raise notice 'PASS: retention runs from signup or verified confirmation, with pending invitations';
end $$;

-- 12. Closing is immediate and always allowed.
do $$
begin
  if pg_temp.admin('waitlist_api.admin_close()')->>'submissions' <> 'OFF' or pg_temp.submit('late@example.com') <> 'closed' then
    raise exception 'FAIL: closing did not stop submissions at once';
  end if;
  raise notice 'PASS: closing stops submissions at once';
end $$;

-- 13. The summary view reads with the caller's rights: with row level security
--     forced and no policies, a caller who doesn't bypass it sees nothing.
do $$
begin
  alter table ops.waitlist force row level security;
  create role waitlist_probe;
  grant usage on schema ops to waitlist_probe;
  grant select on ops.waitlist, ops.waitlist_summary to waitlist_probe;
  set local role waitlist_probe;
  if (select count(*) from ops.waitlist_summary) <> 0 then
    raise exception 'FAIL: the summary view bypasses row level security';
  end if;
  reset role;
  raise notice 'PASS: the summary view respects row level security';
end $$;

rollback;
