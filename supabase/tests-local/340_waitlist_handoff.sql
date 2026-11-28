-- TEST ONLY (throwaway databases). BL-009 waitlist side (20261223000000):
-- email verification links and the handoff, as the real login roles.
-- Everything happens in one transaction that is rolled back.
\set ON_ERROR_STOP on

begin;

-- Four entries, written as the table owner:
--   v1  verified on joining here (as if by link), consented      -> exported
--   v2  unverified, consented                                    -> verified by link, then exported
--   v3  verified but no consent record                          -> never exported
--   v4  verified, consented, joined 13 months ago (retention)    -> never exported
insert into ops.waitlist (id, email, interests, shares_content, platform, audience_band, source, age_confirmed,
                          waitlist_consent_version, waitlist_consented_at, joined_at, email_verified_at, intent, introduced_by_creator)
values
  ('00000000-0000-4000-8000-0000000d0f01', 'h1@example.test', '{support_creators}', null, null, null, 'site', true, 'notice-2026-11', now(), now() - interval '3 days', now(), 'discover', false),
  ('00000000-0000-4000-8000-0000000d0f02', 'h2@example.test', '{reach_followers}', 'yes', 'youtube', '1k_10k', null, true, 'notice-2026-11', now(), now() - interval '2 days', null, 'create', true),
  ('00000000-0000-4000-8000-0000000d0f03', 'h3@example.test', '{}', null, null, null, null, true, 'notice-2026-11', now(), now() - interval '1 day', now(), null, null),
  ('00000000-0000-4000-8000-0000000d0f04', 'h4@example.test', '{}', null, null, null, null, true, 'notice-2026-11', now(), now() - interval '13 months', now() - interval '13 months', null, null);
insert into ops.waitlist_consents (waitlist_id, kind, granted, notice_version)
select id, 'waitlist', true, 'notice-2026-11' from ops.waitlist
where id in ('00000000-0000-4000-8000-0000000d0f01', '00000000-0000-4000-8000-0000000d0f02', '00000000-0000-4000-8000-0000000d0f04');

do $$
declare
  t1 text; t2 text; t3 text; t4 text;
  got text;
  j jsonb;
  ids uuid[];
  v1 constant uuid := '00000000-0000-4000-8000-0000000d0f01';
  v2 constant uuid := '00000000-0000-4000-8000-0000000d0f02';
