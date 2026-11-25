-- IP-4a Content (SP-TA-001 v2, WP-04): post topics, saves, reposts and
-- editing your own posts. Review guide: docs/CONTENT.md.
--
-- 1. Post topic (DSC-05). One optional topic from the approved list. Set
--    once after publishing (app_set_post_topic, while it has none) or changed
--    by editing. Uncategorized posts still reach every follower; only
--    discovery (IP-4b) needs a topic.
-- 2. Editing (CNT-12, CNT-15). The author can change the text and topic of
--    their own live post. The earlier version is kept in social.post_edits
--    (append-only), so an edit of a reported post never erases the evidence.
--    Photos are not replaceable; hidden and deleted posts cannot be edited;
--    the post id, and everything keyed to it, never changes. Edited posts
--    show "Edited".
-- 3. Saves (CNT-08). Private bookmarks: only the member sees what they saved.
-- 4. Reposts (CNT-09). A member reposts someone else's live post to their
--    followers, keeping both the original creator and the distributor. On
--    Home, a follower sees a repost only when they don't already follow the
--    original creator, once per post (the first repost by someone they
--    follow), so every post still appears once.
-- 5. Post details for the cards (app_post_meta): topic, edited, saved by me,
--    repost count, reposted by me, for up to 100 posts in one call.
-- 6. Home with reposts (app_feed_items_page): the followed feed plus reposts,
--    paged on (activity time, post id).
-- 7. Active Supporter now also counts saves and reposts of the creator's
--    posts in the last 28 days (still provisional until decision N8).
-- 8. Events: post_edited, post_saved, post_unsaved, post_reposted,
--    post_unreposted, recorded by triggers.

-- ---------------------------------------------------------------------------
-- 1 and 2. Topic and editing

alter table social.posts add column topic text references social.topics (slug);
alter table social.posts add column edited_at timestamptz;
alter table social.posts add constraint posts_edited_after_created check (edited_at is null or edited_at >= created_at);
comment on column social.posts.topic is 'One optional topic (social.topics). Uncategorized posts reach followers but are left out of discovery.';
comment on column social.posts.edited_at is 'When the author last edited the text or topic; the earlier versions are in social.post_edits.';
create index posts_live_by_topic on social.posts (topic, created_at desc) where deleted_at is null and topic is not null;

create table social.post_edits (
  id             bigint generated always as identity primary key,
  post_id        uuid not null references social.posts (id) on delete cascade,
  editor_id      uuid not null references auth.users (id) on delete cascade,
  previous_body  text not null,
  previous_topic text,
  edited_at      timestamptz not null default pg_catalog.now()
);
comment on table social.post_edits is 'Every edit of a post, with the version it replaced. Append-only, so an edited post that was reported keeps its evidence.';
create index post_edits_by_post on social.post_edits (post_id, edited_at);
create index post_edits_by_editor_time on social.post_edits (editor_id, edited_at);
alter table social.post_edits enable row level security;
revoke all on table social.post_edits from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Saves

create table social.saves (
  member_id uuid not null references auth.users (id) on delete cascade,
  post_id   uuid not null references social.posts (id) on delete cascade,
  saved_at  timestamptz not null default pg_catalog.now(),
  primary key (member_id, post_id)
);
comment on table social.saves is 'Posts a member saved. Private to that member.';
create index saves_by_member_time on social.saves (member_id, saved_at desc, post_id desc);
create index saves_by_post on social.saves (post_id);
alter table social.saves enable row level security;
revoke all on table social.saves from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Reposts

create table social.reposts (
  reposter_id uuid not null references auth.users (id) on delete cascade,
  post_id     uuid not null references social.posts (id) on delete cascade,
  created_at  timestamptz not null default pg_catalog.now(),
  primary key (reposter_id, post_id)
);
comment on table social.reposts is 'Reposts: a member distributing someone else''s post to their followers. The original creator stays the author; the reposter is the distributor.';
create index reposts_by_post on social.reposts (post_id);
create index reposts_by_reposter_time on social.reposts (reposter_id, created_at desc);
alter table social.reposts enable row level security;
revoke all on table social.reposts from public, anon, authenticated;

