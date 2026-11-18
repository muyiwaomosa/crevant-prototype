-- Viewed state: the foundation for Unseen-first Home.
--
-- Records which posts a member has viewed, so Home can show an Unseen-first
-- strip of followed creators with posts the member hasn't seen, and a
-- catch-up view of those posts. The main Home feed (app_feed) is unchanged
-- and stays chronological.
--
-- What a view is: a client-observed signal, reported by the member's own
-- browser when a post meets the viewing rule (text and images: at least 50%
-- visible for 2 continuous seconds; video: 3 seconds of actual playback or
-- completion, whichever comes first). It is a UX signal, not verified
-- engagement, and must never be used to issue Connection Points or decide
-- monetary reward eligibility.
--
--   social.post_views (viewer_id, post_id) primary key: one row per member
--     and post, ever. viewed_at is the server time of the first report and
--     basis is how it was seen ('visible' or 'played'). Rows are never
--     updated; they are removed only with the member's account or the post.
--     Kept across unfollow and refollow.
--
--   public.app_mark_viewed(p_posts uuid[], p_basis text) -> integer
--     Records views for the caller: at most 50 ids per call, own and deleted
--     or missing posts ignored, repeats ignored. Posts by creators the member
--     doesn't follow are recorded too. At most 3,000 new rows per member per
--     rolling hour; a batch that would go past it is refused and writes
--     nothing. A per-member lock makes the count and the insert one step, so
--     simultaneous batches can't exceed the cap or duplicate rows.
--
--   public.app_unseen_creators() -> the Unseen-first strip
--     Followed creators with at least one unseen post: published at or after
--     the member's current follow date, not deleted, not viewed. The count is
--     capped at 10 (the app shows 9+). My Clique creators first, then other
--     followed creators; within each, newest unseen post first.
--
--   public.app_catch_up(p_creator uuid, p_before_at timestamptz, p_before_id uuid)
--     Up to 20 of the creator's most recent unseen posts, returned oldest
--     first. Older batches: pass the oldest returned post's created_at and id
--     (stable keyset on (created_at, id), so equal timestamps never skip or
--     repeat a post). Read-only: it never marks anything viewed.
--
-- Staging only: the social schema is not in supabase/production-migrations.txt.
-- Rollback (staging only, refuses once any view exists):
-- scripts/db/staging-rollback-viewed-state.sql.

create table social.post_views (
  viewer_id uuid not null references auth.users (id) on delete cascade,
  post_id   uuid not null references social.posts (id) on delete cascade,
  viewed_at timestamptz not null default now(),
  basis     text not null,
  primary key (viewer_id, post_id),
  constraint post_views_basis check (basis in ('visible', 'played'))
);
comment on table social.post_views is 'Posts each member has viewed: one row per member and post, first view only. A client-observed UX signal for Unseen-first Home; never used for Connection Points or monetary rewards.';
comment on column social.post_views.basis is 'How the view was observed: visible (text or image, 50% for 2 s) or played (video, 3 s of playback or completion).';

