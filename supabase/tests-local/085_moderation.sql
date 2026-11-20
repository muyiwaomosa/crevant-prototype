-- TEST ONLY (throwaway databases). Essential moderation (20261124000000), as
-- real signed-in accounts calling the same functions the app calls.
--
--   A = ...0d01: an author (posts and a profile that get reported).
--   B = ...0d02, C = ...0d03: members who report.
--   M = ...0d04: a member granted moderation.
--   X = ...0d05: a member who is an invitation admin (ops.admins), NOT a moderator.
--   N = ...0d06: a complete profile, never granted pilot membership.

set role supabase_auth_admin;
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-4000-8000-000000000d01', 'mod-a@example.test', now()),
  ('00000000-0000-4000-8000-000000000d02', 'mod-b@example.test', now()),
  ('00000000-0000-4000-8000-000000000d03', 'mod-c@example.test', now()),
  ('00000000-0000-4000-8000-000000000d04', 'mod-m@example.test', now()),
  ('00000000-0000-4000-8000-000000000d05', 'mod-x@example.test', now()),
  ('00000000-0000-4000-8000-000000000d06', 'mod-n@example.test', now());
reset role;
update public.profiles set username = 'mod_a', display_name = 'Mod A' where id = '00000000-0000-4000-8000-000000000d01';
update public.profiles set username = 'mod_b', display_name = 'Mod B' where id = '00000000-0000-4000-8000-000000000d02';
update public.profiles set username = 'mod_c', display_name = 'Mod C' where id = '00000000-0000-4000-8000-000000000d03';
update public.profiles set username = 'mod_m', display_name = 'Mod M' where id = '00000000-0000-4000-8000-000000000d04';
update public.profiles set username = 'mod_x', display_name = 'Mod X' where id = '00000000-0000-4000-8000-000000000d05';
update public.profiles set username = 'mod_n', display_name = 'Mod N' where id = '00000000-0000-4000-8000-000000000d06';
select ops.grant_member_access(('00000000-0000-4000-8000-000000000d0' || i)::uuid, 'tester', 'test') from generate_series(1, 5) i;
insert into ops.admins (user_id, note) values ('00000000-0000-4000-8000-000000000d05', 'invitation admin only');
insert into social.profile_details (user_id, identity, bio, follow_reason, onboarded_at)
values ('00000000-0000-4000-8000-000000000d01', 'creator', 'A bio to be reported.', 'A reason to follow.', now());
insert into social.member_topics (user_id, topic) values ('00000000-0000-4000-8000-000000000d01', 'food');
-- B and C follow A before A posts, so A's posts are unseen for them.
insert into social.follows (follower_id, creator_id, followed_at) values
  ('00000000-0000-4000-8000-000000000d02', '00000000-0000-4000-8000-000000000d01', now() - interval '1 hour'),
  ('00000000-0000-4000-8000-000000000d03', '00000000-0000-4000-8000-000000000d01', now() - interval '1 hour');
insert into social.posts (id, author_id, body) values
  ('00000000-0000-4000-8000-00000000dd01', '00000000-0000-4000-8000-000000000d01', 'A post that gets hidden'),
  ('00000000-0000-4000-8000-00000000dd02', '00000000-0000-4000-8000-000000000d01', 'A post that gets dismissed'),
  ('00000000-0000-4000-8000-00000000dd03', '00000000-0000-4000-8000-000000000d01', 'A post its author deletes');
insert into social.comments (post_id, author_id, body) values ('00000000-0000-4000-8000-00000000dd01', '00000000-0000-4000-8000-000000000d02', 'A comment on the hidden post');

create function pg_temp.expect_error_mod(sql text, expected text, what text)
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
grant execute on function pg_temp.expect_error_mod(text, text, text) to authenticated, anon;

-- What a member can see of a post, through every member function that shows
-- posts, comments, likes or counts. Returns the places it still appears.
-- p_other_live: how many other live posts the author has (their counts must not exceed it).
create function pg_temp.post_appears(p_post uuid, p_author uuid, p_other_live integer)
returns text[]
language plpgsql
as $$
declare
  seen text[] := '{}';
  author_name text := (select username from public.profiles where id = p_author);
