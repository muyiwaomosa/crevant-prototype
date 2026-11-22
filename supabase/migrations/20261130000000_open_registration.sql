-- Open registration for the beta: anyone who registers and verifies their
-- email receives membership by claiming it once signed in.
-- STAGING ONLY until approved for Production (see supabase/production-migrations.txt).
--
-- What this migration adds: public.app_claim_access(), which a signed-in
-- account calls for itself (the member app calls it automatically when its
-- membership state is 'none'). It gives that account membership in the
-- 'tester' cohort when, and only when:
--   * the account's email is verified (auth.users.email_confirmed_at);
--   * the account has NO membership row at all: a revoked or expired row is
--     never reopened by claiming, so suspending an account sticks;
--   * external member access is open (ops.member_launch_settings
--     .external_access_approved). The launch gate trigger checks that again
--     on the insert itself, for every path.
--
-- Nothing else changes. Membership, its history, the launch gate, revoking,
-- moderation and every member function stay as they are. This grants
-- nothing by itself: while external access is closed (the default, and the
-- state after every migration, on every database) a claim answers 'closed'
-- and changes nothing.
--
-- Why a claim and not a trigger on auth.users: a trigger would run inside
-- Supabase Auth's own email confirmation, where any error would break the
-- confirmation. A claim is a separate, idempotent call: if it fails (a
-- network error, external access closed at that moment), the next page
-- load claims again, and verifying the email is never affected.
--
-- Results (text): 'active' (already a member, or granted now), 'closed'
-- (registration is not open, nothing changed), 'not_confirmed' (email not
-- verified yet), 'revoked' or 'expired' (suspended or ended: claiming never
-- reopens it). Errors: 'not_signed_in'.

create function public.app_claim_access()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  a ops.member_access;
  v_open boolean;
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = 'P0001';
  end if;

  -- Any existing row decides: claiming never reopens a revoked or expired membership.
  select * into a from ops.member_access where user_id = v_uid;
  if found then
    return case
      when a.status = 'revoked' then 'revoked'
      when a.expires_at is not null and a.expires_at <= pg_catalog.now() then 'expired'
      else 'active'
    end;
  end if;

  if not exists (select 1 from auth.users u where u.id = v_uid and u.email_confirmed_at is not null) then
    return 'not_confirmed';
  end if;

  select s.external_access_approved into v_open from ops.member_launch_settings s where s.id;
  if not coalesce(v_open, false) then
    return 'closed';
  end if;

  begin
    insert into ops.member_access (user_id, cohort, status, updated_by, reason)
    values (v_uid, 'tester', 'active', 'self-service', 'open registration')
    on conflict (user_id) do nothing;
  exception when check_violation then
    -- The launch gate refused: external access was closed in the meantime.
    return 'closed';
  end;

  -- A concurrent claim (or grant) may have written the row first: report what is there.
  select * into a from ops.member_access where user_id = v_uid;
  return case
    when a.status = 'revoked' then 'revoked'
    when a.expires_at is not null and a.expires_at <= pg_catalog.now() then 'expired'
    else 'active'
  end;
end;
$$;
comment on function public.app_claim_access() is 'Open registration: the signed-in account claims membership for itself (cohort tester) once its email is verified, only while external member access is open, and never when it already has a membership row (a revoked or expired membership stays so). Idempotent.';

revoke all on function public.app_claim_access() from public, anon;
grant execute on function public.app_claim_access() to authenticated;
