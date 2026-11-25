-- TEST ONLY (throwaway databases). Privacy requests, account deletion and
-- operational switches (20261212000000).
--
--   F = ...9a01 founder   D = ...9a02 asks to be deleted (posts, comments, likes,
--   follows, feedback, points, ad impressions)   C = ...9a03 creator D follows
--   M = ...9a04 other member
\set ON_ERROR_STOP on

set role supabase_auth_admin;
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
select ('00000000-0000-4000-8000-fdfdfd00' || n)::uuid, 'pr-' || n || '@example.test', now(), '{}'
from unnest(array['9a01', '9a02', '9a03', '9a04']) n;
reset role;
update public.profiles p set username = 'pr_' || v.u, display_name = 'Pr ' || upper(v.u)
from (values ('9a01', 'f'), ('9a02', 'd'), ('9a03', 'c'), ('9a04', 'm')) v(n, u)
where p.id = ('00000000-0000-4000-8000-fdfdfd00' || v.n)::uuid;
update ops.member_launch_settings set founder_user_id = '00000000-0000-4000-8000-fdfdfd009a01' where id;
select ops.grant_member_access('00000000-0000-4000-8000-fdfdfd009a01', 'founder', 'pr-test');
select ops.grant_member_access(('00000000-0000-4000-8000-fdfdfd00' || n)::uuid, 'fan', 'pr-test') from unnest(array['9a02', '9a03', '9a04']) n;

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

-- 1. Switches.
begin;
select pg_temp.as_member('9a04');
set local role authenticated;
do $$
declare
  f jsonb := public.app_features();
begin
  if not (f->>'ads')::boolean or not (f->>'sharing')::boolean or (f->>'video_posts')::boolean then
    raise exception 'FAIL: the default switches are wrong: %', f;
  end if;
  perform pg_temp.expect_error('select public.app_founder_switches()', 'not_founder', 'a member reading the switches');
  perform pg_temp.expect_error('select public.app_founder_set_switch(''ads'', false, ''because'')', 'not_founder', 'a member changing a switch');
  raise notice 'PASS: ads and sharing start on, video posts off; only the founder sees or changes switches';
end $$;
commit;

insert into social.posts (id, author_id, body) values (pg_temp.g('9b01'), pg_temp.g('9a03'), 'C on cooking');
insert into ads.advertisers (id, name, website, offering, problem_solved, desired_outcome, customer_needs, objective, conversion_action, categories, status)
values (pg_temp.g('9d01'), 'Kitchenly', 'https://kitchenly.example', 'Pans', 'Sticky pans', 'Better meals', 'Good pans', 'sales', 'Buy', array['home_kitchen'], 'approved');
insert into ads.campaigns (id, advertiser_id, name, status, placement, categories, allow_general, starts_on, ends_on, headline, body, cta_label, landing_url)
values (pg_temp.g('9c01'), pg_temp.g('9d01'), 'Pans', 'active', 'both', array['home_kitchen'], true, current_date, current_date + 30,
        'Pans that last', 'Cook better', 'Shop', 'https://kitchenly.example/pans');

