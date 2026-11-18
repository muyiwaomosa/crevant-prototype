-- TEST ONLY (throwaway databases). My Clique and Inner Clique
-- (20261120000000_inner_clique): unlimited follows, an Inner Clique of at
-- most 25 followed creators, removal without unfollowing, atomic replacement
-- at full capacity (a failed one changes nothing), and unfollowing closing the
-- membership. Simultaneous requests: scripts/db/inner-clique-concurrency-test.sh.
-- Keeping existing memberships through the migration:
-- scripts/db/rollback-inner-clique-test.sh (rolls back and reapplies with data).
--
-- Members: F = ...801 (the fan), creators ...802 to ...830 (29), O = ...831,
-- R = ...832 (a second fan, for the rate limit), ...833 (followed by R only).

set role supabase_auth_admin;
insert into auth.users (id, email, email_confirmed_at)
select ('00000000-0000-4000-8000-000000000' || n::text)::uuid, 'inner' || n || '@example.test', now()
from generate_series(801, 833) as n;
reset role;
update public.profiles p set username = 'inner_' || right(p.id::text, 3), display_name = 'Inner ' || right(p.id::text, 3)
where p.id::text between '00000000-0000-4000-8000-000000000801' and '00000000-0000-4000-8000-000000000833';

create function pg_temp.expect_error_ic(sql text, expected text, what text)
returns void
language plpgsql
as $$
declare
  got text;
begin
  begin
    execute sql;
  exception when others then
    got := sqlerrm;
  end;
  if got is null or pg_catalog.strpos(got, expected) = 0 then
    raise exception 'FAIL: % failed with "%", expected "%"', what, got, expected;
  end if;
end;
$$;
grant execute on function pg_temp.expect_error_ic(text, text, text) to authenticated, anon;

-- The fan's current Inner Clique, as one comparable string.
create function pg_temp.inner_set()
returns text
language sql
as $$
  select coalesce(string_agg(id::text, ',' order by id), '') from public.app_following() where in_my_clique;
$$;
grant execute on function pg_temp.inner_set() to authenticated;

create function pg_temp.c(n int) returns uuid language sql immutable as $$ select ('00000000-0000-4000-8000-000000000' || n::text)::uuid $$;
grant execute on function pg_temp.c(int) to authenticated, anon;

-- ---------------------------------------------------------------------------
-- 1. Anonymous visitors can't replace anything.
begin;
set local role anon;
do $$
begin
  perform pg_temp.expect_error_ic('select public.app_clique_replace(pg_temp.c(802), pg_temp.c(803))', 'permission denied', 'anon replacing');
  raise notice 'PASS: anonymous visitors cannot use app_clique_replace';
end $$;
commit;

-- ---------------------------------------------------------------------------
-- 2. Unlimited follows; an Inner Clique of at most 25.
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000801","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  n int;
  before text;
begin
  for i in 802..830 loop
    perform public.app_follow(pg_temp.c(i));
  end loop;
  select count(*) into n from public.app_following();
  if n <> 29 then
    raise exception 'FAIL: the fan should follow 29 creators (more than 25), follows %', n;
  end if;
  select count(*) into n from public.app_following() where in_my_clique;
  if n <> 0 then
    raise exception 'FAIL: following must never add anyone to the Inner Clique (found %)', n;
  end if;
  raise notice 'PASS: follows are unlimited (29), and following adds nobody to the Inner Clique';

  for i in 802..826 loop
    perform public.app_clique_add(pg_temp.c(i));
  end loop;
  select count(*) into n from public.app_following() where in_my_clique;
  if n <> 25 or (select clique_count from public.app_me()) <> 25 then
    raise exception 'FAIL: the Inner Clique should hold 25, holds %', n;
  end if;
  before := pg_temp.inner_set();
  perform pg_temp.expect_error_ic('select public.app_clique_add(pg_temp.c(827))', 'clique_full', 'a 26th Inner Clique creator');
  if pg_temp.inner_set() <> before then
    raise exception 'FAIL: a refused 26th add changed the Inner Clique';
  end if;
  raise notice 'PASS: the Inner Clique holds 25, and a 26th add is refused, changing nothing';
end $$;
commit;

