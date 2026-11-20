-- Essential moderation for the pilot (Build 5, Stage 5.2a).
-- STAGING ONLY until approved for Production (see supabase/production-migrations.txt).
--
-- What this migration adds:
--   * ops.moderators: who may moderate. Granted and revoked only by server
--     code (ops.grant_moderator / ops.revoke_moderator), never by members,
--     and NOT implied by anything else (an invitation admin in ops.admins
--     is not a moderator). Every change is recorded in the append-only
--     ops.moderator_events, with the database login and role that made it.
--   * ops.content_reports: members' reports of posts and profiles, with a
--     reason from a fixed list, optional details and a snapshot of what was
--     reported. Private: no member can read them, and no member-facing
--     function returns who reported anything.
--   * ops.moderation_actions: the append-only audit trail of every
--     moderation action (hide, restore, dismiss, legal holds, retention purges).
--   * social.posts.hidden_at and social.profile_details.hidden_at: content
--     hidden by a moderator.
--   * Member functions: app_report (any pilot member), app_is_moderator,
--     and the moderator set app_mod_queue, app_mod_report, app_mod_hide,
--     app_mod_restore and app_mod_dismiss, which require active pilot
--     membership AND an active moderator row (social.current_moderator()).
--
-- Reports never hide anything by themselves: only a moderator's action does.
--
-- Hiding a post also sets its deleted_at, which every existing feed,
-- profile, post, comment, like, catch-up and count function already
-- excludes, so a hidden post disappears everywhere without changing any of
-- them. Restoring only reverses a moderator's hide (deleted_at = hidden_at),
-- so it can never bring back a post its author deleted.
--
-- Retention: report details and snapshots of resolved reports are erased 90
-- days after resolution unless a legal or safety hold is set. Erasing runs
-- inside ops.purge_expired_report_data(), which every report and every
-- moderation queue load calls; with no activity at all, it waits for the
-- next one (or a manual call, docs/MODERATION.md).

-- ---------------------------------------------------------------------------
-- 1. Moderators (server-granted, recorded).

create table ops.moderators (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  granted_at  timestamptz not null default pg_catalog.now(),
  granted_by  text not null check (char_length(granted_by) between 1 and 100 and strpos(granted_by, '@') = 0),
  reason      text check (reason is null or (char_length(reason) <= 500 and strpos(reason, '@') = 0))
);
comment on table ops.moderators is 'Pilot moderators. Changed only through ops.grant_moderator / ops.revoke_moderator; every change is recorded in ops.moderator_events. Not implied by ops.admins.';

create table ops.moderator_events (
  id              bigint generated always as identity primary key,
  -- No foreign key: the history outlives the account.
  user_id         uuid not null,
  action          text not null check (action in ('granted', 'revoked', 'removed')),
  actor           text not null,
  reason          text,
  db_session_user text not null,
  db_role         text not null,
  occurred_at     timestamptz not null default pg_catalog.now()
);
create index moderator_events_user on ops.moderator_events (user_id, occurred_at);
comment on table ops.moderator_events is 'Append-only history of every moderator grant, revocation and removal with the account.';

alter table ops.moderators enable row level security;
alter table ops.moderator_events enable row level security;
revoke all on table ops.moderators, ops.moderator_events from public, anon, authenticated;
grant select on table ops.moderators, ops.moderator_events to service_role;

create function ops.moderator_record()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    insert into ops.moderator_events (user_id, action, actor, reason, db_session_user, db_role)
    values (old.user_id,
            case when pg_catalog.current_setting('crevant.moderator_revoke', true) = 'on' then 'revoked' else 'removed' end,
            coalesce(nullif(pg_catalog.current_setting('crevant.moderator_actor', true), ''), 'account_deleted'),
            nullif(pg_catalog.current_setting('crevant.moderator_reason', true), ''),
            session_user, pg_catalog.current_setting('role'));
    return old;
  end if;
  insert into ops.moderator_events (user_id, action, actor, reason, db_session_user, db_role)
  values (new.user_id, 'granted', new.granted_by, new.reason, session_user, pg_catalog.current_setting('role'));
  return new;
end;
$$;
revoke all on function ops.moderator_record() from public, anon, authenticated;
create trigger moderator_record
after insert or delete on ops.moderators
for each row execute function ops.moderator_record();
-- A moderator row is granted or removed, never edited in place.
create function ops.moderators_no_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'moderators are granted or revoked, never edited (use ops.grant_moderator / ops.revoke_moderator)';
end;
$$;
revoke all on function ops.moderators_no_update() from public, anon, authenticated;
create trigger moderators_no_update
before update on ops.moderators
for each row execute function ops.moderators_no_update();