begin;
select pg_temp.as_member('9a01');
set local role authenticated;
do $$
begin
  perform pg_temp.expect_error('select public.app_founder_set_switch(''ads'', false, '''')', 'reason_required', 'a switch without a reason');
  perform pg_temp.expect_error('select public.app_founder_set_switch(''video_posts'', true, ''device test passed'')', 'video_not_ready', 'turning video on before the video package');
  perform pg_temp.expect_error('select public.app_founder_set_switch(''nonsense'', true, ''why not'')', 'invalid_request', 'an unknown switch');
  perform public.app_founder_set_switch('ads', false, 'Pausing ads for a review');
  perform public.app_founder_set_switch('sharing', false, 'Pausing sharing');
  if (public.app_founder_switches()->'recent'->0->>'reason') <> 'Pausing sharing' then
    raise exception 'FAIL: the change is not recorded';
  end if;
  raise notice 'PASS: switches need a reason, video stays off, every change is recorded';
end $$;
commit;

begin;
select pg_temp.as_member('9a04');
set local role authenticated;
do $$
begin
  if (select count(*) from public.app_ad_for('feed', null)) <> 0 then
    raise exception 'FAIL: an ad was served while ads are paused';
  end if;
  perform pg_temp.expect_error('select public.app_record_share(' || quote_literal(pg_temp.g('9b01')::text) || ', ''copy_link'')', 'sharing_paused', 'sharing while paused');
  raise notice 'PASS: with ads and sharing paused, no ad is served and sharing is refused';
end $$;
commit;

begin;
select pg_temp.as_member('9a01');
set local role authenticated;
select public.app_founder_set_switch('ads', true, 'Review done');
select public.app_founder_set_switch('sharing', true, 'Review done');
commit;
begin;
select pg_temp.as_member('9a04');
set local role authenticated;
do $$
begin
  if (select count(*) from public.app_ad_for('feed', null)) <> 1 then
    raise exception 'FAIL: no ad after ads were switched back on';
  end if;
  perform public.app_record_share(pg_temp.g('9b01'), 'copy_link');
  raise notice 'PASS: switching back on restores ads and sharing at once';
end $$;
commit;

-- 2. D's history: a post, comments, a like, a follow, feedback, points, an ad impression.
insert into social.posts (id, author_id, body) values (pg_temp.g('9b02'), pg_temp.g('9a02'), 'D on gardening');
insert into social.follows (follower_id, creator_id) values (pg_temp.g('9a02'), pg_temp.g('9a03'));
insert into social.likes (user_id, post_id) values (pg_temp.g('9a02'), pg_temp.g('9b01'));
begin;
select pg_temp.as_member('9a02');
set local role authenticated;
select public.app_add_comment(pg_temp.g('9b01'), 'This recipe is exactly what I needed for the weekend.', gen_random_uuid());
select public.app_feedback_submit('problem', 'other', 'Please add dark mode to the app soon.', gen_random_uuid());
select public.app_ad_for('feed', null);
commit;
insert into sim.points_ledger (member_id, action, points, redeemable, status, rule_version, source_key)
values (pg_temp.g('9a02'), 'qualified_referral', 100, true, 'approved', 'd6-v1', 'pr-test:referral');

-- 3. Requests.
begin;
select pg_temp.as_member('9a02');
set local role authenticated;
do $$
declare
  v_access bigint;
begin
  perform pg_temp.expect_error('select public.app_submit_member_request(''everything'', null)', 'invalid_request', 'an unknown request');
  v_access := public.app_submit_member_request('access', 'Please send me a copy of my data.');
  perform pg_temp.expect_error('select public.app_submit_member_request(''access'', null)', 'request_open', 'a second open copy request');
  perform public.app_withdraw_member_request(v_access);
  perform public.app_submit_member_request('access', null);
  perform public.app_submit_member_request('deletion', 'Please delete my account.');
  if (select count(*) from public.app_my_member_requests()) <> 3 or (select status from public.app_my_member_requests() where id = v_access) <> 'withdrawn' then
    raise exception 'FAIL: D''s requests are wrong';
  end if;
  raise notice 'PASS: members ask for a copy, a correction or deletion; one open request of each kind; they can withdraw';
end $$;
commit;
begin;
select pg_temp.as_member('9a04');
set local role authenticated;
do $$
begin
  if exists (select 1 from public.app_my_member_requests()) then
    raise exception 'FAIL: M sees someone else''s requests';
  end if;
  perform pg_temp.expect_error('select public.app_founder_member_requests()', 'not_founder', 'a member reading requests');
  perform pg_temp.expect_error('select public.app_founder_delete_member(1, ''pr_d'')', 'not_founder', 'a member deleting an account');
  raise notice 'PASS: requests are private to the member and the founder';
end $$;
commit;

-- 4. The founder resolves the copy request and deletes D's account.
create temporary table before_counts as
select (select count(*) from sim.points_ledger) as ledger_rows,
       (select coalesce(sum(points), 0) from sim.points_ledger where member_id is not null and member_id <> pg_temp.g('9a02')) as others_points,
       (select count(*) from ads.impressions) as impressions,
       (select count(*) from ops.feedback_actions) as feedback_audit;
grant select on before_counts to authenticated;

begin;
select pg_temp.as_member('9a01');
set local role authenticated;
do $$
declare
  v_access bigint := (select id from public.app_founder_member_requests() where kind = 'access' and status = 'open');
  v_delete bigint := (select id from public.app_founder_member_requests() where kind = 'deletion' and status = 'open');
  r jsonb;
begin
  if (select username from public.app_founder_member_requests() where id = v_delete) <> 'pr_d' then
    raise exception 'FAIL: the founder cannot see who asked';
  end if;
  perform pg_temp.expect_error(pg_catalog.format('select public.app_founder_resolve_member_request(%s, true, '''')', v_access), 'note_required', 'resolving without a note');
  perform pg_temp.expect_error(pg_catalog.format('select public.app_founder_resolve_member_request(%s, true, ''done'')', v_delete), 'use_delete_account', 'completing a deletion without deleting');
  perform public.app_founder_resolve_member_request(v_access, true, 'Sent the export by email');
  perform pg_temp.expect_error(pg_catalog.format('select public.app_founder_delete_member(%s, ''pr_m'')', v_delete), 'confirmation_mismatch', 'deleting with the wrong username');
  perform pg_temp.expect_error(pg_catalog.format('select public.app_founder_delete_member(%s, ''pr_d'')', v_access), 'not_found', 'deleting through a copy request');
  r := public.app_founder_delete_member(v_delete, ' PR_D ');
  if (r->>'posts_removed')::int <> 1 or (r->>'awards_forfeited')::int < 1 then
    raise exception 'FAIL: the deletion summary is wrong: %', r;
  end if;
  if (select status from public.app_founder_member_requests() where id = v_delete) <> 'completed'
     or (select details from public.app_founder_member_requests() where id = v_delete) is not null
     or (select username from public.app_founder_member_requests() where id = v_delete) is not null then
    raise exception 'FAIL: the completed request still holds personal data';
  end if;
  perform pg_temp.expect_error(pg_catalog.format('select public.app_founder_delete_member(%s, ''pr_d'')', v_delete), 'not_found', 'deleting twice');
  raise notice 'PASS: the founder resolves requests with a note and deletes an account only through its request, with the username typed';