begin
  if exists (select 1 from public.app_feed(null, 50) f where f.id = p_post) then seen := seen || 'feed'::text; end if;
  if exists (select 1 from public.app_member_posts(p_author, null, 50) f where f.id = p_post) then seen := seen || 'profile posts'::text; end if;
  if exists (select 1 from public.app_post(p_post)) then seen := seen || 'post'::text; end if;
  if exists (select 1 from public.app_comments(p_post)) then seen := seen || 'comments'::text; end if;
  if exists (select 1 from public.app_catch_up(p_author, null, null) f where f.id = p_post) then seen := seen || 'catch-up'::text; end if;
  if exists (select 1 from public.app_unseen_creators() u where u.id = p_author and u.unseen_count > p_other_live) then seen := seen || 'unseen strip'::text; end if;
  if (select post_count from public.app_member(author_name)) > p_other_live then seen := seen || 'profile count'::text; end if;
  if coalesce((select post_count from public.app_discover(author_name, 5) where id = p_author), 0) > p_other_live then seen := seen || 'discover count'::text; end if;
  if coalesce((select post_count from public.app_discover_people(author_name, null, 5) where id = p_author), 0) > p_other_live then seen := seen || 'discover people count'::text; end if;
  begin
    perform public.app_like(p_post);
    seen := seen || 'like'::text;
    perform public.app_unlike(p_post);
  exception when others then null;
  end;
  begin
    perform public.app_add_comment(p_post, 'Can I still comment?', gen_random_uuid());
    seen := seen || 'comment'::text;
  exception when others then null;
  end;
  if public.app_mark_viewed(array[p_post], 'visible') > 0 then seen := seen || 'view'::text; end if;
  return seen;
