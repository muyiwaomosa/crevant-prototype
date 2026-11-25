-- Staging only: undoes 20261215000000 (founder decisions). Never run it against a Production project. Tested locally by
-- scripts/db/rollback-founder-decisions-test.sh.
--
--   psql "<url>" -X -q -v ON_ERROR_STOP=1 -v mode=check -v confirm= -f scripts/db/staging-rollback-founder-decisions.sql
--   psql "<url>" -X -q -v ON_ERROR_STOP=1 -v mode=apply -v confirm='REMOVE THE STAGING FOUNDER DECISIONS' -f ...
--
-- Removes the own-audience recognition rule and the moderator escalation,
-- putting back the earlier referral capture and enforcement. Refuses,
-- changing nothing, while any own-audience recognition award exists, if the
-- record or an expected object is missing, or a later migration exists.

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
     and current_setting('crevant.rollback_confirm') <> 'REMOVE THE STAGING FOUNDER DECISIONS' then
    raise exception 'apply needs the confirmation phrase: REMOVE THE STAGING FOUNDER DECISIONS';
  end if;
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise exception 'refused: no Supabase migration history here (supabase_migrations.schema_migrations)';
  end if;
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20261215000000')
     or not exists (select 1 from sim.point_rules where action = 'own_audience_referral') then
    raise exception 'refused: expected objects are missing (20261215000000 founder decisions), so the database is not in the state this rollback was written for';
  end if;
  if exists (select 1 from supabase_migrations.schema_migrations where version > '20261215000000') then
    raise exception 'refused, nothing changed: a later migration is recorded';
  end if;
end $$;

lock table sim.points_ledger in share row exclusive mode;

do $$
declare
  n bigint;
begin
  n := (select count(*) from sim.points_ledger where action = 'own_audience_referral');
  if n > 0 then
    raise exception 'refused, nothing changed: % rows of data depend on founder decisions (own-audience recognition awards). Fix forward instead.', n;
  end if;
end $$;

\echo 'Checks passed. Removing the founder decisions and the migration record.'

create or replace function sim.capture()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_author uuid;
  v_reg ops.registrations%rowtype;
begin
  if tg_table_name = 'comments' then
    select p.author_id into v_author from social.posts p where p.id = coalesce(new.post_id, old.post_id);
    if tg_op = 'INSERT' and social.meaningful_comment(new.body) then
      perform sim.award(new.author_id, 'meaningful_comment', 'comment:' || new.id, v_author, new.post_id);
    elsif tg_op = 'UPDATE' and old.deleted_at is null and new.deleted_at is not null then
      perform sim.reverse('comment:' || new.id, 'comment-deleted:' || new.id);
    end if;
  elsif tg_table_name = 'saves' then
    select p.author_id into v_author from social.posts p where p.id = new.post_id;
    perform sim.award(new.member_id, 'save', 'save:' || new.member_id || ':' || new.post_id, v_author, new.post_id);
  elsif tg_table_name = 'reposts' then
    select p.author_id into v_author from social.posts p where p.id = new.post_id;
    perform sim.award(new.reposter_id, 'repost', 'repost:' || new.reposter_id || ':' || new.post_id, v_author, new.post_id);
  elsif tg_table_name = 'shares' then
    select p.author_id into v_author from social.posts p where p.id = new.post_id;
    perform sim.award(new.member_id, 'external_share', 'share:' || new.member_id || ':' || new.post_id, v_author, new.post_id);
  elsif tg_table_name = 'follow_events' then
    -- A qualified referral: the referred member's own first follow.
    if new.action = 'followed' then
      select * into v_reg from ops.registrations r where r.user_id = new.follower_id and r.kind = 'referral' and r.referrer_id is not null;
      if found and v_reg.referrer_id <> new.follower_id
         and exists (select 1 from ops.age_attestations a where a.user_id = new.follower_id)
         and exists (select 1 from auth.users u where u.id = new.follower_id and u.email_confirmed_at is not null) then
        perform sim.award(v_reg.referrer_id, 'qualified_referral', 'referral:' || new.follower_id, new.creator_id, null);
      end if;
    end if;
  end if;
  return null;
end;
$$;
revoke all on function sim.capture() from public, anon, authenticated;

create or replace function public.app_mod_enforce(p_member uuid, p_level text, p_reason text, p_report uuid default null,
                                       p_days integer default null, p_note text default null, p_immediate boolean default false)
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
  -- Immediate action for a serious violation needs a recorded justification.
  if coalesce(p_immediate, false) and v_note is null then
    raise exception 'note_required' using errcode = 'P0001', detail = 'Say why this needs immediate action.';
  end if;
  -- The ladder: each step needs the one before it within 180 days, except
  -- threats, self-harm and hate, and serious violations a moderator marks immediate.
  if not coalesce(p_immediate, false) and p_reason not in ('violence', 'self_harm', 'hate') and p_level <> 'warning'
     and not exists (select 1 from ops.enforcements e
                     where e.member_id = p_member and e.created_at > pg_catalog.now() - interval '180 days'
                       and e.level = case p_level when 'restriction' then 'warning' else 'restriction' end
                       and not exists (select 1 from ops.enforcement_lifts l where l.enforcement_id = e.id and l.via = 'appeal')) then
    raise exception 'ladder_step_required' using errcode = 'P0001',
      detail = case p_level when 'restriction' then 'Give a warning first.' else 'A restriction comes first.' end;
  end if;
  insert into ops.enforcements (member_id, level, reason, report_id, note, ends_at, actor_id, immediate)
  values (p_member, p_level, p_reason, p_report, v_note, v_ends, v_uid, coalesce(p_immediate, false))
  returning id into v_id;
  insert into ops.moderation_actions (actor_id, actor_label, action, target_type, target_id, report_id, note)
  values (v_uid, 'moderator', 'enforce', 'member', p_member, p_report,
          p_level || case when coalesce(p_immediate, false) then ' (immediate)' else '' end || coalesce(': ' || v_note, ''))
  returning id into v_action;
  perform ops.notify_member(p_member, p_level, null, null, p_reason, null, v_action, v_id, v_ends);
  return v_id;
end;
$$;
comment on function public.app_mod_enforce(uuid, text, text, uuid, integer, text, boolean) is 'Moderators only: a warning, restriction (1 to 30 days) or suspension (1 to 90 days or until lifted), one step at a time except for threats, self-harm and hate, or a serious violation marked immediate with a recorded justification. The member is notified.';
revoke all on function public.app_mod_enforce(uuid, text, text, uuid, integer, text, boolean) from public, anon;
grant execute on function public.app_mod_enforce(uuid, text, text, uuid, integer, text, boolean) to authenticated;

delete from sim.point_rules where action = 'own_audience_referral';
alter table sim.point_rules drop constraint point_rules_action_check;
alter table sim.point_rules add constraint point_rules_action_check
  check (action in ('meaningful_comment', 'save', 'repost', 'external_share', 'qualified_referral', 'follow', 'clique', 'like', 'ad_view'));
delete from supabase_migrations.schema_migrations where version = '20261215000000';

select current_setting('crevant.rollback_mode') = 'apply' as apply \gset
\if :apply
  commit;
  \echo 'Applied: founder decisions and the migration record were removed.'
\else
  rollback;
  \echo 'Check only: every check and the removal succeeded inside the transaction, and all of it was rolled back. Nothing changed.'
\endif
