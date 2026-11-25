-- IP-3 Governance (SP-TA-001 v2, WP-03; founder authorization of November
-- 25, 2026). Review guide: docs/GOVERNANCE.md.
--
-- 1. Blocking (GOV-01). A member can block another member. A block is two
--    way and immediate: neither sees the other's profile, posts, comments,
--    reposts or search results, neither can follow, comment on or report
--    through a new interaction with the other, and existing follows and
--    Inner Clique memberships between them end (recorded, with the reason
--    'block'). It is applied once, in social.visible_members, which every
--    member function already uses, so feeds, profiles, discovery, search,
--    comments, Clique catch-up and rewards all respect it. Signed-out
--    previews are unaffected (a visitor has no blocks). The blocked member
--    is never told. Reporting still works on someone you blocked
--    (social.listed_members, the view without blocks).
-- 2. Comment reports (GOV-02): reports can name a comment; moderators can
--    hide and restore comments like posts.
-- 3. Enforcement ladder (GOV-03): warning, then restriction (no posting,
--    commenting or reposting for 1 to 30 days), then suspension (hidden
--    from other members and no activity, until lifted or for 1 to 90
--    days). Each step needs the one before it within 180 days, except for
--    threats, self-harm and hate, which a moderator may act on at once.
--    Suspended members can still sign in to read notices and appeal.
-- 4. Author notices (GOV-04): the author is told when content is hidden
--    or restored and when an enforcement starts or ends, with the reason
--    category, never who reported.
-- 5. Appeals (GOV-05): one appeal per notice, within 30 days. A different
--    moderator decides whenever one exists. Reversing restores the
--    content or lifts the enforcement. Every step is in the audit trail.
-- 6. Integration: hidden posts and comments lose the Connection Points
--    they earned (reversal entries; a restore does not re-award), hidden
--    or suspended content never appears in public previews, discovery or
--    search, and restricted or suspended members earn nothing while it
--    lasts because they cannot act.

-- ---------------------------------------------------------------------------
-- 1. Blocking

create table social.blocks (
  blocker_id uuid not null references auth.users (id) on delete cascade,
  blocked_id uuid not null references auth.users (id) on delete cascade,
  blocked_at timestamptz not null default pg_catalog.now(),
  primary key (blocker_id, blocked_id),
  constraint blocks_not_self check (blocker_id <> blocked_id)
);
create index blocks_by_blocked on social.blocks (blocked_id);
comment on table social.blocks is 'Current blocks. Two way in effect: neither member sees or interacts with the other. Every change is also recorded in social.block_events. Never shown to the blocked member.';

create table social.block_events (
  id          bigint generated always as identity primary key,
  blocker_id  uuid not null references auth.users (id) on delete cascade,
  blocked_id  uuid not null references auth.users (id) on delete cascade,
  action      text not null check (action in ('blocked', 'unblocked')),
  occurred_at timestamptz not null default pg_catalog.now()
);
create index block_events_by_blocker on social.block_events (blocker_id, occurred_at);
comment on table social.block_events is 'Every block and unblock, append-only.';
create trigger block_events_append_only
before update or delete on social.block_events
for each row execute function ops.history_append_only();
create trigger block_events_no_truncate
before truncate on social.block_events
for each statement execute function ops.history_append_only();

alter table social.blocks enable row level security;
alter table social.block_events enable row level security;
revoke all on table social.blocks, social.block_events from public, anon, authenticated;

-- A follow or Clique membership ended by a block records why.
alter table social.follow_events drop constraint follow_events_source;
alter table social.follow_events add constraint follow_events_source
  check (source is null
         or (action = 'followed' and source in ('profile', 'discover', 'post', 'catch_up', 'comment', 'search', 'other'))
         or (action = 'unfollowed' and source = 'block'));
alter table social.clique_members drop constraint clique_removal_reason;
alter table social.clique_members add constraint clique_removal_reason check (removal_reason in ('removed', 'unfollowed', 'replaced', 'blocked'));

