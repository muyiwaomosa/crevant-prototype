-- Staging only: undoes 20261120000000 (inner_clique), so the earlier
-- rollbacks (publishing request ids, platform access, social core, creator
-- acquisition, waitlist), which refuse while a later migration is recorded,
-- can run after it. Never run it against Production (the social schema isn't
-- there). Tested locally by scripts/db/rollback-inner-clique-test.sh.
--
--   psql "<url>" -X -q -v ON_ERROR_STOP=1 -v mode=check -v confirm= -f scripts/db/staging-rollback-inner-clique.sql
--   psql "<url>" -X -q -v ON_ERROR_STOP=1 -v mode=apply -v confirm='REMOVE THE STAGING INNER CLIQUE' -f ...
--
-- Restores exactly what the migration replaced: the guard at 10, app_unfollow
-- without the per-member lock, the removal reasons 'removed' and 'unfollowed',
-- and the original comments; drops app_clique_replace; deletes the record.
-- Every follow and every membership row stays.
--
-- Refuses, changing nothing, if the record or an expected object is missing,
-- a later migration is recorded, any member has more than 10 open Inner
-- Clique memberships (the old limit), or any membership was closed as
-- 'replaced' (the history is append-only, and the old constraint can't hold
-- it). Once members have used the larger Inner Clique, roll forward instead.

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
     and current_setting('crevant.rollback_confirm') <> 'REMOVE THE STAGING INNER CLIQUE' then
    raise exception 'apply needs the confirmation phrase: REMOVE THE STAGING INNER CLIQUE';
  end if;
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise exception 'refused: no Supabase migration history here (supabase_migrations.schema_migrations)';
  end if;
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20261120000000')
     or to_regprocedure('public.app_clique_replace(uuid, uuid)') is null
     or to_regprocedure('social.clique_members_guard()') is null
     or to_regclass('social.clique_members') is null then
    raise exception 'refused: expected objects are missing (20261120000000 inner_clique), so the database is not in the state this rollback was written for';
  end if;
  if exists (select 1 from supabase_migrations.schema_migrations where version > '20261120000000') then
    raise exception 'refused, nothing changed: a later migration is recorded';
  end if;
end $$;

-- Hold the table still while checking and restoring.
lock table social.clique_members in share row exclusive mode;

do $$
begin
  if exists (select 1 from social.clique_members where removed_at is null group by fan_id having count(*) > 10) then
    raise exception 'refused, nothing changed: a member has more than 10 creators in their Inner Clique (the old limit). Roll forward instead.';
  end if;
  if exists (select 1 from social.clique_members where removal_reason = 'replaced') then
    raise exception 'refused, nothing changed: an Inner Clique membership was closed as replaced, which the old history rules cannot hold. Roll forward instead.';
  end if;
end $$;

\echo 'Checks passed. To restore: the guard at 10, app_unfollow without the lock, the two removal reasons and the original comments; to remove: app_clique_replace and the migration record. Follows and memberships stay.'

drop function public.app_clique_replace(uuid, uuid);

create or replace function social.clique_members_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $fn$
begin
  if new.removed_at is null then
    if not exists (select 1 from social.follows f where f.follower_id = new.fan_id and f.creator_id = new.creator_id) then
      raise exception 'not_following' using errcode = 'P0001', detail = 'A Clique can only include creators you follow.';
    end if;
    if (select count(*) from social.clique_members c
        where c.fan_id = new.fan_id and c.removed_at is null and c.id is distinct from new.id) >= 10 then
      raise exception 'clique_full' using errcode = 'P0001', detail = 'A Clique holds at most 10 creators.';
    end if;
  end if;
  return new;
end;
$fn$;
comment on function social.clique_members_guard() is null;

alter table social.clique_members drop constraint clique_removal_reason;
alter table social.clique_members add constraint clique_removal_reason check (removal_reason in ('removed', 'unfollowed'));
comment on table social.clique_members is 'Clique history: one row per membership, closed (never deleted or overwritten) when it ends. At most 10 open rows per fan.';

create or replace function public.app_unfollow(p_creator uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid uuid := social.current_member();
begin
  delete from social.follows where follower_id = v_uid and creator_id = p_creator;
  if not found then
    return; -- not following: nothing changes
  end if;
  insert into social.follow_events (follower_id, creator_id, action) values (v_uid, p_creator, 'unfollowed');
  -- A Clique needs a follow: close an open membership, keeping its history.
  update social.clique_members set removed_at = pg_catalog.now(), removal_reason = 'unfollowed'
  where fan_id = v_uid and creator_id = p_creator and removed_at is null;
end;
$fn$;

comment on function public.app_clique_add(uuid) is 'Adds a followed creator to the member''s Clique (at most 10).';
comment on function public.app_clique_remove(uuid) is 'Removes a creator from the member''s Clique. The history is kept.';
delete from supabase_migrations.schema_migrations where version = '20261120000000';

select current_setting('crevant.rollback_mode') = 'apply' as apply \gset
\if :apply
  commit;
  \echo 'Applied: the Inner Clique limit is back to 10, app_clique_replace and the migration record were removed. Follows and memberships remain.'
\else
  rollback;
  \echo 'Check only: every check and the restore succeeded inside the transaction, and all of it was rolled back. Nothing changed.'
\endif
