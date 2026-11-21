-- TEST ONLY (throwaway databases). Member feedback and the founder's inbox
-- (20261126000000), as real signed-in accounts calling the same functions the
-- app calls.
--
--   F = ...0f01: the founder (founder cohort, active).
--   A = ...0f02: a tester who sends feedback.
--   B = ...0f03: a creator who sends feedback.
--   M = ...0f04: a moderator (tester cohort): moderation does NOT open the inbox.
--   R = ...0f05: a member whose access is revoked after sending.
--   G = ...0f06: an account with founder cohort whose access is revoked.

set role supabase_auth_admin;
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-4000-8000-000000000f01', 'fb-f@example.test', now()),
  ('00000000-0000-4000-8000-000000000f02', 'fb-a@example.test', now()),
  ('00000000-0000-4000-8000-000000000f03', 'fb-b@example.test', now()),
  ('00000000-0000-4000-8000-000000000f04', 'fb-m@example.test', now()),
  ('00000000-0000-4000-8000-000000000f05', 'fb-r@example.test', now()),
  ('00000000-0000-4000-8000-000000000f06', 'fb-g@example.test', now());
reset role;
update public.profiles set username = 'fb_f', display_name = 'Fb Founder' where id = '00000000-0000-4000-8000-000000000f01';
update public.profiles set username = 'fb_a', display_name = 'Fb A' where id = '00000000-0000-4000-8000-000000000f02';
update public.profiles set username = 'fb_b', display_name = 'Fb B' where id = '00000000-0000-4000-8000-000000000f03';
update public.profiles set username = 'fb_m', display_name = 'Fb M' where id = '00000000-0000-4000-8000-000000000f04';
update public.profiles set username = 'fb_r', display_name = 'Fb R' where id = '00000000-0000-4000-8000-000000000f05';
update public.profiles set username = 'fb_g', display_name = 'Fb G' where id = '00000000-0000-4000-8000-000000000f06';
-- F is the launch founder (20261129000000): the only account that may hold
-- the founder cohort. Later tests (116, 117) use the same founder.
select ops.set_launch_founder('test', '00000000-0000-4000-8000-000000000f01', 'SET THE LAUNCH FOUNDER');
select ops.grant_member_access('00000000-0000-4000-8000-000000000f01', 'founder', 'test');
select ops.grant_member_access('00000000-0000-4000-8000-000000000f02', 'tester', 'test');
select ops.grant_member_access('00000000-0000-4000-8000-000000000f03', 'creator', 'test');
select ops.grant_member_access('00000000-0000-4000-8000-000000000f04', 'tester', 'test');
select ops.grant_member_access('00000000-0000-4000-8000-000000000f05', 'fan', 'test');
-- G: a founder-cohort record whose access is revoked. Only the launch founder
-- may ever be GIVEN the founder cohort now, so the revoked record is written
-- directly (a write that gives no access, which the gate always allows), as
-- a record from before the gate would look.
select ops.grant_moderator('00000000-0000-4000-8000-000000000f04', 'test', 'feedback test');
insert into ops.member_access (user_id, cohort, status, revoked_at, updated_by) values ('00000000-0000-4000-8000-000000000f06', 'founder', 'revoked', now(), 'test');

create function pg_temp.expect_error_fb(sql text, expected text, what text)
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
grant execute on function pg_temp.expect_error_fb(text, text, text) to authenticated, anon;

-- 1. A sends feedback: validated on the server, one entry per request id.
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000f02","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  id1 uuid;
  id2 uuid;
  rid uuid := '00000000-0000-4000-8000-0000000fa001';
