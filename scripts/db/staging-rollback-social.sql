-- Staging only: removes exactly what the Release 1 social core migration
-- created (20261117000000_social_core), so it can be applied again cleanly,
-- and so the earlier waitlist rollback can run after it. Never run it
-- against Production. Tested locally by scripts/db/rollback-social-test.sh.
--
--   psql "<url>" -X -q -v ON_ERROR_STOP=1 -v mode=check -v confirm= -f scripts/db/staging-rollback-social.sql
--   psql "<url>" -X -q -v ON_ERROR_STOP=1 -v mode=apply -v confirm='DELETE THE STAGING SOCIAL CORE' -f ...
--
-- mode=check   does everything below inside one transaction, including the
--              drops, and then rolls it all back: a dry run. Changes nothing.
-- mode=apply   the same, then commits. Needs the confirmation phrase.
--
-- Refuses, changing nothing, if any of these is true:
--   * any member data exists: a post, follow, follow event, Clique
--     membership, like or comment
--   * the social core migration isn't recorded, or a later one is
--   * any expected object is missing, or the social schema or the public
--     app_* functions hold anything else
--   * another object depends on these (Postgres's own dependency checks,
--     since every drop is explicit and none cascades), or a function outside
--     this list mentions them
--
-- The schema's default privileges go with it (Postgres removes them with
-- the schema). It never uses DROP ... CASCADE or DROP OWNED. Everything happens in one
-- transaction with the social tables locked. It prints counts and names only.

\set ON_ERROR_STOP on
\pset footer off

begin;
set local lock_timeout = '10s';
set local statement_timeout = '120s';

-- An unset -v mode or -v confirm stops here with a syntax error, by design.
select set_config('crevant.rollback_mode', :'mode', true) as mode,
       set_config('crevant.rollback_confirm', :'confirm', true) <> '' as confirmation_given;

do $$
begin
  if current_setting('crevant.rollback_mode') not in ('check', 'apply') then
    raise exception 'mode must be check or apply';
  end if;
  if current_setting('crevant.rollback_mode') = 'apply'
     and current_setting('crevant.rollback_confirm') <> 'DELETE THE STAGING SOCIAL CORE' then
    raise exception 'apply needs the confirmation phrase: DELETE THE STAGING SOCIAL CORE';
  end if;
end $$;

create temporary table rollback_inventory (
  step      integer primary key,
  kind      text not null,
  name      text not null,
  drop_sql  text not null
) on commit drop;

