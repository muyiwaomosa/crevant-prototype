-- TEST ONLY (throwaway databases). BL-009 member side (20261224000000): review
-- copies, cohort decisions, personal invitations behind the launch gate,
-- acceptance on registration, tracking, withdrawals and deletions both ways.
--
--   F = ...0e5f01 the founder   M = ...0e5f02 a member   A = the applicant who registers
-- Everything happens in one transaction that is rolled back.
\set ON_ERROR_STOP on

begin;
set role supabase_auth_admin;
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-4000-8000-0000000e5f01', 'wi-f@example.test', now(), '{}'),
  ('00000000-0000-4000-8000-0000000e5f02', 'wi-m@example.test', now(), '{}');
reset role;
update public.profiles p set username = 'wi_' || right(p.id::text, 1), display_name = 'Wi ' || right(p.id::text, 1)
where p.id in ('00000000-0000-4000-8000-0000000e5f01', '00000000-0000-4000-8000-0000000e5f02');
update ops.member_launch_settings set founder_user_id = '00000000-0000-4000-8000-0000000e5f01', external_access_approved = true where id;
select ops.grant_member_access('00000000-0000-4000-8000-0000000e5f01', 'founder', 'wi-test');
select ops.grant_member_access('00000000-0000-4000-8000-0000000e5f02', 'fan', 'wi-test');
update ops.registration_settings set paused = false where id;

create function pg_temp.expect_error(sql text, expected text, what text)
returns void language plpgsql as $$
declare got text;
begin
  begin execute sql; exception when others then got := sqlerrm; end;
  if got is null then raise exception 'FAIL: % succeeded, expected "%"', what, expected; end if;
  if got !~ expected then raise exception 'FAIL: % failed with "%", expected "%"', what, got, expected; end if;
end; $$;
grant execute on function pg_temp.expect_error(text, text, text) to authenticated, anon, service_role;
create function pg_temp.as_member(n text) returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000e5f0' || n || '","role":"authenticated"}', true) $$;
grant execute on function pg_temp.as_member(text) to authenticated;
-- One exported applicant, as the waitlist's handoff_export returns it.
create function pg_temp.row(n text, email text) returns jsonb language sql as $$
  select jsonb_build_object('waitlist_id', ('00000000-0000-4000-8000-0000000e5a0' || n)::uuid, 'email', email,
    'joined_at', now() - interval '5 days', 'verified_at', now() - interval '4 days', 'consent_version', 'notice-2026-11',
    'consented_at', now() - interval '5 days', 'groups', '["supporter"]'::jsonb, 'intent', 'discover', 'platform', null,
    'audience_band', null, 'introduced_by_creator', false, 'source', 'site', 'creator_ref', null) $$;
grant execute on function pg_temp.row(text, text) to service_role;
create function pg_temp.w(n text) returns uuid language sql immutable as $$ select ('00000000-0000-4000-8000-0000000e5a0' || n)::uuid $$;
grant execute on function pg_temp.w(text) to service_role, authenticated;

do $$
declare
  j jsonb;
  inv jsonb;
  n integer;
  v_a uuid;
