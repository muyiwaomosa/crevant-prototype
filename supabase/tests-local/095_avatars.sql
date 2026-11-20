-- TEST ONLY (throwaway databases). Profile pictures (20261125000000), as real
-- signed-in accounts and the service role, calling the same functions the
-- avatar Edge Function calls. Storage here is the minimal stand-in from
-- supabase/tests-local/before/20261125000000.sql.
--
--   A = ...0e01, B = ...0e02: members.   M = ...0e03: a member and moderator.
--   N = ...0e04: a complete profile, never granted.

set role supabase_auth_admin;
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-4000-8000-000000000e01', 'pic-a@example.test', now()),
  ('00000000-0000-4000-8000-000000000e02', 'pic-b@example.test', now()),
  ('00000000-0000-4000-8000-000000000e03', 'pic-m@example.test', now()),
  ('00000000-0000-4000-8000-000000000e04', 'pic-n@example.test', now());
reset role;
update public.profiles set username = 'pic_a', display_name = 'Pic A' where id = '00000000-0000-4000-8000-000000000e01';
update public.profiles set username = 'pic_b', display_name = 'Pic B' where id = '00000000-0000-4000-8000-000000000e02';
update public.profiles set username = 'pic_m', display_name = 'Pic M' where id = '00000000-0000-4000-8000-000000000e03';
update public.profiles set username = 'pic_n', display_name = 'Pic N' where id = '00000000-0000-4000-8000-000000000e04';
select ops.grant_member_access(('00000000-0000-4000-8000-000000000e0' || i)::uuid, 'tester', 'test') from generate_series(1, 3) i;
select ops.grant_moderator('00000000-0000-4000-8000-000000000e03', 'founder', 'test');

create function pg_temp.expect_error_pic(sql text, expected text, what text)
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
grant execute on function pg_temp.expect_error_pic(text, text, text) to authenticated, anon, service_role;
-- Paths handed out during the test, shared across roles.
create temp table pic_paths (label text primary key, path text);
grant select, insert, update on pic_paths to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 1. Nobody but the database chooses a path, and only members get one.
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000e04","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  perform pg_temp.expect_error_pic('select public.app_avatar_begin()', 'no_pilot_access', 'N starting an upload');
  perform pg_temp.expect_error_pic('select public.app_avatar_remove()', 'no_pilot_access', 'N removing a picture');
  perform pg_temp.expect_error_pic('select * from public.app_avatars(array[''00000000-0000-4000-8000-000000000e01''::uuid])', 'no_pilot_access', 'N reading pictures');
  raise notice 'PASS: without pilot membership, no picture can be started, removed or read';
end $$;
commit;

begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000e01","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  p text;
begin
  p := public.app_avatar_begin();
  if p !~ '^00000000-0000-4000-8000-000000000e01/[0-9a-f-]{36}\.jpg$' then
    raise exception 'FAIL: the path is not in A''s own folder with a random name: %', p;
  end if;
  insert into pic_paths values ('a1', p);
  -- Members can't do the service role's steps, or reach the tables.
  perform pg_temp.expect_error_pic(pg_catalog.format('select public.svc_avatar_commit(%L)', p), 'permission denied', 'A committing directly');
  perform pg_temp.expect_error_pic(pg_catalog.format('select public.svc_avatar_orphan(%L, ''x'')', p), 'permission denied', 'A recording an orphan');
  perform pg_temp.expect_error_pic('select count(*) from social.avatars', 'permission denied', 'A reading avatars directly');
  perform pg_temp.expect_error_pic('select count(*) from social.avatar_uploads', 'permission denied', 'A reading uploads directly');
  perform pg_temp.expect_error_pic('select count(*) from ops.storage_orphans', 'permission denied', 'A reading orphans');
  perform pg_temp.expect_error_pic('select count(*) from storage.objects', 'permission denied', 'A reading storage objects');
  raise notice 'PASS: the database chooses the path (in the member''s own folder); members can''t run the service steps or reach the tables';
end $$;
commit;