-- ---------------------------------------------------------------------------
-- 3. Removing priority status never unfollows.
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000801","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  r record;
begin
  perform public.app_clique_remove(pg_temp.c(826));
  select * into r from public.app_following() where id = pg_temp.c(826);
  if r.id is null or r.in_my_clique then
    raise exception 'FAIL: removing from the Inner Clique should keep the follow and end priority: %', r;
  end if;
  if (select count(*) from public.app_following()) <> 29 or (select count(*) from public.app_following() where in_my_clique) <> 24 then
    raise exception 'FAIL: after removing one, the fan should follow 29 with 24 in the Inner Clique';
  end if;
  perform public.app_clique_add(pg_temp.c(826));
  raise notice 'PASS: removing someone from the Inner Clique keeps them followed';
end $$;
commit;

-- ---------------------------------------------------------------------------
-- 4. Replacement at full capacity.
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000801","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  r record;
begin
  perform public.app_clique_replace(pg_temp.c(802), pg_temp.c(827));
  if (select count(*) from public.app_following() where in_my_clique) <> 25 then
    raise exception 'FAIL: a replacement should keep the Inner Clique at 25';
  end if;
  select * into r from public.app_following() where id = pg_temp.c(802);
  if r.id is null or r.in_my_clique then
    raise exception 'FAIL: the replaced creator should stay followed, outside the Inner Clique: %', r;
  end if;
  if not (select in_my_clique from public.app_following() where id = pg_temp.c(827)) then
    raise exception 'FAIL: the new creator should be in the Inner Clique';
  end if;
  raise notice 'PASS: at 25, a replacement swaps one creator for another; the replaced one stays followed';
end $$;
commit;

do $$
begin
  if not exists (select 1 from social.clique_members where fan_id = '00000000-0000-4000-8000-000000000801'
                 and creator_id = '00000000-0000-4000-8000-000000000802' and removal_reason = 'replaced' and removed_at is not null) then
    raise exception 'FAIL: the replaced membership should be closed with the reason "replaced"';
  end if;
  raise notice 'PASS: the replaced membership is kept in the history, closed as "replaced"';
end $$;

-- ---------------------------------------------------------------------------
-- 5. A failed replacement leaves the Inner Clique exactly as it was.
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000801","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  before text := pg_temp.inner_set();
begin
  -- 802 is no longer in the Inner Clique; 831 isn't followed; 803 is already in it.
  perform pg_temp.expect_error_ic('select public.app_clique_replace(pg_temp.c(802), pg_temp.c(828))', 'not_in_clique', 'replacing someone who is not in the Inner Clique');
  perform pg_temp.expect_error_ic('select public.app_clique_replace(pg_temp.c(803), pg_temp.c(831))', 'not_following', 'replacing with someone not followed');
  perform pg_temp.expect_error_ic('select public.app_clique_replace(pg_temp.c(803), pg_temp.c(804))', 'already_in_clique', 'replacing with someone already in the Inner Clique');
  perform pg_temp.expect_error_ic('select public.app_clique_replace(pg_temp.c(803), pg_temp.c(801))', 'cannot_add_self', 'replacing with yourself');
  perform pg_temp.expect_error_ic('select public.app_clique_replace(pg_temp.c(803), pg_temp.c(803))', 'not_in_clique', 'replacing someone with themselves');
  perform pg_temp.expect_error_ic('select public.app_clique_replace(null, pg_temp.c(828))', 'not_in_clique', 'replacing nobody');
  if pg_temp.inner_set() <> before then
    raise exception 'FAIL: a failed replacement changed the Inner Clique';
  end if;
  raise notice 'PASS: every failed replacement leaves the Inner Clique unchanged';
end $$;
commit;

do $$
begin
  if (select count(*) from social.clique_members where fan_id = '00000000-0000-4000-8000-000000000801' and removed_at is null) <> 25
     or exists (select 1 from social.clique_members where fan_id = '00000000-0000-4000-8000-000000000801' and creator_id = '00000000-0000-4000-8000-000000000803' and removed_at is not null) then
    raise exception 'FAIL: a failed replacement closed or added a membership';
  end if;
  raise notice 'PASS: failed replacements wrote nothing to the history';
end $$;

