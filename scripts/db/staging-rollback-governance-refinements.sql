-- Staging only: undoes 20261207000000 (governance refinements: restoring
-- legitimate points, the sole-moderator appeal exception, immediate
-- enforcement). Never run it against a Production project. Tested locally by
-- scripts/db/rollback-governance-refinements-test.sh.
--
--   psql "<url>" -X -q -v ON_ERROR_STOP=1 -v mode=check -v confirm= -f scripts/db/staging-rollback-governance-refinements.sql
--   psql "<url>" -X -q -v ON_ERROR_STOP=1 -v mode=apply -v confirm='REMOVE THE STAGING GOVERNANCE REFINEMENTS' -f ...
--
-- Puts back the 20261206000000 definitions of the six functions it changed
-- and removes its helpers and columns. Refuses, changing nothing, while any
-- restored points, immediate enforcement or sole-moderator decision exists,
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
     and current_setting('crevant.rollback_confirm') <> 'REMOVE THE STAGING GOVERNANCE REFINEMENTS' then
    raise exception 'apply needs the confirmation phrase: REMOVE THE STAGING GOVERNANCE REFINEMENTS';
  end if;
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise exception 'refused: no Supabase migration history here (supabase_migrations.schema_migrations)';
  end if;
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20261207000000')
     or to_regprocedure('ops.other_moderator_available(uuid, uuid)') is null or to_regprocedure('sim.restore_hidden(text, uuid)') is null then
    raise exception 'refused: expected objects are missing (20261207000000 governance refinements), so the database is not in the state this rollback was written for';
  end if;
  if exists (select 1 from supabase_migrations.schema_migrations where version > '20261207000000') then
    raise exception 'refused, nothing changed: a later migration is recorded';
  end if;
end $$;

lock table sim.points_ledger, ops.enforcements, ops.appeals, ops.member_notices in share row exclusive mode;

do $$
declare
  n bigint;
begin
  n := (select count(*) from sim.points_ledger where source_key like 'restored:%')
     + (select count(*) from ops.enforcements where immediate)
     + (select count(*) from ops.appeals where same_moderator)
     + (select count(*) from ops.member_notices where same_moderator);
  if n > 0 then
    raise exception 'refused, nothing changed: % rows of data depend on the refinements (restored points, immediate enforcement, sole-moderator decisions). Fix forward instead.', n;
  end if;
end $$;

\echo 'Checks passed. Removing the governance refinements and the migration record.'

