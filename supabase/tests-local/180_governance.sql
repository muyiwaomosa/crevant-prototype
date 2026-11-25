-- TEST ONLY (throwaway databases). Governance (20261206000000): blocking,
-- comment reports, the enforcement ladder, author notices and appeals, and
-- their effect on points.
--
--   D = ...7101 moderator      E = ...7102 a second moderator
--   A = ...7103 blocks B       B = ...7104 is blocked     C = ...7105 bystander
--   X = ...7106 breaks the rules
\set ON_ERROR_STOP on

set role supabase_auth_admin;
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-4000-8000-fdfdfd007101', 'gv-d@example.test', now(), '{}'),
  ('00000000-0000-4000-8000-fdfdfd007102', 'gv-e@example.test', now(), '{}'),
  ('00000000-0000-4000-8000-fdfdfd007103', 'gv-a@example.test', now(), '{}'),
  ('00000000-0000-4000-8000-fdfdfd007104', 'gv-b@example.test', now(), '{}'),
  ('00000000-0000-4000-8000-fdfdfd007105', 'gv-c@example.test', now(), '{}'),
  ('00000000-0000-4000-8000-fdfdfd007106', 'gv-x@example.test', now(), '{}');
reset role;
update public.profiles p set username = 'gv_' || v.u, display_name = 'Gv ' || upper(v.u)
from (values ('7101', 'd'), ('7102', 'e'), ('7103', 'a'), ('7104', 'b'), ('7105', 'c'), ('7106', 'x')) v(n, u)
where p.id = ('00000000-0000-4000-8000-fdfdfd00' || v.n)::uuid;
select ops.grant_member_access(('00000000-0000-4000-8000-fdfdfd00' || n)::uuid, 'fan', 'gv-test')
from unnest(array['7101', '7102', '7103', '7104', '7105', '7106']) n;
select ops.grant_moderator('00000000-0000-4000-8000-fdfdfd007101', 'founder', 'gv-test');
select ops.grant_moderator('00000000-0000-4000-8000-fdfdfd007102', 'founder', 'gv-test');

create function pg_temp.expect_error(sql text, expected text, what text)
returns void language plpgsql as $$
declare got text;
begin
  begin execute sql; exception when others then got := sqlerrm; end;
  if got is null then raise exception 'FAIL: % succeeded, expected "%"', what, expected; end if;
  if got !~ expected then raise exception 'FAIL: % failed with "%", expected "%"', what, got, expected; end if;
end; $$;
grant execute on function pg_temp.expect_error(text, text, text) to authenticated, anon;
create function pg_temp.g(n text) returns uuid language sql immutable as $$ select ('00000000-0000-4000-8000-fdfdfd00' || n)::uuid $$;
grant execute on function pg_temp.g(text) to authenticated, anon;
create function pg_temp.as_member(n text) returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-fdfdfd00' || n || '","role":"authenticated"}', true) $$;
grant execute on function pg_temp.as_member(text) to authenticated, anon;

insert into social.posts (id, author_id, body) values
  (pg_temp.g('7201'), pg_temp.g('7104'), 'B post'),
  (pg_temp.g('7202'), pg_temp.g('7103'), 'A post'),
  (pg_temp.g('7203'), pg_temp.g('7105'), 'C post'),
  (pg_temp.g('7204'), pg_temp.g('7106'), 'X post');
insert into social.follows (follower_id, creator_id) values
  (pg_temp.g('7103'), pg_temp.g('7104')), (pg_temp.g('7104'), pg_temp.g('7103')),
  (pg_temp.g('7105'), pg_temp.g('7104')), (pg_temp.g('7105'), pg_temp.g('7106'));
insert into social.clique_members (fan_id, creator_id) values (pg_temp.g('7103'), pg_temp.g('7104'));

