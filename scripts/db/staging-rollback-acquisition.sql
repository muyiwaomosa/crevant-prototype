-- Staging only: removes exactly what the creator acquisition migration
-- (20261116000000_creator_acquisition) added, so it can be applied again
-- cleanly, or so the waitlist rollback can run after it. Never run it against
-- Production. It is not wired to any workflow yet: running it on staging
-- needs the founder's approval (docs/ACQUISITION.md, decisions).
--
--   psql "<url>" -X -q -v ON_ERROR_STOP=1 -v mode=check -v confirm= -f scripts/db/staging-rollback-acquisition.sql
--   psql "<url>" -X -q -v ON_ERROR_STOP=1 -v mode=apply -v confirm='DELETE THE STAGING CREATOR ACQUISITION' -f ...
--
-- mode=check   does everything below inside one transaction, including the
--              drops, and then rolls it all back: a dry run that proves the
--              real run would succeed. Changes nothing.
-- mode=apply   the same, then commits. Needs the confirmation phrase.
--
-- Order matters: this migration comes after the two waitlist migrations, so
-- it has to be removed first. The waitlist rollback refuses while it is
-- recorded, and this one refuses while anything later is.
--
-- Refuses, changing nothing, if any of these is true:
--   * a pilot creator, link, redemption, acquisition event or preview limit
--     record exists
--   * a waitlist entry holds an intent, an introduction answer, a typed name
--     or a verified link, or an invitation holds a verified link
--   * the acquisition migration isn't recorded, or a later one is
--   * any expected object is missing
--   * another object depends on these (Postgres's own dependency checks,
--     since every drop is explicit and none cascades), or a function outside
--     this list mentions them
--   * a login role holds a privilege on these tables, or has an open session
--
-- What the waitlist migrations made (ops.waitlist, ops.join_waitlist,
-- waitlist_api.submit and the rest) is left exactly as it was: this migration
-- never redefined any of it. It never uses DROP ... CASCADE or DROP OWNED,
-- and prints counts and object names only.

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
     and current_setting('crevant.rollback_confirm') <> 'DELETE THE STAGING CREATOR ACQUISITION' then
    raise exception 'apply needs the confirmation phrase: DELETE THE STAGING CREATOR ACQUISITION';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- The inventory: every object the migration created, in drop order. Indexes,
-- the identity sequence and row level security go with their tables; grants
-- go with their objects. Columns are dropped one by one, after the
-- constraints that name them.

create temporary table rollback_inventory (
  step      integer primary key,
  kind      text not null,
  name      text not null,
  drop_sql  text not null
) on commit drop;