begin;
set local role anon;
do $$
begin
  perform pg_temp.expect_error_pic('select public.app_avatar_begin()', 'permission denied', 'anon starting an upload');
  perform pg_temp.expect_error_pic('select public.svc_avatar_commit(''x'')', 'permission denied', 'anon committing');
  raise notice 'PASS: anonymous visitors can call none of it';
end $$;
commit;

-- ---------------------------------------------------------------------------
-- 2. Commit (service role): only an authorised, recent, pending upload; the
--    membership is re-checked at that moment; the old file is returned.
begin;
set local role service_role;
do $$
declare
  old text;
begin
  perform pg_temp.expect_error_pic('select public.svc_avatar_commit(''00000000-0000-4000-8000-000000000e01/00000000-0000-4000-8000-0000000000ff.jpg'')', 'not_found', 'committing a path the database never authorised');
  old := public.svc_avatar_commit((select path from pic_paths where label = 'a1'));
  if old is not null then
    raise exception 'FAIL: a first picture should have no previous file';
  end if;
  perform pg_temp.expect_error_pic(pg_catalog.format('select public.svc_avatar_commit(%L)', (select path from pic_paths where label = 'a1')), 'not_found', 'committing the same upload twice');
  raise notice 'PASS: only an authorised pending upload can be committed, once';
end $$;
commit;

-- A replacement returns the previous file to delete.
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000e01","role":"authenticated"}', true);
set local role authenticated;
insert into pic_paths select 'a2', public.app_avatar_begin();
commit;
begin;
set local role service_role;
do $$
begin
  if public.svc_avatar_commit((select path from pic_paths where label = 'a2')) is distinct from (select path from pic_paths where label = 'a1') then
    raise exception 'FAIL: replacing did not return the previous file';
  end if;
  raise notice 'PASS: replacing returns the previous file (for the Edge Function to delete)';
end $$;
commit;
do $$
begin
  if (select path from social.avatars where user_id = '00000000-0000-4000-8000-000000000e01') <> (select path from pic_paths where label = 'a2') then
    raise exception 'FAIL: the current picture is not the new one';
  end if;
end $$;

-- Two uploads committed one after another (as concurrent requests are
-- serialised by the per-member lock): the newest wins, each returns the one before.
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000e01","role":"authenticated"}', true);
set local role authenticated;
insert into pic_paths select 'a3', public.app_avatar_begin();
insert into pic_paths select 'a4', public.app_avatar_begin();
commit;
begin;
set local role service_role;
do $$
declare
  r3 text := public.svc_avatar_commit((select path from pic_paths where label = 'a3'));
  r4 text := public.svc_avatar_commit((select path from pic_paths where label = 'a4'));
begin
  if r3 <> (select path from pic_paths where label = 'a2') or r4 <> (select path from pic_paths where label = 'a3') then
    raise exception 'FAIL: overlapping replacements did not each hand back the previous file';
  end if;
  raise notice 'PASS: overlapping replacements end with the newest picture, and every replaced file is handed back for deletion';
end $$;
commit;

-- Expired uploads and revoked members can't commit.
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000e02","role":"authenticated"}', true);
set local role authenticated;
insert into pic_paths select 'b1', public.app_avatar_begin();
insert into pic_paths select 'b2', public.app_avatar_begin();
commit;
update social.avatar_uploads set created_at = now() - interval '16 minutes' where path = (select path from pic_paths where label = 'b1');
select ops.revoke_member_access('00000000-0000-4000-8000-000000000e02', 'test', 'test');
begin;
set local role service_role;
do $$
begin
  perform pg_temp.expect_error_pic(pg_catalog.format('select public.svc_avatar_commit(%L)', (select path from pic_paths where label = 'b1')), 'upload_expired', 'committing an upload older than 15 minutes');
  perform pg_temp.expect_error_pic(pg_catalog.format('select public.svc_avatar_commit(%L)', (select path from pic_paths where label = 'b2')), 'no_pilot_access', 'committing after the member was revoked');
  raise notice 'PASS: an upload can''t be committed after 15 minutes, or once the member''s access is revoked';
end $$;
commit;
do $$
begin
  if exists (select 1 from social.avatars where user_id = '00000000-0000-4000-8000-000000000e02') then
    raise exception 'FAIL: a revoked member got a picture';
  end if;