-- ---------------------------------------------------------------------------
-- 2. Comments can be hidden by a moderator

alter table social.comments add column hidden_at timestamptz;
alter table social.comments add constraint comments_hidden_is_deleted check (hidden_at is null or deleted_at = hidden_at);
comment on column social.comments.hidden_at is 'Set when a moderator hides the comment (deleted_at is set to the same time, so every member function excludes it).';

alter table ops.content_reports drop constraint content_reports_target_type_check;
alter table ops.content_reports add constraint content_reports_target_type_check check (target_type in ('post', 'profile', 'comment'));
alter table ops.moderation_actions drop constraint moderation_actions_target_type_check;
alter table ops.moderation_actions add constraint moderation_actions_target_type_check check (target_type in ('post', 'profile', 'comment', 'member'));
alter table ops.moderation_actions drop constraint moderation_actions_action_check;
alter table ops.moderation_actions add constraint moderation_actions_action_check
  check (action in ('hide', 'restore', 'dismiss', 'hold_set', 'hold_cleared', 'retention_purge', 'storage_cleanup_preview', 'storage_cleanup',
                    'enforce', 'lift', 'appeal_upheld', 'appeal_reversed'));

-- ---------------------------------------------------------------------------
-- 3. Enforcement

create table ops.enforcements (
  id          bigint generated always as identity primary key,
  member_id   uuid not null references auth.users (id) on delete cascade,
  level       text not null check (level in ('warning', 'restriction', 'suspension')),
  reason      text not null check (reason in ('spam', 'harassment', 'hate', 'sexual', 'violence', 'self_harm', 'impersonation', 'other')),
  report_id   uuid,
  note        text check (note is null or char_length(note) <= 500),
  starts_at   timestamptz not null default pg_catalog.now(),
  ends_at     timestamptz,
  actor_id    uuid,
  created_at  timestamptz not null default pg_catalog.now(),
  constraint enforcements_warning_has_no_end check (level <> 'warning' or ends_at is null),
  constraint enforcements_restriction_ends check (level <> 'restriction' or ends_at is not null),
  constraint enforcements_end_after_start check (ends_at is null or ends_at > starts_at)
);
create index enforcements_by_member on ops.enforcements (member_id, created_at);
create index enforcements_suspensions on ops.enforcements (member_id) where level = 'suspension';
comment on table ops.enforcements is 'The enforcement ladder: warnings, restrictions and suspensions. Append-only; ending one early is a row in ops.enforcement_lifts.';
create trigger enforcements_no_update
before update or delete on ops.enforcements
for each row execute function ops.history_append_only();
create trigger enforcements_no_truncate
before truncate on ops.enforcements
for each statement execute function ops.history_append_only();

create table ops.enforcement_lifts (
  enforcement_id bigint primary key references ops.enforcements (id) on delete cascade,
  lifted_at      timestamptz not null default pg_catalog.now(),
  actor_id       uuid,
  via            text not null check (via in ('moderator', 'appeal')),
  note           text check (note is null or char_length(note) <= 500)
);
comment on table ops.enforcement_lifts is 'An enforcement ended early by a moderator or a successful appeal. Append-only.';
create trigger enforcement_lifts_no_update
before update or delete on ops.enforcement_lifts
for each row execute function ops.history_append_only();
create trigger enforcement_lifts_no_truncate
before truncate on ops.enforcement_lifts
for each statement execute function ops.history_append_only();

-- The member's current standing: 'suspended', 'restricted' or null.
create function ops.member_standing(p_member uuid)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when bool_or(e.level = 'suspension') then 'suspended'
    when bool_or(e.level = 'restriction') then 'restricted'
  end
  from ops.enforcements e
  where e.member_id = p_member and e.level <> 'warning'
    and e.starts_at <= pg_catalog.now() and (e.ends_at is null or e.ends_at > pg_catalog.now())
    and not exists (select 1 from ops.enforcement_lifts l where l.enforcement_id = e.id);
$$;
revoke all on function ops.member_standing(uuid) from public, anon, authenticated;

