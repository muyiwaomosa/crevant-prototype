-- Staging only: undoes 20261204000000 (fair rotation, search measurement,
-- public previews). Never run it against a Production project. Tested
-- locally by scripts/db/rollback-previews-test.sh.
--
--   psql "<url>" -X -q -v ON_ERROR_STOP=1 -v mode=check -v confirm= -f scripts/db/staging-rollback-previews.sql
--   psql "<url>" -X -q -v ON_ERROR_STOP=1 -v mode=apply -v confirm='REMOVE THE STAGING PREVIEWS' -f ...
--
-- Removes exactly the migration's objects and record and restores discovery
-- and following as 20261203000000 and 20261201000000 defined them. Refuses,
-- changing nothing, while search counts, preview visits, opt-outs, follows
-- from search, or preview switch history exist, or previews are on; or if
-- the record or an expected object is missing, or a later migration exists.

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
     and current_setting('crevant.rollback_confirm') <> 'REMOVE THE STAGING PREVIEWS' then
    raise exception 'apply needs the confirmation phrase: REMOVE THE STAGING PREVIEWS';
  end if;
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise exception 'refused: no Supabase migration history here (supabase_migrations.schema_migrations)';
  end if;
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20261204000000')
     or to_regclass('social.search_metrics_daily') is null or to_regclass('social.preview_visits') is null
     or to_regclass('ops.public_preview_settings') is null
     or to_regprocedure('public.app_public_post(uuid, text)') is null then
    raise exception 'refused: expected objects are missing (20261204000000 previews and search), so the database is not in the state this rollback was written for';
  end if;
  if exists (select 1 from supabase_migrations.schema_migrations where version > '20261204000000') then
    raise exception 'refused, nothing changed: a later migration is recorded';
  end if;
end $$;

lock table social.search_metrics_daily, social.preview_visits, social.preview_optouts, social.follow_events, ops.public_preview_settings, ops.public_preview_events in share row exclusive mode;

do $$
declare
  n bigint;
begin
  n := (select count(*) from social.search_metrics_daily) + (select count(*) from social.preview_visits)
       + (select count(*) from social.preview_optouts) + (select count(*) from social.follow_events where source = 'search')
       + (select count(*) from ops.public_preview_events);
  if n > 0 or (select enabled from ops.public_preview_settings where id) then
    raise exception 'refused, nothing changed: % rows of data exist (search counts, preview visits, opt-outs, follows from search or switch history), or previews are on. Fix forward instead.', n;
  end if;
end $$;

\echo 'Checks passed. Removing previews and search measurement and the migration record.'

drop function public.app_public_previews_allowed();
drop function public.app_set_public_previews(boolean);
drop function public.app_public_post(uuid, text);
drop table social.preview_rate;
drop table social.preview_visits;
drop table social.preview_optouts;
drop function ops.set_public_previews(text, boolean, text);
drop trigger public_preview_events_no_update on ops.public_preview_events;
drop table ops.public_preview_events;
drop table ops.public_preview_settings;
drop function public.app_founder_search_metrics(integer);
drop function public.app_note_search_selection(text, text);
drop function public.app_note_search(text, boolean, text);
drop table social.search_metrics_daily;

-- Following: back to the relationships version (no 'search' source).
create or replace function public.app_follow(p_creator uuid, p_source text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_member();
begin
  if p_creator is null or p_creator = v_uid then
    raise exception 'cannot_follow_self' using errcode = 'P0001';
  end if;
  if p_source is not null and p_source not in ('profile', 'discover', 'post', 'catch_up', 'comment', 'other') then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  if not social.is_member(p_creator) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if exists (select 1 from social.follows where follower_id = v_uid and creator_id = p_creator) then
    return; -- already following: nothing changes, nothing is recorded twice
  end if;
  perform social.rate_check('follow', v_uid);
  insert into social.follows (follower_id, creator_id) values (v_uid, p_creator);
  insert into social.follow_events (follower_id, creator_id, action, source) values (v_uid, p_creator, 'followed', p_source);
  -- A new follow starts fresh: an old mute of this creator ends.
  if exists (select 1 from social.mutes m where m.member_id = v_uid and m.creator_id = p_creator) then
    delete from social.mutes m where m.member_id = v_uid and m.creator_id = p_creator;
    insert into social.mute_events (member_id, creator_id, action) values (v_uid, p_creator, 'unmuted');
  end if;
end;
$$;

alter table social.follow_events drop constraint follow_events_source;
alter table social.follow_events add constraint follow_events_source
  check (source is null or (action = 'followed' and source in ('profile', 'discover', 'post', 'catch_up', 'comment', 'other')));

-- Discovery: back to the 20261203000000 order.
create or replace function public.app_discover_content(p_topic text default null, p_limit integer default 30)
returns table (
  id uuid, author_id uuid, author_username text, author_display_name text,
  body text, created_at timestamptz, like_count bigint, comment_count bigint,
  liked_by_me boolean, author_in_my_clique boolean, is_mine boolean, media jsonb,
  topic text, topic_label text, reason text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_member();
  v_has_interests boolean;
begin
  if p_topic is not null and not exists (select 1 from social.topics t where t.slug = p_topic and t.active) then
    raise exception 'unknown_topic' using errcode = 'P0001';
  end if;
  v_has_interests := exists (select 1 from social.member_topics mt where mt.user_id = v_uid);
  return query
  with eligible as (
    select s.id, s.author_id, s.created_at, s.topic,
           pg_catalog.row_number() over (partition by s.author_id order by s.created_at desc, s.id desc) as nth
    from social.posts s
    where s.deleted_at is null
      and s.topic is not null
      and s.author_id <> v_uid
      and s.created_at > pg_catalog.now() - interval '30 days'
      and not exists (select 1 from social.follows f where f.follower_id = v_uid and f.creator_id = s.author_id)
      and not exists (select 1 from social.mutes mu where mu.member_id = v_uid and mu.creator_id = s.author_id)
      and case
            when p_topic is not null then s.topic = p_topic
            when v_has_interests then exists (select 1 from social.member_topics mt where mt.user_id = v_uid and mt.topic = s.topic)
            else true
          end
  )
  select s.id, s.author_id, p.username, p.display_name, s.body, s.created_at,
         (select count(*) from social.likes l where l.post_id = s.id),
         (select count(*) from social.comments c where c.post_id = s.id and c.deleted_at is null),
         exists (select 1 from social.likes l where l.post_id = s.id and l.user_id = v_uid),
         false,
         false,
         social.post_media_json(s.id),
         s.topic, t.label,
         case
           when p_topic is not null then 'In ' || t.label || ', the topic you chose'
           when v_has_interests then 'Because you''re interested in ' || t.label
           else 'New in ' || t.label || '. Choose interests to tailor this'
         end
  from eligible e
  join social.posts s on s.id = e.id
  join social.visible_members p on p.id = s.author_id
  join social.topics t on t.slug = s.topic
  where e.nth <= 2
  order by s.created_at desc, s.id desc
  limit least(greatest(coalesce(p_limit, 30), 1), 50);
end;
$$;

delete from supabase_migrations.schema_migrations where version = '20261204000000';

select current_setting('crevant.rollback_mode') = 'apply' as apply \gset
\if :apply
  commit;
  \echo 'Applied: previews and search measurement and the migration record were removed; discovery and following are as before.'
\else
  rollback;
  \echo 'Check only: every check and the removal succeeded inside the transaction, and all of it was rolled back. Nothing changed.'
\endif