end $$;
select ops.grant_member_access('00000000-0000-4000-8000-000000000e02', 'tester', 'test');

-- ---------------------------------------------------------------------------
-- 3. Who sees which pictures.
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000e02","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  if (select path from public.app_avatars(array['00000000-0000-4000-8000-000000000e01'::uuid, '00000000-0000-4000-8000-000000000e04'::uuid]))
     <> (select path from pic_paths where label = 'a4') then
    raise exception 'FAIL: B does not see A''s current picture';
  end if;
  perform pg_temp.expect_error_pic('select * from public.app_avatars((select array_agg(gen_random_uuid()) from generate_series(1, 101)))', 'too_many', 'asking for 101 pictures');
  raise notice 'PASS: members see the current picture of visible members (at most 100 at a time)';
end $$;
commit;
-- Hidden by a moderator, or revoked: no picture for anyone.
insert into social.profile_details (user_id, hidden_at, onboarded_at) values ('00000000-0000-4000-8000-000000000e01', now(), now());
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000e02","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  if exists (select 1 from public.app_avatars(array['00000000-0000-4000-8000-000000000e01'::uuid])) then
    raise exception 'FAIL: a profile hidden by a moderator still shows its picture';
  end if;
end $$;
commit;
update social.profile_details set hidden_at = null where user_id = '00000000-0000-4000-8000-000000000e01';
select ops.revoke_member_access('00000000-0000-4000-8000-000000000e01', 'test', 'test');
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000e02","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  if exists (select 1 from public.app_avatars(array['00000000-0000-4000-8000-000000000e01'::uuid])) then
    raise exception 'FAIL: a revoked member''s picture is still handed out';
  end if;
  raise notice 'PASS: pictures of hidden profiles and revoked members are never handed out';
end $$;
commit;
select ops.grant_member_access('00000000-0000-4000-8000-000000000e01', 'tester', 'test');

-- ---------------------------------------------------------------------------
-- 4. Removing, and the 10-a-day limit (uploads started and removals).
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000e01","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  old text;
begin
  old := public.app_avatar_remove();
  if old <> (select path from pic_paths where label = 'a4') then
    raise exception 'FAIL: removing did not hand back the current file';
  end if;
  if public.app_avatar_remove() is not null then
    raise exception 'FAIL: removing twice handed back a file';
  end if;
  -- 4 uploads + 1 removal so far; 5 more changes are allowed, the 11th is not.
  for i in 1..5 loop
    perform public.app_avatar_begin();
  end loop;
  perform pg_temp.expect_error_pic('select public.app_avatar_begin()', 'rate_limited', 'an 11th change in a day');
  raise notice 'PASS: removing hands back the file once; at most 10 changes (uploads and removals) a day';
end $$;
commit;
do $$
begin
  perform pg_temp.expect_error_pic('update social.avatar_events set action = ''removed''', 'append-only', 'editing the avatar history');
  perform pg_temp.expect_error_pic('delete from social.avatar_events', 'append-only', 'erasing the avatar history');
end $$;

-- ---------------------------------------------------------------------------
-- 5. Storage cleanup: moderators only; dry run, then the exact phrase; it
--    never touches current pictures, recent files or live uploads.
insert into storage.objects (bucket_id, name, created_at, metadata) values
  -- old and unused: should be cleaned
  ('avatars', '00000000-0000-4000-8000-000000000e01/00000000-0000-4000-8000-0000000c0001.jpg', now() - interval '3 days', '{"size": 20000}'),
  ('avatars', '00000000-0000-4000-8000-000000000e02/00000000-0000-4000-8000-0000000c0002.jpg', now() - interval '2 days', '{"size": 30000}'),
  -- too recent (less than 24 hours): kept
  ('avatars', '00000000-0000-4000-8000-000000000e01/00000000-0000-4000-8000-0000000c0003.jpg', now() - interval '2 hours', '{"size": 10000}');
