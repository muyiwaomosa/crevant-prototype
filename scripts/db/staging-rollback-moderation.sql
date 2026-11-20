-- Staging only: undoes 20261124000000 (moderation), so the earlier
-- rollbacks, which refuse while a later migration is recorded, can run after
-- it. Never run it against Production. Tested locally by
-- scripts/db/rollback-moderation-test.sh.
--
--   psql "<url>" -X -q -v ON_ERROR_STOP=1 -v mode=check -v confirm= -f scripts/db/staging-rollback-moderation.sql
--   psql "<url>" -X -q -v ON_ERROR_STOP=1 -v mode=apply -v confirm='REMOVE THE STAGING MODERATION' -f ...
--
-- Removes the report and moderation functions, social.current_moderator, the
-- moderator, report and audit tables and their helpers, the hidden_at
-- columns, and the migration record, and restores the three profile detail
-- functions to their 20261123000000 definitions.
--
-- Refuses, changing nothing, if the record or an expected object is missing,
-- a later migration is recorded, or ANY moderator, moderator history,
-- report or moderation action exists, or anything is hidden. Once any of
-- those exist they are audit and safety records: fix forward instead.

\set ON_ERROR_STOP on
\pset footer off

begin;
set local lock_timeout = '10s';
set local statement_timeout = '60s';

-- An unset -v mode or -v confirm stops here with a syntax error, by design.
select set_config('crevant.rollback_mode', :'mode', true) as mode,
       set_config('crevant.rollback_confirm', :'confirm', true) <> '' as confirmation_given;

do $$
begin
  if current_setting('crevant.rollback_mode') not in ('check', 'apply') then
    raise exception 'mode must be check or apply';
  end if;
  if current_setting('crevant.rollback_mode') = 'apply'
     and current_setting('crevant.rollback_confirm') <> 'REMOVE THE STAGING MODERATION' then
    raise exception 'apply needs the confirmation phrase: REMOVE THE STAGING MODERATION';
  end if;
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise exception 'refused: no Supabase migration history here (supabase_migrations.schema_migrations)';
  end if;
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20261124000000')
     or to_regclass('ops.moderators') is null
     or to_regclass('ops.content_reports') is null
     or to_regclass('ops.moderation_actions') is null
     or to_regprocedure('social.current_moderator()') is null
     or to_regprocedure('public.app_report(text, uuid, text, text)') is null then
    raise exception 'refused: expected objects are missing (20261124000000 moderation), so the database is not in the state this rollback was written for';
  end if;
  if exists (select 1 from supabase_migrations.schema_migrations where version > '20261124000000') then
    raise exception 'refused, nothing changed: a later migration is recorded';
  end if;
end $$;

lock table ops.moderators, ops.moderator_events, ops.content_reports, ops.moderation_actions, social.posts, social.profile_details in share row exclusive mode;

do $$
declare
  m bigint := (select count(*) from ops.moderators) + (select count(*) from ops.moderator_events);
  r bigint := (select count(*) from ops.content_reports);
  a bigint := (select count(*) from ops.moderation_actions);
  h bigint := (select count(*) from social.posts where hidden_at is not null) + (select count(*) from social.profile_details where hidden_at is not null);
begin
  if m > 0 or r > 0 or a > 0 or h > 0 then
    raise exception 'refused, nothing changed: % moderator row(s) or history, % report(s), % moderation action(s) and % hidden item(s) exist (audit and safety records). Fix forward with a new migration instead.', m, r, a, h;
  end if;
end $$;

\echo 'Checks passed. Restoring the profile detail functions, then removing moderation and its migration record.'

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
  select d.identity, d.bio, d.follow_reason,
         coalesce((select array_agg(m.topic order by t.sort_order)
                   from social.member_topics m join social.topics t on t.slug = m.topic
                   where m.user_id = p.id and t.active), '{}')
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

drop function public.app_report(text, uuid, text, text);
drop function public.app_is_moderator();
drop function public.app_mod_queue(text);
drop function public.app_mod_report(uuid);
drop function public.app_mod_hide(uuid, text);
drop function public.app_mod_restore(uuid, text);
drop function public.app_mod_dismiss(uuid, text);
drop function social.current_moderator();
drop function ops.clean_note(text);
drop function ops.set_report_hold(uuid, boolean, text, text);
drop function ops.purge_expired_report_data(integer);
drop function ops.grant_moderator(uuid, text, text);
drop function ops.revoke_moderator(uuid, text, text);
drop function ops.moderator_active(uuid);
drop table ops.moderation_actions;
drop table ops.content_reports;
drop table ops.moderators;
drop table ops.moderator_events;
drop function ops.moderator_record();
drop function ops.moderators_no_update();
drop function ops.history_append_only();
alter table social.posts drop constraint posts_hidden_is_deleted;
alter table social.posts drop column hidden_at;
alter table social.profile_details drop column hidden_at;

delete from supabase_migrations.schema_migrations where version = '20261124000000';

select current_setting('crevant.rollback_mode') = 'apply' as apply \gset
\if :apply
  commit;
  \echo 'Applied: moderation and its migration record were removed; the profile detail functions are as in 20261123000000.'
\else
  rollback;
  \echo 'Check only: every check and the removal succeeded inside the transaction, and all of it was rolled back. Nothing changed.'
\endif