begin
  perform pg_temp.expect_error_fb($q$select public.app_feedback_submit('bug', 'home', 'Something about the feed', gen_random_uuid())$q$, 'invalid_category', 'an unknown category');
  perform pg_temp.expect_error_fb($q$select public.app_feedback_submit(null, 'home', 'Something about the feed', gen_random_uuid())$q$, 'invalid_category', 'no category');
  perform pg_temp.expect_error_fb($q$select public.app_feedback_submit('problem', '/app/post/123?x=1', 'Something about the feed', gen_random_uuid())$q$, 'invalid_request', 'a URL as the feature');
  perform pg_temp.expect_error_fb($q$select public.app_feedback_submit('problem', 'settings', 'Something about the feed', gen_random_uuid())$q$, 'invalid_request', 'a feature outside the list');
  perform pg_temp.expect_error_fb($q$select public.app_feedback_submit('problem', 'home', '   short   ', gen_random_uuid())$q$, 'feedback_too_short', 'under 10 characters (after trimming)');
  perform pg_temp.expect_error_fb($q$select public.app_feedback_submit('problem', 'home', null, gen_random_uuid())$q$, 'feedback_too_short', 'no description');
  perform pg_temp.expect_error_fb($q$select public.app_feedback_submit('problem', 'home', repeat('x', 1001), gen_random_uuid())$q$, 'too_long', 'over 1,000 characters');
  perform pg_temp.expect_error_fb($q$select public.app_feedback_submit('problem', 'home', 'Bell ' || chr(7) || ' in the text', gen_random_uuid())$q$, 'invalid_text', 'a control character');
  perform pg_temp.expect_error_fb($q$select public.app_feedback_submit('problem', 'home', 'Something about the feed', null)$q$, 'invalid_request', 'no request id');

  id1 := public.app_feedback_submit('problem', 'home', '  The feed did not refresh after posting.  ', rid);
  id2 := public.app_feedback_submit('problem', 'home', '  The feed did not refresh after posting.  ', rid);
  if id1 is null or id1 <> id2 then
    raise exception 'FAIL: the same request id made two entries';
  end if;
  -- The same text with a new request id (a second tap after a lost reply) within 10 minutes: the first entry.
  if public.app_feedback_submit('problem', 'home', 'The feed did not refresh after posting.', gen_random_uuid()) <> id1 then
    raise exception 'FAIL: the same text sent again within 10 minutes made a second entry';
  end if;
  if exists (select 1 from public.app_feedback_submit('praise', 'discover', 'I love browsing by interest here.', gen_random_uuid()) x where x is null) then
    raise exception 'FAIL: a second, different entry was refused';
  end if;
  raise notice 'PASS: feedback is validated on the server (category, feature list, 10 to 1,000 characters, no control characters) and a retried send is one entry';
end $$;
commit;

-- What was stored: trimmed, with A's cohort and status new; no URL or id from the browser.
do $$
begin
  if (select count(*) from ops.feedback where submitter_id = '00000000-0000-4000-8000-000000000f02') <> 2 then
    raise exception 'FAIL: expected exactly two entries from A';
  end if;
  if not exists (select 1 from ops.feedback where submitter_id = '00000000-0000-4000-8000-000000000f02'
                   and body = 'The feed did not refresh after posting.' and cohort = 'tester' and status = 'new' and feature = 'home') then
    raise exception 'FAIL: the entry was not stored trimmed, with the cohort, status new and the feature';
  end if;
  raise notice 'PASS: entries are stored trimmed, with the member''s cohort at the time and status new';
end $$;

-- 2. Members can't read feedback (not even their own) or use the inbox; the
--    moderator role does not open it.
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000f02","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  perform pg_temp.expect_error_fb('select count(*) from ops.feedback', 'permission denied', 'A reading feedback directly');
  perform pg_temp.expect_error_fb('select count(*) from ops.feedback_notes', 'permission denied', 'A reading notes directly');
  perform pg_temp.expect_error_fb('select count(*) from ops.feedback_actions', 'permission denied', 'A reading the audit trail');
  perform pg_temp.expect_error_fb('select * from public.app_founder_feedback_list()', 'not_founder', 'A listing feedback');
  perform pg_temp.expect_error_fb('select * from public.app_founder_feedback(gen_random_uuid())', 'not_founder', 'A opening an entry');
  perform pg_temp.expect_error_fb($q$select public.app_founder_feedback_set_status(gen_random_uuid(), 'closed')$q$, 'not_founder', 'A changing a status');
  perform pg_temp.expect_error_fb($q$select public.app_founder_feedback_add_note(gen_random_uuid(), 'note')$q$, 'not_founder', 'A adding a note');
  perform pg_temp.expect_error_fb('select ops.purge_feedback(0, ''x'', ''DELETE PILOT FEEDBACK'')', 'permission denied', 'A purging feedback');
  if public.app_is_founder() then
    raise exception 'FAIL: A is told they are the founder';
  end if;
  raise notice 'PASS: a member can''t read any feedback (including their own), use the inbox or purge';
