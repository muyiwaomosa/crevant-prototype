-- TEST ONLY (throwaway databases). Who may post photos (20261128000000), as
-- real signed-in accounts and server code. Runs after 115, which leaves
-- photos on (cap set, checks passed) with the audience opened to members.
--
--   F = ...c601: the founder (founder cohort, active).
--   T = ...c602: a tester.
--   G = ...c603: a founder-cohort account whose access is revoked.

set role supabase_auth_admin;
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-4000-8000-00000000c601', 'au-f@example.test', now()),
  ('00000000-0000-4000-8000-00000000c602', 'au-t@example.test', now()),
  ('00000000-0000-4000-8000-00000000c603', 'au-g@example.test', now());
reset role;
update public.profiles set username = 'au_' || right(id::text, 1), display_name = 'Au ' || right(id::text, 1) where id::text like '00000000-0000-4000-8000-00000000c60_';
select ops.grant_member_access('00000000-0000-4000-8000-00000000c601', 'founder', 'test');
select ops.grant_member_access('00000000-0000-4000-8000-00000000c602', 'tester', 'test');
select ops.grant_member_access('00000000-0000-4000-8000-00000000c603', 'founder', 'test');
select ops.revoke_member_access('00000000-0000-4000-8000-00000000c603', 'test');

create function pg_temp.expect_error_au(sql text, expected text, what text)
returns void language plpgsql as $$
declare got text;
begin
  begin execute sql; exception when others then got := sqlerrm; end;
  if got is null then raise exception 'FAIL: % succeeded, expected "%"', what, expected; end if;
  if got !~ expected then raise exception 'FAIL: % failed with "%", expected "%"', what, got, expected; end if;
end;
$$;
grant execute on function pg_temp.expect_error_au(text, text, text) to authenticated, anon;
-- A stored upload for T (as the Edge Function would leave it), to try publishing.
insert into social.media_uploads (id, user_id, kind, full_path, feed_path, status, width, height, full_bytes, feed_bytes, stored_at)
values ('00000000-0000-4000-8000-00000000c6a2', '00000000-0000-4000-8000-00000000c602', 'photo',
        '00000000-0000-4000-8000-00000000c602/00000000-0000-4000-8000-00000000c6a2.jpg',
        '00000000-0000-4000-8000-00000000c602/00000000-0000-4000-8000-00000000c6a2-feed.jpg', 'stored', 1600, 1067, 300000, 90000, now());

