-- TEST ONLY (throwaway databases). Governance refinements (20261207000000):
-- legitimate points come back when hidden content is restored (compensating
-- entries, never twice, never for content its author deleted), the
-- sole-moderator appeal exception (only without another eligible moderator,
-- a recorded reason, disclosed to the member), and immediate enforcement for
-- serious violations.
--
--   D = ...7301 the only moderator     E = ...7302 becomes a second moderator
--   A = ...7303 saves and reposts      X = ...7304 the author
\set ON_ERROR_STOP on

set role supabase_auth_admin;
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-4000-8000-fdfdfd007301', 'gr-d@example.test', now(), '{}'),
  ('00000000-0000-4000-8000-fdfdfd007302', 'gr-e@example.test', now(), '{}'),
  ('00000000-0000-4000-8000-fdfdfd007303', 'gr-a@example.test', now(), '{}'),
  ('00000000-0000-4000-8000-fdfdfd007304', 'gr-x@example.test', now(), '{}');
reset role;
update public.profiles p set username = 'gr_' || v.u, display_name = 'Gr ' || upper(v.u)
from (values ('7301', 'd'), ('7302', 'e'), ('7303', 'a'), ('7304', 'x')) v(n, u)
where p.id = ('00000000-0000-4000-8000-fdfdfd00' || v.n)::uuid;
select ops.grant_member_access(('00000000-0000-4000-8000-fdfdfd00' || n)::uuid, 'fan', 'gr-test')
from unnest(array['7301', '7302', '7303', '7304']) n;
-- Earlier test files leave moderators behind; this file needs D to be the only one.
select ops.revoke_moderator(user_id, 'gr-test', 'test setup') from ops.moderators;
select ops.grant_moderator('00000000-0000-4000-8000-fdfdfd007301', 'founder', 'gr-test');

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
create function pg_temp.pts(m text) returns integer language sql as $$
  select coalesce(sum(points), 0)::integer from sim.points_ledger where member_id = pg_temp.g(m) $$;

insert into social.posts (id, author_id, body) values
  (pg_temp.g('7401'), pg_temp.g('7304'), 'X post about budgeting'),
  (pg_temp.g('7402'), pg_temp.g('7303'), 'A post for comments');
begin;
select pg_temp.as_member('7303');
set local role authenticated;
do $$
begin
  perform public.app_save(pg_temp.g('7401'));     -- 2
  perform public.app_repost(pg_temp.g('7401'));   -- 5
  perform public.app_report('post', pg_temp.g('7401'), 'spam');
end $$;
commit;
begin;
select pg_temp.as_member('7304');
set local role authenticated;
select set_config('gr.comment', public.app_add_comment(pg_temp.g('7402'), 'Here is my longer follow-up thought on it.')::text, false);
commit;
select set_config('gr.post_report', (select id::text from ops.content_reports where target_id = pg_temp.g('7401') and status = 'open'), false);

-- ---------------------------------------------------------------------------
-- 1. Restore after a hide: the points come back once; a re-hide takes them back again.
do $$
begin
  if pg_temp.pts('7303') <> 7 then raise exception 'FAIL: setup: A should have 7 points, has %', pg_temp.pts('7303'); end if;
end $$;
begin;
select pg_temp.as_member('7301');
set local role authenticated;
select public.app_mod_hide(current_setting('gr.post_report')::uuid, 'Looked like spam.');
commit;
do $$
begin
  if pg_temp.pts('7303') <> 0 then raise exception 'FAIL: the hide did not take A''s points back (%)', pg_temp.pts('7303'); end if;
  -- Nothing comes back while the post is still hidden.
  if sim.restore_hidden('post', pg_temp.g('7401')) <> 0 then raise exception 'FAIL: points restored while the post is still hidden'; end if;
end $$;
begin;
select pg_temp.as_member('7301');
set local role authenticated;
select public.app_mod_restore(current_setting('gr.post_report')::uuid, 'It was a genuine recommendation.');
commit;
do $$
declare before_count bigint := (select count(*) from sim.points_ledger);
begin
  if pg_temp.pts('7303') <> 7 then raise exception 'FAIL: restoring the post did not restore A''s points (%)', pg_temp.pts('7303'); end if;
  if (select count(*) from sim.points_ledger where member_id = pg_temp.g('7303') and source_key like 'restored:%' and status = 'recognized' and not redeemable) <> 2 then
    raise exception 'FAIL: the restore is not two recognized compensating entries';
  end if;
  if sim.restore_hidden('post', pg_temp.g('7401')) <> 0 or (select count(*) from sim.points_ledger) <> before_count then
    raise exception 'FAIL: restoring twice added points again';
  end if;
  perform pg_temp.expect_error($q$update sim.points_ledger set points = 0$q$, 'append-only', 'editing the ledger');
  raise notice 'PASS: restoring hidden content restores its legitimate points once, as compensating entries; nothing historical changes';
end $$;
-- A second report and hide takes them back; a second restore gives them back once more.
begin;
select pg_temp.as_member('7302');
set local role authenticated;
select public.app_report('post', pg_temp.g('7401'), 'spam');
commit;
begin;
select pg_temp.as_member('7301');
set local role authenticated;
select public.app_mod_hide((select id from public.app_mod_queue() where target_id = pg_temp.g('7401')), 'Again.');
commit;
do $$
begin
  if pg_temp.pts('7303') <> 0 then raise exception 'FAIL: a second hide did not take the restored points back (%)', pg_temp.pts('7303'); end if;
  raise notice 'PASS: hiding restored content again takes its points back again';
end $$;

-- ---------------------------------------------------------------------------
-- 2. A comment its author deleted never gets its points back.
do $$
begin
  if pg_temp.pts('7304') <> 2 then raise exception 'FAIL: setup: X should have 2 points for the comment, has %', pg_temp.pts('7304'); end if;