end $$;
commit;
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000f04","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  if not public.app_is_moderator() or public.app_is_founder() then
    raise exception 'FAIL: M should be a moderator and not the founder';
  end if;
  perform pg_temp.expect_error_fb('select * from public.app_founder_feedback_list()', 'not_founder', 'a moderator listing feedback');
  raise notice 'PASS: being a moderator does not open the feedback inbox';
end $$;
commit;
-- A founder-cohort account whose access is revoked gets nothing.
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000f06","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  perform pg_temp.expect_error_fb('select * from public.app_founder_feedback_list()', 'no_pilot_access', 'a revoked founder-cohort account listing feedback');
  perform pg_temp.expect_error_fb('select public.app_is_founder()', 'no_pilot_access', 'a revoked founder-cohort account checking');
  perform pg_temp.expect_error_fb($q$select public.app_feedback_submit('problem', 'home', 'A revoked account trying to send', gen_random_uuid())$q$, 'no_pilot_access', 'a revoked account sending');
  raise notice 'PASS: the founder cohort without active membership is refused';
end $$;
commit;
-- Visitors get nothing.
begin;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
do $$
begin
  perform pg_temp.expect_error_fb($q$select public.app_feedback_submit('problem', 'home', 'An anonymous message', gen_random_uuid())$q$, 'permission denied', 'a visitor sending');
  perform pg_temp.expect_error_fb('select * from public.app_founder_feedback_list()', 'permission denied', 'a visitor listing');
  raise notice 'PASS: visitors can''t send or read feedback (no anonymous feedback)';
end $$;
commit;

-- 3. Rate limits: 3 in any 10 minutes, 10 a day.
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000f03","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  perform public.app_feedback_submit('improvement', 'clique', 'Let me reorder my Clique members.', gen_random_uuid());
  perform public.app_feedback_submit('improvement', 'profile', 'Show when someone followed me.', gen_random_uuid());
  perform public.app_feedback_submit('problem', 'post', 'A comment took a long time to appear.', gen_random_uuid());
  perform pg_temp.expect_error_fb($q$select public.app_feedback_submit('praise', 'home', 'A fourth message in ten minutes', gen_random_uuid())$q$, 'rate_limited', 'a fourth entry within 10 minutes');
  raise notice 'PASS: a fourth entry within 10 minutes is refused (rate_limited)';
end $$;
commit;
-- Earlier entries spread over the day: the 11th in a day is refused even outside the 10-minute window.
update ops.feedback set created_at = now() - interval '2 hours' where submitter_id = '00000000-0000-4000-8000-000000000f03';
insert into ops.feedback (submitter_id, category, feature, body, cohort, client_request_id, created_at)
select '00000000-0000-4000-8000-000000000f03', 'improvement', 'other', 'Earlier entry number ' || i, 'creator', gen_random_uuid(), now() - interval '3 hours'
from generate_series(1, 7) i;
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000f03","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  perform pg_temp.expect_error_fb($q$select public.app_feedback_submit('praise', 'home', 'The eleventh message today', gen_random_uuid())$q$, 'rate_limited', 'an 11th entry in a day');
  raise notice 'PASS: an 11th entry in a day is refused (rate_limited)';
end $$;
commit;
update ops.feedback set created_at = now() - interval '25 hours' where submitter_id = '00000000-0000-4000-8000-000000000f03';

-- 4. Concurrency: two sessions sending with the same request id at once is
--    covered by the advisory lock and the unique index (one entry); here the
--    index itself is checked directly.
do $$
begin
  begin
    insert into ops.feedback (submitter_id, category, feature, body, client_request_id)
    select submitter_id, category, feature, body || ' again', client_request_id from ops.feedback
    where submitter_id = '00000000-0000-4000-8000-000000000f02' limit 1;
    raise exception 'FAIL: a second entry with the same request id was stored';
  exception when unique_violation then null;
  end;
  raise notice 'PASS: the database refuses a second entry with the same member and request id';
end $$;

-- R sends feedback, then loses access: the founder still sees it, with R's cohort.
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000f05","role":"authenticated"}', true);
set local role authenticated;
select public.app_feedback_submit('problem', 'catch_up', 'Catch-up skipped one of the posts.', gen_random_uuid());
commit;
select ops.revoke_member_access('00000000-0000-4000-8000-000000000f05', 'test');

