-- Waitlist email verification and the BL-009 handoff (20261223000000).
-- Read-only. Runs on the waitlist project, staging and member Production.
\set ON_ERROR_STOP on
-- Skipped until the migration is applied.
select to_regclass('ops.waitlist_withdrawals') is not null as waitlist_handoff_applied \gset
\if :waitlist_handoff_applied

do $$
declare
  t text;
  r text;
begin
  foreach t in array array['ops.waitlist_email_verifications', 'ops.waitlist_withdrawals'] loop
    if not (select relrowsecurity from pg_class where oid = t::regclass) then
      raise exception 'FAIL: % has row level security off', t;
    end if;
    foreach r in array array['anon', 'authenticated', 'waitlist_writer', 'waitlist_admin', 'waitlist_handoff'] loop
      if has_table_privilege(r, t, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') then
        raise exception 'FAIL: % has privileges on %', r, t;
      end if;
    end loop;
  end loop;
  -- Only a hash of a verification link is kept, and withdrawals hold no address.
  if exists (select 1 from information_schema.columns where table_schema = 'ops' and table_name = 'waitlist_email_verifications'
             and column_name not in ('waitlist_id', 'token_hash', 'expires_at', 'issued_today', 'day_started', 'issued_at')) then
    raise exception 'FAIL: ops.waitlist_email_verifications has a column beyond the token hash, expiry and issue counts';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'ops' and table_name = 'waitlist_withdrawals'
             and column_name not in ('waitlist_id', 'withdrawn_at')) then
    raise exception 'FAIL: ops.waitlist_withdrawals holds more than an id and a time';
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'ops.waitlist_email_verifications'::regclass and contype = 'c'
                 and pg_get_constraintdef(oid) like '%token_hash%[0-9a-f]{64}%') then
    raise exception 'FAIL: verification tokens are not stored as a 64-character hash';
  end if;
  -- Removing a handed-off entry always leaves a withdrawal for the member project.
  if not exists (select 1 from pg_trigger where tgrelid = 'ops.waitlist'::regclass and tgname = 'waitlist_record_withdrawal' and tgenabled = 'O') then
    raise exception 'FAIL: removing a handed-off entry does not record a withdrawal';
  end if;
  -- Nobody but the handoff login can run the handoff, and no API role can run any of it.
  foreach r in array array['anon', 'authenticated', 'service_role', 'waitlist_writer', 'waitlist_admin'] loop
    if has_function_privilege(r, 'waitlist_api.handoff_export(integer)', 'EXECUTE')
       or has_function_privilege(r, 'waitlist_api.handoff_forget(uuid[])', 'EXECUTE')
       or has_function_privilege(r, 'waitlist_api.handoff_forget_email(text)', 'EXECUTE') then
      raise exception 'FAIL: % can run the waitlist handoff', r;
    end if;
  end loop;
  foreach r in array array['anon', 'authenticated', 'service_role', 'waitlist_handoff'] loop
    if has_function_privilege(r, 'waitlist_api.verify_email(text)', 'EXECUTE')
       or has_function_privilege(r, 'waitlist_api.verification_issue(text)', 'EXECUTE') then
      raise exception 'FAIL: % can issue or check verification links', r;
    end if;
  end loop;
  if (select rolconnlimit from pg_roles where rolname = 'waitlist_handoff') not between 0 and 3 then
    raise exception 'FAIL: waitlist_handoff allows more than 3 connections';
  end if;
  raise notice 'PASS: waitlist verification and handoff: tokens hashed, withdrawals hold ids only, tables private, the handoff runs only as its own login';
end $$;

\else
\echo 'Skipped 039_waitlist_handoff.sql: 20261223000000 is not applied here.'
\endif