-- Restricted members cannot post, comment or repost; suspended members also
-- cannot follow, save or share. Enforced on the tables themselves, so no
-- function can be missed.
create function ops.standing_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member uuid;
  v_standing text;
begin
  if tg_table_name in ('posts', 'comments') then
    v_member := new.author_id;
  elsif tg_table_name = 'reposts' then
    v_member := new.reposter_id;
  elsif tg_table_name in ('saves', 'shares') then
    v_member := new.member_id;
  else
    v_member := new.follower_id;
  end if;
  v_standing := ops.member_standing(v_member);
  if v_standing = 'suspended' then
    raise exception 'suspended' using errcode = 'P0001', detail = 'Your account is suspended. You can read your notices and appeal.';
  end if;
  if v_standing = 'restricted' and tg_table_name in ('posts', 'comments', 'reposts') then
    raise exception 'restricted' using errcode = 'P0001', detail = 'You cannot post, comment or repost while a restriction is in place.';
  end if;
  return new;
end;
$$;
revoke all on function ops.standing_guard() from public, anon, authenticated;
create trigger standing_guard before insert on social.posts for each row execute function ops.standing_guard();
create trigger standing_guard before insert on social.comments for each row execute function ops.standing_guard();
create trigger standing_guard before insert on social.reposts for each row execute function ops.standing_guard();
create trigger standing_guard before insert on social.saves for each row execute function ops.standing_guard();
create trigger standing_guard before insert on social.shares for each row execute function ops.standing_guard();
create trigger standing_guard before insert on social.follows for each row execute function ops.standing_guard();

-- ---------------------------------------------------------------------------
-- 4. Who members can see: no blocks either way, and no suspended members
--    (apart from yourself). listed_members is the same without those two
--    rules, for reporting and moderation.

create view social.listed_members as
  select p.id, p.username, p.display_name
  from public.profiles p
  join ops.member_access a on a.user_id = p.id
  where p.username is not null and p.display_name is not null
    and a.status = 'active' and (a.expires_at is null or a.expires_at > pg_catalog.now());
revoke all on table social.listed_members from public, anon, authenticated;
comment on view social.listed_members is 'Members with a complete profile and active, unexpired pilot membership, before blocks and suspensions. Only for reporting and moderation.';

create or replace view social.visible_members as
  select p.id, p.username, p.display_name
  from public.profiles p
  join ops.member_access a on a.user_id = p.id
  where p.username is not null and p.display_name is not null
    and a.status = 'active' and (a.expires_at is null or a.expires_at > pg_catalog.now())
    and not exists (select 1 from social.blocks b
                    where (b.blocker_id = auth.uid() and b.blocked_id = p.id)
                       or (b.blocker_id = p.id and b.blocked_id = auth.uid()))
    and (p.id = auth.uid()
         or not exists (select 1 from ops.enforcements e
                        where e.member_id = p.id and e.level = 'suspension'
                          and e.starts_at <= pg_catalog.now() and (e.ends_at is null or e.ends_at > pg_catalog.now())
                          and not exists (select 1 from ops.enforcement_lifts x where x.enforcement_id = e.id)));
revoke all on table social.visible_members from public, anon, authenticated;
comment on view social.visible_members is 'Members others may see or interact with: a complete profile, active pilot membership, no block either way with the signed-in member, and not suspended.';

-- ---------------------------------------------------------------------------
-- 5. Notices and appeals

create table ops.member_notices (
  id                   bigint generated always as identity primary key,
  member_id            uuid not null references auth.users (id) on delete cascade,
  kind                 text not null check (kind in ('content_hidden', 'content_restored', 'warning', 'restriction', 'suspension',
                                                     'enforcement_lifted', 'appeal_upheld', 'appeal_reversed')),
  target_type          text check (target_type in ('post', 'profile', 'comment')),
  target_id            uuid,
  reason               text,
  -- The member's own content as it was (first 140 characters).
  excerpt              text check (excerpt is null or char_length(excerpt) <= 140),
  moderation_action_id bigint,
  enforcement_id       bigint references ops.enforcements (id) on delete cascade,
  ends_at              timestamptz,
  created_at           timestamptz not null default pg_catalog.now(),
  read_at              timestamptz
);
create index member_notices_by_member on ops.member_notices (member_id, created_at desc);
comment on table ops.member_notices is 'Notices to a member about moderation of their own content or account. Never names a reporter. Only read_at may change.';

