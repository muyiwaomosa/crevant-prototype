-- Staging only: undoes 20261224000000 (waitlist review and invitations, member
-- side). Never run it against a Production project.
-- Tested locally by scripts/db/rollback-waitlist-invitations-test.sh.
--
--   psql "<url>" -X -q -v ON_ERROR_STOP=1 -v mode=check -v confirm= -f scripts/db/staging-rollback-waitlist-invitations.sql
--   psql "<url>" -X -q -v ON_ERROR_STOP=1 -v mode=apply -v confirm='REMOVE STAGING WAITLIST INVITATIONS' -f ...
--
-- Deletes the review copies, the deletion queue and the bridge state, the
-- waitlist invitations' tracking columns (staging test invitations keep their
-- email, expiry and acceptance), the triggers and functions, and the migration
-- record. Refuses, changing nothing, if the record is missing or a later
-- migration exists.

\set ON_ERROR_STOP on
\pset footer off

begin;
set local lock_timeout = '10s';
set local statement_timeout = '60s';

select set_config('crevant.rollback_mode', :'mode', true) as mode,
       set_config('crevant.rollback_confirm', :'confirm', true) <> '' as confirmation_given;

do $$
begin
  if current_setting('crevant.rollback_mode') not in ('check', 'apply') then
    raise exception 'mode must be check or apply';
  end if;
  if current_setting('crevant.rollback_mode') = 'apply'
     and current_setting('crevant.rollback_confirm') <> 'REMOVE STAGING WAITLIST INVITATIONS' then
    raise exception 'apply needs the confirmation phrase: REMOVE STAGING WAITLIST INVITATIONS';
  end if;
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise exception 'refused: no Supabase migration history here (supabase_migrations.schema_migrations)';
  end if;
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20261224000000')
     or to_regclass('ops.waitlist_review') is null then
    raise exception 'refused: expected objects are missing (20261224000000 waitlist invitations), so the database is not in the state this rollback was written for';
  end if;
  if exists (select 1 from supabase_migrations.schema_migrations where version > '20261224000000') then
    raise exception 'refused, nothing changed: a later migration is recorded';
  end if;
end $$;

drop function public.app_founder_waitlist_overview();
drop function public.app_founder_waitlist_decide(uuid[], text, text);
drop function public.app_founder_waitlist_forget(uuid);
drop function public.svc_waitlist_import(jsonb);
drop function public.svc_waitlist_withdraw(jsonb);
drop function public.svc_waitlist_bridge_pending();
drop function public.svc_waitlist_forget_done(uuid[]);
drop function public.svc_waitlist_declined_done(uuid[]);
drop function public.svc_waitlist_not_confirmed(uuid[]);
drop function public.svc_invitation_create(uuid);
drop function public.svc_invitation_delivery(uuid, text, text, text);
drop function public.svc_invitation_retry_list();
drop function ops.waitlist_founder_overview();
drop function ops.waitlist_decide(uuid[], text, text);
drop function ops.waitlist_forget_applicant(uuid);
drop function ops.waitlist_invitation_summary();
drop function ops.bridge_import(jsonb);
drop function ops.bridge_withdraw(jsonb);
drop function ops.bridge_invitation_create(uuid);
drop function ops.bridge_invitation_delivery(uuid, text, text, text);
drop function ops.bridge_invitation_retry_list();
drop function ops.invites_may_send();
drop function ops.waitlist_review_expire();
drop trigger registrations_accept_invitation on ops.registrations;
drop function ops.invitation_accept_on_registration();
drop trigger invitations_forget_waitlist_entry on ops.invitations;
drop function ops.invitation_forget_waitlist_entry();
drop index ops.invitations_one_per_applicant;
drop index ops.invitations_one_per_link;
alter table ops.invitations
  drop column waitlist_id, drop column link_id, drop column cohort, drop column creator_ref,
  drop column delivery_status, drop column delivery_error, drop column provider_id, drop column send_attempts;
drop table ops.waitlist_bridge_state;
drop table ops.waitlist_forget_queue;
drop table ops.waitlist_review;
delete from supabase_migrations.schema_migrations where version = '20261224000000';

select current_setting('crevant.rollback_mode') = 'apply' as apply \gset
\if :apply
  commit;
  \echo 'Applied: the waitlist review copies, invitation tracking and their functions were removed, and the migration record was removed.'
\else
  rollback;
  \echo 'Check only: every check and the removal succeeded inside the transaction, and all of it was rolled back. Nothing changed.'
\endif