-- ---------------------------------------------------------------------------
-- 6. A replacement that fails at its last step (opening the new membership,
--    after the old one was closed) leaves everything as it was. A temporary
--    trigger, inside a transaction that is rolled back, makes that insert fail.
begin;
create function pg_temp.refuse_insert() returns trigger language plpgsql as $$
begin
  raise exception 'forced_failure';
end;
$$;
create trigger zz_refuse_insert before insert on social.clique_members
  for each row when (new.creator_id = '00000000-0000-4000-8000-000000000828') execute function pg_temp.refuse_insert();
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000801","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  before text := pg_temp.inner_set();
begin
  perform pg_temp.expect_error_ic('select public.app_clique_replace(pg_temp.c(803), pg_temp.c(828))', 'forced_failure', 'a replacement whose insert fails');
  if pg_temp.inner_set() <> before then
    raise exception 'FAIL: a replacement that failed at its last step closed the old membership';
  end if;
  raise notice 'PASS: a replacement that fails after closing the old membership changes nothing (it is one step)';
end $$;
rollback;

-- ---------------------------------------------------------------------------
-- 7. Unfollowing removes priority membership automatically.
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000801","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  perform public.app_unfollow(pg_temp.c(803));
  if exists (select 1 from public.app_following() where id = pg_temp.c(803)) then
    raise exception 'FAIL: unfollowing should remove the creator from My Clique';
  end if;
  if (select count(*) from public.app_following() where in_my_clique) <> 24 then
    raise exception 'FAIL: unfollowing an Inner Clique creator should leave 24 in it';
  end if;
  raise notice 'PASS: unfollowing removes the creator from My Clique and the Inner Clique';
end $$;
commit;

do $$
begin
  if not exists (select 1 from social.clique_members where fan_id = '00000000-0000-4000-8000-000000000801'
                 and creator_id = '00000000-0000-4000-8000-000000000803' and removal_reason = 'unfollowed') then
    raise exception 'FAIL: unfollowing should close the Inner Clique membership as "unfollowed"';
  end if;
  if exists (select 1 from social.clique_members m where m.removed_at is null
             and not exists (select 1 from social.follows f where f.follower_id = m.fan_id and f.creator_id = m.creator_id)) then
    raise exception 'FAIL: an open Inner Clique membership exists without a follow';
  end if;
  raise notice 'PASS: unfollowing closes the membership as "unfollowed", and no membership is left without a follow';
end $$;

-- ---------------------------------------------------------------------------
-- 8. Another member's Inner Clique is untouched; nobody can change someone else's.
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000831","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  perform pg_temp.expect_error_ic('select public.app_clique_replace(pg_temp.c(804), pg_temp.c(805))', 'not_in_clique', 'replacing in your own empty Inner Clique');
  if (select count(*) from public.app_following()) <> 0 then
    raise exception 'FAIL: another member should see only their own follows';
  end if;
  raise notice 'PASS: each member can only change their own Inner Clique';
end $$;
commit;

do $$
begin
  if (select count(*) from social.clique_members where fan_id = '00000000-0000-4000-8000-000000000801' and removed_at is null) <> 24 then
    raise exception 'FAIL: another member''s request changed the fan''s Inner Clique';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 9. Inner Clique creates no points or money, and doesn't change feed order.
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'social' and table_name = 'clique_members'
             and column_name ~* '(point|^cp_|_cp$|amount|cash|money|reward|balance|payout|rank|priority)') then
    raise exception 'FAIL: Inner Clique memberships must not carry points, money or ranking';
  end if;
  if pg_catalog.strpos((select prosrc from pg_proc where oid = 'public.app_feed(timestamptz, integer)'::regprocedure), 'order by s.created_at desc, s.id desc') = 0 then
    raise exception 'FAIL: the feed must stay chronological';
  end if;
  raise notice 'PASS: Inner Clique carries no points, money or ranking, and the feed stays chronological';
end $$;

