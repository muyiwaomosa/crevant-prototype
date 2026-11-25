-- Staging only: undoes 20261203000000 (discovery: content discovery, post
-- search, sharing), so the earlier rollbacks can run after it. Never run it
-- against a Production project. Tested locally by
-- scripts/db/rollback-discovery-test.sh.
--
--   psql "<url>" -X -q -v ON_ERROR_STOP=1 -v mode=check -v confirm= -f scripts/db/staging-rollback-discovery.sql
--   psql "<url>" -X -q -v ON_ERROR_STOP=1 -v mode=apply -v confirm='REMOVE THE STAGING DISCOVERY' -f ...
--
-- Removes exactly the migration's objects and record. It refuses, changing
-- nothing, while any share or share event exists (member data), if the record
-- or an expected object is missing, or if a later migration is recorded.

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
     and current_setting('crevant.rollback_confirm') <> 'REMOVE THE STAGING DISCOVERY' then
    raise exception 'apply needs the confirmation phrase: REMOVE THE STAGING DISCOVERY';
  end if;
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise exception 'refused: no Supabase migration history here (supabase_migrations.schema_migrations)';
  end if;
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20261203000000')
     or to_regclass('social.shares') is null
     or to_regprocedure('public.app_discover_content(text, integer)') is null
     or to_regprocedure('public.app_search_posts(text, integer)') is null then
    raise exception 'refused: expected objects are missing (20261203000000 discovery), so the database is not in the state this rollback was written for';
  end if;
  if exists (select 1 from supabase_migrations.schema_migrations where version > '20261203000000') then
    raise exception 'refused, nothing changed: a later migration is recorded';
  end if;
end $$;

lock table social.shares, analytics.events in share row exclusive mode;

do $$
declare
  n bigint;
begin
  n := (select count(*) from social.shares) + (select count(*) from analytics.events where name = 'post_shared');
  if n > 0 then
    raise exception 'refused, nothing changed: % rows of member data exist (shares or share events). Fix forward with a new migration instead.', n;
  end if;
end $$;

\echo 'Checks passed. Removing discovery and its migration record.'

drop function public.app_record_share(uuid, text);
drop function public.app_search_posts(text, integer);
drop function public.app_discover_content(text, integer);
drop trigger events_shares on social.shares;
drop function analytics.capture_share();
drop trigger shares_append_only on social.shares;
drop function social.shares_are_append_only();
drop table social.shares;
drop index social.posts_live_search;

delete from supabase_migrations.schema_migrations where version = '20261203000000';

select current_setting('crevant.rollback_mode') = 'apply' as apply \gset
\if :apply
  commit;
  \echo 'Applied: discovery and its migration record were removed.'
\else
  rollback;
  \echo 'Check only: every check and the removal succeeded inside the transaction, and all of it was rolled back. Nothing changed.'
\endif
