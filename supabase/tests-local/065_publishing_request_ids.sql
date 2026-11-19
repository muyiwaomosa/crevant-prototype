-- TEST ONLY (throwaway databases). Publishing reliability (issue #48,
-- 20261119000000_publishing_request_ids): posts and comments sent with a
-- request id are stored once, however often the request is repeated.
-- Two simultaneous requests are tested with two real sessions in
-- scripts/db/request-ids-concurrency-test.sh.
--
-- Members: P = ...701, Q = ...702 (complete profiles).

set role supabase_auth_admin;
insert into auth.users (id, email, email_confirmed_at)
select ('00000000-0000-4000-8000-000000000' || n::text)::uuid, 'requests' || n || '@example.test', now()
from generate_series(701, 702) as n;
reset role;
-- Pilot membership (20261122000000): these test members are granted access.
select ops.grant_member_access(u.id, 'tester', 'test') from auth.users u where u.email like 'requests%@example.test';
update public.profiles set username = 'pee_requests', display_name = 'Pee' where id = '00000000-0000-4000-8000-000000000701';
update public.profiles set username = 'cue_requests', display_name = 'Cue' where id = '00000000-0000-4000-8000-000000000702';

create function pg_temp.expect_error_rq(sql text, expected text, what text)
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
grant execute on function pg_temp.expect_error_rq(text, text, text) to authenticated, anon;

-- ---------------------------------------------------------------------------
-- 1. Anonymous visitors can't call the new versions.
begin;
set local role anon;
do $$
begin
  perform pg_temp.expect_error_rq('select public.app_create_post(''hi'', gen_random_uuid())', 'permission denied', 'anon posting with a request id');
  perform pg_temp.expect_error_rq('select public.app_add_comment(gen_random_uuid(), ''hi'', gen_random_uuid())', 'permission denied', 'anon commenting with a request id');
  raise notice 'PASS: anonymous visitors cannot use the request id versions';
end $$;
commit;

-- ---------------------------------------------------------------------------
-- 2. Posts: a repeated request is stored once.
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000701","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  rq uuid := '11111111-1111-4111-8111-111111111111';
  a uuid; b uuid; c uuid; n int;
begin
  a := public.app_create_post(e'  Once, please.\n', rq);
  b := public.app_create_post('Once, please.', rq);
  c := public.app_create_post(e'Once, please.  ', rq);
  select count(*) into n from public.app_member_posts('00000000-0000-4000-8000-000000000701') where body = 'Once, please.';
  if a is null or a <> b or b <> c or n <> 1 then
    raise exception 'FAIL: a repeated post request made % posts (ids % % %)', n, a, b, c;
  end if;
  raise notice 'PASS: the same request id, sent three times, stores one post and returns its id each time';

  perform pg_temp.expect_error_rq(format('select public.app_create_post(%L, %L)', 'Something else', rq), 'request_reused', 'the same id with different text');
  select count(*) into n from public.app_member_posts('00000000-0000-4000-8000-000000000701');
  if n <> 1 then
    raise exception 'FAIL: reusing a request id with different text wrote something (% posts)', n;
  end if;
  raise notice 'PASS: the same request id with different text is refused, and nothing is written';

  -- Validation still applies to a new request.
  perform pg_temp.expect_error_rq('select public.app_create_post(''   '', gen_random_uuid())', 'empty', 'an empty post with a request id');
  perform pg_temp.expect_error_rq('select public.app_create_post(repeat(''x'', 2001), gen_random_uuid())', 'too_long', 'a long post with a request id');

  -- A null id behaves like the original: no de-duplication.
  a := public.app_create_post('No id', null);
  b := public.app_create_post('No id', null);
  if a = b then
    raise exception 'FAIL: a null request id de-duplicated';
  end if;
  -- And the original one-argument version still works.
  a := public.app_create_post('The original version');
  if a is null then
    raise exception 'FAIL: the original app_create_post(text) no longer works';
  end if;
  raise notice 'PASS: a null request id and the original version behave as before';