-- ---------------------------------------------------------------------------
-- 10. Inner Clique changes are rate limited (120 an hour; a replacement is
--     two). Refused requests change nothing; requests that change nothing
--     don't count; follow and unfollow keep working.
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000832","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  before text;
begin
  for i in 802..805 loop
    perform public.app_follow(pg_temp.c(i));
  end loop;
  perform public.app_clique_add(pg_temp.c(803));               -- 1 change
  for i in 1..59 loop                                           -- 118 changes
    perform public.app_clique_add(pg_temp.c(802));
    perform public.app_clique_remove(pg_temp.c(802));
  end loop;
  perform public.app_clique_add(pg_temp.c(802));               -- the 120th
  -- Requests that change nothing are not refused and not counted.
  perform public.app_clique_add(pg_temp.c(803));
  perform public.app_clique_remove(pg_temp.c(805));
  before := (select coalesce(string_agg(id::text, ',' order by id), '') from public.app_following() where in_my_clique);
  perform pg_temp.expect_error_ic('select public.app_clique_add(pg_temp.c(804))', 'rate_limited', 'a 121st Inner Clique change (add)');
  perform pg_temp.expect_error_ic('select public.app_clique_remove(pg_temp.c(802))', 'rate_limited', 'a 121st Inner Clique change (remove)');
  perform pg_temp.expect_error_ic('select public.app_clique_replace(pg_temp.c(803), pg_temp.c(804))', 'rate_limited', 'a 121st Inner Clique change (replace)');
  if (select coalesce(string_agg(id::text, ',' order by id), '') from public.app_following() where in_my_clique) <> before
     or before <> pg_temp.c(802)::text || ',' || pg_temp.c(803)::text then
    raise exception 'FAIL: a rate limited request changed the Inner Clique (%)', before;
  end if;
  raise notice 'PASS: after 120 Inner Clique changes in an hour, add, remove and replace are refused (rate_limited) and change nothing';
  raise notice 'PASS: requests that change nothing (adding someone already there, removing someone who is not) are not counted or refused';

  -- Follow and unfollow are limited separately, and still work.
  perform public.app_unfollow(pg_temp.c(803));
  perform public.app_follow(pg_temp.c(833));
  perform public.app_follow(pg_temp.c(833));
  perform public.app_unfollow(pg_temp.c(805));
  perform public.app_unfollow(pg_temp.c(805));
  if exists (select 1 from public.app_following() where id in (pg_temp.c(803), pg_temp.c(805)))
     or not exists (select 1 from public.app_following() where id = pg_temp.c(833) and not in_my_clique)
     or (select count(*) from public.app_following() where in_my_clique) <> 1 then
    raise exception 'FAIL: follow and unfollow did not work while Inner Clique changes were rate limited';
  end if;
  raise notice 'PASS: while Inner Clique changes are rate limited, follow and unfollow still work, and unfollowing still closes the membership';
end $$;
commit;

do $$
declare
  r uuid := '00000000-0000-4000-8000-000000000832';
begin
  if exists (select 1 from social.clique_members where fan_id = r and creator_id = '00000000-0000-4000-8000-000000000804')
     or (select count(*) from social.clique_members where fan_id = r) <> 61
     or (select count(*) from social.clique_members where fan_id = r and creator_id = '00000000-0000-4000-8000-000000000803' and removal_reason = 'unfollowed') <> 1 then
    raise exception 'FAIL: rate limited requests wrote to the Inner Clique history';
  end if;
  -- Follow history: four follows, one unfollow of 803, one follow of 833 (the
  -- repeat records nothing), one unfollow of 805 (the repeat records nothing).
  if (select count(*) from social.follow_events where follower_id = r) <> 7
     or (select count(*) from social.follows where follower_id = r) <> 3 then
    raise exception 'FAIL: follow and unfollow history changed behaviour (% events)', (select count(*) from social.follow_events where follower_id = r);
  end if;
  raise notice 'PASS: rate limited requests wrote no history, and follow history is recorded exactly as before';
end $$;

-- 11. The window is an hour: changes older than that no longer count.
begin;
alter table social.clique_members disable trigger user;
update social.clique_members set added_at = added_at - interval '2 hours', removed_at = removed_at - interval '2 hours'
where fan_id = '00000000-0000-4000-8000-000000000832';
alter table social.clique_members enable trigger user;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000832","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  perform public.app_clique_add(pg_temp.c(804));
  if not (select in_my_clique from public.app_following() where id = pg_temp.c(804)) then
    raise exception 'FAIL: changes older than an hour still counted against the limit';
  end if;
  raise notice 'PASS: Inner Clique changes older than an hour no longer count against the limit';
end $$;
rollback;