-- ---------------------------------------------------------------------------
-- 1. Blocking: two way, immediate, ends follows and Clique, reporting still works.
begin;
select pg_temp.as_member('7103');
set local role authenticated;
do $$
begin
  perform pg_temp.expect_error($q$select public.app_block(pg_temp.g('7103'))$q$, 'cannot_block_self', 'blocking yourself');
  perform public.app_block(pg_temp.g('7104'));
  perform public.app_block(pg_temp.g('7104')); -- again: nothing changes
  if exists (select 1 from public.app_member('gv_b')) then
    raise exception 'FAIL: A still sees B''s profile after blocking';
  end if;
  perform pg_temp.expect_error($q$select public.app_follow(pg_temp.g('7104'))$q$, 'not_found', 'following someone you blocked');
  perform pg_temp.expect_error($q$select public.app_add_comment(pg_temp.g('7201'), 'Hello there')$q$, 'not_found', 'commenting on a blocked member''s post');
  if (select count(*) from public.app_my_blocks()) <> 1 or (select username from public.app_my_blocks()) <> 'gv_b' then
    raise exception 'FAIL: A''s block list is wrong';
  end if;
  -- Reporting the blocked member still works.
  perform public.app_report('post', pg_temp.g('7201'), 'harassment', 'Kept messaging me');
end $$;
commit;
begin;
select pg_temp.as_member('7104');
set local role authenticated;
do $$
begin
  if exists (select 1 from public.app_member('gv_a')) then
    raise exception 'FAIL: B still sees A after A blocked B';
  end if;
  perform pg_temp.expect_error($q$select public.app_follow(pg_temp.g('7103'))$q$, 'not_found', 'the blocked member following back');
  perform pg_temp.expect_error($q$select public.app_add_comment(pg_temp.g('7202'), 'Hello there')$q$, 'not_found', 'the blocked member commenting');
  if exists (select 1 from public.app_my_blocks()) then
    raise exception 'FAIL: B can see that A blocked them';
  end if;
end $$;
commit;
begin;
select pg_temp.as_member('7105');
set local role authenticated;
do $$
begin
  if not exists (select 1 from public.app_member('gv_a')) or not exists (select 1 from public.app_member('gv_b')) then
    raise exception 'FAIL: a bystander lost sight of A or B';
  end if;
end $$;
commit;
do $$
begin
  if exists (select 1 from social.follows where (follower_id, creator_id) in ((pg_temp.g('7103'), pg_temp.g('7104')), (pg_temp.g('7104'), pg_temp.g('7103')))) then
    raise exception 'FAIL: follows between A and B survived the block';
  end if;
  if (select count(*) from social.follow_events where action = 'unfollowed' and source = 'block') <> 2 then
    raise exception 'FAIL: the two follows ended by the block were not recorded with the reason';
  end if;
  if not exists (select 1 from social.clique_members where fan_id = pg_temp.g('7103') and creator_id = pg_temp.g('7104') and removal_reason = 'blocked') then
    raise exception 'FAIL: the Clique membership was not closed by the block';
  end if;
  if not exists (select 1 from ops.content_reports where target_id = pg_temp.g('7201') and status = 'open') then
    raise exception 'FAIL: the report on the blocked member was not recorded';
  end if;
  perform pg_temp.expect_error($q$update social.block_events set action = 'unblocked'$q$, 'append-only', 'rewriting block history');
  raise notice 'PASS: a block is two way and immediate, ends follows and Clique (recorded), is never shown to the blocked member, and still allows a report';
end $$;
begin;
select pg_temp.as_member('7103');
set local role authenticated;
do $$
begin
  perform public.app_unblock(pg_temp.g('7104'));
  if not exists (select 1 from public.app_member('gv_b')) then
    raise exception 'FAIL: B is still hidden after unblocking';
  end if;
  if exists (select 1 from public.app_member('gv_b') where followed_by_me) then
    raise exception 'FAIL: unblocking restored a follow';
  end if;
  perform public.app_follow(pg_temp.g('7104'));
end $$;
commit;
do $$ begin raise notice 'PASS: unblocking makes both visible again without restoring follows'; end $$;

-- ---------------------------------------------------------------------------
-- 2. Comment reports, hiding a comment and a post, author notices, points reversed.
begin;
select pg_temp.as_member('7106');
set local role authenticated;
select set_config('gv.comment', public.app_add_comment(pg_temp.g('7203'), 'You are all terrible at this, honestly.')::text, false);
commit;
begin;
select pg_temp.as_member('7105');
set local role authenticated;
do $$
begin
  perform public.app_save(pg_temp.g('7204'));       -- C earns 2 on X's post
  perform public.app_report('comment', current_setting('gv.comment')::uuid, 'harassment');
  perform public.app_report('post', pg_temp.g('7204'), 'spam');
  perform pg_temp.expect_error($q$select public.app_report('comment', gen_random_uuid(), 'spam')$q$, 'not_found', 'reporting an unknown comment');