-- The rate limit counts a member's views in the last hour.
create index post_views_by_viewer_time on social.post_views (viewer_id, viewed_at);
-- Removing a post (or its author's account) removes its views quickly.
create index post_views_by_post on social.post_views (post_id);

-- Private like the rest of social: no member access, no policies; reached only
-- through the app_* functions below. (Default privileges already revoke
-- anon and authenticated in this schema; this states it explicitly.)
alter table social.post_views enable row level security;
revoke all on social.post_views from public, anon, authenticated;

-- Views are permanent: never rewritten or deleted directly. Account and post
-- deletion still remove them through the foreign keys (cascades run below
-- depth 0, so they pass).
create function social.post_views_are_permanent()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'viewed state is never rewritten or deleted' using errcode = 'P0001';
end;
$$;
revoke all on function social.post_views_are_permanent() from public, anon, authenticated;

create trigger post_views_permanent
  before update or delete on social.post_views
  for each row when (pg_trigger_depth() = 0)
  execute function social.post_views_are_permanent();

-- Record views reported by the member's browser.
create function public.app_mark_viewed(p_posts uuid[], p_basis text default 'visible')
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_member();
  v_ids uuid[];
  v_recent int;
  v_new int;
begin
  if p_basis is null or p_basis not in ('visible', 'played') then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  select coalesce(array_agg(distinct x), '{}') into v_ids from unnest(coalesce(p_posts, '{}')) as x where x is not null;
  if cardinality(v_ids) = 0 then
    return 0;
  end if;
  if cardinality(v_ids) > 50 then
    raise exception 'too_many' using errcode = 'P0001';
  end if;

  -- One batch at a time per member, so the hourly count and the insert are a
  -- single step: simultaneous batches can't exceed the cap.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('social.views:' || v_uid::text, 0));

  -- What this batch would add: live posts by someone else, not yet viewed.
  select count(*) into v_new
  from social.posts s
  where s.id = any (v_ids) and s.deleted_at is null and s.author_id <> v_uid
    and not exists (select 1 from social.post_views v where v.viewer_id = v_uid and v.post_id = s.id);
  if v_new = 0 then
    return 0;
  end if;

  select count(*) into v_recent
  from social.post_views v
  where v.viewer_id = v_uid and v.viewed_at > pg_catalog.now() - interval '1 hour';
  if v_recent + v_new > 3000 then
    raise exception 'rate_limited' using errcode = 'P0001', detail = 'Please slow down and try again later.';
  end if;

  insert into social.post_views (viewer_id, post_id, basis)
  select v_uid, s.id, p_basis
  from social.posts s
  where s.id = any (v_ids) and s.deleted_at is null and s.author_id <> v_uid
  on conflict (viewer_id, post_id) do nothing;
  get diagnostics v_new = row_count;
  return v_new;
end;
$$;
comment on function public.app_mark_viewed(uuid[], text) is 'Records posts the member has viewed (at most 50 per call, 3,000 new an hour). Repeats, own posts and deleted posts are ignored. A UX signal only: never used for points or rewards.';

-- The Unseen-first strip.
create function public.app_unseen_creators()
returns table (
  id uuid, username text, display_name text, in_my_clique boolean,
  unseen_count integer, latest_unseen_at timestamptz
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
  select p.id, p.username, p.display_name, (m.fan_id is not null), u.n::integer, u.latest
  from social.follows f
  join public.profiles p on p.id = f.creator_id
  left join social.clique_members m on m.fan_id = v_uid and m.creator_id = f.creator_id and m.removed_at is null
  cross join lateral (
    -- At most 10 per creator: enough to show 9+, and it bounds the work.
    select count(*) as n, max(x.created_at) as latest
    from (
      select s.created_at
      from social.posts s
      where s.author_id = f.creator_id and s.deleted_at is null and s.created_at >= f.followed_at
        and not exists (select 1 from social.post_views v where v.viewer_id = v_uid and v.post_id = s.id)
      order by s.created_at desc
      limit 10
    ) x
  ) u
  where f.follower_id = v_uid and u.n > 0
  order by (m.fan_id is null), u.latest desc, p.id;
end;
$$;
comment on function public.app_unseen_creators() is 'Followed creators with unseen posts (since the follow date, not deleted, not viewed), My Clique first, newest unseen first. unseen_count is capped at 10 (shown as 9+).';

-- Catch-up: one creator's unseen posts, newest 20 per batch, shown oldest first.
create function public.app_catch_up(p_creator uuid, p_before_at timestamptz default null, p_before_id uuid default null)
returns table (
  id uuid, author_id uuid, author_username text, author_display_name text,
  body text, created_at timestamptz, like_count bigint, comment_count bigint,
  liked_by_me boolean, author_in_my_clique boolean, is_mine boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_member();
  v_username text;
  v_display_name text;
begin
  if (p_before_at is null) <> (p_before_id is null) then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  -- One creator: look their name up once.
  select p.username, p.display_name into v_username, v_display_name from public.profiles p where p.id = p_creator;
  return query
  select b.id, b.author_id, v_username, v_display_name, b.body, b.created_at,
         (select count(*) from social.likes l where l.post_id = b.id),
         (select count(*) from social.comments c where c.post_id = b.id and c.deleted_at is null),
         exists (select 1 from social.likes l where l.post_id = b.id and l.user_id = v_uid),
         exists (select 1 from social.clique_members m where m.fan_id = v_uid and m.creator_id = b.author_id and m.removed_at is null),
         false
  from (
    select s.id, s.author_id, s.body, s.created_at
    from social.posts s
    join social.follows f on f.follower_id = v_uid and f.creator_id = s.author_id
    where s.author_id = p_creator and s.deleted_at is null and s.created_at >= f.followed_at
      and not exists (select 1 from social.post_views v where v.viewer_id = v_uid and v.post_id = s.id)
      and (p_before_at is null or (s.created_at, s.id) < (p_before_at, p_before_id))
    order by s.created_at desc, s.id desc
    limit 20
  ) b
  order by b.created_at asc, b.id asc;
end;
$$;
comment on function public.app_catch_up(uuid, timestamptz, uuid) is 'Up to 20 of a followed creator''s most recent unseen posts, oldest first. Older batches use the oldest post''s (created_at, id). Read-only: never marks posts viewed.';

-- Signed-in members only, like every other member function.
revoke all on function public.app_mark_viewed(uuid[], text) from public, anon;
revoke all on function public.app_unseen_creators() from public, anon;
revoke all on function public.app_catch_up(uuid, timestamptz, uuid) from public, anon;
grant execute on function public.app_mark_viewed(uuid[], text) to authenticated, service_role;
grant execute on function public.app_unseen_creators() to authenticated, service_role;
grant execute on function public.app_catch_up(uuid, timestamptz, uuid) to authenticated, service_role;