create function ops.notices_read_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op <> 'UPDATE' or (to_jsonb(new) - 'read_at') <> (to_jsonb(old) - 'read_at') then
    raise exception 'member_notices: only read_at may change';
  end if;
  return new;
end;
$$;
revoke all on function ops.notices_read_only() from public, anon, authenticated;
create trigger member_notices_read_only
before update or delete on ops.member_notices
for each row execute function ops.notices_read_only();

create table ops.appeals (
  id            uuid primary key default gen_random_uuid(),
  member_id     uuid not null references auth.users (id) on delete cascade,
  notice_id     bigint not null unique references ops.member_notices (id) on delete cascade,
  body          text not null check (char_length(body) between 1 and 1000 and body ~ '\S'
                                     and body !~ '[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]'),
  status        text not null default 'open' check (status in ('open', 'upheld', 'reversed')),
  created_at    timestamptz not null default pg_catalog.now(),
  decided_at    timestamptz,
  decided_by    uuid,
  decision_note text check (decision_note is null or char_length(decision_note) <= 500),
  constraint appeals_decided_consistent check ((status = 'open') = (decided_at is null))
);
create index appeals_queue on ops.appeals (status, created_at);
comment on table ops.appeals is 'One appeal per notice, within 30 days. Decided once, by a different moderator whenever one exists.';

-- Appeals are decided once.
create function ops.appeals_decided_once()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op <> 'UPDATE' or old.status <> 'open' or new.id <> old.id or new.member_id <> old.member_id
     or new.notice_id <> old.notice_id or new.body <> old.body or new.created_at <> old.created_at then
    raise exception 'appeals are decided once and never rewritten';
  end if;
  return new;
end;
$$;
revoke all on function ops.appeals_decided_once() from public, anon, authenticated;
create trigger appeals_decided_once
before update or delete on ops.appeals
for each row execute function ops.appeals_decided_once();

alter table ops.enforcements enable row level security;
alter table ops.enforcement_lifts enable row level security;
alter table ops.member_notices enable row level security;
alter table ops.appeals enable row level security;
revoke all on table ops.enforcements, ops.enforcement_lifts, ops.member_notices, ops.appeals from public, anon, authenticated;
grant select on table ops.enforcements, ops.enforcement_lifts, ops.member_notices, ops.appeals to service_role;

-- Records a notice for a member.
create function ops.notify_member(p_member uuid, p_kind text, p_target_type text, p_target_id uuid, p_reason text,
                                  p_excerpt text, p_action bigint, p_enforcement bigint, p_ends_at timestamptz)
returns void
language sql
set search_path = ''
as $$
  insert into ops.member_notices (member_id, kind, target_type, target_id, reason, excerpt, moderation_action_id, enforcement_id, ends_at)
  select p_member, p_kind, p_target_type, p_target_id, p_reason, pg_catalog.left(p_excerpt, 140), p_action, p_enforcement, p_ends_at
  where p_member is not null;
$$;
revoke all on function ops.notify_member(uuid, text, text, uuid, text, text, bigint, bigint, timestamptz) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. Blocking functions

