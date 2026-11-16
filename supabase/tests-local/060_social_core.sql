-- TEST ONLY (throwaway databases). Release 1 social core behaviour, through
-- the same public.app_* functions the app calls, as real signed-in members.
--
-- Members: A = ...601, B = ...602, C..L = ...603..612 (complete profiles),
-- M = ...613 (signed in, but no username or display name yet).

set role supabase_auth_admin;
insert into auth.users (id, email, email_confirmed_at)
select ('00000000-0000-4000-8000-000000000' || lpad(n::text, 3, '0'))::uuid, 'social' || n || '@example.test', now()
from generate_series(601, 613) as n;
reset role;

update public.profiles p
set username = 'member_' || right(p.id::text, 3), display_name = 'Member ' || right(p.id::text, 3)
where p.id::text between '00000000-0000-4000-8000-000000000601' and '00000000-0000-4000-8000-000000000612';
update public.profiles set username = 'aye_social', display_name = 'Aye' where id = '00000000-0000-4000-8000-000000000601';
update public.profiles set username = 'bee_social', display_name = 'Bee' where id = '00000000-0000-4000-8000-000000000602';

-- Asserts that running sql fails with the given message (the error code the app shows).
create function pg_temp.expect_error(sql text, expected text, what text)
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
  if got is null then
    raise exception 'FAIL: % succeeded, expected "%"', what, expected;
  end if;
  if got !~ expected then
    raise exception 'FAIL: % failed with "%", expected "%"', what, got, expected;
  end if;
end;
$$;
grant execute on function pg_temp.expect_error(text, text, text) to authenticated, anon;

-- ---------------------------------------------------------------------------
-- 1. Anonymous visitors can't call the functions or read the tables.
begin;
set local role anon;
do $$
begin
  perform pg_temp.expect_error('select * from public.app_feed()', 'permission denied', 'anon reading the feed');
  perform pg_temp.expect_error('select public.app_create_post(''hi'')', 'permission denied', 'anon posting');
  perform pg_temp.expect_error('select * from social.posts', 'permission denied', 'anon reading social.posts');
  raise notice 'PASS: anonymous visitors cannot use the social core';
end $$;
commit;

-- ---------------------------------------------------------------------------
-- 2. A member without a username and display name can see their own profile but not use the social core yet.
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000613","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  r record;
begin
  select * into r from public.app_me();
  if r.id is null or r.complete then
    raise exception 'FAIL: app_me should return M''s own incomplete profile';
  end if;
  perform pg_temp.expect_error('select * from public.app_feed()', 'profile_incomplete', 'feed before choosing a username');
  perform pg_temp.expect_error('select public.app_create_post(''hello'')', 'profile_incomplete', 'posting before choosing a username');
  perform pg_temp.expect_error('select * from social.posts', 'permission denied', 'reading social.posts directly');
  raise notice 'PASS: the social core waits for a complete profile';
end $$;
commit;

-- ---------------------------------------------------------------------------
-- 3. A posts. Validation and self-follow.
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000601","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  v_post uuid;
  r record;
begin
  v_post := public.app_create_post(e'  Fractions, the easy way.\n  ');
  select * into r from public.app_post(v_post);
  if r.body <> 'Fractions, the easy way.' or not r.is_mine or r.author_username <> 'aye_social' then
    raise exception 'FAIL: A''s post was not stored as written (trimmed), or is not marked as theirs: %', r;
  end if;
  perform pg_temp.expect_error('select public.app_create_post(''   '')', 'empty', 'an empty post');
  perform pg_temp.expect_error('select public.app_create_post(repeat(''x'', 2001))', 'too_long', 'a post over 2,000 characters');
  perform pg_temp.expect_error('select public.app_create_post(''bell'' || chr(7))', 'posts_body_valid', 'a post with a control character');
  perform pg_temp.expect_error('select public.app_follow(''00000000-0000-4000-8000-000000000601'')', 'cannot_follow_self', 'following yourself');
  perform pg_temp.expect_error('select public.app_clique_add(''00000000-0000-4000-8000-000000000601'')', 'cannot_add_self', 'adding yourself to your Clique');
  perform pg_temp.expect_error('select public.app_follow(''00000000-0000-4000-8000-000000000613'')', 'not_found', 'following a member without a profile');
  select * into r from public.app_me();
  if r.post_count <> 1 then
    raise exception 'FAIL: A should have 1 post, has %', r.post_count;
  end if;
  raise notice 'PASS: posting validates input and self-follows are refused';
end $$;
commit;

-- ---------------------------------------------------------------------------
-- 4. B follows A, likes, comments and adds A to their Clique.
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000602","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  v_a uuid := '00000000-0000-4000-8000-000000000601';
  v_post uuid;
  n int;
  r record;