end $$;
commit;
do $$
begin
  if (select sum(points) from sim.points_ledger where member_id = pg_temp.g('7106') and action = 'meaningful_comment') <> 2
     or (select sum(points) from sim.points_ledger where member_id = pg_temp.g('7105') and action = 'save') <> 2 then
    raise exception 'FAIL: the setup points are not as expected';
  end if;
end $$;
select set_config('gv.comment_report', (select id::text from ops.content_reports where target_type = 'comment' and status = 'open'), false);
select set_config('gv.post_report', (select id::text from ops.content_reports where target_id = pg_temp.g('7204') and status = 'open'), false);
begin;
select pg_temp.as_member('7101');
set local role authenticated;
do $$
declare r record;
begin
  select * into r from public.app_mod_report(current_setting('gv.comment_report')::uuid);
  if r.target_type <> 'comment' or r.target_state <> 'live' or r.current_body !~ 'terrible' then
    raise exception 'FAIL: the comment report detail is wrong: % % %', r.target_type, r.target_state, r.current_body;
  end if;
  perform public.app_mod_hide(current_setting('gv.comment_report')::uuid, 'Insulting other members.');
  perform public.app_mod_hide(current_setting('gv.post_report')::uuid, 'Spam.');
  if (select target_state from public.app_mod_report(current_setting('gv.comment_report')::uuid)) <> 'hidden' then
    raise exception 'FAIL: the comment does not show as hidden';
  end if;
end $$;
commit;
begin;
select pg_temp.as_member('7105');
set local role authenticated;
do $$
begin
  if exists (select 1 from public.app_comments(pg_temp.g('7203')) where id = current_setting('gv.comment')::uuid) then
    raise exception 'FAIL: the hidden comment is still shown';
  end if;
end $$;
commit;
do $$
begin
  if (select sum(points) from sim.points_ledger where member_id = pg_temp.g('7106') and action = 'meaningful_comment') <> 0 then
    raise exception 'FAIL: the hidden comment kept its points';
  end if;
  if (select sum(points) from sim.points_ledger where member_id = pg_temp.g('7105') and action = 'save') <> 0 then
    raise exception 'FAIL: points earned on the hidden post were not reversed';
  end if;
  raise notice 'PASS: comments can be reported and hidden; hidden comments and posts lose the points earned on them';
end $$;
begin;
select pg_temp.as_member('7106');
set local role authenticated;
do $$
begin
  if (select count(*) from public.app_my_notices() where kind = 'content_hidden') <> 2
     or not exists (select 1 from public.app_my_notices() where kind = 'content_hidden' and target_type = 'comment' and reason = 'harassment' and excerpt ~ 'terrible' and can_appeal) then
    raise exception 'FAIL: X was not told about the hidden comment and post';
  end if;
end $$;
commit;
do $$ begin raise notice 'PASS: the author is told what was hidden and why, never by whom, and can appeal'; end $$;

-- ---------------------------------------------------------------------------
-- 3. The enforcement ladder.
begin;
select pg_temp.as_member('7105');
set local role authenticated;
do $$
begin
  perform pg_temp.expect_error($q$select public.app_mod_enforce(pg_temp.g('7106'), 'warning', 'spam')$q$, 'not_moderator', 'a member enforcing');
end $$;
commit;
begin;
select pg_temp.as_member('7101');
set local role authenticated;
do $$
begin
  perform pg_temp.expect_error($q$select public.app_mod_enforce(pg_temp.g('7101'), 'warning', 'spam')$q$, 'cannot_enforce_self', 'enforcing on yourself');
  perform pg_temp.expect_error($q$select public.app_mod_enforce(pg_temp.g('7106'), 'restriction', 'spam')$q$, 'ladder_step_required', 'a restriction before any warning');
  perform pg_temp.expect_error($q$select public.app_mod_enforce(pg_temp.g('7106'), 'warning', 'spam', null, 3)$q$, 'invalid_request', 'a warning with a duration');
  perform public.app_mod_enforce(pg_temp.g('7106'), 'warning', 'spam', current_setting('gv.post_report')::uuid);
  perform pg_temp.expect_error($q$select public.app_mod_enforce(pg_temp.g('7106'), 'suspension', 'spam')$q$, 'ladder_step_required', 'a suspension before any restriction');
  perform pg_temp.expect_error($q$select public.app_mod_enforce(pg_temp.g('7106'), 'restriction', 'spam', null, 31)$q$, 'invalid_request', 'a restriction over 30 days');
  perform public.app_mod_enforce(pg_temp.g('7106'), 'restriction', 'harassment', null, 7);