create temp table fb_expected as select id, category, created_at from ops.feedback;
grant select on fb_expected to authenticated;

-- 5. The founder: newest first, filters, one entry in full, status changes and
--    notes, all recorded; names and usernames only.
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000f01","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  ids uuid[];
  e record;
  target uuid;
  n int;
  cols text;
begin
  if not public.app_is_founder() then
    raise exception 'FAIL: F is not recognised as the founder';
  end if;
  select array_agg(l.id order by l.created_at desc, l.id desc) into ids from public.app_founder_feedback_list() l;
  if ids is distinct from (select array_agg(f.id order by f.created_at desc, f.id desc) from fb_expected f) then
    raise exception 'FAIL: the inbox is not every entry, newest first';
  end if;
  if (select array_agg(l.id) from public.app_founder_feedback_list() l) is distinct from ids then
    raise exception 'FAIL: the inbox is not in newest-first order';
  end if;
  if exists (select 1 from public.app_founder_feedback_list('praise') l where l.category <> 'praise')
     or (select count(*) from public.app_founder_feedback_list('praise')) <> (select count(*) from fb_expected where category = 'praise') then
    raise exception 'FAIL: the category filter';
  end if;
  if (select count(*) from public.app_founder_feedback_list(null, null, 'fan')) <> 1
     or (select submitter_username from public.app_founder_feedback_list(null, null, 'fan')) <> 'fb_r' then
    raise exception 'FAIL: the role filter, or a revoked member''s feedback is missing';
  end if;
  if (select count(*) from public.app_founder_feedback_list(null, null, null, null, null, 2)) <> 2 then
    raise exception 'FAIL: the page size';
  end if;
  -- Older ones after the second.
  select l.created_at, l.id into e from public.app_founder_feedback_list(null, null, null, null, null, 2) l order by l.created_at, l.id limit 1;
  if (select array_agg(l.id order by l.created_at desc, l.id desc) from public.app_founder_feedback_list(null, null, null, e.created_at, e.id, 50) l)
     is distinct from ids[3:] then
    raise exception 'FAIL: older entries after a page';
  end if;
  perform pg_temp.expect_error_fb($q$select * from public.app_founder_feedback_list('bug')$q$, 'invalid_request', 'an unknown category filter');
  perform pg_temp.expect_error_fb($q$select * from public.app_founder_feedback_list(null, 'done')$q$, 'invalid_request', 'an unknown status filter');
  perform pg_temp.expect_error_fb($q$select * from public.app_founder_feedback_list(null, null, 'admin')$q$, 'invalid_request', 'an unknown role filter');
  -- No email in anything the founder sees.
  select string_agg(l::text, ' ') into cols from public.app_founder_feedback_list() l;
  if cols ~ '@example\.test' then
    raise exception 'FAIL: the inbox shows an email address';
  end if;

  select l.id into target from public.app_founder_feedback_list('problem') l where l.submitter_username = 'fb_a';
  perform public.app_founder_feedback_set_status(target, 'reviewing');
  perform public.app_founder_feedback_set_status(target, 'reviewing');
  perform public.app_founder_feedback_add_note(target, '  Reproduced on iPhone.  ');
  perform public.app_founder_feedback_set_status(target, 'planned');
  perform pg_temp.expect_error_fb(pg_catalog.format('select public.app_founder_feedback_set_status(%L, %L)', target, 'done'), 'invalid_status', 'an unknown status');
  perform pg_temp.expect_error_fb(pg_catalog.format('select public.app_founder_feedback_set_status(%L, %L)', gen_random_uuid(), 'closed'), 'not_found', 'a missing entry');
  perform pg_temp.expect_error_fb(pg_catalog.format('select public.app_founder_feedback_add_note(%L, %L)', target, '   '), 'note_required', 'an empty note');
  perform pg_temp.expect_error_fb(pg_catalog.format('select public.app_founder_feedback_add_note(%L, %L)', target, repeat('n', 1001)), 'too_long', 'a note over 1,000 characters');
  select * into e from public.app_founder_feedback(target);
  if e.status <> 'planned' or e.submitter_display_name <> 'Fb A' or e.cohort <> 'tester' or e.feature <> 'home' then
    raise exception 'FAIL: the entry in full: %', e;
  end if;
  if jsonb_array_length(e.notes) <> 1 or e.notes->0->>'body' <> 'Reproduced on iPhone.' or e.notes->0->>'author' <> 'Fb Founder' then
    raise exception 'FAIL: the note: %', e.notes;
  end if;
  if (select array_agg(x->>'action' || ':' || coalesce(x->>'from', '') || '>' || coalesce(x->>'to', '')) from jsonb_array_elements(e.history) x)
     is distinct from array['status_changed:new>reviewing', 'note_added:>', 'status_changed:reviewing>planned'] then
    raise exception 'FAIL: the history (a no-op change must not be recorded): %', e.history;
  end if;
  if (select status from public.app_founder_feedback_list() where id = target) <> 'planned'
     or (select note_count from public.app_founder_feedback_list() where id = target) <> 1 then
    raise exception 'FAIL: the list does not show the new status and note count';
  end if;
  select count(*) into n from public.app_founder_feedback_list(null, 'planned');
  if n <> 1 then
    raise exception 'FAIL: the status filter (% planned)', n;
  end if;
  raise notice 'PASS: the founder sees every entry newest first, filters by category, status and role, pages, and changes status and adds notes, all recorded';