-- Saves and reposts change often: one hourly limit for both, counted from the events.
create function social.content_rate_check(p_user uuid, p_names text[], p_limit integer)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('social.content:' || p_user::text, 0));
  if (select count(*) from social.content_actions a
      where a.member_id = p_user and a.action = any (p_names) and a.occurred_at > pg_catalog.now() - interval '1 hour') >= p_limit then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
end;
$$;
revoke all on function social.content_rate_check(uuid, text[], integer) from public, anon, authenticated;

-- A small private log of save, repost and edit actions, for the limits above
-- (the event stream is analytics and is never read by member functions).
create table social.content_actions (
  id          bigint generated always as identity primary key,
  member_id   uuid not null references auth.users (id) on delete cascade,
  action      text not null check (action in ('save', 'unsave', 'repost', 'unrepost', 'edit')),
  occurred_at timestamptz not null default pg_catalog.now()
);
comment on table social.content_actions is 'Recent save, repost and edit actions per member, for rate limits only.';
create index content_actions_by_member_time on social.content_actions (member_id, occurred_at);
alter table social.content_actions enable row level security;
revoke all on table social.content_actions from public, anon, authenticated;

create function social.content_history_is_append_only()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception '% is append-only', tg_table_name using errcode = 'P0001';
end;
$$;
revoke all on function social.content_history_is_append_only() from public, anon, authenticated;
create trigger post_edits_append_only
  before update or delete on social.post_edits
  for each row when (pg_trigger_depth() = 0)
  execute function social.content_history_is_append_only();
create trigger content_actions_append_only
  before update or delete on social.content_actions
  for each row when (pg_trigger_depth() = 0)
  execute function social.content_history_is_append_only();

-- ---------------------------------------------------------------------------
-- 7. Active Supporter: meaningful comments, saves and reposts (28 days).