-- B's current picture (old, but in use): kept
insert into social.avatar_uploads (path, user_id, status, created_at) values ('00000000-0000-4000-8000-000000000e02/00000000-0000-4000-8000-0000000c0004.jpg', '00000000-0000-4000-8000-000000000e02', 'committed', now() - interval '5 days');
insert into social.avatars (user_id, path) values ('00000000-0000-4000-8000-000000000e02', '00000000-0000-4000-8000-000000000e02/00000000-0000-4000-8000-0000000c0004.jpg');
insert into storage.objects (bucket_id, name, created_at, metadata) values ('avatars', '00000000-0000-4000-8000-000000000e02/00000000-0000-4000-8000-0000000c0004.jpg', now() - interval '5 days', '{"size": 25000}');
-- An old object whose upload is still within the hour (clock skew, a slow upload): kept
insert into social.avatar_uploads (path, user_id, created_at) values ('00000000-0000-4000-8000-000000000e01/00000000-0000-4000-8000-0000000c0005.jpg', '00000000-0000-4000-8000-000000000e01', now() - interval '10 minutes');
insert into storage.objects (bucket_id, name, created_at, metadata) values ('avatars', '00000000-0000-4000-8000-000000000e01/00000000-0000-4000-8000-0000000c0005.jpg', now() - interval '2 days', '{"size": 5000}');
-- Another bucket: never touched
insert into storage.buckets (id, name) values ('elsewhere', 'elsewhere');
insert into storage.objects (bucket_id, name, created_at) values ('elsewhere', 'x.jpg', now() - interval '9 days');

begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000e01","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  perform pg_temp.expect_error_pic('select * from public.app_mod_storage_preview()', 'not_moderator', 'a member previewing cleanup');
  perform pg_temp.expect_error_pic('select * from public.app_mod_storage_cleanup_start(gen_random_uuid(), ''DELETE 0 FILES'')', 'not_moderator', 'a member confirming cleanup');
  perform pg_temp.expect_error_pic('select public.app_mod_storage_cleanup_finish(gen_random_uuid())', 'not_moderator', 'a member finishing cleanup');
  raise notice 'PASS: ordinary members can''t preview, confirm or finish storage cleanup';
end $$;
commit;

begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000e03","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  r record;
  started text[];
begin
  select * into r from public.app_mod_storage_preview();
  if r.file_count <> 2 or r.total_bytes <> 50000 or r.confirm_phrase <> 'DELETE 2 FILES' then
    raise exception 'FAIL: the dry run is wrong: %', r;
  end if;
  insert into pic_paths values ('plan', r.plan_id::text);
  perform pg_temp.expect_error_pic(pg_catalog.format('select * from public.app_mod_storage_cleanup_start(%L, ''delete 2 files'')', r.plan_id), 'confirmation_mismatch', 'confirming with the wrong phrase');
  raise notice 'PASS: the dry run lists only old, unused files (not current pictures, recent files, live uploads or other buckets), and needs the exact phrase';
end $$;
commit;

-- Between the dry run and the confirmation, one candidate becomes in use: the recheck drops it.
update social.avatar_uploads set status = 'committed' where path = '00000000-0000-4000-8000-000000000e01/00000000-0000-4000-8000-0000000c0005.jpg';
insert into social.avatar_uploads (path, user_id, status, created_at) values ('00000000-0000-4000-8000-000000000e01/00000000-0000-4000-8000-0000000c0001.jpg', '00000000-0000-4000-8000-000000000e01', 'committed', now() - interval '3 days');
insert into social.avatars (user_id, path) values ('00000000-0000-4000-8000-000000000e01', '00000000-0000-4000-8000-000000000e01/00000000-0000-4000-8000-0000000c0001.jpg');

begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000e03","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  started text[];
begin
  select array_agg(x) into started from public.app_mod_storage_cleanup_start((select path from pic_paths where label = 'plan')::uuid, 'DELETE 2 FILES') x;
  if started <> array['00000000-0000-4000-8000-000000000e02/00000000-0000-4000-8000-0000000c0002.jpg'] then
    raise exception 'FAIL: the confirmation did not recheck the files: %', started;
  end if;
  perform pg_temp.expect_error_pic(pg_catalog.format('select * from public.app_mod_storage_cleanup_start(%L, ''DELETE 2 FILES'')', (select path from pic_paths where label = 'plan')), 'not_open', 'confirming the same dry run twice');
  raise notice 'PASS: confirming rechecks every file and drops any that came into use; a dry run can be confirmed once';