begin
  select count(*) into n from public.app_feed();
  if n <> 0 then
    raise exception 'FAIL: B''s feed shows % posts before following anyone', n;
  end if;
  select count(*) into n from public.app_discover() where id = v_a;
  if n <> 1 then
    raise exception 'FAIL: Discover should list A';
  end if;
  if exists (select 1 from public.app_discover() where id in ('00000000-0000-4000-8000-000000000602', '00000000-0000-4000-8000-000000000613')) then
    raise exception 'FAIL: Discover lists the member themselves or someone without a profile';
  end if;
  select count(*) into n from public.app_discover('AYE_SOC');
  if n <> 1 then
    raise exception 'FAIL: searching Discover for "AYE_SOC" found % members', n;
  end if;

  perform public.app_follow(v_a);
  perform public.app_follow(v_a);
  select * into r from public.app_member('aye_social');
  if not r.followed_by_me or r.in_my_clique or r.follower_count <> 1 then
    raise exception 'FAIL: after following twice, B should follow A once and A should not be in B''s Clique: %', r;
  end if;

  select id into v_post from public.app_feed() limit 1;
  if v_post is null then
    raise exception 'FAIL: B''s feed should show A''s post after following';
  end if;
  perform public.app_like(v_post);
  perform public.app_like(v_post);
  select * into r from public.app_post(v_post);
  if r.like_count <> 1 or not r.liked_by_me then
    raise exception 'FAIL: liking twice should count once: %', r;
  end if;
  perform public.app_add_comment(v_post, 'This finally made it click for my class.');
  perform pg_temp.expect_error(format('select public.app_add_comment(%L, %L)', v_post, '  '), 'empty', 'an empty comment');
  select * into r from public.app_post(v_post);
  if r.comment_count <> 1 then
    raise exception 'FAIL: the post should have 1 comment, has %', r.comment_count;
  end if;

  perform public.app_clique_add(v_a);
  perform public.app_clique_add(v_a);
  select * into r from public.app_member('aye_social');
  if not r.in_my_clique then
    raise exception 'FAIL: A should be in B''s Clique';
  end if;
  select * into r from public.app_me();
  if r.clique_count <> 1 or r.following_count <> 1 then
    raise exception 'FAIL: B should follow 1 and have 1 in their Clique: %', r;
  end if;
  raise notice 'PASS: follow, like, comment and Clique are idempotent and reflected everywhere';
end $$;
commit;

-- Follow history recorded once, and the Clique and follow are separate records.
do $$
begin
  if (select count(*) from social.follow_events where follower_id = '00000000-0000-4000-8000-000000000602' and action = 'followed') <> 1 then
    raise exception 'FAIL: following twice should record one follow event';
  end if;
  if (select count(*) from social.clique_members where fan_id = '00000000-0000-4000-8000-000000000602') <> 1 then
    raise exception 'FAIL: adding to the Clique twice should create one membership';
  end if;
  raise notice 'PASS: follow history and Clique history are recorded once';
end $$;

-- ---------------------------------------------------------------------------
-- 5. A Clique needs a follow.
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000603","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  perform pg_temp.expect_error('select public.app_clique_add(''00000000-0000-4000-8000-000000000601'')', 'not_following', 'adding someone you don''t follow');
  raise notice 'PASS: a Clique only includes creators you follow';
end $$;
commit;

-- ---------------------------------------------------------------------------
-- 6. At most 10 in a Clique; unfollowing closes the membership and frees a slot.
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000602","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  n int;
  i int;
begin
  for i in 603..612 loop
    perform public.app_follow(('00000000-0000-4000-8000-000000000' || i)::uuid);
  end loop;
  for i in 603..611 loop
    perform public.app_clique_add(('00000000-0000-4000-8000-000000000' || i)::uuid);
  end loop;
  select count(*) into n from public.app_following() where in_my_clique;
  if n <> 10 then
    raise exception 'FAIL: B should have 10 in their Clique, has %', n;
  end if;
  perform pg_temp.expect_error('select public.app_clique_add(''00000000-0000-4000-8000-000000000612'')', 'clique_full', 'an 11th Clique member');

  perform public.app_unfollow('00000000-0000-4000-8000-000000000601');
  select count(*) into n from public.app_following() where in_my_clique;
  if n <> 9 then
    raise exception 'FAIL: unfollowing A should leave 9 in the Clique, found %', n;
  end if;
  perform public.app_clique_add('00000000-0000-4000-8000-000000000612');
  perform public.app_clique_remove('00000000-0000-4000-8000-000000000603');
  select count(*) into n from public.app_following() where in_my_clique;
  if n <> 9 then
    raise exception 'FAIL: after adding L and removing C the Clique should hold 9, found %', n;
  end if;
  select count(*) into n from public.app_feed();
  if n <> 0 then
    raise exception 'FAIL: after unfollowing A, B''s feed should not show A''s post (found %)', n;
  end if;
  raise notice 'PASS: a Clique holds at most 10, and unfollowing frees a slot';
end $$;
commit;

do $$
begin
  if not exists (select 1 from social.clique_members where fan_id = '00000000-0000-4000-8000-000000000602'
                 and creator_id = '00000000-0000-4000-8000-000000000601' and removal_reason = 'unfollowed') then
    raise exception 'FAIL: unfollowing should close the Clique membership with the reason "unfollowed"';
  end if;
  if not exists (select 1 from social.clique_members where fan_id = '00000000-0000-4000-8000-000000000602'
                 and creator_id = '00000000-0000-4000-8000-000000000603' and removal_reason = 'removed') then
    raise exception 'FAIL: removing should close the Clique membership with the reason "removed"';
  end if;
  if not exists (select 1 from social.follow_events where follower_id = '00000000-0000-4000-8000-000000000602'
                 and creator_id = '00000000-0000-4000-8000-000000000601' and action = 'unfollowed') then
    raise exception 'FAIL: the unfollow is missing from follow history';
  end if;
  raise notice 'PASS: Clique and follow history keep every change, with reasons';