end $$;
commit;
begin;
select pg_temp.as_member('7106');
set local role authenticated;
do $$
begin
  if (select standing from public.app_my_standing()) <> 'restricted' then
    raise exception 'FAIL: X''s standing is not restricted';
  end if;
  perform pg_temp.expect_error($q$select public.app_create_post('Buy now')$q$, 'restricted', 'posting while restricted');
  perform pg_temp.expect_error($q$select public.app_add_comment(pg_temp.g('7203'), 'Another comment here')$q$, 'restricted', 'commenting while restricted');
  perform public.app_save(pg_temp.g('7203')); -- saving is still allowed
end $$;
commit;
do $$ begin raise notice 'PASS: warning first, then restriction (no posting or commenting, saving still allowed)'; end $$;
begin;
select pg_temp.as_member('7101');
set local role authenticated;
select set_config('gv.suspension', public.app_mod_enforce(pg_temp.g('7106'), 'suspension', 'harassment')::text, false);
commit;
begin;
select pg_temp.as_member('7106');
set local role authenticated;
do $$
begin
  if (select standing from public.app_my_standing()) <> 'suspended' or (select ends_at from public.app_my_standing()) is not null then
    raise exception 'FAIL: X is not suspended until lifted';
  end if;
  perform pg_temp.expect_error($q$select public.app_save(pg_temp.g('7202'))$q$, 'suspended', 'saving while suspended');
  perform pg_temp.expect_error($q$select public.app_follow(pg_temp.g('7103'))$q$, 'suspended', 'following while suspended');
  if (select count(*) from public.app_my_notices()) < 5 then
    raise exception 'FAIL: a suspended member cannot read their notices';
  end if;
end $$;
commit;
begin;
select pg_temp.as_member('7105');
set local role authenticated;
do $$
begin
  if exists (select 1 from public.app_member('gv_x')) then
    raise exception 'FAIL: other members still see a suspended member';
  end if;
end $$;
commit;
-- Threats can be acted on at once; lifting ends it early.
begin;
select pg_temp.as_member('7101');
set local role authenticated;
do $$
declare v_id bigint;
begin
  v_id := public.app_mod_enforce(pg_temp.g('7104'), 'suspension', 'violence', null, 14);
  perform public.app_mod_lift(v_id, 'Reviewed: not a threat.');
  perform pg_temp.expect_error(format('select public.app_mod_lift(%s)', v_id), 'not_active', 'lifting twice');
  if (public.app_mod_member_record(pg_temp.g('7106'))->>'standing') <> 'suspended'
     or jsonb_array_length(public.app_mod_member_record(pg_temp.g('7106'))->'enforcements') <> 3
     or (public.app_mod_member_record(pg_temp.g('7106'))->>'hidden_content')::int <> 2 then
    raise exception 'FAIL: X''s moderation record is wrong: %', public.app_mod_member_record(pg_temp.g('7106'));
  end if;
end $$;
commit;
begin;
select pg_temp.as_member('7105');
set local role authenticated;
do $$
begin
  if not exists (select 1 from public.app_member('gv_b')) then
    raise exception 'FAIL: B is still hidden after the suspension was lifted';
  end if;
end $$;
commit;
do $$ begin raise notice 'PASS: suspension hides the member and stops all activity but keeps notices readable; threats skip the ladder; lifting ends it'; end $$;

-- ---------------------------------------------------------------------------
-- 4. Appeals.
select set_config('gv.comment_notice', (select id::text from ops.member_notices where member_id = pg_temp.g('7106') and kind = 'content_hidden' and target_type = 'comment'), false);
select set_config('gv.suspension_notice', (select id::text from ops.member_notices where member_id = pg_temp.g('7106') and kind = 'suspension'), false);
-- An old notice (31 days) cannot be appealed.
insert into ops.member_notices (member_id, kind, reason, created_at) values (pg_temp.g('7106'), 'warning', 'spam', now() - interval '31 days');
begin;
select pg_temp.as_member('7106');
set local role authenticated;
do $$
begin
  perform public.app_appeal(current_setting('gv.comment_notice')::bigint, 'I was quoting a film line, not insulting anyone.');
  perform pg_temp.expect_error(format('select public.app_appeal(%s, %L)', current_setting('gv.comment_notice'), 'Again'), 'already_appealed', 'appealing twice');
  perform public.app_appeal(current_setting('gv.suspension_notice')::bigint, 'Please review the suspension.');
