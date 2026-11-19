-- TEST ONLY (throwaway databases). Runs just BEFORE 20261122000000_member_access:
-- the kind of accounts and content staging already has (complete profiles,
-- an incomplete one, posts, follows, an Inner Clique, likes, comments and
-- viewed state), with a fingerprint of every row, so
-- supabase/tests-local/070_member_access.sql can prove the migration changed,
-- lost or granted nothing.
--
-- Accounts: P1 = ...0a01 and P2 = ...0a02 (complete profiles), P3 = ...0a03
-- (signed in, no username yet).

set role supabase_auth_admin;
insert into auth.users (id, email, email_confirmed_at)
select ('00000000-0000-4000-8000-000000000a0' || n)::uuid, 'premigration' || n || '@example.test', now() - interval '3 days'
from generate_series(1, 3) as n;
reset role;

update public.profiles set username = 'pre_one', display_name = 'Pre One' where id = '00000000-0000-4000-8000-000000000a01';
update public.profiles set username = 'pre_two', display_name = 'Pre Two' where id = '00000000-0000-4000-8000-000000000a02';

insert into social.posts (id, author_id, body, created_at) values
  ('00000000-0000-4000-8000-00000000aa01', '00000000-0000-4000-8000-000000000a01', 'A post from before the gate', now() - interval '2 days'),
  ('00000000-0000-4000-8000-00000000aa02', '00000000-0000-4000-8000-000000000a02', 'Another post from before', now() - interval '1 day');
insert into social.follows (follower_id, creator_id, followed_at) values
  ('00000000-0000-4000-8000-000000000a02', '00000000-0000-4000-8000-000000000a01', now() - interval '2 days'),
  ('00000000-0000-4000-8000-000000000a01', '00000000-0000-4000-8000-000000000a02', now() - interval '2 days');
insert into social.clique_members (fan_id, creator_id) values ('00000000-0000-4000-8000-000000000a02', '00000000-0000-4000-8000-000000000a01');
insert into social.likes (user_id, post_id) values ('00000000-0000-4000-8000-000000000a02', '00000000-0000-4000-8000-00000000aa01');
insert into social.comments (post_id, author_id, body) values ('00000000-0000-4000-8000-00000000aa01', '00000000-0000-4000-8000-000000000a02', 'A comment from before');
insert into social.post_views (viewer_id, post_id, basis) values ('00000000-0000-4000-8000-000000000a02', '00000000-0000-4000-8000-00000000aa01', 'visible');

-- The fingerprint: every row these accounts own, before the migration.
create schema test_fixture;
create table test_fixture.premigration as
select 'auth' as part, count(*)::text || md5(string_agg(id::text || email || coalesce(email_confirmed_at::text, ''), ',' order by id)) as fp
  from auth.users where id::text like '00000000-0000-4000-8000-000000000a0_'
union all select 'profiles', count(*)::text || md5(string_agg(id::text || coalesce(username, '-') || coalesce(display_name, '-') || created_at::text || updated_at::text, ',' order by id))
  from public.profiles where id::text like '00000000-0000-4000-8000-000000000a0_'
union all select 'posts', count(*)::text || md5(string_agg(id::text || author_id::text || body || created_at::text || coalesce(deleted_at::text, '-'), ',' order by id))
  from social.posts where author_id::text like '00000000-0000-4000-8000-000000000a0_'
union all select 'follows', count(*)::text || md5(string_agg(follower_id::text || creator_id::text || followed_at::text, ',' order by follower_id, creator_id))
  from social.follows where follower_id::text like '00000000-0000-4000-8000-000000000a0_'
union all select 'clique', count(*)::text || md5(string_agg(fan_id::text || creator_id::text || added_at::text || coalesce(removed_at::text, '-'), ',' order by fan_id, creator_id))
  from social.clique_members where fan_id::text like '00000000-0000-4000-8000-000000000a0_'
union all select 'likes', count(*)::text || md5(string_agg(user_id::text || post_id::text, ',' order by user_id, post_id))
  from social.likes where user_id::text like '00000000-0000-4000-8000-000000000a0_'
union all select 'comments', count(*)::text || md5(string_agg(id::text || post_id::text || author_id::text || body, ',' order by id))
  from social.comments where author_id::text like '00000000-0000-4000-8000-000000000a0_'
union all select 'views', count(*)::text || md5(string_agg(viewer_id::text || post_id::text || basis, ',' order by viewer_id, post_id))
  from social.post_views where viewer_id::text like '00000000-0000-4000-8000-000000000a0_';
