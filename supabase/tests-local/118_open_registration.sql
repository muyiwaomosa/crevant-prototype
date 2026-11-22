-- TEST ONLY (throwaway databases). Open registration (20261130000000):
-- public.app_claim_access(). Runs after 117, which leaves external access
-- open. This tests claiming while open, closes it, tests claiming while
-- closed, and reopens it at the end.
--
--   A = ...d801: verified, never a member (claims while open).
--   U = ...d802: not verified yet.
--   R = ...d803: a member who is then revoked (suspended).
--   X = ...d804: a member whose access then expires.
--   C = ...d805: verified, never a member (claims while closed, then while open).

set role supabase_auth_admin;
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-4000-8000-00000000d801', 'or-a@example.test', now()),
  ('00000000-0000-4000-8000-00000000d802', 'or-u@example.test', null),
  ('00000000-0000-4000-8000-00000000d803', 'or-r@example.test', now()),
  ('00000000-0000-4000-8000-00000000d804', 'or-x@example.test', now()),
  ('00000000-0000-4000-8000-00000000d805', 'or-c@example.test', now());
reset role;

create function pg_temp.expect_error_or(sql text, expected text, what text)
returns void language plpgsql as $$
declare got text;
begin
  begin execute sql; exception when others then got := sqlerrm; end;
  if got is null then raise exception 'FAIL: % succeeded, expected "%"', what, expected; end if;
  if got !~ expected then raise exception 'FAIL: % failed with "%", expected "%"', what, got, expected; end if;
end;
$$;
grant execute on function pg_temp.expect_error_or(text, text, text) to service_role, authenticated, anon;

-- Setup as the server: R is a member, then revoked; X is a member whose access then ends.
select ops.grant_member_access('00000000-0000-4000-8000-00000000d803', 'tester', 'test');
select ops.revoke_member_access('00000000-0000-4000-8000-00000000d803', 'test', 'suspended for the test');
select ops.grant_member_access('00000000-0000-4000-8000-00000000d804', 'tester', 'test', now() + interval '1 day');
update ops.member_access set expires_at = now() - interval '1 minute' where user_id = '00000000-0000-4000-8000-00000000d804';

do $$
begin
  if not (select external_access_approved from ops.member_launch_settings where id) then
    raise exception 'FAIL (setup): 117 should leave external access open';
  end if;
end $$;

-- 1. Who may call it: never anon, never without a signed-in account.
begin;
set local role anon;
do $$ begin
  perform pg_temp.expect_error_or($q$select public.app_claim_access()$q$, 'permission denied', 'an anonymous visitor claiming');
  raise notice 'PASS: anonymous visitors cannot claim membership';
end $$;
commit;
begin;
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  perform pg_temp.expect_error_or($q$select public.app_claim_access()$q$, 'not_signed_in', 'a claim without an account');
  raise notice 'PASS: a claim without a signed-in account is refused';
end $$;
commit;

-- 2. While open: a verified account with no membership gets the tester cohort, recorded; claiming again changes nothing.
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000d801","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  if public.app_claim_access() <> 'active' then raise exception 'FAIL: a verified account was not given membership while registration is open'; end if;
  if (select status from public.app_access_state()) <> 'active' then raise exception 'FAIL: after claiming, the account is not active'; end if;
  if public.app_claim_access() <> 'active' then raise exception 'FAIL: claiming again did not answer active'; end if;
  perform public.app_me();
  raise notice 'PASS: while open, a verified account claims membership and can use the member app; claiming again is harmless';
end $$;
commit;
do $$ begin
  if (select count(*) from ops.member_access where user_id = '00000000-0000-4000-8000-00000000d801') <> 1
     or not exists (select 1 from ops.member_access where user_id = '00000000-0000-4000-8000-00000000d801'
                    and cohort = 'tester' and status = 'active' and expires_at is null and updated_by = 'self-service' and reason = 'open registration') then
    raise exception 'FAIL: the claimed membership is not one active tester row by self-service';
  end if;
  if (select count(*) from ops.member_access_events where user_id = '00000000-0000-4000-8000-00000000d801' and action = 'granted') <> 1 then
    raise exception 'FAIL: the claim was not recorded exactly once in the history';
  end if;
  raise notice 'PASS: one tester membership, recorded once, by self-service';