insert into rollback_inventory values
  ( 1, 'trigger',    'invitations_record_link_redemption on ops.invitations', 'drop trigger invitations_record_link_redemption on ops.invitations'),
  ( 2, 'trigger',    'invitations_copy_creator_link on ops.invitations', 'drop trigger invitations_copy_creator_link on ops.invitations'),
  ( 3, 'trigger',    'creator_links_require_accepted_creator on ops.creator_links', 'drop trigger creator_links_require_accepted_creator on ops.creator_links'),
  ( 4, 'function',   'waitlist_api.submit_v2(text,text[],text,text,text,text,boolean,boolean,text,text,text,text,boolean,text)', 'drop function waitlist_api.submit_v2(text,text[],text,text,text,text,boolean,boolean,text,text,text,text,boolean,text)'),
  ( 5, 'function',   'waitlist_api.invite_preview(text,text)', 'drop function waitlist_api.invite_preview(text,text)'),
  ( 6, 'function',   'waitlist_api.admin_acquisition_summary()', 'drop function waitlist_api.admin_acquisition_summary()'),
  ( 7, 'function',   'waitlist_api.admin_accept_creator(uuid,text[])', 'drop function waitlist_api.admin_accept_creator(uuid,text[])'),
  ( 8, 'function',   'waitlist_api.admin_set_creator_status(uuid,text)', 'drop function waitlist_api.admin_set_creator_status(uuid,text)'),
  ( 9, 'function',   'waitlist_api.admin_set_creator_public_name(uuid,text)', 'drop function waitlist_api.admin_set_creator_public_name(uuid,text)'),
  (10, 'function',   'waitlist_api.admin_issue_creator_link(uuid,integer,text)', 'drop function waitlist_api.admin_issue_creator_link(uuid,integer,text)'),
  (11, 'function',   'waitlist_api.admin_revoke_creator_link(text)', 'drop function waitlist_api.admin_revoke_creator_link(text)'),
  (12, 'function',   'ops.invite_preview_hit(text,interval,integer)', 'drop function ops.invite_preview_hit(text,interval,integer)'),
  (13, 'function',   'waitlist_api.admin_purge_acquisition_events(integer)', 'drop function waitlist_api.admin_purge_acquisition_events(integer)'),
  (14, 'function',   'ops.invitations_record_link_redemption()', 'drop function ops.invitations_record_link_redemption()'),
  (15, 'function',   'ops.invitations_copy_creator_link()', 'drop function ops.invitations_copy_creator_link()'),
  (16, 'function',   'ops.join_waitlist_v2(text,text[],text,text,text,text,boolean,boolean,text,text,text,text,boolean,text)', 'drop function ops.join_waitlist_v2(text,text[],text,text,text,text,boolean,boolean,text,text,text,text,boolean,text)'),
  (17, 'function',   'ops.resolve_creator_link(text)', 'drop function ops.resolve_creator_link(text)'),
  (18, 'function',   'ops.create_creator_link(uuid,integer,text)', 'drop function ops.create_creator_link(uuid,integer,text)'),
  (19, 'function',   'ops.creator_links_require_accepted_creator()', 'drop function ops.creator_links_require_accepted_creator()'),
  (20, 'table',      'ops.invite_preview_limits', 'drop table ops.invite_preview_limits'),
  (21, 'table',      'ops.acquisition_events', 'drop table ops.acquisition_events'),
  (22, 'table',      'ops.creator_link_redemptions', 'drop table ops.creator_link_redemptions'),
  (23, 'column',     'ops.invitations.creator_link_id', 'alter table ops.invitations drop column creator_link_id'),
  (24, 'constraint', 'waitlist_intent_allowed on ops.waitlist', 'alter table ops.waitlist drop constraint waitlist_intent_allowed'),
  (25, 'column',     'ops.waitlist.creator_link_id', 'alter table ops.waitlist drop column creator_link_id'),
  (26, 'column',     'ops.waitlist.introduced_by_creator', 'alter table ops.waitlist drop column introduced_by_creator'),
  (27, 'column',     'ops.waitlist.intent', 'alter table ops.waitlist drop column intent'),
  (28, 'table',      'ops.creator_links', 'drop table ops.creator_links'),
  (29, 'table',      'ops.pilot_creators', 'drop table ops.pilot_creators'),
  (30, 'migration record', '20261116000000 creator_acquisition', $q$delete from supabase_migrations.schema_migrations where version = '20261116000000'$q$);

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
       or (r.kind = 'column' and not exists (
             select 1 from pg_attribute
             where attrelid = to_regclass(regexp_replace(r.name, '\.[a-z_]+$', ''))
               and attname = substring(r.name from '([a-z_]+)$') and not attisdropped))
       or (r.kind in ('trigger', 'constraint') and to_regclass(split_part(r.name, ' on ', 2)) is null)
       or (r.kind = 'trigger' and not exists (
             select 1 from pg_trigger t
             where not t.tgisinternal and t.tgname = split_part(r.name, ' on ', 1)
               and t.tgrelid = to_regclass(split_part(r.name, ' on ', 2))))
       or (r.kind = 'constraint' and not exists (
             select 1 from pg_constraint c
             where c.conname = split_part(r.name, ' on ', 1) and c.conrelid = to_regclass(split_part(r.name, ' on ', 2))))
       or (r.kind = 'migration record' and not exists (
             select 1 from supabase_migrations.schema_migrations where version = split_part(r.name, ' ', 1))) then
      missing := missing || r.name;
    end if;
  end loop;
  if cardinality(missing) > 0 then
    raise exception 'refused: expected objects are missing (%), so the database is not in the state this rollback was written for', array_to_string(missing, ', ');
  end if;
end $$;

-- Nothing can write to these tables, or to the waitlist and invitations,
-- until this transaction ends.
lock table ops.pilot_creators, ops.creator_links, ops.creator_link_redemptions, ops.acquisition_events,
           ops.invite_preview_limits, ops.waitlist, ops.invitations in access exclusive mode;

do $$
declare
  problems text[] := '{}';
  n bigint;
  roles text[] := array['waitlist_writer', 'waitlist_admin'];
