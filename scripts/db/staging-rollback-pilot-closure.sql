-- Staging only: undoes 20261219000000 (pilot closure, activation and triage). Never run it against a Production project.
-- Tested locally by scripts/db/rollback-pilot-closure-test.sh.
--
--   psql "<url>" -X -q -v ON_ERROR_STOP=1 -v mode=check -v confirm= -f scripts/db/staging-rollback-pilot-closure.sql
--   psql "<url>" -X -q -v ON_ERROR_STOP=1 -v mode=apply -v confirm='REMOVE STAGING PILOT CLOSURE' -f ...
--
-- Restores account deletion as 20261214000000 left it and the review queue
-- as 20261218000000 left it, and removes the closure table, the member's
-- deletion consequences, activation and triage. Refuses, changing nothing,
-- while any balance closure is recorded (that audit record would be lost),
-- if the record or an expected object is missing, or a later migration exists.

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
     and current_setting('crevant.rollback_confirm') <> 'REMOVE STAGING PILOT CLOSURE' then
    raise exception 'apply needs the confirmation phrase: REMOVE STAGING PILOT CLOSURE';
  end if;
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise exception 'refused: no Supabase migration history here (supabase_migrations.schema_migrations)';
  end if;
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20261219000000')
     or to_regclass('sim.balance_closures') is null then
    raise exception 'refused: expected objects are missing (20261219000000 pilot closure), so the database is not in the state this rollback was written for';
  end if;
  if exists (select 1 from supabase_migrations.schema_migrations where version > '20261219000000') then
    raise exception 'refused, nothing changed: a later migration is recorded';
  end if;
end $$;

lock table sim.balance_closures in share row exclusive mode;

do $$
begin
  if exists (select 1 from sim.balance_closures) then
    raise exception 'refused, nothing changed: balance closures are recorded, and removing them would lose that audit record';
  end if;
end $$;

\echo 'Checks passed. Removing the pilot closure, activation and triage, and the migration record.'

drop function public.app_founder_activation();
drop function public.app_my_deletion_consequences();

-- As 20261214000000 and 20261218000000 left them.
create or replace function public.app_founder_delete_member(p_request bigint, p_confirm_username text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_founder();
  r ops.member_requests%rowtype;
  v_username text;
  v_forfeited integer := 0;
  v_key text;
  v_posts bigint;
begin
  select * into r from ops.member_requests where id = p_request for update;
  if not found or r.kind <> 'deletion' or r.status <> 'open' or r.member_id is null then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  select p.username into v_username from public.profiles p where p.id = r.member_id;
  if v_username is null or v_username <> lower(pg_catalog.btrim(coalesce(p_confirm_username, ''))) then
    raise exception 'confirmation_mismatch' using errcode = 'P0001';
  end if;
  if r.member_id = v_uid or exists (select 1 from ops.member_access a where a.user_id = r.member_id and a.cohort = 'founder') then
    raise exception 'cannot_delete_founder' using errcode = 'P0001';
  end if;
  -- Unsettled simulated points are forfeited first, as recorded reversals.
  for v_key in select l.source_key from sim.points_ledger l
               where l.member_id = r.member_id and l.reverses is null and l.points > 0
                 and sim.award_state(l.id) in ('recognized', 'pending_review', 'approved') loop
    perform sim.reverse(v_key, 'account_deleted:' || v_key);
    v_forfeited := v_forfeited + 1;
  end loop;
  select count(*) into v_posts from social.posts s where s.author_id = r.member_id;
  update ops.member_requests set status = 'completed', resolved_at = pg_catalog.now(), details = null where id = r.id;
  -- No free text from the member's other requests, and no invitation, survive the account.
  update ops.member_requests set details = null where member_id = r.member_id and details is not null;
  perform ops.forget_member_invitations(r.member_id);
  insert into ops.member_request_events (request_id, action, actor, note)
  values (r.id, 'account_deleted', 'founder:' || v_uid::text,
          pg_catalog.format('%s posts removed; %s simulated awards forfeited', v_posts, v_forfeited));
  delete from auth.users where id = r.member_id;
  return pg_catalog.jsonb_build_object('posts_removed', v_posts, 'awards_forfeited', v_forfeited);
end;
$$;

create or replace function public.app_founder_progression_queue()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_founder();
begin
  perform v_uid;
  return pg_catalog.jsonb_build_object(
    'members', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
                 'member_id', q.member_id, 'username', p.username, 'audience', q.audience, 'goals_met_at', q.qualified_at,
                 'version_id', q.version_id, 'status', sim.qualification_status(q.member_id, q.audience)) order by q.qualified_at)
               from sim.qualifications q left join public.profiles p on p.id = q.member_id), '[]'::jsonb),
    'holds', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
               'id', h.id, 'username', p.username, 'scope', h.scope, 'revenue_entry_id', h.revenue_entry_id, 'settlement_id', h.settlement_id,
               'reason', h.reason, 'evidence_ref', h.evidence_ref, 'justification', h.justification, 'placed_at', h.placed_at) order by h.placed_at)
             from sim.financial_holds h left join public.profiles p on p.id = h.member_id
             where not exists (select 1 from sim.financial_hold_releases x where x.hold_id = h.id)), '[]'::jsonb),
    'decisions', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
                   'username', p.username, 'audience', d.audience, 'decision', d.decision, 'reason', d.reason,
                   'evidence_ref', d.evidence_ref, 'decided_at', d.decided_at) order by d.id desc)
                 from (select * from sim.qualification_decisions order by id desc limit 50) d
                 left join public.profiles p on p.id = d.member_id), '[]'::jsonb));
end;
$$;

drop function sim.review_concerns(uuid);
drop table sim.balance_closures;
delete from supabase_migrations.schema_migrations where version = '20261219000000';

select current_setting('crevant.rollback_mode') = 'apply' as apply \gset
\if :apply
  commit;
  \echo 'Applied: the pilot closure, activation and triage and the migration record were removed.'
\else
  rollback;
  \echo 'Check only: every check and the removal succeeded inside the transaction, and all of it was rolled back. Nothing changed.'
\endif