create function public.app_block(p_member uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_member();
begin
  if p_member is null or p_member = v_uid then
    raise exception 'cannot_block_self' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_member) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if exists (select 1 from social.blocks b where b.blocker_id = v_uid and b.blocked_id = p_member) then
    return; -- already blocked
  end if;
  if (select count(*) from social.block_events e where e.blocker_id = v_uid and e.occurred_at > pg_catalog.now() - interval '1 hour') >= 30 then
    raise exception 'rate_limited' using errcode = 'P0001', detail = 'Please slow down and try again later.';
  end if;
  -- The same locks app_unfollow takes, both members, in a fixed order.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('social.clique:' || least(v_uid, p_member)::text, 0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('social.clique:' || greatest(v_uid, p_member)::text, 0));
  insert into social.blocks (blocker_id, blocked_id) values (v_uid, p_member);
  insert into social.block_events (blocker_id, blocked_id, action) values (v_uid, p_member, 'blocked');
  -- Follows end both ways, recorded with the reason.
  with gone as (
    delete from social.follows f
    where (f.follower_id = v_uid and f.creator_id = p_member) or (f.follower_id = p_member and f.creator_id = v_uid)
    returning f.follower_id, f.creator_id
  )
  insert into social.follow_events (follower_id, creator_id, action, source)
  select g.follower_id, g.creator_id, 'unfollowed', 'block' from gone g;
  update social.clique_members c set removed_at = pg_catalog.now(), removal_reason = 'blocked'
  where c.removed_at is null
    and ((c.fan_id = v_uid and c.creator_id = p_member) or (c.fan_id = p_member and c.creator_id = v_uid));
end;
$$;
comment on function public.app_block(uuid) is 'Blocks a member: neither sees or interacts with the other, follows and Clique memberships between them end. The blocked member is not told. 30 an hour.';
revoke all on function public.app_block(uuid) from public, anon;
grant execute on function public.app_block(uuid) to authenticated;

