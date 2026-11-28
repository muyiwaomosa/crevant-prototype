-- Waitlist review and invitations, member side (20261224000000). Read-only.
-- Runs on staging and member Production.
\set ON_ERROR_STOP on
-- Skipped only while 20261224000000 is neither recorded nor present. Once it is
-- recorded in the migration history, the check always runs, so a recorded
-- migration whose objects are missing or changed fails instead of skipping.
select to_regclass('supabase_migrations.schema_migrations') is not null as has_history \gset
\if :has_history
select exists (select 1 from supabase_migrations.schema_migrations where version = '20261224000000') as recorded \gset
\else
select false as recorded \gset
\endif
select :'recorded'::boolean or to_regclass('ops.waitlist_review') is not null as waitlist_invitations_applied \gset
\if :waitlist_invitations_applied

do $$
declare
  t text;
  r text;
  f text;
  bad text[] := '{}';
begin
  -- The copies, the deletion queue and the bridge state are private.
  foreach t in array array['ops.waitlist_review', 'ops.waitlist_forget_queue', 'ops.waitlist_bridge_state'] loop
    if not (select relrowsecurity from pg_class where oid = t::regclass) then
      bad := bad || (t || ': row level security off');
    end if;
    foreach r in array array['anon', 'authenticated'] loop
      if has_table_privilege(r, t, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') then
        bad := bad || (t || ': ' || r || ' has privileges');
      end if;
    end loop;
  end loop;
  -- Copies expire within 30 days, one per applicant and per address.
  if not exists (select 1 from pg_constraint where conrelid = 'ops.waitlist_review'::regclass and conname = 'waitlist_review_expiry'
                 and pg_get_constraintdef(oid) like '%30 days%') then
    bad := bad || 'review copies are not limited to 30 days'::text;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'ops.waitlist_review'::regclass and conname = 'waitlist_review_email_unique') then
    bad := bad || 'two copies can share an address'::text;
  end if;
  -- At most one open and one accepted invitation per applicant, and one per link.
  if to_regclass('ops.invitations_one_open_per_applicant') is null or to_regclass('ops.invitations_one_accepted_per_applicant') is null
     or to_regclass('ops.invitations_one_per_link') is null then
    bad := bad || 'an applicant can hold two open or two accepted invitations, or a link two invitations'::text;
  end if;
  -- A replacement revokes the old invitation and its link first, rechecks the launch gate, and is never offered for an accepted one.
  if position('revoked_at = pg_catalog.now() where id = i.id' in (select prosrc from pg_proc where oid = 'ops.bridge_invitation_replace(uuid)'::regprocedure)) = 0
     or position('ops.invites_may_send()' in (select prosrc from pg_proc where oid = 'ops.bridge_invitation_replace_check(uuid)'::regprocedure)) = 0
     or position('already_accepted' in (select prosrc from pg_proc where oid = 'ops.bridge_invitation_replace_check(uuid)'::regprocedure)) = 0 then
    bad := bad || 'a replacement invitation skips revoking the old one, the launch gate or the accepted check'::text;
  end if;
  -- Delivered is only ever set from a provider delivery event.
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname in ('ops', 'public') and p.prosrc ~ 'delivery_status = ''delivered'''
               and p.oid <> 'ops.bridge_delivery_event(text,text,timestamptz)'::regprocedure) then
    bad := bad || 'something other than a provider delivery event marks an invitation delivered'::text;
  end if;
  -- The bridge steps are for the server key only.
  foreach f in array array['public.svc_waitlist_import(jsonb)', 'public.svc_waitlist_withdraw(jsonb)', 'public.svc_waitlist_bridge_pending()',
                           'public.svc_waitlist_forget_done(uuid[])', 'public.svc_waitlist_declined_done(uuid[])', 'public.svc_waitlist_not_confirmed(uuid[])',
                           'public.svc_invitation_create(uuid)', 'public.svc_invitation_delivery(uuid,text,text,text)', 'public.svc_invitation_retry_list()',
                           'public.svc_waitlist_forget_address(text)', 'public.svc_invitation_delivery_event(text,text,timestamptz)',
                           'public.svc_invitation_replace_check(uuid)', 'public.svc_invitation_replace(uuid)', 'public.svc_waitlist_outcomes_done(uuid[])'] loop
    if has_function_privilege('anon', f, 'EXECUTE') or has_function_privilege('authenticated', f, 'EXECUTE') then
      bad := bad || (f || ': callable by visitors or members');
    end if;
    if not has_function_privilege('service_role', f, 'EXECUTE') then
      bad := bad || (f || ': not callable by the server');
    end if;
  end loop;
  -- Nothing is created while external access is closed or registration paused.
  if position('ops.invites_may_send()' in (select prosrc from pg_proc where oid = 'ops.bridge_invitation_create(uuid)'::regprocedure)) = 0
     or position('external_access_approved' in (select prosrc from pg_proc where oid = 'ops.invites_may_send()'::regprocedure)) = 0
     or position('paused' in (select prosrc from pg_proc where oid = 'ops.invites_may_send()'::regprocedure)) = 0 then
    bad := bad || 'an invitation can be created without the launch gate and registration checks'::text;
  end if;
  -- Each invitation is a single-use link.
  if position('ops.create_invitation_link(''waitlist-bridge'', w.cohort, 1,' in (select prosrc from pg_proc where oid = 'ops.bridge_invitation_create(uuid)'::regprocedure)) = 0 then
    bad := bad || 'an invitation link is not single-use'::text;
  end if;
  -- Acceptance on registration, and account deletion carried to the waitlist.
  if not exists (select 1 from pg_trigger where tgrelid = 'ops.registrations'::regclass and tgname = 'registrations_accept_invitation' and tgenabled = 'O') then
    bad := bad || 'registering does not mark the invitation accepted'::text;
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'ops.invitations'::regclass and tgname = 'invitations_forget_waitlist_entry' and tgenabled = 'O') then
    bad := bad || 'deleting an account that came from the waitlist is not carried to the waitlist'::text;
  end if;
  -- The founder functions check the founder.
  foreach f in array array['public.app_founder_waitlist_overview()', 'public.app_founder_waitlist_decide(uuid[],text,text)', 'public.app_founder_waitlist_forget(uuid)'] loop
    if position('social.current_founder()' in (select prosrc from pg_proc where oid = f::regprocedure)) = 0 then
      bad := bad || (f || ': does not check the founder');
    end if;
  end loop;
  -- Only the founder's waitlist functions and the server's bridge steps reach the review copies.
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname in ('public', 'social') and p.proname not like 'app\_founder\_waitlist\_%' and p.proname not like 'svc\_waitlist\_%'
               and p.prosrc ~* '\mops\.(waitlist_founder_overview|waitlist_decide|waitlist_forget_applicant|waitlist_accepted_members|waitlist_review)\M') then
    bad := bad || 'a function other than the founder''s waitlist functions reaches the review copies'::text;
  end if;
  if cardinality(bad) > 0 then
    raise exception 'FAIL: waitlist invitations: %', bad;
  end if;
  raise notice 'PASS: waitlist invitations: private, expiring copies; one single-use invitation per applicant, only behind the launch gate; bridge steps for the server only; founder-only review';
end $$;

\else
\echo 'Skipped 040_waitlist_invitations.sql: 20261224000000 is not applied here.'
\endif
