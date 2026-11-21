-- TEST ONLY (throwaway databases). The member launch gate (20261129000000)
-- starts closed: only the launch founder may be given membership. The
-- behaviour tests that follow grant many tester, creator and fan accounts,
-- so this opens it here, through the same recorded, phrase-protected
-- function an operator would use (no bypass). supabase/tests-local/117
-- closes it again to test the gate itself. Never run against staging or
-- Production: nothing opens the gate there except a separately approved,
-- recorded operation.
select ops.set_external_access('local-tests', true, 'APPROVE EXTERNAL MEMBER ACCESS');
do $$
begin
  if not (select external_access_approved from ops.member_launch_settings where id)
     or not exists (select 1 from ops.member_launch_events where action = 'external_access_opened' and actor = 'local-tests') then
    raise exception 'FAIL: the test setup could not open the launch gate';
  end if;
  raise notice 'PASS: test setup: external member access opened (recorded) for the throwaway test database';
end $$;
