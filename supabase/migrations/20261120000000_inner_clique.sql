-- My Clique and Inner Clique.
--
-- My Clique is everyone a member follows (social.follows, unchanged, still the
-- source of truth). Inner Clique is the optional priority group within it,
-- kept in the existing social.clique_members (one row per membership, closed
-- and never deleted). Every follow and every current membership is kept as it
-- is; nothing here rewrites existing rows.
--
-- Changes:
--   * Inner Clique capacity 25 (was 10), still enforced by the guard trigger on
--     whatever writes the rows, behind the per-member lock.
--   * public.app_clique_replace(p_remove, p_add): swaps one Inner Clique
--     creator for another followed creator in one transaction, under the same
--     per-member lock. It closes the old membership (reason 'replaced') and
--     opens the new one; if any check fails, nothing changes.
--   * public.app_unfollow takes the same per-member lock, so an unfollow can't
--     race an Inner Clique add or replace and leave a membership without a
--     follow. Its behaviour is otherwise unchanged.
--   * removal_reason allows 'replaced' alongside 'removed' and 'unfollowed'.
--
-- Inner Clique changes presentation priority only. It never changes feed
-- ordering, and records no Connection Points, rewards or money.
-- Staging only: the social schema is not in supabase/production-migrations.txt.
-- Rollback (staging only): scripts/db/staging-rollback-inner-clique.sql.

-- Capacity 25, a follow required: the guard that holds whatever writes the rows.
create or replace function social.clique_members_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.removed_at is null then
    if not exists (select 1 from social.follows f where f.follower_id = new.fan_id and f.creator_id = new.creator_id) then
      raise exception 'not_following' using errcode = 'P0001', detail = 'An Inner Clique can only include creators you follow.';
    end if;
    if (select count(*) from social.clique_members c
        where c.fan_id = new.fan_id and c.removed_at is null and c.id is distinct from new.id) >= 25 then
      raise exception 'clique_full' using errcode = 'P0001', detail = 'An Inner Clique holds at most 25 creators.';
    end if;
  end if;
  return new;
end;
$$;
comment on function social.clique_members_guard() is 'An Inner Clique membership needs a current follow, and a member has at most 25 open memberships.';

alter table social.clique_members drop constraint clique_removal_reason;
alter table social.clique_members add constraint clique_removal_reason check (removal_reason in ('removed', 'unfollowed', 'replaced'));
comment on table social.clique_members is 'Inner Clique history: one row per membership, closed (never deleted or overwritten) when it ends, as removed, unfollowed or replaced. At most 25 open rows per member.';

-- The same unfollow, now behind the per-member Inner Clique lock.
create or replace function public.app_unfollow(p_creator uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_member();
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('social.clique:' || v_uid::text, 0));
  delete from social.follows where follower_id = v_uid and creator_id = p_creator;
  if not found then
    return; -- not following: nothing changes
  end if;
  insert into social.follow_events (follower_id, creator_id, action) values (v_uid, p_creator, 'unfollowed');
  -- An Inner Clique needs a follow: close an open membership, keeping its history.
  update social.clique_members set removed_at = pg_catalog.now(), removal_reason = 'unfollowed'
  where fan_id = v_uid and creator_id = p_creator and removed_at is null;
end;
$$;

comment on function public.app_clique_add(uuid) is 'Adds a followed creator to the member''s Inner Clique (at most 25).';
comment on function public.app_clique_remove(uuid) is 'Removes a creator from the member''s Inner Clique. They stay followed, and the history is kept.';

-- Replace one Inner Clique creator with another followed creator, atomically.
create function public.app_clique_replace(p_remove uuid, p_add uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_member();
begin
  if p_add is null or p_add = v_uid then
    raise exception 'cannot_add_self' using errcode = 'P0001';
  end if;
  if p_remove is null or p_remove = p_add then
    raise exception 'not_in_clique' using errcode = 'P0001';
  end if;
  -- One Inner Clique change at a time per member (shared with add, remove and unfollow).
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('social.clique:' || v_uid::text, 0));
  if not exists (select 1 from social.clique_members where fan_id = v_uid and creator_id = p_remove and removed_at is null) then
    raise exception 'not_in_clique' using errcode = 'P0001';
  end if;
  if exists (select 1 from social.clique_members where fan_id = v_uid and creator_id = p_add and removed_at is null) then
    raise exception 'already_in_clique' using errcode = 'P0001';
  end if;
  if not exists (select 1 from social.follows where follower_id = v_uid and creator_id = p_add) then
    raise exception 'not_following' using errcode = 'P0001';
  end if;
  update social.clique_members set removed_at = pg_catalog.now(), removal_reason = 'replaced'
  where fan_id = v_uid and creator_id = p_remove and removed_at is null;
  insert into social.clique_members (fan_id, creator_id) values (v_uid, p_add);
end;
$$;
comment on function public.app_clique_replace(uuid, uuid) is 'Replaces one Inner Clique creator with another followed creator in one step. The replaced creator stays followed; on any failure nothing changes.';

-- Signed-in members only, like every other member function.
revoke all on function public.app_clique_replace(uuid, uuid) from public, anon;
grant execute on function public.app_clique_replace(uuid, uuid) to authenticated, service_role;