begin
  -- Unverified entries are never handed off.
  set local role waitlist_handoff;
  if exists (select 1 from jsonb_array_elements(waitlist_api.handoff_export(500)) e where e ->> 'email' = 'h2@example.test') then
    raise exception 'FAIL: an unverified entry was handed off';
  end if;
  reset role;
  -- (That export marked v1; clear it so the steps below start fresh.)
  update ops.waitlist set handoff_exported_at = null;

  -- Verification links: 3 a day for an unverified entry, the newest replacing the last.
  set local role waitlist_writer;
  t1 := waitlist_api.verification_issue('  H2@Example.test ');
  t2 := waitlist_api.verification_issue('h2@example.test');
  t3 := waitlist_api.verification_issue('h2@example.test');
  t4 := waitlist_api.verification_issue('h2@example.test');
  if t1 !~ '^[0-9a-f]{64}$' or t2 !~ '^[0-9a-f]{64}$' or t3 !~ '^[0-9a-f]{64}$' then raise exception 'FAIL: a verification link was not issued'; end if;
  if t4 is not null then raise exception 'FAIL: a fourth link was issued within a day'; end if;
  if waitlist_api.verification_issue('h1@example.test') is not null then raise exception 'FAIL: a link was issued for a verified entry'; end if;
  if waitlist_api.verification_issue('nobody@example.test') is not null then raise exception 'FAIL: a link was issued for an address not on the list'; end if;
  reset role;
  if exists (select 1 from ops.waitlist_email_verifications where token_hash in (t1, t2, t3)) then
    raise exception 'FAIL: a raw token was stored';
  end if;

  set local role waitlist_writer;
  if waitlist_api.verify_email('nonsense') <> 'invalid' then raise exception 'FAIL: a malformed token was accepted'; end if;
  if waitlist_api.verify_email(t1) <> 'invalid' then raise exception 'FAIL: a replaced link still worked'; end if;
  reset role;
  update ops.waitlist_email_verifications set expires_at = now() - interval '1 minute' where waitlist_id = v2;
  set local role waitlist_writer;
  if waitlist_api.verify_email(t3) <> 'expired' then raise exception 'FAIL: an expired link was not reported as expired'; end if;
  reset role;
  update ops.waitlist_email_verifications set expires_at = now() + interval '1 hour' where waitlist_id = v2;
  set local role waitlist_writer;
  got := waitlist_api.verify_email(t3);
  if got <> 'verified' then raise exception 'FAIL: a valid link did not verify (got %)', got; end if;
  if waitlist_api.verify_email(t3) <> 'invalid' then raise exception 'FAIL: a link worked twice'; end if;
  reset role;
  if (select email_verified_at is null or interest_confirmed_at is null from ops.waitlist where id = v2) then
    raise exception 'FAIL: verifying did not record the verification and confirmation';
  end if;

  -- Export: verified and consenting only, the minimum fields, once.
  set local role waitlist_handoff;
  j := waitlist_api.handoff_export(500);
  reset role;
  if jsonb_array_length(j) <> 2 or (select array_agg(e ->> 'email' order by e ->> 'email') from jsonb_array_elements(j) e) <> array['h1@example.test', 'h2@example.test'] then
    raise exception 'FAIL: the export was not exactly the two verified, consenting, current entries: %', j;
  end if;
  if exists (select 1 from jsonb_array_elements(j) e, jsonb_object_keys(e) k
             where k not in ('waitlist_id', 'email', 'joined_at', 'verified_at', 'consent_version', 'consented_at', 'groups', 'intent',
                             'platform', 'audience_band', 'introduced_by_creator', 'source', 'creator_ref')) then
    raise exception 'FAIL: the export carries more than the minimum fields';
  end if;
  if (select e -> 'groups' from jsonb_array_elements(j) e where e ->> 'email' = 'h2@example.test') <> '["active_creator"]'::jsonb then
    raise exception 'FAIL: the participant groups were not carried';
  end if;
  set local role waitlist_handoff;
  if jsonb_array_length(waitlist_api.handoff_export(500)) <> 0 then raise exception 'FAIL: an entry was exported twice'; end if;

  -- Recheck, then record an outcome: decided entries are no longer eligible.
  ids := waitlist_api.handoff_recheck(array[v1, v2]);
  if cardinality(ids) <> 2 then raise exception 'FAIL: the recheck did not confirm both entries'; end if;
  if not waitlist_api.handoff_record(v1, 'invited') then raise exception 'FAIL: the outcome was not recorded'; end if;
  if waitlist_api.handoff_record(v1, 'declined') then raise exception 'FAIL: an outcome was recorded twice'; end if;
  if waitlist_api.handoff_recheck(array[v1]) <> '{}' then raise exception 'FAIL: an invited entry was still eligible'; end if;
  begin
    perform waitlist_api.handoff_record(v2, 'shortlisted');
    raise exception 'FAIL: an unknown outcome was accepted';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  reset role;
  if (select status from ops.waitlist where id = v1) <> 'invited' then raise exception 'FAIL: the waitlist status did not follow the outcome'; end if;

  -- Withdrawal: a handed-off entry deleted on request is reported by id only.
  set local role waitlist_handoff;
  if waitlist_api.handoff_forget(array[v2]) <> 1 then raise exception 'FAIL: the deletion request did not delete the entry'; end if;
  j := waitlist_api.handoff_withdrawals(now() - interval '1 hour');
  if not exists (select 1 from jsonb_array_elements(j) e where (e ->> 'waitlist_id')::uuid = v2) then
    raise exception 'FAIL: the deleted entry was not reported as withdrawn';
  end if;
  if j::text like '%@%' then raise exception 'FAIL: a withdrawal carried an address'; end if;

  -- The handoff login reads no table.
  begin
    perform count(*) from ops.waitlist;
    raise exception 'FAIL: waitlist_handoff could read ops.waitlist';
  exception when insufficient_privilege then null;
  end;
  begin
    perform waitlist_api.admin_summary();
    raise exception 'FAIL: waitlist_handoff could run an admin function';
  exception when insufficient_privilege then null;
  end;
  reset role;
  if exists (select 1 from ops.waitlist where id = v2) then raise exception 'FAIL: the entry survived its deletion'; end if;
  raise notice 'PASS: waitlist handoff: links verify once and expire; only verified, consenting, current entries are exported, once, with the minimum fields; outcomes, rechecks and withdrawals by id; the handoff login reads nothing else';
end $$;

rollback;