end;
$$;
grant execute on function pg_temp.post_appears(uuid, uuid, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 1. Moderators: server-granted only, recorded, not implied by anything else.
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000d02","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  perform pg_temp.expect_error_mod($q$select ops.grant_moderator('00000000-0000-4000-8000-000000000d02', 'me')$q$, 'permission denied', 'B making themselves a moderator');
  perform pg_temp.expect_error_mod($q$insert into ops.moderators (user_id, granted_by) values ('00000000-0000-4000-8000-000000000d02', 'me')$q$, 'permission denied', 'B inserting a moderator row');
  perform pg_temp.expect_error_mod($q$select social.current_moderator()$q$, 'permission denied', 'B calling the moderator helper');
  perform pg_temp.expect_error_mod($q$select count(*) from ops.content_reports$q$, 'permission denied', 'B reading reports');
  perform pg_temp.expect_error_mod($q$select count(*) from ops.moderation_actions$q$, 'permission denied', 'B reading the audit trail');
  perform pg_temp.expect_error_mod($q$select ops.purge_expired_report_data(1)$q$, 'permission denied', 'B running the retention purge');
  perform pg_temp.expect_error_mod($q$select ops.set_report_hold(gen_random_uuid(), true, 'me', 'x')$q$, 'permission denied', 'B setting a hold');
  raise notice 'PASS: members can''t grant moderation, read reports or the audit trail, or run the purge or holds';
end $$;
commit;

do $$
begin
  perform pg_temp.expect_error_mod($q$select ops.grant_moderator('00000000-0000-4000-8000-000000000d06', 'founder')$q$, 'active pilot members', 'granting moderation to a non-member');
  perform pg_temp.expect_error_mod($q$select ops.grant_moderator(gen_random_uuid(), 'founder')$q$, 'no confirmed account', 'granting moderation to nobody');
  perform ops.grant_moderator('00000000-0000-4000-8000-000000000d04', 'founder', 'initial moderator');
  perform pg_temp.expect_error_mod($q$select ops.grant_moderator('00000000-0000-4000-8000-000000000d04', 'founder')$q$, 'already a moderator', 'granting twice');
  perform pg_temp.expect_error_mod($q$update ops.moderators set granted_by = 'x'$q$, 'never edited', 'editing a moderator row');
  if (select string_agg(action || ':' || actor || ':' || coalesce(reason, '-') || ':' || db_session_user, ',') from ops.moderator_events
      where user_id = '00000000-0000-4000-8000-000000000d04') <> 'granted:founder:initial moderator:' || session_user then
    raise exception 'FAIL: the grant was not recorded with who made it';
  end if;
  perform pg_temp.expect_error_mod($q$update ops.moderator_events set actor = 'x'$q$, 'append-only', 'editing moderator history');
  perform pg_temp.expect_error_mod($q$delete from ops.moderator_events$q$, 'append-only', 'erasing moderator history');
  if ops.moderator_active('00000000-0000-4000-8000-000000000d05') then
    raise exception 'FAIL: an invitation admin is a moderator';
  end if;
  raise notice 'PASS: moderation is granted only by server code, only to active members, recorded with who granted it, and not implied by ops.admins';
end $$;

-- X (an invitation admin) and B are not moderators.
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000d05","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  if public.app_is_moderator() then
    raise exception 'FAIL: the invitation admin is shown as a moderator';
  end if;
  perform pg_temp.expect_error_mod('select * from public.app_mod_queue()', 'not_moderator', 'X reading the queue');
  perform pg_temp.expect_error_mod('select * from public.app_mod_report(gen_random_uuid())', 'not_moderator', 'X reading a report');
  perform pg_temp.expect_error_mod('select public.app_mod_hide(gen_random_uuid())', 'not_moderator', 'X hiding');
  perform pg_temp.expect_error_mod('select public.app_mod_restore(gen_random_uuid())', 'not_moderator', 'X restoring');
  perform pg_temp.expect_error_mod('select public.app_mod_dismiss(gen_random_uuid())', 'not_moderator', 'X dismissing');
  raise notice 'PASS: an invitation admin who is not a moderator can''t use any moderation function';
end $$;
commit;

begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000d06","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  perform pg_temp.expect_error_mod($q$select public.app_report('post', '00000000-0000-4000-8000-00000000dd01', 'spam')$q$, 'no_pilot_access', 'N reporting');
  perform pg_temp.expect_error_mod('select public.app_is_moderator()', 'no_pilot_access', 'N asking whether they moderate');
  perform pg_temp.expect_error_mod('select * from public.app_mod_queue()', 'no_pilot_access', 'N reading the queue');
  raise notice 'PASS: without pilot membership, reporting and moderation are refused (no_pilot_access)';
end $$;
commit;

-- ---------------------------------------------------------------------------
-- 2. Reporting.
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000d02","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  perform public.app_report('post', '00000000-0000-4000-8000-00000000dd01', 'harassment', '  This is aimed at me.  ');
  perform pg_temp.expect_error_mod($q$select public.app_report('post', '00000000-0000-4000-8000-00000000dd01', 'spam')$q$, 'already_reported', 'reporting the same post twice');
  perform pg_temp.expect_error_mod($q$select public.app_report('profile', '00000000-0000-4000-8000-000000000d02', 'spam')$q$, 'cannot_report_self', 'reporting yourself');
  perform pg_temp.expect_error_mod($q$select public.app_report('post', '00000000-0000-4000-8000-00000000dd02', 'rude')$q$, 'invalid_reason', 'an unknown reason');
  perform pg_temp.expect_error_mod($q$select public.app_report('comment', '00000000-0000-4000-8000-00000000dd02', 'spam')$q$, 'invalid_request', 'an unknown target type');
  perform pg_temp.expect_error_mod($q$select public.app_report('post', '00000000-0000-4000-8000-00000000dd02', 'spam', repeat('x', 501))$q$, 'too_long', 'details over 500 characters');
  perform pg_temp.expect_error_mod($q$select public.app_report('post', gen_random_uuid(), 'spam')$q$, 'not_found', 'a post that does not exist');
  perform pg_temp.expect_error_mod($q$select public.app_report('profile', '00000000-0000-4000-8000-000000000d06', 'spam')$q$, 'not_found', 'a profile the reporter can''t see');
  perform public.app_report('profile', '00000000-0000-4000-8000-000000000d01', 'impersonation', E'Line one\nLine two');
  -- Still visible: a report hides nothing by itself.
  if not exists (select 1 from public.app_feed(null, 50) where id = '00000000-0000-4000-8000-00000000dd01') then
    raise exception 'FAIL: reporting a post hid it';
  end if;
  if (select bio from public.app_member_details('00000000-0000-4000-8000-000000000d01')) is null then
    raise exception 'FAIL: reporting a profile hid it';
  end if;
  raise notice 'PASS: a member reports a post and a profile; duplicates, self-reports, bad reasons and unseen targets are refused; nothing is hidden by a report';
end $$;
commit;

-- Separate transactions, so each report has its own time.
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000d03","role":"authenticated"}', true);
set local role authenticated;
select public.app_report('post', '00000000-0000-4000-8000-00000000dd01', 'violence', 'They threatened someone.');
commit;
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000d03","role":"authenticated"}', true);
set local role authenticated;
select public.app_report('post', '00000000-0000-4000-8000-00000000dd02', 'spam');
commit;
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000d03","role":"authenticated"}', true);
set local role authenticated;
select public.app_report('post', '00000000-0000-4000-8000-00000000dd03', 'self_harm');
commit;

do $$
begin
  if (select string_agg(reason || ':' || priority, ',' order by created_at) from ops.content_reports)
     <> 'harassment:false,impersonation:false,violence:true,spam:false,self_harm:true' then
    raise exception 'FAIL: reports or their priority are wrong: %', (select string_agg(reason || ':' || priority, ',' order by created_at) from ops.content_reports);
  end if;
  if (select details from ops.content_reports where reason = 'harassment') <> 'This is aimed at me.'
     or (select snapshot->>'body' from ops.content_reports where reason = 'harassment') <> 'A post that gets hidden'
     or (select snapshot->>'bio' from ops.content_reports where reason = 'impersonation') <> 'A bio to be reported.'
     or (select target_owner_id from ops.content_reports where reason = 'harassment') <> '00000000-0000-4000-8000-000000000d01' then
    raise exception 'FAIL: the report did not keep its details, snapshot or target owner';
  end if;
  raise notice 'PASS: threats and self-harm are flagged for priority review; details and a snapshot are kept';
end $$;

-- Rate limits: 10 an hour, 30 a day (earlier reports filled in by server code).
insert into ops.content_reports (reporter_id, target_type, target_id, reason, priority, status, created_at, resolved_at)
select '00000000-0000-4000-8000-000000000d03', 'post', gen_random_uuid(), 'spam', false, 'dismissed', now() - interval '5 minutes', now()
from generate_series(1, 7);
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000d03","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  perform pg_temp.expect_error_mod($q$select public.app_report('profile', '00000000-0000-4000-8000-000000000d01', 'spam')$q$, 'rate_limited', 'an 11th report within the hour');
  raise notice 'PASS: at most 10 reports an hour';
end $$;
commit;
update ops.content_reports set created_at = now() - interval '3 hours' where reporter_id = '00000000-0000-4000-8000-000000000d03' and status = 'dismissed';
insert into ops.content_reports (reporter_id, target_type, target_id, reason, priority, status, created_at, resolved_at)
select '00000000-0000-4000-8000-000000000d03', 'post', gen_random_uuid(), 'spam', false, 'dismissed', now() - interval '5 hours', now()
from generate_series(1, 20);
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000d03","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  perform pg_temp.expect_error_mod($q$select public.app_report('profile', '00000000-0000-4000-8000-000000000d01', 'spam')$q$, 'rate_limited', 'a 31st report within the day');
  raise notice 'PASS: at most 30 reports a day';
end $$;
commit;
delete from ops.content_reports where reporter_id = '00000000-0000-4000-8000-000000000d03' and status = 'dismissed';

-- ---------------------------------------------------------------------------
-- 3. Confidentiality: no member-facing function can return who reported.
do $$
begin
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'app\_%'
      and (exists (select 1 from unnest(coalesce(p.proargnames, '{}')) a where a ~* 'reporter')
           or pg_get_function_result(p.oid) ~* 'reporter')
  ) then
    raise exception 'FAIL: a member function returns a reporter';
  end if;
  raise notice 'PASS: no member function returns or takes a reporter';