end $$;

-- 3. Not verified: nothing is given.
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000d802","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  if public.app_claim_access() <> 'not_confirmed' then raise exception 'FAIL: an unverified account was not answered not_confirmed'; end if;
  raise notice 'PASS: an account whose email is not verified cannot claim membership';
end $$;
commit;

-- 4. Suspended or ended: claiming never reopens it, even while open.
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000d803","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  if public.app_claim_access() <> 'revoked' then raise exception 'FAIL: a revoked account was not answered revoked'; end if;
  if (select status from public.app_access_state()) <> 'revoked' then raise exception 'FAIL: claiming reopened a revoked membership'; end if;
  perform pg_temp.expect_error_or($q$select public.app_feed(null, 10)$q$, 'no_pilot_access', 'a revoked account reading the feed after claiming');
  raise notice 'PASS: a suspended (revoked) account stays suspended: claiming never reopens it';
end $$;
commit;
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000d804","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  if public.app_claim_access() <> 'expired' then raise exception 'FAIL: an expired account was not answered expired'; end if;
  if (select status from public.app_access_state()) <> 'expired' then raise exception 'FAIL: claiming extended an expired membership'; end if;
  raise notice 'PASS: an ended (expired) membership stays ended: claiming never extends it';
end $$;
commit;
do $$ begin
  if (select count(*) from ops.member_access_events where user_id = '00000000-0000-4000-8000-00000000d803' and action = 'restored') <> 0 then
    raise exception 'FAIL: the revoked membership was restored';
  end if;
end $$;

-- 5. Closed: registration closed answers 'closed' and gives nothing; existing members keep access.
select ops.set_external_access('test', false);
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000d805","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  if public.app_claim_access() <> 'closed' then raise exception 'FAIL: a claim while closed was not answered closed'; end if;
  if (select status from public.app_access_state()) <> 'none' then raise exception 'FAIL: a claim while closed gave membership'; end if;
  raise notice 'PASS: while registration is closed, a claim gives nothing';
end $$;
commit;
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000d801","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  if public.app_claim_access() <> 'active' or (select status from public.app_access_state()) <> 'active' then
    raise exception 'FAIL: closing registration took access away from an existing member';
  end if;
  perform public.app_me();
  raise notice 'PASS: closing registration does not suspend existing members';
end $$;
commit;

-- 6. The gate itself refuses a self-service row while closed, whatever the path (the claim's insert is checked by the trigger too).
do $$ begin
  perform pg_temp.expect_error_or($q$insert into ops.member_access (user_id, cohort, status, updated_by, reason) values ('00000000-0000-4000-8000-00000000d805', 'tester', 'active', 'self-service', 'open registration')$q$,
    'external member access is not approved', 'a self-service row written while closed');
  raise notice 'PASS: the launch gate refuses a self-service row while registration is closed';
end $$;

-- 7. Reopened: the account that was refused while closed claims successfully now (retry works).
select ops.set_external_access('test', true, 'APPROVE EXTERNAL MEMBER ACCESS');
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000d805","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  if public.app_claim_access() <> 'active' then raise exception 'FAIL: a retry after reopening did not give membership'; end if;
  raise notice 'PASS: a claim refused while closed succeeds on retry once registration is open';
end $$;
commit;

-- 8. Never the founder cohort, and the server key gets nothing from it.
do $$ begin
  if exists (select 1 from ops.member_access where updated_by = 'self-service' and cohort <> 'tester') then
    raise exception 'FAIL: self-service gave a cohort other than tester';
  end if;
end $$;
begin;
set local role service_role;
do $$ begin
  perform pg_temp.expect_error_or($q$select public.app_claim_access()$q$, '(not_signed_in|permission denied)', 'the server key claiming');
  raise notice 'PASS: only the tester cohort is ever claimed, and the server key cannot claim';
end $$;
commit;