end $$;
begin;
select pg_temp.as_member('7304');
set local role authenticated;
select public.app_delete_comment(current_setting('gr.comment')::uuid);
commit;
do $$
begin
  if sim.restore_hidden('comment', current_setting('gr.comment')::uuid) <> 0 or pg_temp.pts('7304') <> 0 then
    raise exception 'FAIL: points came back for a comment its author deleted';
  end if;
  raise notice 'PASS: points reversed for any other reason (here, the author deleting) are never restored';
end $$;

-- ---------------------------------------------------------------------------
-- 3. The sole-moderator exception.
begin;
select pg_temp.as_member('7304');
set local role authenticated;
select set_config('gr.c2', public.app_add_comment(pg_temp.g('7402'), 'A sharp but fair disagreement with this.')::text, false);
commit;
begin;
select pg_temp.as_member('7303');
set local role authenticated;
select public.app_report('comment', current_setting('gr.c2')::uuid, 'harassment');
commit;
begin;
select pg_temp.as_member('7301');
set local role authenticated;
select public.app_mod_hide((select id from public.app_mod_queue() where target_id = current_setting('gr.c2')::uuid), 'Too personal.');
commit;
begin;
select pg_temp.as_member('7304');
set local role authenticated;
select public.app_appeal((select id from public.app_my_notices() where kind = 'content_hidden' and target_id = current_setting('gr.c2')::uuid), 'It was about the idea, not the person.');
commit;
-- With a second, active moderator, D may not decide.
select ops.grant_moderator(pg_temp.g('7302'), 'founder', 'gr-test');
begin;
select pg_temp.as_member('7301');
set local role authenticated;
do $$
begin
  if not (select another_moderator_available from public.app_mod_appeals() limit 1) then
    raise exception 'FAIL: the queue does not say another moderator is available';
  end if;
  perform pg_temp.expect_error(format('select public.app_mod_decide_appeal(%L, true, %L)', (select id from public.app_mod_appeals() limit 1), 'Reason'),
                               'needs_another_moderator', 'deciding your own action while another moderator is available');
end $$;
commit;
-- E's pilot access ends: E is no longer eligible, so the exception applies again by itself.
select ops.revoke_member_access(pg_temp.g('7302'), 'gr-test', 'pilot ended for E');
begin;
select pg_temp.as_member('7301');
set local role authenticated;
do $$
declare a uuid := (select id from public.app_mod_appeals() limit 1);
begin
  if (select another_moderator_available from public.app_mod_appeals() limit 1) then
    raise exception 'FAIL: an inactive moderator still counts as available';
  end if;
  perform pg_temp.expect_error(format('select public.app_mod_decide_appeal(%L, true)', a), 'note_required', 'using the exception without a reason');
  perform public.app_mod_decide_appeal(a, true, 'No other moderator is active; on review the comment criticised the idea.');
end $$;
commit;
do $$
begin
  if not (select same_moderator from ops.appeals where member_id = pg_temp.g('7304') and status = 'reversed') then
    raise exception 'FAIL: the appeal does not record the sole-moderator exception';
  end if;
  if not exists (select 1 from ops.moderation_actions where action = 'appeal_reversed' and note like 'Sole moderator, conflict of interest disclosed: %') then
    raise exception 'FAIL: the audit trail does not disclose the conflict of interest';
  end if;
  if pg_temp.pts('7304') <> 2 then
    raise exception 'FAIL: reversing the appeal did not restore the comment''s points (%)', pg_temp.pts('7304');
  end if;
end $$;
begin;
select pg_temp.as_member('7304');
set local role authenticated;
do $$
begin
  if not (select same_moderator from public.app_my_notices() where kind = 'appeal_reversed' limit 1) then
    raise exception 'FAIL: the member is not told the same moderator reviewed the appeal';
  end if;
end $$;
commit;
do $$ begin raise notice 'PASS: the sole-moderator exception applies only without another eligible moderator, needs a recorded reason, is disclosed to the member and in the audit trail, and ends by itself'; end $$;

-- ---------------------------------------------------------------------------
-- 4. Immediate enforcement for a serious violation.
begin;
select pg_temp.as_member('7301');
set local role authenticated;
do $$
begin
  perform pg_temp.expect_error($q$select public.app_mod_enforce(pg_temp.g('7304'), 'suspension', 'sexual')$q$, 'ladder_step_required', 'a suspension without the earlier steps');
  perform pg_temp.expect_error($q$select public.app_mod_enforce(pg_temp.g('7304'), 'suspension', 'sexual', null, null, null, true)$q$, 'note_required', 'immediate action without a justification');
  perform public.app_mod_enforce(pg_temp.g('7304'), 'suspension', 'sexual', null, 14, 'Explicit images sent to a minor-looking account; acting at once.', true);
end $$;
commit;
do $$
begin
  if not exists (select 1 from ops.enforcements where member_id = pg_temp.g('7304') and level = 'suspension' and immediate) then
    raise exception 'FAIL: the immediate suspension is not recorded as immediate';
  end if;
  if not exists (select 1 from ops.moderation_actions where action = 'enforce' and note like 'suspension (immediate): %') then
    raise exception 'FAIL: the audit trail does not show the action was immediate';
  end if;
  -- Redeemable points and settlements are never touched by moderation.
  if exists (select 1 from sim.points_ledger where redeemable and (source_key like 'restored:%' or source_key like 'hidden:%')) then
    raise exception 'FAIL: moderation touched redeemable points';
  end if;
  raise notice 'PASS: serious violations can be acted on at once with a recorded justification; moderation never touches redeemable points or settlements';
end $$;