end $$;

-- ---------------------------------------------------------------------------
-- 4. The moderator's queue and report view never include the reporter.
create temp table mod_expected_queue as
select string_agg(reason || ':' || priority, ',' order by priority desc, created_at, id) as expected from ops.content_reports where status = 'open';
grant select on mod_expected_queue to authenticated;
create temp table mod_report_ids as select id, reason from ops.content_reports;
grant select on mod_report_ids to authenticated;
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000d04","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  q text;
  r record;
begin
  if not public.app_is_moderator() then
    raise exception 'FAIL: the moderator is not recognised';
  end if;
  select string_agg(reason || ':' || priority, ',' order by ord) into q
  from (select *, row_number() over () ord from public.app_mod_queue()) s;
  -- Priority (threats, self-harm) first, then oldest first.
  if q <> (select expected from mod_expected_queue)
     or q !~ '^(violence|self_harm):true,(violence|self_harm):true,' then
    raise exception 'FAIL: the queue is not priority first, then oldest: %', q;
  end if;
  -- Nothing returned names or identifies a reporter.
  if exists (select 1 from public.app_mod_queue() x where x::text ~ '(000000000d02|000000000d03|mod_b|mod_c|Mod B|Mod C)')
     or exists (select 1 from public.app_mod_queue('resolved') x where x::text ~ '(000000000d02|000000000d03)') then
    raise exception 'FAIL: the queue identifies a reporter';
  end if;
  for r in select id from mod_report_ids loop
    if exists (select 1 from public.app_mod_report(r.id) x where x::text ~ '(000000000d02|000000000d03|mod_b|mod_c|Mod B|Mod C)') then
      raise exception 'FAIL: a report view identifies the reporter';
    end if;
  end loop;
  select * into r from public.app_mod_report((select id from mod_report_ids where reason = 'harassment'));
  if r.target_state <> 'live' or r.current_body <> 'A post that gets hidden' or r.open_reports_for_target <> 2 or r.details <> 'This is aimed at me.' then
    raise exception 'FAIL: the report view is wrong: %', r;
  end if;
  raise notice 'PASS: the moderator sees the queue (priority first) and each report with its target''s state, and never who reported';
