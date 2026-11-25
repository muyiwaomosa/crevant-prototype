-- TEST ONLY (throwaway databases). Since 20261130000000 every member function
-- requires the member's own 18+ confirmation (ops.age_attestations). The
-- behaviour tests that follow grant many fixture accounts membership, so this
-- records a 'test' confirmation for each account as it is granted, the way
-- 005 opens the launch gate. supabase/tests-local/120_foundation_v2.sql drops
-- this trigger to test the requirement itself. Never installed on staging or
-- Production: it lives only in this file and in scripts/db/local-open-launch-gate.sh.
\set ON_ERROR_STOP on
create schema if not exists test_support;
revoke all on schema test_support from public, anon, authenticated;
create or replace function test_support.auto_attest()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into ops.age_attestations (user_id, wording_version, source)
  values (new.user_id, 'test', 'test')
  on conflict (user_id) do nothing;
  return new;
end;
$$;
revoke all on function test_support.auto_attest() from public, anon, authenticated;
drop trigger if exists zz_test_auto_attest on ops.member_access;
create trigger zz_test_auto_attest
after insert or update on ops.member_access
for each row execute function test_support.auto_attest();
-- Accounts that already hold membership (created before this file ran).
insert into ops.age_attestations (user_id, wording_version, source)
select a.user_id, 'test', 'test' from ops.member_access a
on conflict (user_id) do nothing;
do $$ begin raise notice 'PASS: test setup: fixture members get a test adult confirmation'; end $$;