-- 1. The default is the founder, and the migration's own default is founder.
do $$
begin
  if (select column_default from information_schema.columns where table_schema = 'ops' and table_name = 'media_settings' and column_name = 'photos_audience') <> '''founder''::text' then
    raise exception 'FAIL: the audience does not default to founder';
  end if;
  -- Back to founder-only (115 opened it to members), recorded.
  perform ops.set_photo_audience('founder', 'founder');
  if (select photos_audience from ops.media_settings) <> 'founder' then raise exception 'FAIL: the audience did not change'; end if;
  if not exists (select 1 from ops.media_admin_events where action = 'audience_changed' and detail = 'photo posting audience members -> founder' and actor = 'founder') then
    raise exception 'FAIL: the change to founder-only was not recorded';
  end if;
  raise notice 'PASS: the audience defaults to founder, and changing it is recorded';
end $$;

-- 2. Founder-only: the founder may post photos; a tester is refused at every step.
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000c601","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  if not public.app_photo_status() then raise exception 'FAIL: the founder is told photos are off'; end if;
  if (select count(*) from public.app_photo_upload_begin()) <> 1 then raise exception 'FAIL: the founder cannot authorise an upload'; end if;
  raise notice 'PASS: with the audience at founder, the founder can post photos';
end $$;
commit;
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000c602","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  if public.app_photo_status() then raise exception 'FAIL: a tester is told photos are on'; end if;
  perform pg_temp.expect_error_au('select * from public.app_photo_upload_begin()', 'photos_unavailable', 'a tester authorising an upload');
  perform pg_temp.expect_error_au($q$select public.app_create_post('', gen_random_uuid(), '00000000-0000-4000-8000-00000000c6a2')$q$, 'photos_unavailable', 'a tester publishing a stored photo');
  -- Text posting is unchanged for the tester.
  if public.app_create_post('Text still works for testers', gen_random_uuid()) is null then raise exception 'FAIL: text posting'; end if;
  raise notice 'PASS: a tester is refused at status, upload and publish (photos_unavailable), and can still post text';
end $$;
commit;
-- A founder-cohort account without active access, and no signed-in caller: refused (fail closed).
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000c603","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  perform pg_temp.expect_error_au('select public.app_photo_status()', 'no_pilot_access', 'a revoked founder-cohort account');
  perform pg_temp.expect_error_au('select * from public.app_photo_upload_begin()', 'no_pilot_access', 'a revoked founder-cohort account uploading');
end $$;
commit;
do $$
begin
  perform set_config('request.jwt.claims', '', true);
  if ops.photos_open() then raise exception 'FAIL: with no signed-in caller, photos are open under the founder audience'; end if;
  -- The revoked founder-cohort account is not the founder for photos either.
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000c603","role":"authenticated"}', true);
  if ops.photos_open() then raise exception 'FAIL: a revoked founder-cohort account counts as the founder'; end if;
  perform set_config('request.jwt.claims', '', true);
  raise notice 'PASS: fail closed: no caller, or a founder-cohort account without active access, gets no photo posting';
end $$;

-- 3. Viewing is unchanged: a tester still gets links for the founder's photo posts.
do $$
declare u uuid := '00000000-0000-4000-8000-00000000c6a1';
begin
  insert into social.media_uploads (id, user_id, kind, full_path, feed_path, status, width, height, full_bytes, feed_bytes, stored_at)
  values (u, '00000000-0000-4000-8000-00000000c601', 'photo', '00000000-0000-4000-8000-00000000c601/' || u || '.jpg',
          '00000000-0000-4000-8000-00000000c601/' || u || '-feed.jpg', 'stored', 1600, 1067, 300000, 90000, now());
end $$;
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000c601","role":"authenticated"}', true);
set local role authenticated;
select public.app_create_post('From the founder', gen_random_uuid(), '00000000-0000-4000-8000-00000000c6a1') is not null as founder_posted;
commit;
create temp table au_post as select id from social.posts where body = 'From the founder';
grant select on au_post to authenticated;
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000c602","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  if (select count(*) from public.app_post_photos(array[(select id from au_post)])) <> 1 then
    raise exception 'FAIL: a tester can no longer see the founder''s photo';
  end if;
  raise notice 'PASS: the founder publishes a photo post, and a tester still sees it (viewing is unchanged)';
end $$;
commit;

-- 4. Changing the audience: server only, explicit, recorded.
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000c601","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  perform pg_temp.expect_error_au($q$select ops.set_photo_audience('founder', 'members', 'OPEN PHOTO POSTING TO ALL MEMBERS')$q$, 'permission denied', 'even the founder''s session changing the audience');
  raise notice 'PASS: no signed-in account can change the audience (server only)';
end $$;
commit;
do $$
declare n int := (select count(*) from ops.media_admin_events where action = 'audience_changed');
begin
  perform pg_temp.expect_error_au($q$select ops.set_photo_audience('founder', 'members')$q$, 'exact phrase', 'opening to members without the phrase');
  perform pg_temp.expect_error_au($q$select ops.set_photo_audience('founder', 'members', 'open photo posting to all members')$q$, 'exact phrase', 'opening to members with a different phrase');
  perform pg_temp.expect_error_au($q$select ops.set_photo_audience('founder', 'everyone')$q$, 'founder or members', 'an unknown audience');
  perform pg_temp.expect_error_au($q$select ops.set_photo_audience('a@b.c', 'founder')$q$, 'actor label', 'an email address as the actor');
  perform ops.set_photo_audience('founder', 'founder');
  if (select count(*) from ops.media_admin_events where action = 'audience_changed') <> n then
    raise exception 'FAIL: a no-op change was recorded';
  end if;
  -- Turning photos on or changing the cap never changes the audience.
  perform ops.set_media_settings('founder', true, 2000000000, 10, 20);
  if (select photos_audience from ops.media_settings) <> 'founder' then raise exception 'FAIL: set_media_settings changed the audience'; end if;
  perform ops.set_photo_audience('founder', 'members', 'OPEN PHOTO POSTING TO ALL MEMBERS');
  if (select photos_audience from ops.media_settings) <> 'members'
     or not exists (select 1 from ops.media_admin_events where action = 'audience_changed' and detail = 'photo posting audience founder -> members') then
    raise exception 'FAIL: opening to members did not apply or was not recorded';
  end if;
  raise notice 'PASS: opening to all members needs the exact phrase and is recorded; refusals and no-ops change nothing; the switch never changes the audience';
end $$;
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000c602","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  if not public.app_photo_status() or (select count(*) from public.app_photo_upload_begin()) <> 1 then
    raise exception 'FAIL: with the audience at members, a tester still cannot post photos';
  end if;
  raise notice 'PASS: once opened to members (explicitly), a tester can post photos';
end $$;
commit;
-- The switch still wins: off means off for the founder too.
do $$
begin
  perform ops.set_media_settings('founder', false, 2000000000, 10, 20);
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000c601","role":"authenticated"}', true);
  if ops.photos_open() then raise exception 'FAIL: the founder can post with photos switched off'; end if;
  perform set_config('request.jwt.claims', '', true);
  perform ops.set_media_settings('founder', true, 2000000000, 10, 20);
  raise notice 'PASS: with photos switched off, nobody can post photos, whatever the audience';
end $$;