insert into rollback_inventory values
  ( 1, 'function', 'public.app_me()', 'drop function public.app_me()'),
  ( 2, 'function', 'public.app_feed(timestamp with time zone,integer)', 'drop function public.app_feed(timestamp with time zone,integer)'),
  ( 3, 'function', 'public.app_member(text)', 'drop function public.app_member(text)'),
  ( 4, 'function', 'public.app_member_posts(uuid,timestamp with time zone,integer)', 'drop function public.app_member_posts(uuid,timestamp with time zone,integer)'),
  ( 5, 'function', 'public.app_post(uuid)', 'drop function public.app_post(uuid)'),
  ( 6, 'function', 'public.app_comments(uuid)', 'drop function public.app_comments(uuid)'),
  ( 7, 'function', 'public.app_discover(text,integer)', 'drop function public.app_discover(text,integer)'),
  ( 8, 'function', 'public.app_following()', 'drop function public.app_following()'),
  ( 9, 'function', 'public.app_create_post(text)', 'drop function public.app_create_post(text)'),
  (10, 'function', 'public.app_delete_post(uuid)', 'drop function public.app_delete_post(uuid)'),
  (11, 'function', 'public.app_follow(uuid)', 'drop function public.app_follow(uuid)'),
  (12, 'function', 'public.app_unfollow(uuid)', 'drop function public.app_unfollow(uuid)'),
  (13, 'function', 'public.app_clique_add(uuid)', 'drop function public.app_clique_add(uuid)'),
  (14, 'function', 'public.app_clique_remove(uuid)', 'drop function public.app_clique_remove(uuid)'),
  (15, 'function', 'public.app_like(uuid)', 'drop function public.app_like(uuid)'),
  (16, 'function', 'public.app_unlike(uuid)', 'drop function public.app_unlike(uuid)'),
  (17, 'function', 'public.app_add_comment(uuid,text)', 'drop function public.app_add_comment(uuid,text)'),
  (18, 'function', 'public.app_delete_comment(uuid)', 'drop function public.app_delete_comment(uuid)'),
  (19, 'trigger',  'clique_members_guard on social.clique_members', 'drop trigger clique_members_guard on social.clique_members'),
  (20, 'trigger',  'clique_members_append_only on social.clique_members', 'drop trigger clique_members_append_only on social.clique_members'),
  (21, 'trigger',  'follow_events_append_only on social.follow_events', 'drop trigger follow_events_append_only on social.follow_events'),
  (22, 'function', 'social.current_member()', 'drop function social.current_member()'),
  (23, 'function', 'social.is_member(uuid)', 'drop function social.is_member(uuid)'),
  (24, 'function', 'social.rate_check(text,uuid)', 'drop function social.rate_check(text,uuid)'),
  (25, 'function', 'social.clique_members_guard()', 'drop function social.clique_members_guard()'),
  (26, 'function', 'social.history_is_append_only()', 'drop function social.history_is_append_only()'),
  (27, 'table',    'social.comments', 'drop table social.comments'),
  (28, 'table',    'social.likes', 'drop table social.likes'),
  (29, 'table',    'social.clique_members', 'drop table social.clique_members'),
  (30, 'table',    'social.follow_events', 'drop table social.follow_events'),
  (31, 'table',    'social.follows', 'drop table social.follows'),
  (32, 'table',    'social.posts', 'drop table social.posts'),
  (33, 'schema',   'social', 'drop schema social'),
  (34, 'migration record', '20261117000000 social_core', $q$delete from supabase_migrations.schema_migrations where version = '20261117000000'$q$);

-- (Functions are compared by object id: Postgres prints names in the search
-- path, such as public, without their schema.)

-- Every expected object must exist before anything is locked or checked.
do $$
declare
  missing text[] := '{}';
  r record;
begin
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise exception 'refused: no Supabase migration history here (supabase_migrations.schema_migrations)';
  end if;
  for r in select * from rollback_inventory order by step loop
    if (r.kind = 'function' and to_regprocedure(r.name) is null)
       or (r.kind = 'table' and to_regclass(r.name) is null)
       or (r.kind = 'schema' and to_regnamespace(r.name) is null)
       or (r.kind = 'trigger' and not exists (
             select 1 from pg_trigger t
             where not t.tgisinternal and t.tgname = split_part(r.name, ' on ', 1)
               and t.tgrelid = to_regclass(split_part(r.name, ' on ', 2))))
       or (r.kind = 'migration record' and not exists (
             select 1 from supabase_migrations.schema_migrations where version = split_part(r.name, ' ', 1))) then
      missing := missing || r.name;
    end if;
  end loop;
  if cardinality(missing) > 0 then
    raise exception 'refused: expected objects are missing (%), so the database is not in the state this rollback was written for', array_to_string(missing, ', ');
  end if;
end $$;

-- Nothing can write to the social tables until this transaction ends.
lock table social.posts, social.follows, social.follow_events, social.clique_members, social.likes, social.comments in access exclusive mode;

do $$
declare
  problems text[] := '{}';
  n bigint;
