-- Staging only: undoes 20261206000000 (governance: blocking, comment
-- reports, the enforcement ladder, notices and appeals). Never run it against
-- a Production project. Tested locally by scripts/db/rollback-governance-test.sh.
--
--   psql "<url>" -X -q -v ON_ERROR_STOP=1 -v mode=check -v confirm= -f scripts/db/staging-rollback-governance.sql
--   psql "<url>" -X -q -v ON_ERROR_STOP=1 -v mode=apply -v confirm='REMOVE THE STAGING GOVERNANCE' -f ...
--
-- Removes exactly the migration's objects and record, and puts back the
-- earlier definitions of the view and four functions it changed (generated
-- from 20261122000000, 20261124000000 and 20261127000000). Refuses, changing
-- nothing, while any block, enforcement, notice, appeal, hidden comment,
-- comment report or new kind of moderation action exists, if the record or
-- an expected object is missing, or a later migration exists.

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
     and current_setting('crevant.rollback_confirm') <> 'REMOVE THE STAGING GOVERNANCE' then
    raise exception 'apply needs the confirmation phrase: REMOVE THE STAGING GOVERNANCE';
  end if;
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise exception 'refused: no Supabase migration history here (supabase_migrations.schema_migrations)';
  end if;
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20261206000000')
     or to_regclass('social.blocks') is null or to_regclass('ops.enforcements') is null or to_regclass('ops.appeals') is null
     or to_regprocedure('public.app_block(uuid)') is null then
    raise exception 'refused: expected objects are missing (20261206000000 governance), so the database is not in the state this rollback was written for';
  end if;
  if exists (select 1 from supabase_migrations.schema_migrations where version > '20261206000000') then
    raise exception 'refused, nothing changed: a later migration is recorded';
  end if;
end $$;

lock table social.blocks, social.block_events, ops.enforcements, ops.enforcement_lifts, ops.member_notices, ops.appeals,
           social.comments, social.follow_events, social.clique_members, ops.content_reports, ops.moderation_actions in share row exclusive mode;

do $$
declare
  n bigint;
begin
  n := (select count(*) from social.blocks) + (select count(*) from social.block_events)
     + (select count(*) from ops.enforcements) + (select count(*) from ops.member_notices) + (select count(*) from ops.appeals)
     + (select count(*) from social.comments where hidden_at is not null)
     + (select count(*) from ops.content_reports where target_type = 'comment')
     + (select count(*) from ops.moderation_actions where action in ('enforce', 'lift', 'appeal_upheld', 'appeal_reversed') or target_type in ('comment', 'member'))
     + (select count(*) from social.follow_events where source = 'block')
     + (select count(*) from social.clique_members where removal_reason = 'blocked');
  if n > 0 then
    raise exception 'refused, nothing changed: % rows of governance data exist (blocks, enforcement, notices, appeals, hidden or reported comments). Fix forward instead.', n;
  end if;
end $$;

\echo 'Checks passed. Removing governance and the migration record.'

drop function public.app_mod_decide_appeal(uuid, boolean, text);
drop function public.app_mod_appeals(text);
drop function public.app_appeal(bigint, text);
drop function public.app_mark_notices_read();
drop function public.app_my_notices();
drop function public.app_my_standing();
drop function public.app_mod_member_record(uuid);
drop function public.app_mod_lift(bigint, text);
drop function public.app_mod_enforce(uuid, text, text, uuid, integer, text);
drop function public.app_my_blocks();
drop function public.app_unblock(uuid);
drop function public.app_block(uuid);