begin
  -- 1. Import: copies stored once; anyone already a member, or a repeat, is skipped.
  set local role service_role;
  j := public.svc_waitlist_import(jsonb_build_array(
    pg_temp.row('1', 'wa1@example.test'), pg_temp.row('2', 'wa2@example.test'), pg_temp.row('3', 'wa3@example.test'),
    pg_temp.row('1', 'wa1@example.test'), pg_temp.row('9', 'wi-m@example.test')));
  if j <> '{"imported": 3, "skipped": 2}'::jsonb then raise exception 'FAIL: import stored or skipped the wrong applicants: %', j; end if;
  j := public.svc_waitlist_import(jsonb_build_array(pg_temp.row('4', 'WA1@example.test')));
  if (j ->> 'imported')::int <> 0 then raise exception 'FAIL: a second copy of the same address was stored'; end if;
  reset role;

  -- 2. Only the founder sees applicants or decides; visitors and members can't run any step.
  perform pg_temp.as_member('2');
  set local role authenticated;
  perform pg_temp.expect_error('select public.app_founder_waitlist_overview()', 'not_founder', 'a member reading applicants');
  perform pg_temp.expect_error($q$select public.app_founder_waitlist_decide(array[pg_temp.w('1')], 'approved', 'fan')$q$, 'not_founder', 'a member approving');
  perform pg_temp.expect_error($q$select public.svc_invitation_create(pg_temp.w('1'))$q$, 'permission denied', 'a member creating an invitation');
  perform pg_temp.expect_error($q$select public.svc_waitlist_import('[]'::jsonb)$q$, 'permission denied', 'a member importing applicants');
  reset role;
  set local role anon;
  perform pg_temp.expect_error('select public.app_founder_waitlist_overview()', 'permission denied', 'a visitor reading applicants');
  reset role;

  -- 3. The founder reviews and decides.
  perform pg_temp.as_member('1');
  set local role authenticated;
  j := public.app_founder_waitlist_overview();
  if jsonb_array_length(j -> 'applicants') <> 3 or not (j ->> 'may_send')::boolean then raise exception 'FAIL: the overview was wrong: %', j; end if;
  perform pg_temp.expect_error($q$select public.app_founder_waitlist_decide(array[pg_temp.w('1')], 'approved', null)$q$, 'invalid_cohort', 'approving without a cohort');
  if public.app_founder_waitlist_decide(array[pg_temp.w('1')], 'approved', 'creator') <> 1 then raise exception 'FAIL: approval did not apply'; end if;
  if public.app_founder_waitlist_decide(array[pg_temp.w('2')], 'declined', null) <> 1 then raise exception 'FAIL: decline did not apply'; end if;
  reset role;

  set local role service_role;
  j := public.svc_waitlist_bridge_pending();
  if j -> 'approved' <> jsonb_build_array(pg_temp.w('1')) or j -> 'declined' <> jsonb_build_array(pg_temp.w('2')) then
    raise exception 'FAIL: the bridge did not see exactly the decisions: %', j;
  end if;
  if public.svc_waitlist_declined_done(array[pg_temp.w('2')]) <> 1 then raise exception 'FAIL: the declined copy was not removed'; end if;
  reset role;

  -- 4. Invitations are refused while external access is closed or registration paused.
  update ops.member_launch_settings set external_access_approved = false where id;
  set local role service_role;
  perform pg_temp.expect_error($q$select public.svc_invitation_create(pg_temp.w('1'))$q$, 'invitations_closed', 'an invitation while external access is closed');
  reset role;
  update ops.member_launch_settings set external_access_approved = true where id;
  update ops.registration_settings set paused = true where id;
  set local role service_role;
  perform pg_temp.expect_error($q$select public.svc_invitation_create(pg_temp.w('1'))$q$, 'invitations_closed', 'an invitation while registration is paused');
  reset role;
  update ops.registration_settings set paused = false where id;

  -- 5. One personal, single-use invitation; the copy goes; never twice.
  set local role service_role;
  perform pg_temp.expect_error($q$select public.svc_invitation_create(pg_temp.w('3'))$q$, 'not_approved', 'an invitation for an undecided applicant');
  inv := public.svc_invitation_create(pg_temp.w('1'));
  if inv ->> 'status' <> 'created' or inv ->> 'email' <> 'wa1@example.test' or inv ->> 'code' !~ '^[0-9a-f]{16}$' then
    raise exception 'FAIL: the invitation was not created: %', inv;
  end if;
  perform pg_temp.expect_error($q$select public.svc_invitation_create(pg_temp.w('1'))$q$, 'not_approved', 'a second invitation');
  if not public.svc_invitation_delivery((inv ->> 'invitation_id')::uuid, 'sent', 're_abc123', null) then raise exception 'FAIL: delivery was not recorded'; end if;
  reset role;
  if exists (select 1 from ops.waitlist_review where waitlist_id = pg_temp.w('1')) then raise exception 'FAIL: the copy survived the invitation'; end if;
  if (select (l.max_uses, l.cohort, l.kind) <> (1, 'creator', 'invitation') from ops.registration_links l where l.code = inv ->> 'code') then
    raise exception 'FAIL: the link is not a single-use creator invitation';
  end if;

  -- 6. Registering through the link marks the invitation accepted.
  set local role supabase_auth_admin;
  insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
  values ('00000000-0000-4000-8000-0000000e5f0a', 'wa1@example.test', now(), '{}') returning id into v_a;
  reset role;
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000e5f0a","role":"authenticated"}', true);
  set local role authenticated;
  if public.app_claim_access(inv ->> 'code', true, 'adult-v1') <> 'active' then raise exception 'FAIL: the invitee could not register'; end if;
  reset role;
  if (select accepted_user_id from ops.invitations where id = (inv ->> 'invitation_id')::uuid) is distinct from v_a then
    raise exception 'FAIL: registering did not mark the invitation accepted';
  end if;
  perform pg_temp.as_member('1');
  set local role authenticated;
  j := public.app_founder_waitlist_overview() -> 'invitations';
  if (j ->> 'sent')::int <> 1 or (j ->> 'accepted')::int <> 1 or (j ->> 'open')::int <> 0 then raise exception 'FAIL: the counts were wrong: %', j; end if;
  if public.app_founder_waitlist_decide(array[pg_temp.w('3')], 'approved', 'fan') <> 1 then raise exception 'FAIL: approval did not apply'; end if;
  reset role;

  -- 7. A waitlist withdrawal removes the copy and any open invitation and its link.
  set local role service_role;
  inv := public.svc_invitation_create(pg_temp.w('3'));
  perform public.svc_waitlist_import(jsonb_build_array(pg_temp.row('5', 'wa5@example.test')));
  n := public.svc_waitlist_withdraw(jsonb_build_array(
    jsonb_build_object('waitlist_id', pg_temp.w('3'), 'withdrawn_at', now()),
    jsonb_build_object('waitlist_id', pg_temp.w('5'), 'withdrawn_at', now())));
  if n <> 1 then raise exception 'FAIL: the open invitation was not removed (% removed)', n; end if;
  -- It reads again from an hour before the last withdrawal seen, so one committed late is never skipped.
  if (public.svc_waitlist_bridge_pending() ->> 'withdrawals_since')::timestamptz not between now() - interval '61 minutes' and now() - interval '59 minutes' then
    raise exception 'FAIL: the withdrawal read position did not advance with an hour of overlap';
  end if;
  reset role;
  if exists (select 1 from ops.waitlist_review where waitlist_id in (pg_temp.w('3'), pg_temp.w('5')))
     or exists (select 1 from ops.invitations where waitlist_id = pg_temp.w('3'))
     or (select revoked_at is null from ops.registration_links where code = inv ->> 'code') then
    raise exception 'FAIL: a withdrawal left a copy, an invitation or a usable link';
  end if;

  -- 8. Deletion requests: from Control Center, and a member deleting their account.
  set local role service_role;
  perform public.svc_waitlist_import(jsonb_build_array(pg_temp.row('6', 'wa6@example.test')));
  reset role;
  perform pg_temp.as_member('1');
  set local role authenticated;
  perform public.app_founder_waitlist_forget(pg_temp.w('6'));
  reset role;
  if exists (select 1 from ops.waitlist_review where waitlist_id = pg_temp.w('6')) then raise exception 'FAIL: the copy survived a deletion request'; end if;
  perform ops.forget_member_invitations(v_a);
  set local role service_role;
  j := public.svc_waitlist_bridge_pending() -> 'forget';
  if not (j @> jsonb_build_array(pg_temp.w('6')) and j @> jsonb_build_array(pg_temp.w('1'))) then
    raise exception 'FAIL: the deletions were not queued for the waitlist: %', j;
  end if;
  if public.svc_waitlist_forget_done(array[pg_temp.w('6'), pg_temp.w('1')]) <> 2 then raise exception 'FAIL: confirmed deletions stayed queued'; end if;
  -- A queued or deleted applicant is never imported again.
  reset role;
  insert into ops.waitlist_forget_queue (waitlist_id, reason) values (pg_temp.w('7'), 'applicant_request');
  set local role service_role;
  if (public.svc_waitlist_import(jsonb_build_array(pg_temp.row('7', 'wa7@example.test'))) ->> 'imported')::int <> 0 then
    raise exception 'FAIL: an applicant queued for deletion was imported';
  end if;
  reset role;

  -- A deletion request by address removes the copy (the waitlist side is the bridge's).
  set local role service_role;
  perform public.svc_waitlist_import(jsonb_build_array(pg_temp.row('9', 'wa9@example.test')));
  if public.svc_waitlist_forget_address(' WA9@example.test ') <> 1 then raise exception 'FAIL: deletion by address did not remove the copy'; end if;
  reset role;

  -- 10. Outcomes the waitlist has not recorded yet stay pending until it confirms.
  set local role service_role;
  perform public.svc_waitlist_import(jsonb_build_array(pg_temp.row('a', 'waa@example.test')));
  reset role;
  update ops.waitlist_review set decision = 'approved', cohort = 'fan', decided_at = now() where waitlist_id = pg_temp.w('a');
  set local role service_role;
  inv := public.svc_invitation_create(pg_temp.w('a'));
  if not (public.svc_waitlist_bridge_pending() -> 'outcomes') @> jsonb_build_array(pg_temp.w('a')) then
    raise exception 'FAIL: an outcome the waitlist has not recorded was not pending';
  end if;
  if public.svc_waitlist_outcomes_done(array[pg_temp.w('a')]) <> 1 then raise exception 'FAIL: the recorded outcome was not marked'; end if;
  if (public.svc_waitlist_bridge_pending() -> 'outcomes') @> jsonb_build_array(pg_temp.w('a')) then
    raise exception 'FAIL: a recorded outcome stayed pending';
  end if;

  -- 11. Delivery: sent means only the provider accepted it; delivered needs the provider's event.
  perform public.svc_invitation_delivery((inv ->> 'invitation_id')::uuid, 'sent', 'msg_a1', null);
  if (select delivery_status from ops.invitations where id = (inv ->> 'invitation_id')::uuid) <> 'sent' then raise exception 'FAIL: not recorded as sent'; end if;
  if public.svc_invitation_delivery_event('msg_a1', 'email.opened', now()) then raise exception 'FAIL: an unknown event was applied'; end if;
  if not public.svc_invitation_delivery_event('msg_a1', 'email.delivered', now()) then raise exception 'FAIL: the delivered event was not applied'; end if;
  if public.svc_invitation_delivery_event('msg_a1', 'email.delivery_delayed', now() + interval '1 minute') then
    raise exception 'FAIL: a delay replaced a confirmed delivery';
  end if;
  if public.svc_invitation_delivery_event('msg_a1', 'email.bounced', now() - interval '1 hour') then
    raise exception 'FAIL: an older event overwrote a newer one';
  end if;
  if (select (delivery_status, delivered_at is not null) <> ('delivered', true) from ops.invitations where id = (inv ->> 'invitation_id')::uuid) then
    raise exception 'FAIL: the delivery was not recorded with its time';
  end if;
  if public.svc_invitation_delivery_event('msg_nobody', 'email.delivered', now()) then raise exception 'FAIL: an unknown message was applied'; end if;

  -- 12. Recovery: an open invitation can't be replaced; an expired one can, once,
  --     revoking it and its link first; never two open at once.
  perform pg_temp.expect_error(format('select public.svc_invitation_replace_check(%L::uuid)', inv ->> 'invitation_id'), 'still_open', 'replacing an open, delivered invitation');
  reset role;
  update ops.invitations set created_at = now() - interval '15 days', expires_at = now() - interval '1 day' where id = (inv ->> 'invitation_id')::uuid;
  set local role service_role;
  if public.svc_invitation_replace_check((inv ->> 'invitation_id')::uuid) ->> 'waitlist_id' <> pg_temp.w('a')::text then raise exception 'FAIL: the replacement check did not name the applicant'; end if;
  j := public.svc_invitation_replace((inv ->> 'invitation_id')::uuid);
  if j ->> 'status' <> 'created' or j ->> 'code' = inv ->> 'code' then raise exception 'FAIL: no new invitation: %', j; end if;
  perform pg_temp.expect_error(format('select public.svc_invitation_replace(%L::uuid)', inv ->> 'invitation_id'), 'already_replaced', 'replacing the same invitation twice');
  reset role;
  if (select count(*) from ops.invitations where waitlist_id = pg_temp.w('a') and accepted_at is null and revoked_at is null) <> 1
     or (select revoked_at is null from ops.registration_links where code = inv ->> 'code')
     or (select replaces_id from ops.invitations where id = (j ->> 'invitation_id')::uuid) <> (inv ->> 'invitation_id')::uuid then
    raise exception 'FAIL: the replacement left two open invitations, a usable old link, or no link to what it replaced';
  end if;
  -- A failed email can be replaced too; a stuck send is retried after 10 minutes; a bounce never is.
  update ops.invitations set delivery_status = 'sending', created_at = now() - interval '11 minutes' where id = (j ->> 'invitation_id')::uuid;
  set local role service_role;
  if not exists (select 1 from jsonb_array_elements(public.svc_invitation_retry_list()) r where r ->> 'invitation_id' = j ->> 'invitation_id') then
    raise exception 'FAIL: an invitation stuck sending was not retried';
  end if;
  perform public.svc_invitation_delivery((j ->> 'invitation_id')::uuid, 'sent', 'msg_a2', null);
  perform public.svc_invitation_delivery_event('msg_a2', 'email.bounced', now());
  if exists (select 1 from jsonb_array_elements(public.svc_invitation_retry_list()) r where r ->> 'invitation_id' = j ->> 'invitation_id') then
    raise exception 'FAIL: a bounced invitation was retried automatically';
  end if;
  if public.svc_invitation_replace_check((j ->> 'invitation_id')::uuid) ->> 'waitlist_id' is null then raise exception 'FAIL: a bounced invitation could not be replaced'; end if;
  reset role;
  -- Never once accepted.
  update ops.invitations set accepted_at = now() where id = (j ->> 'invitation_id')::uuid;
  set local role service_role;
  perform pg_temp.expect_error(format('select public.svc_invitation_replace_check(%L::uuid)', j ->> 'invitation_id'), 'already_accepted', 'replacing after the applicant accepted');
  reset role;

  -- 9. Copies expire after 30 days.
  update ops.waitlist_review set imported_at = now() - interval '31 days', expires_at = now() - interval '1 day' where waitlist_id = pg_temp.w('3');
  insert into ops.waitlist_review (waitlist_id, email, joined_at, verified_at, consent_version, consented_at, imported_at, expires_at)
  values (pg_temp.w('8'), 'wa8@example.test', now(), now(), 'notice-2026-11', now(), now() - interval '31 days', now() - interval '1 day');
  perform pg_temp.as_member('1');
  set local role authenticated;
  if exists (select 1 from jsonb_array_elements(public.app_founder_waitlist_overview() -> 'applicants') a where a ->> 'email' = 'wa8@example.test') then
    raise exception 'FAIL: an expired copy was shown';
  end if;
  reset role;
  if exists (select 1 from ops.waitlist_review where waitlist_id = pg_temp.w('8')) then raise exception 'FAIL: an expired copy was kept'; end if;
  raise notice 'PASS: waitlist invitations: founder-only review and decisions; copies once, expiring; single-use invitations only behind the launch gate; accepted on registration; counts; withdrawals, deletions and outcomes carried until confirmed; delivered only from provider events; expired, failed or bounced invitations replaceable, never two open';
end $$;

rollback;
