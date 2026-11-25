-- Staging only: undoes 20261202000000 (content: post topics, editing, saves,
-- reposts, Home with reposts), so the earlier rollbacks, which refuse while a
-- later migration is recorded, can run after it. Never run it against a
-- Production project. Tested locally by scripts/db/rollback-content-test.sh.
--
--   psql "<url>" -X -q -v ON_ERROR_STOP=1 -v mode=check -v confirm= -f scripts/db/staging-rollback-content.sql
--   psql "<url>" -X -q -v ON_ERROR_STOP=1 -v mode=apply -v confirm='REMOVE THE STAGING CONTENT' -f ...
--
-- Removes exactly the migration's objects and record, and restores
-- social.is_active_supporter and analytics.capture as 20261201000000 defined
-- them. It refuses, changing nothing, while any member data exists that it
-- would lose: post topics or edits, edit history, saves, reposts, the action
-- log, or their events. Once that exists, fix forward with a new migration.
-- It also refuses if the record or an expected object is missing, or a later
-- migration is recorded.

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
     and current_setting('crevant.rollback_confirm') <> 'REMOVE THE STAGING CONTENT' then
    raise exception 'apply needs the confirmation phrase: REMOVE THE STAGING CONTENT';
  end if;
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise exception 'refused: no Supabase migration history here (supabase_migrations.schema_migrations)';
  end if;
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20261202000000')
     or to_regclass('social.saves') is null or to_regclass('social.reposts') is null
     or to_regclass('social.post_edits') is null or to_regclass('social.content_actions') is null
     or to_regprocedure('public.app_feed_items_page(timestamp with time zone, uuid, integer, text)') is null
     or not exists (select 1 from information_schema.columns where table_schema = 'social' and table_name = 'posts' and column_name = 'topic') then
    raise exception 'refused: expected objects are missing (20261202000000 content), so the database is not in the state this rollback was written for';
  end if;
  if exists (select 1 from supabase_migrations.schema_migrations where version > '20261202000000') then
    raise exception 'refused, nothing changed: a later migration is recorded';
  end if;
end $$;

lock table social.posts, social.post_edits, social.saves, social.reposts, social.content_actions, analytics.events in share row exclusive mode;

do $$
declare
  n bigint;
begin
  n := (select count(*) from social.post_edits) + (select count(*) from social.saves) + (select count(*) from social.reposts)
       + (select count(*) from social.content_actions)
       + (select count(*) from social.posts where topic is not null or edited_at is not null)
       + (select count(*) from analytics.events where name in ('post_edited', 'post_saved', 'post_unsaved', 'post_reposted', 'post_unreposted'));
  if n > 0 then
    raise exception 'refused, nothing changed: % rows of member data exist (topics, edits, saves, reposts or their events). Fix forward with a new migration instead.', n;
  end if;
end $$;

\echo 'Checks passed. Removing content and its migration record.'

drop trigger events_post_edits on social.post_edits;
drop trigger events_saves on social.saves;
drop trigger events_reposts on social.reposts;
-- Events: back to the relationships capture.
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
  end if;
  return null;
end;
$$;
revoke all on function analytics.capture() from public, anon, authenticated;

-- Active Supporter: back to the relationships definition.
create or replace function social.is_active_supporter(p_fan uuid, p_creator uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (select 1 from social.follows f where f.follower_id = p_fan and f.creator_id = p_creator)
     and exists (
       select 1
       from social.comments c
       join social.posts s on s.id = c.post_id
       where c.author_id = p_fan and s.author_id = p_creator
         and c.deleted_at is null and s.deleted_at is null
         and c.created_at >= pg_catalog.now() - interval '28 days'
         and social.meaningful_comment(c.body)
     );
$$;

drop function public.app_feed_items_page(timestamptz, uuid, integer, text);
drop function public.app_post_meta(uuid[]);
drop function public.app_unrepost(uuid);
drop function public.app_repost(uuid);
drop function public.app_saved_page(timestamptz, uuid, integer);
drop function public.app_unsave(uuid);
drop function public.app_save(uuid);
drop function public.app_post_edits(uuid);
drop function public.app_edit_post(uuid, text, text);
drop function public.app_set_post_topic(uuid, text);
drop trigger post_edits_append_only on social.post_edits;
drop trigger content_actions_append_only on social.content_actions;
drop function social.content_history_is_append_only();
drop function social.content_rate_check(uuid, text[], integer);
drop table social.content_actions;
drop table social.reposts;
drop table social.saves;
drop table social.post_edits;
drop index social.posts_live_by_topic;
alter table social.posts drop constraint posts_edited_after_created;
alter table social.posts drop column edited_at;
alter table social.posts drop column topic;

delete from supabase_migrations.schema_migrations where version = '20261202000000';

select current_setting('crevant.rollback_mode') = 'apply' as apply \gset
\if :apply
  commit;
  \echo 'Applied: content and its migration record were removed; Active Supporter and events are as before.'
\else
  rollback;
  \echo 'Check only: every check and the removal succeeded inside the transaction, and all of it was rolled back. Nothing changed.'
\endif