begin
  -- Data: any of these means creators, links, attribution or measurement exist.
  select count(*) into n from ops.pilot_creators;
  if n > 0 then problems := problems || format('%s pilot creator(s)', n); end if;
  select count(*) into n from ops.creator_links;
  if n > 0 then problems := problems || format('%s creator link(s)', n); end if;
  select count(*) into n from ops.creator_link_redemptions;
  if n > 0 then problems := problems || format('%s link redemption(s)', n); end if;
  select count(*) into n from ops.acquisition_events;
  if n > 0 then problems := problems || format('%s acquisition event(s)', n); end if;
  select count(*) into n from ops.invite_preview_limits;
  if n > 0 then problems := problems || format('%s preview limit record(s)', n); end if;
  select count(*) into n from ops.waitlist
  where intent is not null or introduced_by_creator is not null or creator_link_id is not null;
  if n > 0 then problems := problems || format('%s waitlist entr(ies) with acquisition answers', n); end if;
  select count(*) into n from ops.invitations where creator_link_id is not null;
  if n > 0 then problems := problems || format('%s invitation(s) with a creator link', n); end if;

  -- Migration history: nothing later may build on this one.
  if exists (select 1 from supabase_migrations.schema_migrations where version > '20261116000000') then
    problems := problems || 'a later migration is recorded'::text;
  end if;

  -- Functions outside the inventory whose code mentions these objects
  -- (function bodies aren't tracked as dependencies by Postgres).
  select count(*) into n from pg_proc p
  where p.oid::regprocedure::text not in (select name from rollback_inventory where kind = 'function')
    and p.pronamespace not in ('pg_catalog'::regnamespace, 'information_schema'::regnamespace)
    and p.prosrc ~ '(pilot_creators|creator_link|acquisition_events|invite_preview|join_waitlist_v2|submit_v2|introduced_by_creator|admin_purge_acquisition_events)';
  if n > 0 then problems := problems || format('%s other function(s) refer to creator acquisition', n); end if;

  -- The login roles: no privilege on these tables (only ever on the
  -- inventory's waitlist_api functions), and no open session.
  select count(*) into n from pg_shdepend d join pg_roles r on r.oid = d.refobjid
  where r.rolname = any (roles)
    and d.dbid = (select oid from pg_database where datname = current_database())
    and d.classid = 'pg_class'::regclass
    and d.objid in (select to_regclass(name)::oid from rollback_inventory where kind = 'table');
  if n > 0 then problems := problems || format('the login roles hold %s privilege(s) on creator acquisition tables', n); end if;
  select count(*) into n from pg_stat_activity where usename = any (roles);
  if n > 0 then problems := problems || format('%s open session(s) as a login role', n); end if;

  if cardinality(problems) > 0 then
    raise exception 'refused, nothing changed: %', array_to_string(problems, '; ');
  end if;
end $$;

\echo 'Checks passed. Objects to remove, in order:'
select step, kind, name from rollback_inventory order by step;

-- The drops, each by its exact name, none cascading: if anything outside the
-- inventory still depends on an object, Postgres refuses and the whole
-- transaction is rolled back.
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
       or (r.kind = 'column' and exists (
             select 1 from pg_attribute
             where attrelid = to_regclass(regexp_replace(r.name, '\.[a-z_]+$', ''))
               and attname = substring(r.name from '([a-z_]+)$') and not attisdropped))
       or (r.kind = 'migration record' and exists (
             select 1 from supabase_migrations.schema_migrations where version = split_part(r.name, ' ', 1))) then
      left_over := left_over || r.name;
    end if;
  end loop;
  if exists (select 1 from pg_trigger where tgname in ('invitations_record_link_redemption', 'invitations_copy_creator_link', 'creator_links_require_accepted_creator')) then
    left_over := left_over || 'an acquisition trigger'::text;
  end if;
  if cardinality(left_over) > 0 then
    raise exception 'rollback incomplete, nothing changed: % still present', array_to_string(left_over, ', ');
  end if;
  if to_regclass('ops.waitlist') is null or to_regclass('ops.invitations') is null
     or to_regprocedure('ops.join_waitlist(text,text[],text,text,text,text,boolean,boolean,text,text,text)') is null
     or to_regprocedure('waitlist_api.submit(text,text[],text,text,text,text,boolean,boolean,text,text,text)') is null
     or (select count(*) from supabase_migrations.schema_migrations where version in ('20261110000000', '20261111000000')) <> 2 then
    raise exception 'rollback would have touched objects from the waitlist migrations, nothing changed';
  end if;
end $$;

select current_setting('crevant.rollback_mode') = 'apply' as apply \gset
\if :apply
  commit;
  \echo 'Applied: the creator acquisition objects and their migration record were removed. The migration can now be applied again, or the waitlist rollback run.'
\else
  rollback;
  \echo 'Check only: every check and drop succeeded inside the transaction, and all of it was rolled back. Nothing changed.'
\endif