end $$;
commit;

-- ---------------------------------------------------------------------------
-- 5. Hide: the post disappears everywhere, for everyone, including its author.
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000d04","role":"authenticated"}', true);
set local role authenticated;
select public.app_mod_hide((select id from mod_report_ids where reason = 'harassment'), 'Targeted harassment.');
commit;

do $$
declare
  who text;
  seen text[];
begin
  foreach who in array array['00000000-0000-4000-8000-000000000d01', '00000000-0000-4000-8000-000000000d02', '00000000-0000-4000-8000-000000000d03', '00000000-0000-4000-8000-000000000d04'] loop
    perform set_config('request.jwt.claims', pg_catalog.format('{"sub":"%s","role":"authenticated"}', who), true);
    set local role authenticated;
    -- A's two other posts are still live, so A's counts must be exactly 2.
    seen := pg_temp.post_appears('00000000-0000-4000-8000-00000000dd01', '00000000-0000-4000-8000-000000000d01', 2);
    reset role;
    if cardinality(seen) > 0 then
      raise exception 'FAIL: the hidden post still appears for % in: %', who, seen;
    end if;
  end loop;
  if (select status from ops.content_reports where reason = 'violence') <> 'hidden' or (select status from ops.content_reports where reason = 'harassment') <> 'hidden' then
    raise exception 'FAIL: hiding did not resolve every open report on the post';
  end if;
  if (select string_agg(action || ':' || target_type || ':' || coalesce(note, '-') || ':' || actor_label, ',') from ops.moderation_actions) <> 'hide:post:Targeted harassment.:moderator'
     or (select actor_id from ops.moderation_actions where action = 'hide') <> '00000000-0000-4000-8000-000000000d04' then
    raise exception 'FAIL: the hide was not recorded';
  end if;
  raise notice 'PASS: a hidden post appears nowhere (feed, profile, post, comments, likes, new comments, catch-up, unseen strip, counts, Discover, views) for anyone, its open reports are resolved, and the action is recorded';
end $$;

begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000d01","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  perform pg_temp.expect_error_mod($q$select public.app_delete_post('00000000-0000-4000-8000-00000000dd01')$q$, 'not_found', 'the author deleting their hidden post');
  perform pg_temp.expect_error_mod($q$select public.app_report('post', '00000000-0000-4000-8000-00000000dd01', 'spam')$q$, 'not_found', 'reporting a hidden post');
  raise notice 'PASS: a hidden post can''t be touched or reported through any member function';
end $$;
commit;

-- Restore brings it back, exactly.
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000d04","role":"authenticated"}', true);
set local role authenticated;
select public.app_mod_restore((select id from mod_report_ids where reason = 'violence'), 'Context changes things.');
commit;
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000d02","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  if not exists (select 1 from public.app_feed(null, 50) where id = '00000000-0000-4000-8000-00000000dd01')
     or not exists (select 1 from public.app_comments('00000000-0000-4000-8000-00000000dd01')) then
    raise exception 'FAIL: restoring did not bring the post and its comments back';
  end if;
  raise notice 'PASS: Restore brings a hidden post back, with its comments';
end $$;
commit;
do $$
begin
  if (select string_agg(distinct status, ',') from ops.content_reports where target_id = '00000000-0000-4000-8000-00000000dd01') <> 'restored'
     or (select count(*) from ops.moderation_actions where action = 'restore') <> 1 then
    raise exception 'FAIL: the restore was not recorded';
  end if;