create function public.app_unblock(p_member uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_member();
begin
  delete from social.blocks b where b.blocker_id = v_uid and b.blocked_id = p_member;
  if found then
    insert into social.block_events (blocker_id, blocked_id, action) values (v_uid, p_member, 'unblocked');
  end if;
end;
$$;
comment on function public.app_unblock(uuid) is 'Ends a block. Follows are not restored.';
revoke all on function public.app_unblock(uuid) from public, anon;
grant execute on function public.app_unblock(uuid) to authenticated;

create function public.app_my_blocks()
returns table (id uuid, username text, display_name text, blocked_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_member();
begin
  return query
  select p.id, p.username, p.display_name, b.blocked_at
  from social.blocks b join public.profiles p on p.id = b.blocked_id
  where b.blocker_id = v_uid
  order by b.blocked_at desc;
end;
$$;
comment on function public.app_my_blocks() is 'The members the caller has blocked (only their own blocks, never who blocked them).';
revoke all on function public.app_my_blocks() from public, anon;
grant execute on function public.app_my_blocks() to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Reporting comments, and reporting someone you blocked

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
  if p_target_type is null or p_target_type not in ('post', 'profile', 'comment') or p_target_id is null then
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

  -- Live content by a current member. A block does not stop a report (20261206000000).
  if p_target_type = 'post' then
    select s.author_id, pg_catalog.jsonb_build_object(
             'body', s.body, 'author_username', a.username, 'author_display_name', a.display_name, 'posted_at', s.created_at)
             -- Photo posts (20261127000000): the photo's paths, held as evidence while this snapshot is kept.
             || coalesce((select pg_catalog.jsonb_build_object('media_kind', m.kind, 'media_full_path', u.full_path,
                                  'media_feed_path', u.feed_path, 'media_description', m.description)
                          from social.post_media m join social.media_uploads u on u.id = m.upload_id
                          where m.post_id = s.id), '{}'::jsonb)
      into v_owner, v_snapshot
    from social.posts s join social.listed_members a on a.id = s.author_id
    where s.id = p_target_id and s.deleted_at is null;
  elsif p_target_type = 'comment' then
    select c.author_id, pg_catalog.jsonb_build_object(
             'body', c.body, 'author_username', a.username, 'author_display_name', a.display_name,
             'post_id', c.post_id, 'commented_at', c.created_at)
      into v_owner, v_snapshot
    from social.comments c
    join social.posts s on s.id = c.post_id and s.deleted_at is null
    join social.listed_members a on a.id = c.author_id
    where c.id = p_target_id and c.deleted_at is null;
  else
    select p.id, pg_catalog.jsonb_build_object(
             'username', p.username, 'display_name', p.display_name,
             'identity', d.identity, 'bio', d.bio, 'follow_reason', d.follow_reason)
      into v_owner, v_snapshot
    from social.listed_members p
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

-- One report in full, with the target's current state (now also comments)
-- and whose content it is, so a moderator can open that member's record.
drop function public.app_mod_report(uuid);
create function public.app_mod_report(p_report uuid)
returns table (
  id uuid, target_type text, target_id uuid, reason text, priority boolean, details text, snapshot jsonb,
  status text, created_at timestamptz, resolved_at timestamptz, data_purged boolean,
  target_state text, current_body text, open_reports_for_target bigint, target_owner_id uuid
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
           when r.target_type = 'comment' then
             (select case when c.id is null then 'gone' when c.hidden_at is not null then 'hidden' when c.deleted_at is not null then 'deleted_by_author' else 'live' end
              from (select 1) one left join social.comments c on c.id = r.target_id)
           else
             (select case when p.id is null then 'gone' when d.hidden_at is not null then 'hidden' else 'live' end
              from (select 1) one left join public.profiles p on p.id = r.target_id left join social.profile_details d on d.user_id = r.target_id)
         end,
         case when r.target_type = 'post' then (select s.body from social.posts s where s.id = r.target_id and s.deleted_at is null)
              when r.target_type = 'comment' then (select c.body from social.comments c where c.id = r.target_id and c.deleted_at is null) end,
         (select count(*) from ops.content_reports o where o.target_type = r.target_type and o.target_id = r.target_id and o.status = 'open'),
         r.target_owner_id
  from ops.content_reports r
  where r.id = p_report;
end;
$$;
comment on function public.app_mod_report(uuid) is 'Moderators only: one report, its target''s current state and whose content it is. Never includes the reporter.';
revoke all on function public.app_mod_report(uuid) from public, anon;
grant execute on function public.app_mod_report(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 8. Hide, restore and dismiss: comments too, author notices, and points
--    earned on hidden content are reversed.

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

-- ---------------------------------------------------------------------------
-- 9. The enforcement ladder

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

create function public.app_mod_lift(p_enforcement bigint, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_moderator();
  v_note text := ops.clean_note(p_note);
  e ops.enforcements%rowtype;
  v_action bigint;
begin
  select * into e from ops.enforcements where id = p_enforcement;
  if not found or e.level = 'warning' then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if (e.ends_at is not null and e.ends_at <= pg_catalog.now())
     or exists (select 1 from ops.enforcement_lifts l where l.enforcement_id = e.id) then
    raise exception 'not_active' using errcode = 'P0001', detail = 'This has already ended.';
  end if;
  insert into ops.enforcement_lifts (enforcement_id, actor_id, via, note) values (e.id, v_uid, 'moderator', v_note);
  insert into ops.moderation_actions (actor_id, actor_label, action, target_type, target_id, note)
  values (v_uid, 'moderator', 'lift', 'member', e.member_id, e.level || coalesce(': ' || v_note, ''))
  returning id into v_action;
  perform ops.notify_member(e.member_id, 'enforcement_lifted', null, null, e.reason, null, v_action, e.id, null);
end;
$$;
comment on function public.app_mod_lift(bigint, text) is 'Moderators only: ends a restriction or suspension early. The member is notified.';
revoke all on function public.app_mod_lift(bigint, text) from public, anon;
grant execute on function public.app_mod_lift(bigint, text) to authenticated;

-- A member's moderation record, for deciding the next step.
create function public.app_mod_member_record(p_member uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_moderator();
begin
  return (
    select pg_catalog.jsonb_build_object(
      'username', p.username,
      'display_name', p.display_name,
      'standing', ops.member_standing(p.id),
      'hidden_content', (select count(*) from ops.moderation_actions a
                         where a.action = 'hide' and a.target_id in (
                           select s.id from social.posts s where s.author_id = p.id
                           union all select c.id from social.comments c where c.author_id = p.id
                           union all select p.id)),
      'enforcements', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
                          'id', e.id, 'level', e.level, 'reason', e.reason, 'starts_at', e.starts_at, 'ends_at', e.ends_at,
                          'lifted_at', l.lifted_at, 'lifted_via', l.via,
                          'active', e.level <> 'warning' and l.enforcement_id is null and (e.ends_at is null or e.ends_at > pg_catalog.now()))
                        order by e.created_at desc)
                        from ops.enforcements e left join ops.enforcement_lifts l on l.enforcement_id = e.id
                        where e.member_id = p.id), '[]'::jsonb))
    from public.profiles p where p.id = p_member);
end;
$$;
comment on function public.app_mod_member_record(uuid) is 'Moderators only: a member''s standing, hidden content count and enforcement history. Never includes reporters.';
revoke all on function public.app_mod_member_record(uuid) from public, anon;
grant execute on function public.app_mod_member_record(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 10. The member's side: standing, notices and appeals

create function public.app_my_standing()
returns table (standing text, ends_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_member();
  v_standing text := ops.member_standing(v_uid);
begin
  if v_standing is null then
    return;
  end if;
  return query
  select v_standing,
         case when bool_or(e.ends_at is null) then null else max(e.ends_at) end
  from ops.enforcements e
  where e.member_id = v_uid and e.level = case v_standing when 'suspended' then 'suspension' else 'restriction' end
    and e.starts_at <= pg_catalog.now() and (e.ends_at is null or e.ends_at > pg_catalog.now())
    and not exists (select 1 from ops.enforcement_lifts l where l.enforcement_id = e.id);
end;
$$;
comment on function public.app_my_standing() is 'The caller''s own restriction or suspension, if any, and when it ends.';
revoke all on function public.app_my_standing() from public, anon;
grant execute on function public.app_my_standing() to authenticated;

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

create function public.app_mark_notices_read()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_member();
begin
  update ops.member_notices n set read_at = pg_catalog.now() where n.member_id = v_uid and n.read_at is null;
end;
$$;
comment on function public.app_mark_notices_read() is 'Marks the caller''s notices as read.';
revoke all on function public.app_mark_notices_read() from public, anon;
grant execute on function public.app_mark_notices_read() to authenticated;

create function public.app_appeal(p_notice bigint, p_body text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_member();
  v_body text := pg_catalog.btrim(coalesce(p_body, ''));
  n ops.member_notices%rowtype;
  v_id uuid;
begin
  select * into n from ops.member_notices where id = p_notice and member_id = v_uid;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if n.kind not in ('content_hidden', 'warning', 'restriction', 'suspension') then
    raise exception 'not_appealable' using errcode = 'P0001';
  end if;
  if n.created_at <= pg_catalog.now() - interval '30 days' then
    raise exception 'appeal_window_closed' using errcode = 'P0001', detail = 'Appeals can be made within 30 days.';
  end if;
  if v_body = '' then
    raise exception 'empty' using errcode = 'P0001';
  end if;
  if char_length(v_body) > 1000 then
    raise exception 'too_long' using errcode = 'P0001';
  end if;
  insert into ops.appeals (member_id, notice_id, body) values (v_uid, n.id, v_body)
  on conflict (notice_id) do nothing
  returning id into v_id;
  if v_id is null then
    raise exception 'already_appealed' using errcode = 'P0001';
  end if;
  return v_id;
end;
$$;
comment on function public.app_appeal(bigint, text) is 'Appeals a hidden item, warning, restriction or suspension: once per notice, within 30 days, up to 1,000 characters.';
revoke all on function public.app_appeal(bigint, text) from public, anon;
grant execute on function public.app_appeal(bigint, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 11. Deciding appeals

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

create function public.app_mod_decide_appeal(p_appeal uuid, p_reverse boolean, p_note text default null)
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
revoke all on function public.app_mod_decide_appeal(uuid, boolean, text) from public, anon;
grant execute on function public.app_mod_decide_appeal(uuid, boolean, text) to authenticated;