end $$;
commit;
select set_config('gv.old_notice', (select id::text from ops.member_notices where kind = 'warning' and created_at < now() - interval '30 days'), false);
begin;
select pg_temp.as_member('7106');
set local role authenticated;
do $$
begin
  perform pg_temp.expect_error(format('select public.app_appeal(%s, %L)', current_setting('gv.old_notice'), 'Late'), 'appeal_window_closed', 'appealing after 30 days');
  if (select can_appeal from public.app_my_notices() where id = current_setting('gv.old_notice')::bigint) then
    raise exception 'FAIL: an old notice shows as appealable';
  end if;
end $$;
commit;
begin;
select pg_temp.as_member('7101');
set local role authenticated;
do $$
begin
  if (select count(*) from public.app_mod_appeals()) <> 2 or not (select bool_and(decided_original) from public.app_mod_appeals()) then
    raise exception 'FAIL: D''s appeal queue is wrong';
  end if;
  perform pg_temp.expect_error(format('select public.app_mod_decide_appeal(%L, true)', (select id from public.app_mod_appeals() where kind = 'content_hidden')),
                               'needs_another_moderator', 'deciding an appeal on your own action');
end $$;
commit;
begin;
select pg_temp.as_member('7102');
set local role authenticated;
do $$
begin
  perform public.app_mod_decide_appeal((select id from public.app_mod_appeals() where kind = 'content_hidden'), true, 'Context shows a quote.');
  perform public.app_mod_decide_appeal((select id from public.app_mod_appeals() where kind = 'suspension'), true, 'First offence.');
  perform pg_temp.expect_error(format('select public.app_mod_decide_appeal(%L, false)', (select id from public.app_mod_appeals('decided') limit 1)), 'not_open', 'deciding twice');
end $$;
commit;
begin;
select pg_temp.as_member('7105');
set local role authenticated;
do $$
begin
  if not exists (select 1 from public.app_comments(pg_temp.g('7203')) where id = current_setting('gv.comment')::uuid) then
    raise exception 'FAIL: a reversed appeal did not restore the comment';
  end if;
  if not exists (select 1 from public.app_member('gv_x')) then
    raise exception 'FAIL: a reversed appeal did not lift the suspension';
  end if;
end $$;
commit;
begin;
select pg_temp.as_member('7106');
set local role authenticated;
do $$
begin
  if (select standing from public.app_my_standing()) <> 'restricted' then
    raise exception 'FAIL: lifting the suspension should leave the separate restriction in place';
  end if;
  if (select count(*) from public.app_my_notices() where kind = 'appeal_reversed') <> 2 then
    raise exception 'FAIL: X was not told the appeals were reversed';
  end if;
  perform public.app_mark_notices_read();
  if exists (select 1 from public.app_my_notices() where not read) then
    raise exception 'FAIL: notices were not marked read';
  end if;
end $$;
commit;
do $$
begin
  -- A restored comment does not get its points back.
  if (select sum(points) from sim.points_ledger where member_id = pg_temp.g('7106') and action = 'meaningful_comment') <> 0 then
    raise exception 'FAIL: a restore re-awarded points';
  end if;
  perform pg_temp.expect_error($q$update ops.member_notices set kind = 'warning'$q$, 'only read_at', 'rewriting a notice');
  perform pg_temp.expect_error($q$update ops.appeals set status = 'open'$q$, 'decided once', 'reopening an appeal');
  perform pg_temp.expect_error($q$delete from ops.enforcements$q$, 'append-only', 'deleting enforcement history');
  if (select count(*) from ops.moderation_actions where action in ('enforce', 'lift', 'appeal_reversed')) <> 7 then
    raise exception 'FAIL: the audit trail is missing enforcement or appeal steps (%)', (select count(*) from ops.moderation_actions where action in ('enforce', 'lift', 'appeal_reversed'));
  end if;
  raise notice 'PASS: appeals once per notice within 30 days, decided by a different moderator, reversing restores content or lifts the enforcement, the member is told, and every step is audited';
end $$;