end $$;

-- Restore never brings back a post its author deleted; Dismiss leaves content alone.
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000d01","role":"authenticated"}', true);
set local role authenticated;
select public.app_delete_post('00000000-0000-4000-8000-00000000dd03');
commit;
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000d04","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  if (select target_state from public.app_mod_report((select id from mod_report_ids where reason = 'self_harm'))) <> 'deleted_by_author' then
    raise exception 'FAIL: the report does not show the author deleted the post';
  end if;
  perform pg_temp.expect_error_mod($q$select public.app_mod_restore((select id from mod_report_ids where reason = 'self_harm'))$q$, 'permission denied|not_hidden', 'restoring an author-deleted post');
  perform pg_temp.expect_error_mod($q$select public.app_mod_hide((select id from mod_report_ids where reason = 'self_harm'))$q$, 'permission denied|not_live', 'hiding an author-deleted post');
  perform public.app_mod_dismiss((select id from mod_report_ids where reason = 'spam'), null);
  perform pg_temp.expect_error_mod($q$select public.app_mod_dismiss((select id from mod_report_ids where reason = 'spam'))$q$, 'permission denied|not_open', 'dismissing twice');
  perform pg_temp.expect_error_mod($q$select public.app_mod_hide(gen_random_uuid())$q$, 'not_found', 'hiding an unknown report');
  perform pg_temp.expect_error_mod($q$select public.app_mod_hide(gen_random_uuid(), repeat('x', 501))$q$, 'too_long', 'a note over 500 characters');
  raise notice 'PASS: Restore never revives an author-deleted post; Dismiss resolves without touching content; bad requests are refused';
end $$;
commit;
do $$
begin
  if (select deleted_at from social.posts where id = '00000000-0000-4000-8000-00000000dd03') is null
     or (select deleted_at from social.posts where id = '00000000-0000-4000-8000-00000000dd02') is not null
     or (select status from ops.content_reports where reason = 'spam') <> 'dismissed' then
    raise exception 'FAIL: restore or dismiss changed content it should not have';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Hiding a profile: its details disappear for others (not its name).
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000d04","role":"authenticated"}', true);
set local role authenticated;
select public.app_mod_hide((select id from mod_report_ids where reason = 'impersonation'), 'Pretending to be someone else.');
commit;
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000d02","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  d record;
begin
  select * into d from public.app_member_details('00000000-0000-4000-8000-000000000d01');
  if d.identity is not null or d.bio is not null or d.follow_reason is not null or d.topics <> '{}' then
    raise exception 'FAIL: hidden profile details still show on the profile: %', d;
  end if;
  select * into d from public.app_discover_people('mod_a', null, 5);
  if d.bio is not null or d.follow_reason is not null or d.identity is not null or d.topics <> '{}' or d.shared_topics <> 0 then
    raise exception 'FAIL: hidden profile details still show in Discover: %', d;
  end if;
  if exists (select 1 from public.app_discover_people(null, 'food', 50) where id = '00000000-0000-4000-8000-000000000d01') then
    raise exception 'FAIL: a hidden profile is still found by interest';
  end if;
  if exists (select 1 from public.app_suggested_creators(20) where id = '00000000-0000-4000-8000-000000000d01' and (bio is not null or follow_reason is not null)) then
    raise exception 'FAIL: hidden profile details still show in suggestions';
  end if;
  if not exists (select 1 from public.app_member('mod_a')) then
    raise exception 'FAIL: hiding details removed the member';
  end if;
  raise notice 'PASS: a hidden profile''s bio, reason, identity and interests disappear from its page, Discover, interest search and suggestions (the member stays)';
end $$;
commit;
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000d04","role":"authenticated"}', true);
set local role authenticated;
select public.app_mod_restore((select id from mod_report_ids where reason = 'impersonation'), null);
commit;
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000d02","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  if (select bio from public.app_member_details('00000000-0000-4000-8000-000000000d01')) <> 'A bio to be reported.' then
    raise exception 'FAIL: restoring the profile did not bring its details back';
  end if;
  raise notice 'PASS: Restore brings a hidden profile''s details back';
end $$;
commit;