-- The earlier definitions, unchanged.
create or replace function public.app_report(p_target_type text, p_target_id uuid, p_reason text, p_details text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_member();
  v_details text := nullif(pg_catalog.regexp_replace(coalesce(p_details, ''), '^\s+|\s+$', '', 'g'), '');
  v_owner uuid;
  v_snapshot jsonb;
begin
  perform ops.purge_expired_report_data();
  if p_target_type is null or p_target_type not in ('post', 'profile') or p_target_id is null then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  if p_reason is null or p_reason not in ('spam', 'harassment', 'hate', 'sexual', 'violence', 'self_harm', 'impersonation', 'other') then
    raise exception 'invalid_reason' using errcode = 'P0001', detail = 'Choose a reason from the list.';
  end if;
  if v_details is not null and char_length(v_details) > 500 then
    raise exception 'too_long' using errcode = 'P0001';
  end if;
  if v_details is not null and v_details ~ '[\u0001-\u0009\u000B-\u001F\u007F-\u009F]' then
    raise exception 'invalid_text' using errcode = 'P0001';
  end if;

  -- Only what the reporter can see can be reported.
  if p_target_type = 'post' then
    select s.author_id, pg_catalog.jsonb_build_object(
             'body', s.body, 'author_username', a.username, 'author_display_name', a.display_name, 'posted_at', s.created_at)
             -- Photo posts (20261127000000): the photo's paths, held as evidence while this snapshot is kept.
             || coalesce((select pg_catalog.jsonb_build_object('media_kind', m.kind, 'media_full_path', u.full_path,
                                  'media_feed_path', u.feed_path, 'media_description', m.description)
                          from social.post_media m join social.media_uploads u on u.id = m.upload_id
                          where m.post_id = s.id), '{}'::jsonb)
      into v_owner, v_snapshot
    from social.posts s join social.visible_members a on a.id = s.author_id
    where s.id = p_target_id and s.deleted_at is null;
  else
    select p.id, pg_catalog.jsonb_build_object(
             'username', p.username, 'display_name', p.display_name,
             'identity', d.identity, 'bio', d.bio, 'follow_reason', d.follow_reason)
      into v_owner, v_snapshot
    from social.visible_members p
    left join social.profile_details d on d.user_id = p.id
    where p.id = p_target_id;
  end if;
  if v_owner is null then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if v_owner = v_uid then
    raise exception 'cannot_report_self' using errcode = 'P0001';
  end if;

  -- One open report per member and target; 10 an hour, 30 a day.
  if exists (select 1 from ops.content_reports r where r.reporter_id = v_uid and r.target_type = p_target_type and r.target_id = p_target_id and r.status = 'open') then
    raise exception 'already_reported' using errcode = 'P0001';
  end if;
  if (select count(*) from ops.content_reports r where r.reporter_id = v_uid and r.created_at > pg_catalog.now() - interval '1 hour') >= 10
     or (select count(*) from ops.content_reports r where r.reporter_id = v_uid and r.created_at > pg_catalog.now() - interval '1 day') >= 30 then
    raise exception 'rate_limited' using errcode = 'P0001', detail = 'Please slow down and try again later.';
  end if;

  insert into ops.content_reports (reporter_id, target_type, target_id, target_owner_id, reason, priority, details, snapshot)
  values (v_uid, p_target_type, p_target_id, v_owner, p_reason, p_reason in ('violence', 'self_harm'), v_details, v_snapshot)
  on conflict do nothing;
  if not found then
    raise exception 'already_reported' using errcode = 'P0001';
  end if;
end;
$$;

drop function public.app_mod_report(uuid);
create function public.app_mod_report(p_report uuid)
returns table (
  id uuid, target_type text, target_id uuid, reason text, priority boolean, details text, snapshot jsonb,
  status text, created_at timestamptz, resolved_at timestamptz, data_purged boolean,
  target_state text, current_body text, open_reports_for_target bigint
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
  select r.id, r.target_type, r.target_id, r.reason, r.priority, r.details, r.snapshot,
         r.status, r.created_at, r.resolved_at, r.data_purged_at is not null,
         case
           when r.target_type = 'post' then
             (select case when s.id is null then 'gone' when s.hidden_at is not null then 'hidden' when s.deleted_at is not null then 'deleted_by_author' else 'live' end
              from (select 1) one left join social.posts s on s.id = r.target_id)
           else
             (select case when p.id is null then 'gone' when d.hidden_at is not null then 'hidden' else 'live' end
              from (select 1) one left join public.profiles p on p.id = r.target_id left join social.profile_details d on d.user_id = r.target_id)
         end,
         case when r.target_type = 'post' then (select s.body from social.posts s where s.id = r.target_id and s.deleted_at is null) end,
         (select count(*) from ops.content_reports o where o.target_type = r.target_type and o.target_id = r.target_id and o.status = 'open')
  from ops.content_reports r
  where r.id = p_report;
end;
$$;

comment on function public.app_mod_report(uuid) is 'Moderators only: one report and its target''s current state. Never includes the reporter.';
revoke all on function public.app_mod_report(uuid) from public, anon;
grant execute on function public.app_mod_report(uuid) to authenticated, service_role;

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
  values (v_uid, 'moderator', 'hide', r.target_type, r.target_id, r.id, v_note);
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
begin
  select * into r from ops.content_reports where id = p_report for update;
  if r.id is null then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if r.target_type = 'post' then
    update social.posts set hidden_at = null, deleted_at = null
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
  values (v_uid, 'moderator', 'restore', r.target_type, r.target_id, r.id, v_note);
end;
$$;

create or replace view social.visible_members as
  select p.id, p.username, p.display_name
  from public.profiles p
  join ops.member_access a on a.user_id = p.id
  where p.username is not null and p.display_name is not null
    and a.status = 'active' and (a.expires_at is null or a.expires_at > pg_catalog.now());

revoke all on table social.visible_members from public, anon, authenticated;
comment on view social.visible_members is 'Members others may see or interact with: a complete profile and active, unexpired pilot membership.';
drop view social.listed_members;

drop trigger standing_guard on social.posts;
drop trigger standing_guard on social.comments;
drop trigger standing_guard on social.reposts;
drop trigger standing_guard on social.saves;
drop trigger standing_guard on social.shares;
drop trigger standing_guard on social.follows;
drop function ops.standing_guard();
drop function ops.notify_member(uuid, text, text, uuid, text, text, bigint, bigint, timestamptz);
drop table ops.appeals;
drop function ops.appeals_decided_once();
drop table ops.member_notices;
drop function ops.notices_read_only();
drop function ops.member_standing(uuid);
drop table ops.enforcement_lifts;
drop table ops.enforcements;

alter table ops.moderation_actions drop constraint moderation_actions_action_check;
alter table ops.moderation_actions add constraint moderation_actions_action_check
  check (action in ('hide', 'restore', 'dismiss', 'hold_set', 'hold_cleared', 'retention_purge', 'storage_cleanup_preview', 'storage_cleanup'));
alter table ops.moderation_actions drop constraint moderation_actions_target_type_check;
alter table ops.moderation_actions add constraint moderation_actions_target_type_check check (target_type in ('post', 'profile'));
alter table ops.content_reports drop constraint content_reports_target_type_check;
alter table ops.content_reports add constraint content_reports_target_type_check check (target_type in ('post', 'profile'));
alter table social.comments drop constraint comments_hidden_is_deleted;
alter table social.comments drop column hidden_at;
alter table social.clique_members drop constraint clique_removal_reason;
alter table social.clique_members add constraint clique_removal_reason check (removal_reason in ('removed', 'unfollowed', 'replaced'));
alter table social.follow_events drop constraint follow_events_source;
alter table social.follow_events add constraint follow_events_source
  check (source is null or (action = 'followed' and source in ('profile', 'discover', 'post', 'catch_up', 'comment', 'search', 'other')));

drop table social.block_events;
drop table social.blocks;

delete from supabase_migrations.schema_migrations where version = '20261206000000';

select current_setting('crevant.rollback_mode') = 'apply' as apply \gset
\if :apply
  commit;
  \echo 'Applied: governance and the migration record were removed.'
\else
  rollback;
  \echo 'Check only: every check and the removal succeeded inside the transaction, and all of it was rolled back. Nothing changed.'
\endif
