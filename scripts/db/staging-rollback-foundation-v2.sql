-- Staging only: undoes 20261130000000 (foundation v2: adult confirmation,
-- controlled registration, events, keyset paging), so the earlier rollbacks,
-- which refuse while a later migration is recorded, can run after it. Never run
-- it against a Production project. Tested locally by
-- scripts/db/rollback-foundation-v2-test.sh.
--
--   psql "<url>" -X -q -v ON_ERROR_STOP=1 -v mode=check -v confirm= -f scripts/db/staging-rollback-foundation-v2.sql
--   psql "<url>" -X -q -v ON_ERROR_STOP=1 -v mode=apply -v confirm='REMOVE THE STAGING FOUNDATION V2' -f ...
--
-- Removes exactly the migration's objects and record, and restores
-- social.current_access() and public.app_access_state() as 20261122000000
-- defined them. Before running it, turn off the account creation hook in the
-- project's Auth settings (it would otherwise call a function that no longer
-- exists and refuse every sign-up and invite).
--
-- It refuses, changing nothing, if any member data exists in the migration's
-- tables (adult confirmations, registrations, registration links, settings
-- history beyond the default, or events): that is member data, so once it
-- exists problems are fixed forward with a new migration, never by deleting it.
-- It also refuses if the record or an expected object is missing, or a later
-- migration is recorded.

\set ON_ERROR_STOP on
\pset footer off

begin;
set local lock_timeout = '10s';
set local statement_timeout = '60s';

-- An unset -v mode or -v confirm stops here with a syntax error, by design.
select set_config('crevant.rollback_mode', :'mode', true) as mode,
       set_config('crevant.rollback_confirm', :'confirm', true) <> '' as confirmation_given;

do $$
begin
  if current_setting('crevant.rollback_mode') not in ('check', 'apply') then
    raise exception 'mode must be check or apply';
  end if;
  if current_setting('crevant.rollback_mode') = 'apply'
     and current_setting('crevant.rollback_confirm') <> 'REMOVE THE STAGING FOUNDATION V2' then
    raise exception 'apply needs the confirmation phrase: REMOVE THE STAGING FOUNDATION V2';
  end if;
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise exception 'refused: no Supabase migration history here (supabase_migrations.schema_migrations)';
  end if;
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20261130000000')
     or to_regclass('ops.age_attestations') is null or to_regclass('ops.registrations') is null
     or to_regclass('ops.registration_links') is null or to_regclass('ops.registration_settings') is null
     or to_regclass('analytics.events') is null
     or to_regprocedure('public.hook_before_user_created(jsonb)') is null
     or to_regprocedure('public.app_claim_access(text, boolean, text)') is null
     or to_regprocedure('public.app_feed_page(timestamp with time zone, uuid, integer, text)') is null then
    raise exception 'refused: expected objects are missing (20261130000000 foundation v2), so the database is not in the state this rollback was written for';
  end if;
  if exists (select 1 from supabase_migrations.schema_migrations where version > '20261130000000') then
    raise exception 'refused, nothing changed: a later migration is recorded';
  end if;
end $$;

lock table ops.age_attestations, ops.registrations, ops.registration_links, ops.registration_settings,
           ops.registration_setting_events, analytics.events in share row exclusive mode;

do $$
declare
  n bigint;
begin
  n := (select count(*) from ops.age_attestations) + (select count(*) from ops.registrations)
       + (select count(*) from ops.registration_links) + (select count(*) from ops.registration_setting_events)
       + (select count(*) from analytics.events);
  if n > 0 then
    raise exception 'refused, nothing changed: % rows of member data exist (adult confirmations, registrations, links, settings history or events). Fix forward with a new migration instead.', n;
  end if;
end $$;

\echo 'Checks passed. Removing foundation v2 and its migration record.'

-- Events
drop trigger events_posts on social.posts;
drop trigger events_comments on social.comments;
drop trigger events_likes on social.likes;
drop trigger events_follow_events on social.follow_events;
drop trigger events_clique_members on social.clique_members;
drop trigger events_registrations on ops.registrations;
drop function analytics.capture();
drop function analytics.record(text, uuid, uuid, uuid, jsonb);
drop function analytics.class_for(uuid);
drop table analytics.events;

-- Paging
drop function public.app_feed_page(timestamptz, uuid, integer, text);
drop function public.app_member_posts_page(uuid, timestamptz, uuid, integer);

-- Registration
drop function public.app_founder_create_invitation_link(text, integer, integer);
drop function public.app_founder_set_registration(boolean, integer, integer, integer, text);
drop function public.app_founder_registration();
drop function public.app_my_referral_link();
drop function public.app_claim_access(text, boolean, text);
drop function public.hook_before_user_created(jsonb);
drop function ops.open_invitation_exists(text);
drop function ops.registration_check(text);
drop function ops.create_invitation_link(text, text, integer, interval, uuid);
drop function ops.new_link_code();
drop function ops.set_registration_settings(text, text, boolean, integer, integer, integer);
drop trigger registrations_guard on ops.registrations;
drop function ops.registrations_guard();
drop table ops.registrations;
drop table ops.registration_links;
drop table ops.blocked_email_domains;
drop table ops.registration_setting_events;
drop table ops.registration_settings;

-- Adult confirmation: restore the access check and state as 20261122000000 defined them.
create or replace function social.current_access()
returns uuid
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = 'P0001';
  end if;
  if not ops.member_access_active(v_uid) then
    raise exception 'no_pilot_access' using errcode = 'P0001', detail = 'Your pilot access is not active.';
  end if;
  return v_uid;
end;
$$;
create or replace function public.app_access_state()
returns table (status text, expires_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = 'P0001';
  end if;
  return query
  select case
           when a.user_id is null then 'none'
           when a.status = 'revoked' then 'revoked'
           when a.expires_at is not null and a.expires_at <= pg_catalog.now() then 'expired'
           else 'active'
         end,
         case when a.status = 'active' then a.expires_at end
  from (select 1) one
  left join ops.member_access a on a.user_id = v_uid;
end;
$$;
drop function public.app_attest_adult(text);
drop trigger age_attestations_permanent on ops.age_attestations;
drop function ops.age_attestations_permanent();
drop function ops.adult_attested(uuid);
drop table ops.age_attestations;

delete from supabase_migrations.schema_migrations where version = '20261130000000';

select current_setting('crevant.rollback_mode') = 'apply' as apply \gset
\if :apply
  commit;
  \echo 'Applied: foundation v2 and its migration record were removed; the access check is as before.'
\else
  rollback;
  \echo 'Check only: every check and the removal succeeded inside the transaction, and all of it was rolled back. Nothing changed.'
\endif