end $$;
commit;

-- ---------------------------------------------------------------------------
-- 3. A repeat doesn't count against the rate limit again (20 posts an hour).
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000701","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  rq uuid := '11111111-1111-4111-8111-111111111111';
  n int; a uuid;
begin
  -- Fill the hour to the limit with new posts.
  select count(*) into n from public.app_member_posts('00000000-0000-4000-8000-000000000701', null, 50);
  for i in 1 .. 20 - n loop
    perform public.app_create_post('Filler ' || i, gen_random_uuid());
  end loop;
  perform pg_temp.expect_error_rq('select public.app_create_post(''One too many'', gen_random_uuid())', 'rate_limited', 'a 21st new post in an hour');
  a := public.app_create_post('Once, please.', rq);
  if a is null then
    raise exception 'FAIL: a repeat of an earlier request was refused by the rate limit';
  end if;
  raise notice 'PASS: at the hourly limit, a repeat still returns the original post (it is not a new post)';
end $$;
rollback;

-- ---------------------------------------------------------------------------
-- 4. Another member can use the same id independently.
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000702","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  a uuid; n int;
begin
  a := public.app_create_post('Same id, different person', '11111111-1111-4111-8111-111111111111');
  select count(*) into n from public.app_member_posts('00000000-0000-4000-8000-000000000702') where id = a;
  if a is null or n <> 1 then
    raise exception 'FAIL: a second member could not use the same request id';
  end if;
  raise notice 'PASS: two members can use the same request id without affecting each other';
end $$;
commit;

-- ---------------------------------------------------------------------------
-- 5. Comments: a repeated request is stored once.
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000702","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  rq uuid := '22222222-2222-4222-8222-222222222222';
  v_post uuid; v_other uuid; a uuid; b uuid; n int;
begin
  select id into v_post from public.app_member_posts('00000000-0000-4000-8000-000000000701') where body = 'Once, please.';
  select id into v_other from public.app_member_posts('00000000-0000-4000-8000-000000000701') where body = 'The original version';
  a := public.app_add_comment(v_post, 'Lovely.', rq);
  b := public.app_add_comment(v_post, '  Lovely.  ', rq);
  select count(*) into n from public.app_comments(v_post) where body = 'Lovely.';
  if a is null or a <> b or n <> 1 then
    raise exception 'FAIL: a repeated comment request made % comments', n;
  end if;
  raise notice 'PASS: the same comment request id, sent twice, stores one comment and returns its id';

  perform pg_temp.expect_error_rq(format('select public.app_add_comment(%L, %L, %L)', v_post, 'Different words', rq), 'request_reused', 'the same comment id with different text');
  perform pg_temp.expect_error_rq(format('select public.app_add_comment(%L, %L, %L)', v_other, 'Lovely.', rq), 'request_reused', 'the same comment id on another post');
  perform pg_temp.expect_error_rq(format('select public.app_add_comment(%L, %L, %L)', gen_random_uuid(), 'Hello', gen_random_uuid()), 'not_found', 'a comment on a missing post');
  select count(*) into n from public.app_comments(v_post);
  if n <> 1 or exists (select 1 from public.app_comments(v_other)) then
    raise exception 'FAIL: a refused comment request wrote something';
  end if;
  raise notice 'PASS: a reused comment id with other text or another post is refused, and nothing is written';

  -- The original two-argument version still works.
  a := public.app_add_comment(v_post, 'The original comment version');
  if a is null then
    raise exception 'FAIL: the original app_add_comment(uuid, text) no longer works';
  end if;
  raise notice 'PASS: the original app_add_comment(uuid, text) still works';
end $$;
commit;

-- ---------------------------------------------------------------------------
-- 6. Members still can't read the tables directly, including the new column.
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000702","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  perform pg_temp.expect_error_rq('select client_request_id from social.posts', 'permission denied', 'a member reading request ids');
  raise notice 'PASS: request ids stay server-side';
end $$;
commit;