end $$;
commit;

-- 6. The audit trail holds no text, and can't be changed; notes can't be edited.
do $$
begin
  if exists (select 1 from ops.feedback_actions where detail ~ 'iPhone' or detail ~ 'refresh') then
    raise exception 'FAIL: the audit trail holds note or feedback text';
  end if;
  begin
    update ops.feedback_actions set to_status = 'closed';
    raise exception 'FAIL: the audit trail was edited';
  exception when raise_exception then
    if sqlerrm like 'FAIL:%' then raise; end if;
  end;
  begin
    delete from ops.feedback_actions;
    raise exception 'FAIL: the audit trail was deleted';
  exception when raise_exception then
    if sqlerrm like 'FAIL:%' then raise; end if;
  end;
  begin
    update ops.feedback_notes set body = 'changed';
    raise exception 'FAIL: a note was edited';
  exception when raise_exception then
    if sqlerrm like 'FAIL:%' then raise; end if;
  end;
  raise notice 'PASS: the audit trail holds no feedback or note text and is append-only; notes can''t be edited';
end $$;

-- 7. Retention: the purge needs the phrase, is recorded, and deleting an
--    account deletes its feedback and the notes on it.
do $$
declare
  n int;
  before_actions int := (select count(*) from ops.feedback_actions);
begin
  begin
    perform ops.purge_feedback(0, 'founder', 'yes');
    raise exception 'FAIL: the purge ran without the exact phrase';
  exception when raise_exception then
    if sqlerrm like 'FAIL:%' then raise; end if;
  end;
  begin
    perform ops.purge_feedback(0, 'someone@example.test', 'DELETE PILOT FEEDBACK');
    raise exception 'FAIL: the purge accepted an email address as the actor';
  exception when raise_exception then
    if sqlerrm like 'FAIL:%' then raise; end if;
  end;
  -- Only entries older than a day: B's (moved to 25 hours ago).
  n := ops.purge_feedback(1, 'founder', 'DELETE PILOT FEEDBACK');
  if n <> (10) or exists (select 1 from ops.feedback where submitter_id = '00000000-0000-4000-8000-000000000f03') then
    raise exception 'FAIL: the purge deleted % entries; expected B''s 10', n;
  end if;
  if (select count(*) from ops.feedback_actions) <> before_actions + 1
     or not exists (select 1 from ops.feedback_actions where action = 'retention_purge' and actor_label = 'founder') then
    raise exception 'FAIL: the purge was not recorded';
  end if;
  -- Deleting A's account removes A's feedback and the founder's notes on it; the audit trail stays.
  delete from auth.users where id = '00000000-0000-4000-8000-000000000f02';
  if exists (select 1 from ops.feedback where submitter_id = '00000000-0000-4000-8000-000000000f02') or exists (select 1 from ops.feedback_notes) then
    raise exception 'FAIL: a deleted account''s feedback or the notes on it remain';
  end if;
  if (select count(*) from ops.feedback_actions where action = 'status_changed') <> 2 then
    raise exception 'FAIL: the audit trail lost entries when an account was deleted';
  end if;
  raise notice 'PASS: the retention purge needs the exact phrase and is recorded; deleting an account deletes its feedback and notes';
end $$;