end $$;
commit;

do $$
declare
  b record;
begin
  select * into b from before_counts;
  if exists (select 1 from auth.users where id = pg_temp.g('9a02')) or exists (select 1 from public.profiles where id = pg_temp.g('9a02'))
     or exists (select 1 from social.posts where author_id = pg_temp.g('9a02')) or exists (select 1 from social.comments where author_id = pg_temp.g('9a02'))
     or exists (select 1 from social.follows where follower_id = pg_temp.g('9a02')) or exists (select 1 from social.likes where user_id = pg_temp.g('9a02'))
     or exists (select 1 from ops.feedback where submitter_id = pg_temp.g('9a02')) or exists (select 1 from ops.member_access where user_id = pg_temp.g('9a02')) then
    raise exception 'FAIL: some of D''s account remains';
  end if;
  -- The simulated ledger keeps every row (plus the forfeits), without the member.
  if (select count(*) from sim.points_ledger) <> b.ledger_rows + (select count(*) from sim.points_ledger where source_key like 'account_deleted:%')
     or (select count(*) from sim.points_ledger where source_key like 'account_deleted:%') < 2
     or exists (select 1 from sim.points_ledger where member_id = pg_temp.g('9a02'))
     or (select coalesce(sum(l.points), 0) from sim.points_ledger l
         where l.source_key like 'account_deleted:%'
            or l.id in (select f.reverses from sim.points_ledger f where f.source_key like 'account_deleted:%')) <> 0
     or (select coalesce(sum(points), 0) from sim.points_ledger where member_id is not null) <> b.others_points
     or exists (select 1 from sim.outstanding() where member_id is null) then
    raise exception 'FAIL: the ledger does not keep the anonymous history, or left points to allocate';
  end if;
  if (select count(*) from ads.impressions) <> b.impressions or exists (select 1 from ads.impressions where member_id = pg_temp.g('9a02')) then
    raise exception 'FAIL: ad observations were lost or still name the member';
  end if;
  if (select count(*) from ops.feedback_actions) < b.feedback_audit then
    raise exception 'FAIL: the feedback audit trail lost rows';
  end if;
  if (select count(*) from ops.member_request_events e join ops.member_requests r on r.id = e.request_id
      where r.kind = 'deletion' and e.action = 'account_deleted') <> 1 then
    raise exception 'FAIL: the deletion is not in the audit trail';
  end if;
  if not exists (select 1 from ops.media_deletions) and exists (select 1 from social.media_uploads where user_id = pg_temp.g('9a02')) then
    raise exception 'FAIL: files were not queued';
  end if;
  raise notice 'PASS: deleting an account removes the member and their content, keeps the anonymous ledger and ad counts, forfeits unsettled points and is audited';
end $$;

-- 5. A founder account cannot be deleted this way.
do $$
declare
  v_req bigint;
begin
  insert into ops.member_requests (member_id, kind) values (pg_temp.g('9a01'), 'deletion') returning id into v_req;
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-fdfdfd009a01","role":"authenticated"}', true);
  begin
    perform public.app_founder_delete_member(v_req, 'pr_f');
    raise exception 'FAIL: the founder account was deleted';
  exception when others then
    if sqlerrm !~ 'cannot_delete_founder' then raise; end if;
  end;
  raise notice 'PASS: a founder account is never deleted through a request';
end $$;