end $$;
commit;

-- The Edge Function deletes the confirmed file from Storage (simulated), then finishes.
set storage.allow_delete_query = 'true';
delete from storage.objects where name = '00000000-0000-4000-8000-000000000e02/00000000-0000-4000-8000-0000000c0002.jpg';
reset storage.allow_delete_query;
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000e03","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  if public.app_mod_storage_cleanup_finish((select path from pic_paths where label = 'plan')::uuid) <> 1 then
    raise exception 'FAIL: the cleanup did not count the file actually deleted';
  end if;
  raise notice 'PASS: finishing records only files that are really gone from Storage';
end $$;
commit;
do $$
begin
  if (select string_agg(action || ':' || note, ' | ' order by id) from ops.moderation_actions where action like 'storage%')
     <> 'storage_cleanup_preview:dry run: 2 unused file(s), 50000 bytes | storage_cleanup:deleted 1 of 1 confirmed file(s)' then
    raise exception 'FAIL: the cleanup was not recorded: %', (select string_agg(action || ':' || note, ' | ' order by id) from ops.moderation_actions where action like 'storage%');
  end if;
  if not exists (select 1 from storage.objects where bucket_id = 'elsewhere') or not exists (select 1 from storage.objects where name like '%c0003.jpg') then
    raise exception 'FAIL: cleanup touched a recent file or another bucket';
  end if;
  raise notice 'PASS: every dry run and cleanup is recorded in the moderation audit trail';
end $$;

-- An expired dry run, or another moderator's, can't be confirmed.
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000e03","role":"authenticated"}', true);
set local role authenticated;
select plan_id::text as p from public.app_mod_storage_preview() \gset
commit;
update ops.storage_cleanup_plans set expires_at = now() - interval '1 minute' where id = :'p';
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000e03","role":"authenticated"}', true);
set local role authenticated;
select pg_temp.expect_error_pic(pg_catalog.format('select * from public.app_mod_storage_cleanup_start(%L, ''DELETE 0 FILES'')', :'p'), 'plan_expired', 'confirming an expired dry run');
commit;
select ops.revoke_moderator('00000000-0000-4000-8000-000000000e03', 'founder', 'test');
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000e03","role":"authenticated"}', true);
set local role authenticated;
select pg_temp.expect_error_pic('select * from public.app_mod_storage_preview()', 'not_moderator', 'a former moderator previewing cleanup');
commit;
do $$ begin raise notice 'PASS: expired dry runs and former moderators are refused'; end $$;

-- ---------------------------------------------------------------------------
-- 6. Orphans: recorded by the service role only; deleting an account removes its picture row.
begin;
set local role service_role;
select public.svc_avatar_orphan('00000000-0000-4000-8000-000000000e01/00000000-0000-4000-8000-0000000c0009.jpg', 'delete after replace failed');
select pg_temp.expect_error_pic('select public.svc_avatar_orphan(''../../etc/passwd'', ''x'')', 'invalid_request', 'recording a malformed path');
commit;
do $$
begin
  if not exists (select 1 from ops.storage_orphans where path like '%c0009.jpg' and deleted_at is null) then
    raise exception 'FAIL: the orphan was not recorded';
  end if;
  set local role supabase_auth_admin;
  delete from auth.users where id = '00000000-0000-4000-8000-000000000e02';
  reset role;
  if exists (select 1 from social.avatars where user_id = '00000000-0000-4000-8000-000000000e02') then
    raise exception 'FAIL: a deleted account kept its picture row';
  end if;
  raise notice 'PASS: failed steps record orphans (service role only); a deleted account''s picture row goes with it (its file is left for cleanup)';
end $$;

-- Leave the stand-in Storage as the audit expects (only the avatars bucket).
delete from storage.objects where bucket_id = 'elsewhere';
delete from storage.buckets where id = 'elsewhere';