begin
  -- Member data: real or test posts and relationships exist.
  select count(*) into n from social.posts;
  if n > 0 then problems := problems || format('%s post(s) (member data)', n); end if;
  select count(*) into n from social.follows;
  if n > 0 then problems := problems || format('%s follow(s) (member data)', n); end if;
  select count(*) into n from social.follow_events;
  if n > 0 then problems := problems || format('%s follow event(s) (member data)', n); end if;
  select count(*) into n from social.clique_members;
  if n > 0 then problems := problems || format('%s Clique membership(s) (member data)', n); end if;
  select count(*) into n from social.likes;
  if n > 0 then problems := problems || format('%s like(s) (member data)', n); end if;
  select count(*) into n from social.comments;
  if n > 0 then problems := problems || format('%s comment(s) (member data)', n); end if;

  -- Migration history: nothing later may build on this one.
  if exists (select 1 from supabase_migrations.schema_migrations where version > '20261117000000') then
    problems := problems || 'a later migration is recorded'::text;
  end if;

  -- The social schema and the public app_* functions hold exactly the inventory.
  select count(*) into n from pg_proc p
  where (p.pronamespace = 'social'::regnamespace or (p.pronamespace = 'public'::regnamespace and p.proname like 'app\_%'))
    and p.oid not in (select to_regprocedure(name)::oid from rollback_inventory where kind = 'function');
  if n > 0 then problems := problems || format('%s unexpected function(s) in social or named public.app_*', n); end if;
  select count(*) into n from pg_class c
  where c.relnamespace = 'social'::regnamespace and c.relkind in ('r', 'p', 'v', 'm', 'f')
    and ('social.' || c.relname) not in (select name from rollback_inventory where kind = 'table');
  if n > 0 then problems := problems || format('%s unexpected table(s) or view(s) in social', n); end if;
  select count(*) into n from pg_type t
  where t.typnamespace = 'social'::regnamespace and t.typrelid = 0 and t.typelem = 0;
  if n > 0 then problems := problems || format('%s unexpected type(s) in social', n); end if;

  -- Functions outside the inventory whose code mentions the social core
  -- (function bodies aren't tracked as dependencies by Postgres).
  select count(*) into n from pg_proc p
  where p.oid not in (select to_regprocedure(name)::oid from rollback_inventory where kind = 'function')
    and p.pronamespace not in ('pg_catalog'::regnamespace, 'information_schema'::regnamespace)
    and p.prosrc ~ '(\msocial\.|\mapp_(me|feed|member|post|comments|discover|following|create_post|delete_post|follow|unfollow|clique_add|clique_remove|like|unlike|add_comment|delete_comment)\M)';
  if n > 0 then problems := problems || format('%s other function(s) refer to the social core', n); end if;

  if cardinality(problems) > 0 then
    raise exception 'refused, nothing changed: %', array_to_string(problems, '; ');
  end if;
end $$;

\echo 'Checks passed. Objects to remove, in order:'
select step, kind, name from rollback_inventory order by step;

-- The drops, each by its exact name, none cascading.
do $$
declare
  r record;
begin
  for r in select * from rollback_inventory order by step loop
    execute r.drop_sql;
  end loop;
end $$;

-- Afterwards: everything in the inventory is gone, and what the earlier
-- migrations made is untouched.
do $$
declare
  left_over text[] := '{}';
  r record;
begin
  for r in select * from rollback_inventory order by step loop
    if (r.kind = 'function' and to_regprocedure(r.name) is not null)
       or (r.kind = 'table' and to_regclass(r.name) is not null)
       or (r.kind = 'schema' and to_regnamespace(r.name) is not null)
       or (r.kind = 'migration record' and exists (
             select 1 from supabase_migrations.schema_migrations where version = split_part(r.name, ' ', 1))) then
      left_over := left_over || r.name;
    end if;
  end loop;
  if cardinality(left_over) > 0 then
    raise exception 'rollback incomplete, nothing changed: % still present', array_to_string(left_over, ', ');
  end if;
  if to_regclass('public.profiles') is null or to_regclass('ops.invitations') is null or to_regclass('ops.waitlist') is null
     or (select count(*) from supabase_migrations.schema_migrations where version in ('20261106000000', '20261107000000', '20261110000000', '20261111000000')) <> 4 then
    raise exception 'rollback would have touched objects from earlier migrations, nothing changed';
  end if;
end $$;

select current_setting('crevant.rollback_mode') = 'apply' as apply \gset
\if :apply
  commit;
  \echo 'Applied: the social core objects and its migration record were removed. The migration can now be applied again.'
\else
  rollback;
  \echo 'Check only: every check and drop succeeded inside the transaction, and all of it was rolled back. Nothing changed.'
\endif