-- Append-only histories and audit trails.
create function ops.history_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% is append-only', tg_table_name;
end;
$$;
revoke all on function ops.history_append_only() from public, anon, authenticated;
create trigger moderator_events_no_update
before update or delete on ops.moderator_events
for each row execute function ops.history_append_only();
create trigger moderator_events_no_truncate
before truncate on ops.moderator_events
for each statement execute function ops.history_append_only();

create function ops.moderator_active(p_user uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (select 1 from ops.moderators m where m.user_id = p_user);
$$;
revoke all on function ops.moderator_active(uuid) from public, anon, authenticated;

-- Grants moderation. Server only (the founder, through the SQL Editor or an
-- approved process). The account must be a confirmed, active pilot member.
create function ops.grant_moderator(p_user uuid, p_actor text, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user is null or not exists (select 1 from auth.users u where u.id = p_user and u.email_confirmed_at is not null) then
    raise exception 'grant refused: no confirmed account with that id';
  end if;
  if not ops.member_access_active(p_user) then
    raise exception 'grant refused: moderators must be active pilot members';
  end if;
  if ops.moderator_active(p_user) then
    raise exception 'grant refused: that account is already a moderator';
  end if;
  insert into ops.moderators (user_id, granted_by, reason) values (p_user, p_actor, p_reason);
end;
$$;
revoke all on function ops.grant_moderator(uuid, text, text) from public, anon, authenticated;
grant execute on function ops.grant_moderator(uuid, text, text) to service_role;

create function ops.revoke_moderator(p_user uuid, p_actor text, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_actor is null or char_length(p_actor) not between 1 and 100 or strpos(p_actor, '@') > 0 then
    raise exception 'revoke refused: give an actor label (1 to 100 characters, no email)';
  end if;
  perform pg_catalog.set_config('crevant.moderator_revoke', 'on', true);
  perform pg_catalog.set_config('crevant.moderator_actor', p_actor, true);
  perform pg_catalog.set_config('crevant.moderator_reason', coalesce(p_reason, ''), true);
  delete from ops.moderators where user_id = p_user;
  if not found then
    raise exception 'revoke refused: that account is not a moderator';
  end if;
  perform pg_catalog.set_config('crevant.moderator_revoke', '', true);
  perform pg_catalog.set_config('crevant.moderator_actor', '', true);
  perform pg_catalog.set_config('crevant.moderator_reason', '', true);
end;
$$;
revoke all on function ops.revoke_moderator(uuid, text, text) from public, anon, authenticated;
grant execute on function ops.revoke_moderator(uuid, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- 2. Reports and the moderation audit trail.

create table ops.content_reports (
  id              uuid primary key default gen_random_uuid(),
  -- The reporter. Never returned by any member-facing function. Kept as
  -- null if the reporter's account is deleted.
  reporter_id     uuid references auth.users (id) on delete set null,
  target_type     text not null check (target_type in ('post', 'profile')),
  target_id       uuid not null,
  -- The account the report is about (the post's author, or the profile).
  target_owner_id uuid references auth.users (id) on delete set null,
  reason          text not null check (reason in ('spam', 'harassment', 'hate', 'sexual', 'violence', 'self_harm', 'impersonation', 'other')),
  -- Threats and self-harm are reviewed first.
  priority        boolean not null,
  details         text check (details is null or (char_length(details) between 1 and 500 and details !~ '[\u0001-\u0009\u000B-\u001F\u007F-\u009F]')),
  -- What was reported, as it was then (so it can be reviewed even if edited or deleted).
  snapshot        jsonb,
  status          text not null default 'open' check (status in ('open', 'hidden', 'dismissed', 'restored')),
  created_at      timestamptz not null default pg_catalog.now(),
  resolved_at     timestamptz,
  -- A legal or safety hold keeps details and the snapshot past 90 days.
  legal_hold      boolean not null default false,
  data_purged_at  timestamptz,
  constraint content_reports_resolved_consistent check ((status = 'open') = (resolved_at is null)),
  constraint content_reports_purged_consistent check (data_purged_at is null or (snapshot is null and details is null and not legal_hold))
);
create unique index content_reports_one_open on ops.content_reports (reporter_id, target_type, target_id) where status = 'open';
create index content_reports_queue on ops.content_reports (status, priority desc, created_at);
create index content_reports_by_reporter on ops.content_reports (reporter_id, created_at);
create index content_reports_by_target on ops.content_reports (target_type, target_id);
comment on table ops.content_reports is 'Members'' reports of posts and profiles. Private (moderators read them only through app_mod_* functions, which never return the reporter). Details and snapshots of resolved reports are erased 90 days after resolution unless on hold.';

create table ops.moderation_actions (
  id              bigint generated always as identity primary key,
  occurred_at     timestamptz not null default pg_catalog.now(),
  -- The moderator (null for server-side actions such as retention purges).
  actor_id        uuid,
  actor_label     text not null,
  action          text not null check (action in ('hide', 'restore', 'dismiss', 'hold_set', 'hold_cleared', 'retention_purge')),
  target_type     text check (target_type in ('post', 'profile')),
  target_id       uuid,
  report_id       uuid,
  note            text check (note is null or char_length(note) <= 500),
  db_session_user text not null default session_user,
  db_role         text not null default pg_catalog.current_setting('role')
);
create index moderation_actions_target on ops.moderation_actions (target_type, target_id, occurred_at);
comment on table ops.moderation_actions is 'Append-only audit trail of every moderation action.';
create trigger moderation_actions_no_update
before update or delete on ops.moderation_actions
for each row execute function ops.history_append_only();
create trigger moderation_actions_no_truncate
before truncate on ops.moderation_actions
for each statement execute function ops.history_append_only();

alter table ops.content_reports enable row level security;
alter table ops.moderation_actions enable row level security;
revoke all on table ops.content_reports, ops.moderation_actions from public, anon, authenticated;
grant select on table ops.content_reports, ops.moderation_actions to service_role;

-- Retention: erase the details and snapshot of reports resolved more than
-- p_days ago (90 by default), unless on hold. Returns how many were erased,
-- and records the purge in the audit trail when there were any.
create function ops.purge_expired_report_data(p_days integer default 90)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  if p_days is null or p_days < 1 then
    raise exception 'purge refused: the retention period must be at least one day';
  end if;
  update ops.content_reports r
  set snapshot = null, details = null, data_purged_at = pg_catalog.now()
  where r.status <> 'open' and not r.legal_hold and r.data_purged_at is null
    and r.resolved_at < pg_catalog.now() - pg_catalog.make_interval(days => p_days);
  get diagnostics n = row_count;
  if n > 0 then
    insert into ops.moderation_actions (actor_label, action, note)
    values ('retention', 'retention_purge', pg_catalog.format('%s resolved report(s) older than %s days: details and snapshot erased', n, p_days));
  end if;
  return n;
end;
$$;
revoke all on function ops.purge_expired_report_data(integer) from public, anon, authenticated;
grant execute on function ops.purge_expired_report_data(integer) to service_role;

-- Legal or safety hold: server only, recorded.
create function ops.set_report_hold(p_report uuid, p_hold boolean, p_actor text, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_actor is null or char_length(p_actor) not between 1 and 100 or strpos(p_actor, '@') > 0 or p_reason is null or char_length(p_reason) not between 1 and 500 then
    raise exception 'hold refused: give an actor label and a reason';
  end if;
  update ops.content_reports set legal_hold = p_hold where id = p_report and data_purged_at is null;
  if not found then
    raise exception 'hold refused: no such report, or its data was already erased';
  end if;
  insert into ops.moderation_actions (actor_label, action, report_id, note)
  values (p_actor, case when p_hold then 'hold_set' else 'hold_cleared' end, p_report, p_reason);
end;
$$;
revoke all on function ops.set_report_hold(uuid, boolean, text, text) from public, anon, authenticated;
grant execute on function ops.set_report_hold(uuid, boolean, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- 3. Hidden content.

alter table social.posts add column hidden_at timestamptz;
alter table social.posts add constraint posts_hidden_is_deleted check (hidden_at is null or deleted_at = hidden_at);
comment on column social.posts.hidden_at is 'Set when a moderator hides the post (deleted_at is set to the same time, so every member function excludes it).';

alter table social.profile_details add column hidden_at timestamptz;
comment on column social.profile_details.hidden_at is 'Set when a moderator hides the member''s bio, follow reason, identity and interests from other members.';

-- The signed-in member, with active pilot membership, a complete profile AND
-- an active moderator row. Every app_mod_* function goes through it.
create function social.current_moderator()
returns uuid
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := social.current_member();
begin
  if not ops.moderator_active(v_uid) then
    raise exception 'not_moderator' using errcode = 'P0001', detail = 'Only moderators can do this.';
  end if;
  return v_uid;
end;
$$;
revoke all on function social.current_moderator() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Reporting (any pilot member).

create function public.app_report(p_target_type text, p_target_id uuid, p_reason text, p_details text default null)
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

-- ---------------------------------------------------------------------------
-- 5. Moderation (active pilot member AND moderator).

-- Whether the caller may moderate. Not an error for other members: it only
-- decides whether the app shows the Moderation page.
create function public.app_is_moderator()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_member();
begin
  return ops.moderator_active(v_uid);
end;
$$;

-- The queue: open reports (or resolved ones), priority first, oldest first.
-- Never includes who reported.
create function public.app_mod_queue(p_status text default 'open')
returns table (
  id uuid, target_type text, target_id uuid, reason text, priority boolean, has_details boolean,
  excerpt text, target_username text, open_reports_for_target bigint, status text, created_at timestamptz, resolved_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_moderator();
begin
  perform ops.purge_expired_report_data();
  return query
  select r.id, r.target_type, r.target_id, r.reason, r.priority, r.details is not null,
         pg_catalog.left(coalesce(r.snapshot->>'body', r.snapshot->>'bio', r.snapshot->>'display_name', ''), 140),
         coalesce(r.snapshot->>'author_username', r.snapshot->>'username'),
         (select count(*) from ops.content_reports o where o.target_type = r.target_type and o.target_id = r.target_id and o.status = 'open'),
         r.status, r.created_at, r.resolved_at
  from ops.content_reports r
  where case when coalesce(p_status, 'open') = 'open' then r.status = 'open' else r.status <> 'open' end
  order by r.priority desc, r.created_at, r.id
  limit 100;
end;
$$;

-- One report in full, with the target's current state. Never includes who reported.
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

-- Validates a moderator's note.
create function ops.clean_note(p_note text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text := nullif(pg_catalog.btrim(coalesce(p_note, '')), '');
begin
  if v is not null and char_length(v) > 500 then
    raise exception 'too_long' using errcode = 'P0001';
  end if;
  return v;
end;
$$;
revoke all on function ops.clean_note(text) from public, anon, authenticated;

-- Hide the reported post or profile details. Resolves every open report on it.
create function public.app_mod_hide(p_report uuid, p_note text default null)
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

-- Restore content a moderator hid (never content its author deleted).
create function public.app_mod_restore(p_report uuid, p_note text default null)
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

-- Dismiss: no action needed. Resolves every open report on the same target.
create function public.app_mod_dismiss(p_report uuid, p_note text default null)
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
  if r.status <> 'open' then
    raise exception 'not_open' using errcode = 'P0001', detail = 'This report was already resolved.';
  end if;
  update ops.content_reports set status = 'dismissed', resolved_at = pg_catalog.now()
  where target_type = r.target_type and target_id = r.target_id and status = 'open';
  insert into ops.moderation_actions (actor_id, actor_label, action, target_type, target_id, report_id, note)
  values (v_uid, 'moderator', 'dismiss', r.target_type, r.target_id, r.id, v_note);
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Hidden profile details are not shown to other members. (The three
--    profile detail functions of 20261123000000, with that one change.)

create or replace function public.app_member_details(p_member uuid)
returns table (identity text, bio text, follow_reason text, topics text[])
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_member();
begin
  return query
  select case when d.hidden_at is null then d.identity end,
         case when d.hidden_at is null then d.bio end,
         case when d.hidden_at is null then d.follow_reason end,
         case when d.hidden_at is null then
           coalesce((select array_agg(m.topic order by t.sort_order)
                     from social.member_topics m join social.topics t on t.slug = m.topic
                     where m.user_id = p.id and t.active), '{}')
         else '{}'::text[] end
  from social.visible_members p
  left join social.profile_details d on d.user_id = p.id
  where p.id = p_member;
end;
$$;

create or replace function public.app_discover_people(p_query text default null, p_topic text default null, p_limit integer default 30)
returns table (
  id uuid, username text, display_name text, identity text, bio text, follow_reason text,
  topics text[], shared_topics integer, post_count bigint, follower_count bigint,
  followed_by_me boolean, in_my_clique boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_member();
  v_q text := nullif(lower(pg_catalog.btrim(coalesce(p_query, ''))), '');
  v_topic text := nullif(lower(pg_catalog.btrim(coalesce(p_topic, ''))), '');
begin
  return query
  select p.id, p.username, p.display_name,
         case when d.hidden_at is null then d.identity end,
         case when d.hidden_at is null then d.bio end,
         case when d.hidden_at is null then d.follow_reason end,
         case when d.hidden_at is null then
           coalesce((select array_agg(m.topic order by t.sort_order)
                     from social.member_topics m join social.topics t on t.slug = m.topic
                     where m.user_id = p.id and t.active), '{}')
         else '{}'::text[] end,
         case when d.hidden_at is null then
           (select count(*)::integer from social.member_topics m
            join social.member_topics mine on mine.topic = m.topic and mine.user_id = v_uid
            join social.topics t on t.slug = m.topic and t.active
            where m.user_id = p.id)
         else 0 end as shared,
         (select count(*) from social.posts s where s.author_id = p.id and s.deleted_at is null),
         (select count(*) from social.follows f where f.creator_id = p.id),
         exists (select 1 from social.follows f where f.follower_id = v_uid and f.creator_id = p.id),
         exists (select 1 from social.clique_members c where c.fan_id = v_uid and c.creator_id = p.id and c.removed_at is null)
  from social.visible_members p
  left join social.profile_details d on d.user_id = p.id
  where p.id <> v_uid
    and (v_q is null
         or pg_catalog.strpos(p.username, v_q) > 0
         or pg_catalog.strpos(lower(p.display_name), v_q) > 0)
    and (v_topic is null or (d.hidden_at is null and exists (
         select 1 from social.member_topics m join social.topics t on t.slug = m.topic and t.active
         where m.user_id = p.id and m.topic = v_topic)))
  order by shared desc,
           (select max(s.created_at) from social.posts s where s.author_id = p.id and s.deleted_at is null) desc nulls last,
           p.username
  limit least(greatest(coalesce(p_limit, 30), 1), 50);
end;
$$;

create or replace function public.app_suggested_creators(p_limit integer default 10)
returns table (
  id uuid, username text, display_name text, identity text, bio text, follow_reason text,
  topics text[], shared_topics integer, post_count bigint, follower_count bigint
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
  select p.id, p.username, p.display_name,
         case when d.hidden_at is null then d.identity end,
         case when d.hidden_at is null then d.bio end,
         case when d.hidden_at is null then d.follow_reason end,
         case when d.hidden_at is null then
           coalesce((select array_agg(m.topic order by t.sort_order)
                     from social.member_topics m join social.topics t on t.slug = m.topic
                     where m.user_id = p.id and t.active), '{}')
         else '{}'::text[] end,
         case when d.hidden_at is null then
           (select count(*)::integer from social.member_topics m
            join social.member_topics mine on mine.topic = m.topic and mine.user_id = v_uid
            join social.topics t on t.slug = m.topic and t.active
            where m.user_id = p.id)
         else 0 end as shared,
         (select count(*) from social.posts s where s.author_id = p.id and s.deleted_at is null) as posts,
         (select count(*) from social.follows f where f.creator_id = p.id)
  from social.visible_members p
  left join social.profile_details d on d.user_id = p.id
  where p.id <> v_uid
    and not exists (select 1 from social.follows f where f.follower_id = v_uid and f.creator_id = p.id)
  order by shared desc,
           coalesce(d.hidden_at is null and d.identity in ('creator', 'both'), false) desc,
           (d.hidden_at is null and d.follow_reason is not null) desc nulls last,
           (select max(s.created_at) from social.posts s where s.author_id = p.id and s.deleted_at is null) desc nulls last,
           p.username
  limit least(greatest(coalesce(p_limit, 10), 1), 20);
end;
$$;

comment on function public.app_report(text, uuid, text, text) is 'Reports a post or profile the caller can see. One open report per member and target; 10 an hour, 30 a day. Never hides anything by itself.';
comment on function public.app_is_moderator() is 'Whether the signed-in pilot member is a moderator.';
comment on function public.app_mod_queue(text) is 'Moderators only: the report queue, priority first. Never includes reporters.';
comment on function public.app_mod_report(uuid) is 'Moderators only: one report and its target''s current state. Never includes the reporter.';
comment on function public.app_mod_hide(uuid, text) is 'Moderators only: hides the reported post or profile details, resolves its open reports, and records the action.';
comment on function public.app_mod_restore(uuid, text) is 'Moderators only: restores content a moderator hid, and records the action.';
comment on function public.app_mod_dismiss(uuid, text) is 'Moderators only: dismisses the open reports on a target, and records the action.';

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.app_report(text, uuid, text, text)',
    'public.app_is_moderator()',
    'public.app_mod_queue(text)',
    'public.app_mod_report(uuid)',
    'public.app_mod_hide(uuid, text)',
    'public.app_mod_restore(uuid, text)',
    'public.app_mod_dismiss(uuid, text)'
  ] loop
    execute pg_catalog.format('revoke all on function %s from public, anon', f);
    execute pg_catalog.format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end;
$$;