end $$;

-- ---------------------------------------------------------------------------
-- 7. History can't be rewritten, even by the server's own login.
do $$
begin
  perform pg_temp.expect_error('update social.follow_events set action = ''followed''', 'append-only', 'rewriting follow history');
  perform pg_temp.expect_error('delete from social.follow_events', 'append-only', 'deleting follow history');
  perform pg_temp.expect_error('delete from social.clique_members', 'never deleted', 'deleting Clique history');
  perform pg_temp.expect_error($q$update social.clique_members set removed_at = null, removal_reason = null where removal_reason = 'removed'$q$, 'never rewritten', 'reopening a closed Clique membership');
  perform pg_temp.expect_error($q$update social.clique_members set creator_id = '00000000-0000-4000-8000-000000000604' where removed_at is null and creator_id = '00000000-0000-4000-8000-000000000612'$q$, 'never rewritten', 'swapping the creator on a membership');
  raise notice 'PASS: follow and Clique history are append-only';
end $$;

-- ---------------------------------------------------------------------------
-- 8. Only your own posts and comments can be deleted; deleted posts disappear everywhere.
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000601","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  v_post uuid;
  v_comment uuid;
begin
  select id into v_post from public.app_member_posts('00000000-0000-4000-8000-000000000601') limit 1;
  select id into v_comment from public.app_comments(v_post) limit 1;
  perform pg_temp.expect_error(format('select public.app_delete_comment(%L)', v_comment), 'not_found', 'deleting someone else''s comment');
  raise notice 'PASS: members cannot delete other people''s comments';
end $$;
commit;

begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000602","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  v_post uuid;
  v_comment uuid;
  r record;
begin
  select id into v_post from public.app_member_posts('00000000-0000-4000-8000-000000000601') limit 1;
  perform pg_temp.expect_error(format('select public.app_delete_post(%L)', v_post), 'not_found', 'deleting someone else''s post');
  select id into v_comment from public.app_comments(v_post) where is_mine limit 1;
  perform public.app_delete_comment(v_comment);
  select * into r from public.app_post(v_post);
  if r.comment_count <> 0 then
    raise exception 'FAIL: a deleted comment is still counted';
  end if;
  raise notice 'PASS: members delete only their own comments';
end $$;
commit;

begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000601","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  v_post uuid;
  n int;
begin
  select id into v_post from public.app_member_posts('00000000-0000-4000-8000-000000000601') limit 1;
  perform public.app_delete_post(v_post);
  select count(*) into n from public.app_post(v_post);
  if n <> 0 then
    raise exception 'FAIL: a deleted post can still be opened';
  end if;
  perform pg_temp.expect_error(format('select public.app_like(%L)', v_post), 'not_found', 'liking a deleted post');
  perform pg_temp.expect_error(format('select public.app_add_comment(%L, %L)', v_post, 'still here?'), 'not_found', 'commenting on a deleted post');
  perform pg_temp.expect_error(format('select public.app_delete_post(%L)', v_post), 'not_found', 'deleting a post twice');
  raise notice 'PASS: deleted posts disappear everywhere';
end $$;
commit;

-- ---------------------------------------------------------------------------
-- 9. Simple rate limit on posting.
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000604","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  i int;
begin
  for i in 1..20 loop
    perform public.app_create_post('Post number ' || i);
  end loop;
  perform pg_temp.expect_error('select public.app_create_post(''one too many'')', 'rate_limited', 'a 21st post within an hour');
  raise notice 'PASS: posting is rate limited';
end $$;
commit;

-- ---------------------------------------------------------------------------
-- 10. Profiles stay own-row only: the social core never widens profile access.
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000602","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  n int;
begin
  select count(*) into n from public.profiles;
  if n <> 1 then
    raise exception 'FAIL: B can read % profiles directly (expected only their own)', n;
  end if;
  raise notice 'PASS: profiles stay own-row only; other members are seen only through public fields';
end $$;
commit;

-- ---------------------------------------------------------------------------
-- 11. Deleting an account removes its social data, history included.
set role supabase_auth_admin;
delete from auth.users where id = '00000000-0000-4000-8000-000000000612';
reset role;
do $$
begin
  if exists (select 1 from social.follows where creator_id = '00000000-0000-4000-8000-000000000612')
     or exists (select 1 from social.follow_events where creator_id = '00000000-0000-4000-8000-000000000612')
     or exists (select 1 from social.clique_members where creator_id = '00000000-0000-4000-8000-000000000612') then
    raise exception 'FAIL: a deleted account left social data behind';
  end if;
  raise notice 'PASS: deleting an account removes its follows, Clique memberships and history';
end $$;
