-- Richer profiles and interest-based discovery (Build 5, Stage 5.1).
-- STAGING ONLY until approved for Production (see supabase/production-migrations.txt).
--
-- What this migration adds:
--   * social.topics: the topic list members choose interests from. The rows
--     below are the APPROVED taxonomy (17 topics, docs/PROFILES.md); the app reads the
--     list from the database and never hard-codes it, so changing it is a
--     small reviewed data migration, not an app release.
--   * social.profile_details: one row per member with an optional identity
--     preference (creator, fan or both), a short bio, a "Why should people
--     follow you?" statement and when they finished first-time setup.
--   * social.member_topics: each member's interests, at most 5.
--   * Six member functions, each through social.current_member() (signed in,
--     active pilot membership, complete profile):
--       app_topics, app_my_details, app_set_profile_details,
--       app_member_details, app_discover_people, app_suggested_creators.
--
-- The identity preference is DESCRIPTIVE ONLY. It says how a member expects
-- to use Splitpost. It grants nothing: membership still comes only from
-- ops.member_access, every member can post, follow and join a Clique
-- whatever they chose, and no access check reads it. Suggestions may use it
-- to rank people, never to allow or refuse anything.
--
-- Additive only: no existing table, column, row or function changes, so the
-- app already deployed keeps working unchanged before and after it.

-- ---------------------------------------------------------------------------
-- 1. Topics.

create table social.topics (
  slug        text primary key check (slug ~ '^[a-z][a-z_]{1,29}$'),
  label       text not null check (char_length(label) between 1 and 40 and label ~ '\S'),
  sort_order  integer not null unique,
  active      boolean not null default true
);
comment on table social.topics is 'The topics members choose interests from (approved list, docs/PROFILES.md). Retire a topic with active = false rather than deleting it.';

insert into social.topics (slug, label, sort_order) values
  ('food',     'Food & cooking',        10),
  ('money',    'Money & business',      20),
  ('tech',     'Tech',                  30),
  ('learning', 'Learning',              40),
  ('music',    'Music',                 50),
  ('film',     'Film & TV',             60),
  ('comedy',   'Comedy',                70),
  ('gaming',   'Gaming',                80),
  ('art',      'Art & design',          90),
  ('style',    'Fashion & beauty',     100),
  ('books',    'Books & writing',      110),
  ('fitness',  'Fitness',              120),
  ('sports',   'Sports',               130),
  ('wellness', 'Health & wellness',    140),
  ('faith',    'Faith & Spirituality', 150),
  ('travel',   'Travel',               160),
  ('family',   'Family & parenting',   170);

-- ---------------------------------------------------------------------------
-- 2. Profile details and interests (private: reached only through functions).

create table social.profile_details (
  user_id       uuid primary key references public.profiles (id) on delete cascade,
  -- How the member expects to use Splitpost. Descriptive only (see above).
  identity      text check (identity in ('creator', 'fan', 'both')),
  -- Up to 160 and 140 characters, one paragraph, at least one visible
  -- character, no control characters. Empty is stored as null.
  bio           text check (bio is null or (
                  char_length(bio) between 1 and 160 and bio ~ '\S'
                  and bio !~ '[\u0001-\u001F\u007F-\u009F]')),
  follow_reason text check (follow_reason is null or (
                  char_length(follow_reason) between 1 and 140 and follow_reason ~ '\S'
                  and follow_reason !~ '[\u0001-\u001F\u007F-\u009F]')),
  -- Set the first time the member saves their details (or skips them) in
  -- first-time setup, so the app shows setup once.
  onboarded_at  timestamptz,
  updated_at    timestamptz not null default pg_catalog.now()
);
comment on table social.profile_details is 'Optional profile details: identity preference (descriptive only, grants nothing), bio and follow reason. Written only through public.app_set_profile_details.';

create table social.member_topics (
  user_id   uuid not null references public.profiles (id) on delete cascade,
  topic     text not null references social.topics (slug),
  added_at  timestamptz not null default pg_catalog.now(),
  primary key (user_id, topic)
);
create index member_topics_by_topic on social.member_topics (topic, user_id);
comment on table social.member_topics is 'Each member''s interests (at most 5), from social.topics. Written only through public.app_set_profile_details.';