create or replace function social.is_active_supporter(p_fan uuid, p_creator uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (select 1 from social.follows f where f.follower_id = p_fan and f.creator_id = p_creator)
     and (
       exists (
         select 1
         from social.comments c
         join social.posts s on s.id = c.post_id
         where c.author_id = p_fan and s.author_id = p_creator
           and c.deleted_at is null and s.deleted_at is null
           and c.created_at >= pg_catalog.now() - interval '28 days'
           and social.meaningful_comment(c.body)
       )
       or exists (
         select 1 from social.saves v join social.posts s on s.id = v.post_id
         where v.member_id = p_fan and s.author_id = p_creator and s.deleted_at is null
           and v.saved_at >= pg_catalog.now() - interval '28 days'
       )
       or exists (
         select 1 from social.reposts r join social.posts s on s.id = r.post_id
         where r.reposter_id = p_fan and s.author_id = p_creator and s.deleted_at is null
           and r.created_at >= pg_catalog.now() - interval '28 days'
       )
     );
$$;
comment on function social.is_active_supporter(uuid, uuid) is 'Relationship stage 3: a follower with qualifying activity on the creator''s posts in the last 28 days: a meaningful comment, a save or a repost (provisional, decision N8).';

-- ---------------------------------------------------------------------------
-- 8. Events

create or replace function analytics.capture()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_author uuid;
begin
  if tg_table_name = 'posts' then
    if tg_op = 'INSERT' then
      perform analytics.record('post_created', new.author_id, new.author_id, new.id,
        pg_catalog.jsonb_build_object('media', coalesce(to_jsonb(new) ->> 'media_kind', 'text')));
    elsif tg_op = 'UPDATE' and old.deleted_at is null and new.deleted_at is not null then
      perform analytics.record('post_deleted', new.author_id, new.author_id, new.id);
    end if;
  elsif tg_table_name = 'comments' then
    select p.author_id into v_author from social.posts p where p.id = coalesce(new.post_id, old.post_id);
    if tg_op = 'INSERT' then
      perform analytics.record('comment_added', new.author_id, v_author, new.post_id,
        pg_catalog.jsonb_build_object('meaningful', social.meaningful_comment(new.body)));
    elsif tg_op = 'UPDATE' and old.deleted_at is null and new.deleted_at is not null then
      perform analytics.record('comment_deleted', new.author_id, v_author, new.post_id);
    end if;
  elsif tg_table_name = 'likes' then
    if tg_op = 'INSERT' then
      select p.author_id into v_author from social.posts p where p.id = new.post_id;
      perform analytics.record('post_liked', new.user_id, v_author, new.post_id);
    else
      -- A like removed by an account or post deletion is not an "unlike":
      -- record nothing, so deleting an account is never blocked.
      select p.author_id into v_author from social.posts p where p.id = old.post_id;
      if v_author is not null and exists (select 1 from auth.users x where x.id = old.user_id) then
        perform analytics.record('post_unliked', old.user_id, v_author, old.post_id);
      end if;
    end if;
  elsif tg_table_name = 'follow_events' then
    perform analytics.record(new.action, new.follower_id, new.creator_id, null,
      case when new.source is null then '{}'::jsonb else pg_catalog.jsonb_build_object('source', new.source) end);
  elsif tg_table_name = 'clique_members' then
    if tg_op = 'INSERT' then
      perform analytics.record('clique_joined', new.fan_id, new.creator_id, null);
    elsif tg_op = 'UPDATE' and old.removed_at is null and new.removed_at is not null then
      perform analytics.record('clique_left', new.fan_id, new.creator_id, null,
        pg_catalog.jsonb_build_object('reason', new.removal_reason));
    end if;
  elsif tg_table_name = 'registrations' then
    perform analytics.record('registered', new.user_id, new.creator_id, null,
      pg_catalog.jsonb_build_object('kind', new.kind, 'referred', new.referrer_id is not null));
  elsif tg_table_name = 'mute_events' then
    perform analytics.record(new.action, new.member_id, new.creator_id, null);
  elsif tg_table_name = 'support_intents' then
    perform analytics.record('support_intent_recorded', new.member_id, new.creator_id, null,
      pg_catalog.jsonb_build_object('choice', new.choice));
  elsif tg_table_name = 'post_edits' then
    select p.author_id into v_author from social.posts p where p.id = new.post_id;
    perform analytics.record('post_edited', new.editor_id, v_author, new.post_id);
  elsif tg_table_name = 'saves' then
    select p.author_id into v_author from social.posts p where p.id = coalesce(new.post_id, old.post_id);
    if tg_op = 'INSERT' then
      perform analytics.record('post_saved', new.member_id, v_author, new.post_id);
    elsif v_author is not null and exists (select 1 from auth.users x where x.id = old.member_id) then
      -- Removed by the member (not by an account or post deletion).
      perform analytics.record('post_unsaved', old.member_id, v_author, old.post_id);
    end if;
  elsif tg_table_name = 'reposts' then
    select p.author_id into v_author from social.posts p where p.id = coalesce(new.post_id, old.post_id);
    if tg_op = 'INSERT' then
      perform analytics.record('post_reposted', new.reposter_id, v_author, new.post_id);
    elsif v_author is not null and exists (select 1 from auth.users x where x.id = old.reposter_id) then
      perform analytics.record('post_unreposted', old.reposter_id, v_author, old.post_id);
    end if;
  end if;
  return null;
end;
$$;
revoke all on function analytics.capture() from public, anon, authenticated;

create trigger events_post_edits after insert on social.post_edits
for each row execute function analytics.capture();
create trigger events_saves after insert or delete on social.saves
for each row execute function analytics.capture();
create trigger events_reposts after insert or delete on social.reposts
for each row execute function analytics.capture();

-- ---------------------------------------------------------------------------
-- Member functions

create function public.app_set_post_topic(p_post uuid, p_topic text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_member();
begin
  if p_topic is null or not exists (select 1 from social.topics t where t.slug = p_topic and t.active) then
    raise exception 'unknown_topic' using errcode = 'P0001';
  end if;
  update social.posts s set topic = p_topic
  where s.id = p_post and s.author_id = v_uid and s.deleted_at is null and s.topic is null;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
end;
$$;
comment on function public.app_set_post_topic(uuid, text) is 'Gives one of the member''s own live posts its first topic (right after publishing). Changing a topic later is an edit.';
revoke all on function public.app_set_post_topic(uuid, text) from public, anon;
grant execute on function public.app_set_post_topic(uuid, text) to authenticated;

create function public.app_edit_post(p_post uuid, p_body text, p_topic text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_member();
  v_post social.posts%rowtype;
  v_body text := pg_catalog.btrim(coalesce(p_body, ''));
begin
  select * into v_post from social.posts s where s.id = p_post and s.author_id = v_uid and s.deleted_at is null for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if p_topic is not null and not exists (select 1 from social.topics t where t.slug = p_topic and t.active) then
    raise exception 'unknown_topic' using errcode = 'P0001';
  end if;
  if v_body = '' and v_post.media_kind is null then
    raise exception 'empty' using errcode = 'P0001';
  end if;
  if pg_catalog.char_length(v_body) > 2000 then
    raise exception 'too_long' using errcode = 'P0001';
  end if;
  if v_body = v_post.body and p_topic is not distinct from v_post.topic then
    return; -- nothing changed: nothing is recorded
  end if;
  perform social.content_rate_check(v_uid, array['edit'], 30);
  insert into social.post_edits (post_id, editor_id, previous_body, previous_topic) values (v_post.id, v_uid, v_post.body, v_post.topic);
  insert into social.content_actions (member_id, action) values (v_uid, 'edit');
  update social.posts s set body = v_body, topic = p_topic, edited_at = pg_catalog.now() where s.id = v_post.id;
end;
$$;
comment on function public.app_edit_post(uuid, text, text) is 'Edits the text and topic of one of the member''s own live posts. The earlier version is kept (social.post_edits); photos are not replaceable.';
revoke all on function public.app_edit_post(uuid, text, text) from public, anon;
grant execute on function public.app_edit_post(uuid, text, text) to authenticated;

create function public.app_post_edits(p_post uuid)
returns table (previous_body text, previous_topic text, edited_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_member();
begin
  -- The author's own history only.
  return query
  select e.previous_body, e.previous_topic, e.edited_at
  from social.post_edits e
  join social.posts s on s.id = e.post_id
  where e.post_id = p_post and s.author_id = v_uid
  order by e.edited_at desc, e.id desc;
end;
$$;
comment on function public.app_post_edits(uuid) is 'The earlier versions of one of the member''s own posts, newest first.';
revoke all on function public.app_post_edits(uuid) from public, anon;
grant execute on function public.app_post_edits(uuid) to authenticated;

create function public.app_save(p_post uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_member();
begin
  if not exists (select 1 from social.posts s join social.visible_members p on p.id = s.author_id where s.id = p_post and s.deleted_at is null) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if exists (select 1 from social.saves v where v.member_id = v_uid and v.post_id = p_post) then
    return;
  end if;
  perform social.content_rate_check(v_uid, array['save', 'unsave'], 200);
  insert into social.saves (member_id, post_id) values (v_uid, p_post);
  insert into social.content_actions (member_id, action) values (v_uid, 'save');
end;
$$;
comment on function public.app_save(uuid) is 'Saves a live post for the member (private).';
revoke all on function public.app_save(uuid) from public, anon;
grant execute on function public.app_save(uuid) to authenticated;

create function public.app_unsave(p_post uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_member();
begin
  if not exists (select 1 from social.saves v where v.member_id = v_uid and v.post_id = p_post) then
    return;
  end if;
  perform social.content_rate_check(v_uid, array['save', 'unsave'], 200);
  delete from social.saves v where v.member_id = v_uid and v.post_id = p_post;
  insert into social.content_actions (member_id, action) values (v_uid, 'unsave');
end;
$$;
comment on function public.app_unsave(uuid) is 'Removes a saved post. Does nothing if it was not saved.';
revoke all on function public.app_unsave(uuid) from public, anon;
grant execute on function public.app_unsave(uuid) to authenticated;

create function public.app_saved_page(p_before_at timestamptz default null, p_before_id uuid default null, p_limit integer default 20)
returns table (
  id uuid, author_id uuid, author_username text, author_display_name text,
  body text, created_at timestamptz, like_count bigint, comment_count bigint,
  liked_by_me boolean, author_in_my_clique boolean, is_mine boolean, media jsonb, saved_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_member();
begin
  if (p_before_at is null) <> (p_before_id is null) then
    raise exception 'invalid_cursor' using errcode = 'P0001';
  end if;
  return query
  select s.id, s.author_id, p.username, p.display_name, s.body, s.created_at,
         (select count(*) from social.likes l where l.post_id = s.id),
         (select count(*) from social.comments c where c.post_id = s.id and c.deleted_at is null),
         exists (select 1 from social.likes l where l.post_id = s.id and l.user_id = v_uid),
         exists (select 1 from social.clique_members m where m.fan_id = v_uid and m.creator_id = s.author_id and m.removed_at is null),
         s.author_id = v_uid,
         social.post_media_json(s.id),
         v.saved_at
  from social.saves v
  join social.posts s on s.id = v.post_id
  join social.visible_members p on p.id = s.author_id
  where v.member_id = v_uid and s.deleted_at is null
    and (p_before_at is null or (v.saved_at, s.id) < (p_before_at, p_before_id))
  order by v.saved_at desc, s.id desc
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
end;
$$;
comment on function public.app_saved_page(timestamptz, uuid, integer) is 'The member''s saved posts that are still live, most recently saved first, paged on (saved time, post id).';
revoke all on function public.app_saved_page(timestamptz, uuid, integer) from public, anon;
grant execute on function public.app_saved_page(timestamptz, uuid, integer) to authenticated;

create function public.app_repost(p_post uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_member();
  v_author uuid;
begin
  select s.author_id into v_author from social.posts s join social.visible_members p on p.id = s.author_id
  where s.id = p_post and s.deleted_at is null;
  if v_author is null then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if v_author = v_uid then
    raise exception 'cannot_repost_own' using errcode = 'P0001';
  end if;
  if exists (select 1 from social.reposts r where r.reposter_id = v_uid and r.post_id = p_post) then
    return;
  end if;
  perform social.content_rate_check(v_uid, array['repost', 'unrepost'], 60);
  insert into social.reposts (reposter_id, post_id) values (v_uid, p_post);
  insert into social.content_actions (member_id, action) values (v_uid, 'repost');
end;
$$;
comment on function public.app_repost(uuid) is 'Reposts someone else''s live post to the member''s followers. The original creator stays the author.';
revoke all on function public.app_repost(uuid) from public, anon;
grant execute on function public.app_repost(uuid) to authenticated;

create function public.app_unrepost(p_post uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_member();
begin
  if not exists (select 1 from social.reposts r where r.reposter_id = v_uid and r.post_id = p_post) then
    return;
  end if;
  perform social.content_rate_check(v_uid, array['repost', 'unrepost'], 60);
  delete from social.reposts r where r.reposter_id = v_uid and r.post_id = p_post;
  insert into social.content_actions (member_id, action) values (v_uid, 'unrepost');
end;
$$;
comment on function public.app_unrepost(uuid) is 'Undoes the member''s repost. Does nothing if there was none.';
revoke all on function public.app_unrepost(uuid) from public, anon;
grant execute on function public.app_unrepost(uuid) to authenticated;

create function public.app_post_meta(p_posts uuid[])
returns table (
  post_id uuid, topic text, topic_label text, edited_at timestamptz,
  saved_by_me boolean, repost_count bigint, reposted_by_me boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_member();
begin
  if pg_catalog.cardinality(coalesce(p_posts, '{}')) > 100 then
    raise exception 'too_many' using errcode = 'P0001';
  end if;
  return query
  select s.id, s.topic, t.label, s.edited_at,
         exists (select 1 from social.saves v where v.member_id = v_uid and v.post_id = s.id),
         (select count(*) from social.reposts r where r.post_id = s.id),
         exists (select 1 from social.reposts r where r.reposter_id = v_uid and r.post_id = s.id)
  from social.posts s
  join social.visible_members p on p.id = s.author_id
  left join social.topics t on t.slug = s.topic
  where s.id = any (p_posts) and s.deleted_at is null;
end;
$$;
comment on function public.app_post_meta(uuid[]) is 'Card details for up to 100 live posts: topic, edited time, whether the member saved or reposted it, and the repost count.';
revoke all on function public.app_post_meta(uuid[]) from public, anon;
grant execute on function public.app_post_meta(uuid[]) to authenticated;

-- Home with reposts. Each post appears once: the member's own and followed
-- creators' posts at their publishing time; a reposted post (by someone the
-- member follows, of a creator the member does not follow) at its first such
-- repost. Muted creators and muted reposters are left out. My Clique stays
-- the Clique creators' own posts.
create function public.app_feed_items_page(
  p_before_at timestamptz default null, p_before_id uuid default null,
  p_limit integer default 20, p_filter text default 'all'
)
returns table (
  id uuid, author_id uuid, author_username text, author_display_name text,
  body text, created_at timestamptz, like_count bigint, comment_count bigint,
  liked_by_me boolean, author_in_my_clique boolean, is_mine boolean, media jsonb,
  activity_at timestamptz, reposted_by_id uuid, reposted_by_username text, reposted_by_display_name text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_member();
begin
  if (p_before_at is null) <> (p_before_id is null) then
    raise exception 'invalid_cursor' using errcode = 'P0001';
  end if;
  if coalesce(p_filter, 'all') not in ('all', 'clique') then
    raise exception 'invalid_filter' using errcode = 'P0001';
  end if;
  return query
  with own_and_followed as (
    select s.id as post_id, s.created_at as at, null::uuid as by_id
    from social.posts s
    where s.deleted_at is null
      and case when coalesce(p_filter, 'all') = 'clique'
               then exists (select 1 from social.clique_members m where m.fan_id = v_uid and m.creator_id = s.author_id and m.removed_at is null)
               else (s.author_id = v_uid or exists (select 1 from social.follows f where f.follower_id = v_uid and f.creator_id = s.author_id))
          end
      and not exists (select 1 from social.mutes mu where mu.member_id = v_uid and mu.creator_id = s.author_id)
  ),
  reposted as (
    select distinct on (r.post_id) r.post_id, r.created_at as at, r.reposter_id as by_id
    from social.reposts r
    join social.follows f on f.follower_id = v_uid and f.creator_id = r.reposter_id
    join social.posts s on s.id = r.post_id
    where coalesce(p_filter, 'all') = 'all'
      and s.deleted_at is null and s.author_id <> v_uid
      and not exists (select 1 from social.follows f2 where f2.follower_id = v_uid and f2.creator_id = s.author_id)
      and not exists (select 1 from social.mutes mu where mu.member_id = v_uid and mu.creator_id in (s.author_id, r.reposter_id))
    order by r.post_id, r.created_at, r.reposter_id
  ),
  items as (
    select * from own_and_followed
    union all
    select * from reposted
  )
  select s.id, s.author_id, p.username, p.display_name, s.body, s.created_at,
         (select count(*) from social.likes l where l.post_id = s.id),
         (select count(*) from social.comments c where c.post_id = s.id and c.deleted_at is null),
         exists (select 1 from social.likes l where l.post_id = s.id and l.user_id = v_uid),
         exists (select 1 from social.clique_members m where m.fan_id = v_uid and m.creator_id = s.author_id and m.removed_at is null),
         s.author_id = v_uid,
         social.post_media_json(s.id),
         i.at, i.by_id, rp.username, rp.display_name
  from items i
  join social.posts s on s.id = i.post_id
  join social.visible_members p on p.id = s.author_id
  left join social.visible_members rp on rp.id = i.by_id
  where (i.by_id is null or rp.id is not null)
    and (p_before_at is null or (i.at, s.id) < (p_before_at, p_before_id))
  order by i.at desc, s.id desc
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
end;
$$;
comment on function public.app_feed_items_page(timestamptz, uuid, integer, text) is 'Home with reposts: every followed and own post, plus posts reposted by people the member follows (creator not followed), each once, newest activity first, paged on (activity time, post id).';
revoke all on function public.app_feed_items_page(timestamptz, uuid, integer, text) from public, anon;
grant execute on function public.app_feed_items_page(timestamptz, uuid, integer, text) to authenticated;