-- ---------------------------------------------------------------------------
-- 7. The audit trail is append-only.
do $$
begin
  perform pg_temp.expect_error_mod($q$update ops.moderation_actions set note = 'x'$q$, 'append-only', 'editing the audit trail');
  perform pg_temp.expect_error_mod($q$delete from ops.moderation_actions$q$, 'append-only', 'erasing the audit trail');
  perform pg_temp.expect_error_mod($q$truncate ops.moderation_actions$q$, 'append-only', 'truncating the audit trail');
  if (select string_agg(action, ',' order by id) from ops.moderation_actions) <> 'hide,restore,dismiss,hide,restore' then
    raise exception 'FAIL: the audit trail is incomplete: %', (select string_agg(action, ',' order by id) from ops.moderation_actions);
  end if;
  raise notice 'PASS: every moderation action is in an append-only audit trail';
end $$;

-- ---------------------------------------------------------------------------
-- 8. Retention: 90 days after resolution, details and snapshots are erased,
--    unless on hold. Triggered by any report or queue load.
update ops.content_reports set resolved_at = now() - interval '91 days' where status <> 'open';
select ops.set_report_hold((select id from mod_report_ids where reason = 'harassment'), true, 'founder', 'Kept for a safety follow-up.');
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000d04","role":"authenticated"}', true);
set local role authenticated;
select count(*) from public.app_mod_queue();
commit;
do $$
begin
  if exists (select 1 from ops.content_reports where status <> 'open' and not legal_hold and (snapshot is not null or details is not null or data_purged_at is null)) then
    raise exception 'FAIL: expired report data was not erased';
  end if;
  if (select snapshot is null or details is null from ops.content_reports where reason = 'harassment') then
    raise exception 'FAIL: a report on hold was erased';
  end if;
  if exists (select 1 from ops.content_reports where status = 'open' and snapshot is null) then
    raise exception 'FAIL: an open report was erased';
  end if;
  if (select count(*) from ops.moderation_actions where action = 'retention_purge') <> 1
     or (select count(*) from ops.moderation_actions where action = 'hold_set') <> 1 then
    raise exception 'FAIL: the purge or the hold was not recorded';
  end if;
  perform pg_temp.expect_error_mod($q$select ops.set_report_hold((select id from ops.content_reports where data_purged_at is not null limit 1), true, 'founder', 'too late')$q$, 'already erased', 'holding erased data');
  perform pg_temp.expect_error_mod($q$select ops.purge_expired_report_data(0)$q$, 'at least one day', 'a zero-day purge');
  raise notice 'PASS: 90 days after resolution, details and snapshots are erased (not held or open reports), and the purge and holds are recorded';
end $$;

-- ---------------------------------------------------------------------------
-- 9. Losing moderation or membership takes effect at once.
select ops.revoke_member_access('00000000-0000-4000-8000-000000000d04', 'test', 'test');
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000d04","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  perform pg_temp.expect_error_mod('select * from public.app_mod_queue()', 'no_pilot_access', 'a moderator whose membership was revoked');
  raise notice 'PASS: a moderator whose pilot membership is revoked can no longer moderate';
end $$;
commit;
select ops.grant_member_access('00000000-0000-4000-8000-000000000d04', 'tester', 'test');
select ops.revoke_moderator('00000000-0000-4000-8000-000000000d04', 'founder', 'no longer needed');
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000d04","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  perform pg_temp.expect_error_mod('select * from public.app_mod_queue()', 'not_moderator', 'a former moderator');
  if public.app_is_moderator() then
    raise exception 'FAIL: a former moderator is still a moderator';
  end if;
end $$;
commit;
do $$
begin
  if (select string_agg(action || ':' || actor || ':' || coalesce(reason, '-'), ',' order by id) from ops.moderator_events where user_id = '00000000-0000-4000-8000-000000000d04')
     <> 'granted:founder:initial moderator,revoked:founder:no longer needed' then
    raise exception 'FAIL: the revocation was not recorded';
  end if;
  raise notice 'PASS: revoking moderation takes effect at once and is recorded';
end $$;

-- Deleting a reporter's account keeps the report, without the reporter.
do $$
begin
  set local role supabase_auth_admin;
  delete from auth.users where id = '00000000-0000-4000-8000-000000000d03';
  reset role;
  if exists (select 1 from ops.content_reports where reporter_id = '00000000-0000-4000-8000-000000000d03')
     or not exists (select 1 from ops.content_reports where reason = 'violence') then
    raise exception 'FAIL: deleting the reporter lost the report or kept their id';
  end if;
  raise notice 'PASS: deleting a reporter''s account keeps their reports, without the reporter';
end $$;