-- The 20261206000000 definitions, unchanged.
create or replace function public.app_mod_hide(p_report uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_moderator();
  v_note text := ops.clean_note(p_note);
  r record;
  v_action bigint;
  v_key text;
begin
  select * into r from ops.content_reports where id = p_report for update;
  if r.id is null then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if r.target_type = 'post' then
    update social.posts set hidden_at = pg_catalog.now(), deleted_at = pg_catalog.now()
    where id = r.target_id and deleted_at is null;
    if not found then
      raise exception 'not_live' using errcode = 'P0001', detail = 'This post is already hidden or deleted.';
    end if;
    -- Points earned on the hidden post are reversed (a restore does not re-award).
    for v_key in select l.source_key from sim.points_ledger l
                 where l.post_id = r.target_id and l.reverses is null and l.action <> 'qualified_referral'
    loop
      perform sim.reverse(v_key, 'hidden:' || v_key);
    end loop;
  elsif r.target_type = 'comment' then
    -- Hiding sets deleted_at, so the rewards trigger reverses the comment's points.
    update social.comments set hidden_at = pg_catalog.now(), deleted_at = pg_catalog.now()
    where id = r.target_id and deleted_at is null;
    if not found then
      raise exception 'not_live' using errcode = 'P0001', detail = 'This comment is already hidden or deleted.';
    end if;
  else
    if not exists (select 1 from public.profiles where id = r.target_id) then
      raise exception 'not_live' using errcode = 'P0001';
    end if;
    -- A member with no details yet gets an empty, hidden row (setup marked
    -- done, so hiding never sends them back through first-time setup).
    insert into social.profile_details as d (user_id, hidden_at, onboarded_at) values (r.target_id, pg_catalog.now(), pg_catalog.now())
    on conflict (user_id) do update set hidden_at = pg_catalog.now() where d.hidden_at is null;
    if not found then
      raise exception 'not_live' using errcode = 'P0001', detail = 'This profile is already hidden.';
    end if;
  end if;
  update ops.content_reports set status = 'hidden', resolved_at = pg_catalog.now()
  where target_type = r.target_type and target_id = r.target_id and status = 'open';
  insert into ops.moderation_actions (actor_id, actor_label, action, target_type, target_id, report_id, note)
  values (v_uid, 'moderator', 'hide', r.target_type, r.target_id, r.id, v_note)
  returning id into v_action;
  perform ops.notify_member(r.target_owner_id, 'content_hidden', r.target_type, r.target_id, r.reason,
                            coalesce(r.snapshot->>'body', r.snapshot->>'bio', r.snapshot->>'display_name'), v_action, null, null);
end;
$$;

create or replace function public.app_mod_restore(p_report uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_moderator();
  v_note text := ops.clean_note(p_note);
  r record;
  v_action bigint;
begin
  select * into r from ops.content_reports where id = p_report for update;
  if r.id is null then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if r.target_type = 'post' then
    update social.posts set hidden_at = null, deleted_at = null
    where id = r.target_id and hidden_at is not null and deleted_at = hidden_at;
  elsif r.target_type = 'comment' then
    update social.comments set hidden_at = null, deleted_at = null
    where id = r.target_id and hidden_at is not null and deleted_at = hidden_at;
  else
    update social.profile_details set hidden_at = null where user_id = r.target_id and hidden_at is not null;
  end if;
  if not found then
    raise exception 'not_hidden' using errcode = 'P0001', detail = 'This content is not hidden by a moderator.';
  end if;
  update ops.content_reports set status = 'restored', resolved_at = coalesce(resolved_at, pg_catalog.now())
  where target_type = r.target_type and target_id = r.target_id and status in ('open', 'hidden');
  insert into ops.moderation_actions (actor_id, actor_label, action, target_type, target_id, report_id, note)
  values (v_uid, 'moderator', 'restore', r.target_type, r.target_id, r.id, v_note)
  returning id into v_action;
  perform ops.notify_member(r.target_owner_id, 'content_restored', r.target_type, r.target_id, r.reason,
                            coalesce(r.snapshot->>'body', r.snapshot->>'bio', r.snapshot->>'display_name'), v_action, null, null);
end;
$$;

drop function public.app_mod_enforce(uuid, text, text, uuid, integer, text, boolean);
create function public.app_mod_enforce(p_member uuid, p_level text, p_reason text, p_report uuid default null,
                                       p_days integer default null, p_note text default null)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_moderator();
  v_note text := ops.clean_note(p_note);
  v_ends timestamptz;
  v_id bigint;
  v_action bigint;
begin
  if p_member is null or p_level is null or p_level not in ('warning', 'restriction', 'suspension') then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  if p_member = v_uid then
    raise exception 'cannot_enforce_self' using errcode = 'P0001';
  end if;
  if p_reason is null or p_reason not in ('spam', 'harassment', 'hate', 'sexual', 'violence', 'self_harm', 'impersonation', 'other') then
    raise exception 'invalid_reason' using errcode = 'P0001', detail = 'Choose a reason from the list.';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_member) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if p_report is not null and not exists (select 1 from ops.content_reports r where r.id = p_report and r.target_owner_id = p_member) then
    raise exception 'not_found' using errcode = 'P0001', detail = 'That report is not about this member.';
  end if;
  if p_level = 'warning' then
    if p_days is not null then
      raise exception 'invalid_request' using errcode = 'P0001', detail = 'A warning has no duration.';
    end if;
  elsif p_level = 'restriction' then
    if coalesce(p_days, 7) not between 1 and 30 then
      raise exception 'invalid_request' using errcode = 'P0001', detail = 'A restriction lasts 1 to 30 days.';
    end if;
    v_ends := pg_catalog.now() + pg_catalog.make_interval(days => coalesce(p_days, 7));
  else
    if p_days is not null and p_days not between 1 and 90 then
      raise exception 'invalid_request' using errcode = 'P0001', detail = 'A suspension lasts 1 to 90 days, or until lifted.';
    end if;
    v_ends := case when p_days is not null then pg_catalog.now() + pg_catalog.make_interval(days => p_days) end;
  end if;
  -- The ladder: each step needs the one before it within 180 days, except
  -- threats, self-harm and hate.
  if p_reason not in ('violence', 'self_harm', 'hate') and p_level <> 'warning'
     and not exists (select 1 from ops.enforcements e
                     where e.member_id = p_member and e.created_at > pg_catalog.now() - interval '180 days'
                       and e.level = case p_level when 'restriction' then 'warning' else 'restriction' end
                       and not exists (select 1 from ops.enforcement_lifts l where l.enforcement_id = e.id and l.via = 'appeal')) then
    raise exception 'ladder_step_required' using errcode = 'P0001',
      detail = case p_level when 'restriction' then 'Give a warning first.' else 'A restriction comes first.' end;
  end if;
  insert into ops.enforcements (member_id, level, reason, report_id, note, ends_at, actor_id)
  values (p_member, p_level, p_reason, p_report, v_note, v_ends, v_uid)
  returning id into v_id;
  insert into ops.moderation_actions (actor_id, actor_label, action, target_type, target_id, report_id, note)
  values (v_uid, 'moderator', 'enforce', 'member', p_member, p_report, p_level || coalesce(': ' || v_note, ''))
  returning id into v_action;
  perform ops.notify_member(p_member, p_level, null, null, p_reason, null, v_action, v_id, v_ends);
  return v_id;
end;
$$;

comment on function public.app_mod_enforce(uuid, text, text, uuid, integer, text) is 'Moderators only: a warning, restriction (1 to 30 days) or suspension (1 to 90 days or until lifted), one step at a time except for threats, self-harm and hate. The member is notified.';

revoke all on function public.app_mod_enforce(uuid, text, text, uuid, integer, text) from public, anon;
grant execute on function public.app_mod_enforce(uuid, text, text, uuid, integer, text) to authenticated;

drop function public.app_my_notices();
create function public.app_my_notices()
returns table (
  id bigint, kind text, target_type text, target_id uuid, reason text, excerpt text, ends_at timestamptz,
  created_at timestamptz, read boolean, appeal_status text, can_appeal boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_member();
begin
  return query
  select n.id, n.kind, n.target_type, n.target_id, n.reason, n.excerpt, n.ends_at, n.created_at, n.read_at is not null,
         a.status,
         a.id is null and n.kind in ('content_hidden', 'warning', 'restriction', 'suspension')
           and n.created_at > pg_catalog.now() - interval '30 days'
  from ops.member_notices n
  left join ops.appeals a on a.notice_id = n.id
  where n.member_id = v_uid
  order by n.created_at desc, n.id desc
  limit 100;
end;
$$;

comment on function public.app_my_notices() is 'The caller''s own moderation notices, newest first, with whether each can still be appealed. Never names a reporter.';

revoke all on function public.app_my_notices() from public, anon;
grant execute on function public.app_my_notices() to authenticated;

drop function public.app_mod_appeals(text);
create function public.app_mod_appeals(p_status text default 'open')
returns table (
  id uuid, member_id uuid, member_username text, kind text, target_type text, target_id uuid, reason text, excerpt text,
  body text, status text, created_at timestamptz, decided_at timestamptz, decision_note text, decided_original boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_moderator();
begin
  return query
  select a.id, a.member_id, p.username, n.kind, n.target_type, n.target_id, n.reason, n.excerpt,
         a.body, a.status, a.created_at, a.decided_at, a.decision_note,
         coalesce((select m.actor_id = v_uid from ops.moderation_actions m where m.id = n.moderation_action_id), false)
  from ops.appeals a
  join ops.member_notices n on n.id = a.notice_id
  left join public.profiles p on p.id = a.member_id
  where case when coalesce(p_status, 'open') = 'open' then a.status = 'open' else a.status <> 'open' end
  order by a.created_at, a.id
  limit 100;
end;
$$;

comment on function public.app_mod_appeals(text) is 'Moderators only: appeals, oldest first, and whether the caller took the original action.';

revoke all on function public.app_mod_appeals(text) from public, anon;
grant execute on function public.app_mod_appeals(text) to authenticated;

create or replace function public.app_mod_decide_appeal(p_appeal uuid, p_reverse boolean, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_moderator();
  v_note text := ops.clean_note(p_note);
  a ops.appeals%rowtype;
  n ops.member_notices%rowtype;
  v_original uuid;
  v_action bigint;
begin
  if p_reverse is null then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  select * into a from ops.appeals where id = p_appeal for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if a.status <> 'open' then
    raise exception 'not_open' using errcode = 'P0001', detail = 'This appeal was already decided.';
  end if;
  if a.member_id = v_uid then
    raise exception 'cannot_decide_own_appeal' using errcode = 'P0001';
  end if;
  select * into n from ops.member_notices where id = a.notice_id;
  select m.actor_id into v_original from ops.moderation_actions m where m.id = n.moderation_action_id;
  -- Independence: a different moderator decides whenever one exists.
  if v_original = v_uid and exists (select 1 from ops.moderators o where o.user_id <> v_uid and o.user_id <> a.member_id) then
    raise exception 'needs_another_moderator' using errcode = 'P0001', detail = 'Another moderator decides appeals on your own actions.';
  end if;
  if p_reverse then
    if n.kind = 'content_hidden' then
      if n.target_type = 'post' then
        update social.posts set hidden_at = null, deleted_at = null
        where id = n.target_id and hidden_at is not null and deleted_at = hidden_at;
      elsif n.target_type = 'comment' then
        update social.comments set hidden_at = null, deleted_at = null
        where id = n.target_id and hidden_at is not null and deleted_at = hidden_at;
      else
        update social.profile_details set hidden_at = null where user_id = n.target_id and hidden_at is not null;
      end if;
      update ops.content_reports set status = 'restored', resolved_at = coalesce(resolved_at, pg_catalog.now())
      where target_type = n.target_type and target_id = n.target_id and status in ('open', 'hidden');
    elsif n.enforcement_id is not null then
      insert into ops.enforcement_lifts (enforcement_id, actor_id, via, note)
      values (n.enforcement_id, v_uid, 'appeal', v_note)
      on conflict (enforcement_id) do nothing;
    end if;
  end if;
  update ops.appeals set status = case when p_reverse then 'reversed' else 'upheld' end,
         decided_at = pg_catalog.now(), decided_by = v_uid, decision_note = v_note
  where id = a.id;
  insert into ops.moderation_actions (actor_id, actor_label, action, target_type, target_id, note)
  values (v_uid, 'moderator', case when p_reverse then 'appeal_reversed' else 'appeal_upheld' end,
          coalesce(n.target_type, 'member'), coalesce(n.target_id, a.member_id), v_note)
  returning id into v_action;
  perform ops.notify_member(a.member_id, case when p_reverse then 'appeal_reversed' else 'appeal_upheld' end,
                            n.target_type, n.target_id, n.reason, n.excerpt, v_action, n.enforcement_id, null);
end;
$$;

comment on function public.app_mod_decide_appeal(uuid, boolean, text) is 'Moderators only: upholds or reverses an appeal (reversing restores the content or lifts the enforcement). Another moderator decides appeals on your own actions whenever one exists. The member is notified.';

drop function sim.restore_hidden(text, uuid);
drop function ops.other_moderator_available(uuid, uuid);
alter table ops.member_notices drop column same_moderator;
alter table ops.appeals drop column same_moderator;
alter table ops.enforcements drop column immediate;

delete from supabase_migrations.schema_migrations where version = '20261207000000';

select current_setting('crevant.rollback_mode') = 'apply' as apply \gset
\if :apply
  commit;
  \echo 'Applied: the governance refinements and the migration record were removed.'
\else
  rollback;
  \echo 'Check only: every check and the removal succeeded inside the transaction, and all of it was rolled back. Nothing changed.'
\endif