alter table social.topics enable row level security;
alter table social.profile_details enable row level security;
alter table social.member_topics enable row level security;
revoke all on table social.topics, social.profile_details, social.member_topics from public, anon, authenticated;
grant all on table social.topics, social.profile_details, social.member_topics to service_role;

-- ---------------------------------------------------------------------------
-- 3. Member functions.

-- The topic list, in display order.
create function public.app_topics()
returns table (slug text, label text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_member();
begin
  return query
  select t.slug, t.label from social.topics t where t.active order by t.sort_order;
end;
$$;

-- The member's own details.
create function public.app_my_details()
returns table (identity text, bio text, follow_reason text, topics text[], onboarded boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_member();
begin
  return query
  select d.identity, d.bio, d.follow_reason,
         coalesce((select array_agg(m.topic order by t.sort_order)
                   from social.member_topics m join social.topics t on t.slug = m.topic
                   where m.user_id = v_uid and t.active), '{}'),
         d.onboarded_at is not null
  from (select 1) one
  left join social.profile_details d on d.user_id = v_uid;
end;
$$;

-- Saves all of the member's own details at once (each may be empty) and
-- marks first-time setup as done.
create function public.app_set_profile_details(p_identity text, p_bio text, p_follow_reason text, p_topics text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_member();
  v_identity text := nullif(lower(pg_catalog.btrim(coalesce(p_identity, ''))), '');
  v_bio text := nullif(pg_catalog.regexp_replace(coalesce(p_bio, ''), '^\s+|\s+$', '', 'g'), '');
  v_reason text := nullif(pg_catalog.regexp_replace(coalesce(p_follow_reason, ''), '^\s+|\s+$', '', 'g'), '');
  v_topics text[];
begin
  if v_identity is not null and v_identity not in ('creator', 'fan', 'both') then
    raise exception 'invalid_identity' using errcode = 'P0001', detail = 'Choose creator, fan or both.';
  end if;
  if v_bio is not null and char_length(v_bio) > 160 then
    raise exception 'bio_too_long' using errcode = 'P0001', detail = 'Keep your bio to 160 characters.';
  end if;
  if v_reason is not null and char_length(v_reason) > 140 then
    raise exception 'follow_reason_too_long' using errcode = 'P0001', detail = 'Keep this to 140 characters.';
  end if;
  if (v_bio is not null and v_bio ~ '[\u0001-\u001F\u007F-\u009F]')
     or (v_reason is not null and v_reason ~ '[\u0001-\u001F\u007F-\u009F]') then
    raise exception 'invalid_text' using errcode = 'P0001', detail = 'Use a single paragraph without special characters.';
  end if;

  select coalesce(array_agg(distinct x), '{}') into v_topics
  from unnest(coalesce(p_topics, '{}')) x where x is not null;
  if cardinality(v_topics) > 5 then
    raise exception 'too_many_topics' using errcode = 'P0001', detail = 'Choose up to 5 interests.';
  end if;
  if exists (select 1 from unnest(v_topics) x where not exists (select 1 from social.topics t where t.slug = x and t.active)) then
    raise exception 'unknown_topic' using errcode = 'P0001', detail = 'Choose interests from the list.';
  end if;

  -- The details row first: its row lock serialises concurrent saves by the
  -- same member, so the interests can never exceed 5.
  insert into social.profile_details as d (user_id, identity, bio, follow_reason, onboarded_at)
  values (v_uid, v_identity, v_bio, v_reason, pg_catalog.now())
  on conflict (user_id) do update
    set identity = excluded.identity, bio = excluded.bio, follow_reason = excluded.follow_reason,
        onboarded_at = coalesce(d.onboarded_at, excluded.onboarded_at), updated_at = pg_catalog.now();

  delete from social.member_topics m where m.user_id = v_uid and m.topic <> all (v_topics);
  insert into social.member_topics (user_id, topic)
  select v_uid, x from unnest(v_topics) x
  on conflict do nothing;
end;
$$;

-- Another member's details, for their profile page. Only visible members.
create function public.app_member_details(p_member uuid)
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
  select d.identity, d.bio, d.follow_reason,
         coalesce((select array_agg(m.topic order by t.sort_order)
                   from social.member_topics m join social.topics t on t.slug = m.topic
                   where m.user_id = p.id and t.active), '{}')
  from social.visible_members p
  left join social.profile_details d on d.user_id = p.id
  where p.id = p_member;
end;
$$;

-- Discover: other visible members, optionally searched by name and filtered
-- by one topic. People who share more of the caller's interests come first,
-- then the most recently active.
create function public.app_discover_people(p_query text default null, p_topic text default null, p_limit integer default 30)
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
  select p.id, p.username, p.display_name, d.identity, d.bio, d.follow_reason,
         coalesce((select array_agg(m.topic order by t.sort_order)
                   from social.member_topics m join social.topics t on t.slug = m.topic
                   where m.user_id = p.id and t.active), '{}'),
         (select count(*)::integer from social.member_topics m
          join social.member_topics mine on mine.topic = m.topic and mine.user_id = v_uid
          join social.topics t on t.slug = m.topic and t.active
          where m.user_id = p.id) as shared,
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
    and (v_topic is null or exists (
         select 1 from social.member_topics m join social.topics t on t.slug = m.topic and t.active
         where m.user_id = p.id and m.topic = v_topic))
  order by shared desc,
           (select max(s.created_at) from social.posts s where s.author_id = p.id and s.deleted_at is null) desc nulls last,
           p.username
  limit least(greatest(coalesce(p_limit, 30), 1), 50);
end;
$$;

-- Suggested people to follow: visible members the caller doesn't follow
-- yet. Ranked (never filtered) by shared interests, then by whether they
-- describe themselves as creating, then by a follow statement, then by
-- recent posts. The identity preference only orders the list.
create function public.app_suggested_creators(p_limit integer default 10)
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
  select p.id, p.username, p.display_name, d.identity, d.bio, d.follow_reason,
         coalesce((select array_agg(m.topic order by t.sort_order)
                   from social.member_topics m join social.topics t on t.slug = m.topic
                   where m.user_id = p.id and t.active), '{}'),
         (select count(*)::integer from social.member_topics m
          join social.member_topics mine on mine.topic = m.topic and mine.user_id = v_uid
          join social.topics t on t.slug = m.topic and t.active
          where m.user_id = p.id) as shared,
         (select count(*) from social.posts s where s.author_id = p.id and s.deleted_at is null) as posts,
         (select count(*) from social.follows f where f.creator_id = p.id)
  from social.visible_members p
  left join social.profile_details d on d.user_id = p.id
  where p.id <> v_uid
    and not exists (select 1 from social.follows f where f.follower_id = v_uid and f.creator_id = p.id)
  order by shared desc,
           coalesce(d.identity in ('creator', 'both'), false) desc,
           (d.follow_reason is not null) desc,
           (select max(s.created_at) from social.posts s where s.author_id = p.id and s.deleted_at is null) desc nulls last,
           p.username
  limit least(greatest(coalesce(p_limit, 10), 1), 20);
end;
$$;

comment on function public.app_topics() is 'The topic list for interests. Pilot members only.';
comment on function public.app_my_details() is 'The member''s own identity preference, bio, follow reason, interests and whether first-time setup is done.';
comment on function public.app_set_profile_details(text, text, text, text[]) is 'Saves the member''s own details and interests (at most 5) and marks setup done. The identity preference is descriptive only and grants nothing.';
comment on function public.app_member_details(uuid) is 'A visible member''s identity preference, bio, follow reason and interests.';
comment on function public.app_discover_people(text, text, integer) is 'Other visible members, by name and topic, shared interests first.';
comment on function public.app_suggested_creators(integer) is 'Visible members the caller does not follow yet, ranked by shared interests. Ranking only: grants nothing.';

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.app_topics()',
    'public.app_my_details()',
    'public.app_set_profile_details(text, text, text, text[])',
    'public.app_member_details(uuid)',
    'public.app_discover_people(text, text, integer)',
    'public.app_suggested_creators(integer)'
  ] loop
    execute pg_catalog.format('revoke all on function %s from public, anon', f);
    execute pg_catalog.format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end;
$$;
