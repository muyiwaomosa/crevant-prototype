-- TEST ONLY (throwaway databases). Unified onboarding (20261211000000):
-- creator posting topics and suggestions, who invited me, the founder's
-- invitation tools, and advertising requests from a member's own account.
--
--   F = ...8a01 founder   C = ...8a02 creator (invites N)   N = ...8a03 joined through C's link
--   M = ...8a04 member who likes food   Z = ...8a05 reads only   P = ...8a06 posts, no posting topics
\set ON_ERROR_STOP on

set role supabase_auth_admin;
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
select ('00000000-0000-4000-8000-fdfdfd00' || n)::uuid, 'ou-' || n || '@example.test', now(), '{}'
from unnest(array['8a01', '8a02', '8a03', '8a04', '8a05', '8a06']) n;
reset role;
update public.profiles p set username = 'ou_' || v.u, display_name = 'Ou ' || upper(v.u)
from (values ('8a01', 'f'), ('8a02', 'c'), ('8a03', 'n'), ('8a04', 'm'), ('8a05', 'z'), ('8a06', 'p')) v(n, u)
where p.id = ('00000000-0000-4000-8000-fdfdfd00' || v.n)::uuid;
update ops.member_launch_settings set founder_user_id = '00000000-0000-4000-8000-fdfdfd008a01' where id;
select ops.grant_member_access('00000000-0000-4000-8000-fdfdfd008a01', 'founder', 'ou-test');
select ops.grant_member_access(('00000000-0000-4000-8000-fdfdfd00' || n)::uuid, 'fan', 'ou-test') from unnest(array['8a02', '8a03', '8a04', '8a05', '8a06']) n;

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

-- N joined through C's personal link; P has a post; M likes food.
insert into ops.registrations (user_id, kind, referrer_id, cohort, account_created_at)
values (pg_temp.g('8a03'), 'referral', pg_temp.g('8a02'), 'fan', now());
insert into social.posts (id, author_id, body) values (pg_temp.g('8b01'), pg_temp.g('8a06'), 'P on travel');
insert into social.member_topics (user_id, topic) values (pg_temp.g('8a04'), 'food'), (pg_temp.g('8a06'), 'travel');

-- 1. Creator setup: at most three active topics, never required.
begin;
select pg_temp.as_member('8a02');
set local role authenticated;
do $$
declare
  s jsonb;
begin
  perform pg_temp.expect_error('select public.app_set_creator_topics(array[''food'', ''music'', ''travel'', ''art''])', 'too_many_posting_topics', 'four posting topics');
  perform pg_temp.expect_error('select public.app_set_creator_topics(array[''not_a_topic''])', 'invalid_posting_topic', 'an unknown topic');
  if public.app_set_creator_topics(array['music', 'food', 'food']) <> array['food', 'music'] then
    raise exception 'FAIL: posting topics are not saved once each, in display order';
  end if;
  s := public.app_my_creator_setup();
  if s->'posting_topics' <> '["food", "music"]'::jsonb or (s->>'posts')::int <> 0 or (s->>'joined_through_my_link')::int <> 1 then
    raise exception 'FAIL: C''s creator setup is wrong: %', s;
  end if;
  raise notice 'PASS: creator setup keeps at most three active posting topics and counts who joined through the creator''s link';
end $$;
commit;

-- 2. Suggestions: posting topics or posts make someone a creator; readers are not suggested.
begin;
select pg_temp.as_member('8a04');
set local role authenticated;
do $$
declare
  ids uuid[];
  r record;
begin
  select array_agg(id order by ord) into ids
  from (select id, row_number() over () ord from public.app_suggested_creators(20)) s
  where id::text like '00000000-0000-4000-8000-fdfdfd008a0_';
  if ids <> array[pg_temp.g('8a02'), pg_temp.g('8a06')] then
    raise exception 'FAIL: M''s suggestions should be C (posts about food) then P (has posted), never Z or N: %', ids;
  end if;
  select * into r from public.app_suggested_creators(20) where id = pg_temp.g('8a02');
  if r.topics <> array['food', 'music'] or r.shared_topics <> 1 then
    raise exception 'FAIL: C''s suggestion card should show the posting topics and one match: %', r;
  end if;
  if public.app_member_creator_topics(pg_temp.g('8a02')) <> array['food', 'music'] or cardinality(public.app_member_creator_topics(pg_temp.g('8a05'))) <> 0 then
    raise exception 'FAIL: posting topics on a profile are wrong';
  end if;
  if exists (select 1 from public.app_my_inviter()) then
    raise exception 'FAIL: M was invited by nobody';
  end if;
  raise notice 'PASS: creator suggestions include members who chose posting topics or published, best match first; readers are not suggested';
end $$;
commit;

-- Hidden profile details hide the posting topics too.
update social.profile_details set hidden_at = now() where user_id = pg_temp.g('8a02');
insert into social.profile_details (user_id, hidden_at) values (pg_temp.g('8a02'), now()) on conflict (user_id) do update set hidden_at = now();
begin;
select pg_temp.as_member('8a04');
set local role authenticated;
do $$
begin
  if cardinality(public.app_member_creator_topics(pg_temp.g('8a02'))) <> 0
     or cardinality((select topics from public.app_suggested_creators(20) where id = pg_temp.g('8a02'))) <> 0 then
    raise exception 'FAIL: hidden details still show posting topics';
  end if;
  raise notice 'PASS: a moderator hiding profile details also hides the posting topics';
end $$;
commit;
update social.profile_details set hidden_at = null where user_id = pg_temp.g('8a02');

-- 3. Who invited me: shown, never followed automatically.
do $$
begin
  if exists (select 1 from social.follows where follower_id = pg_temp.g('8a03')) then
    raise exception 'FAIL: N follows someone without choosing to';
  end if;
end $$;
begin;
select pg_temp.as_member('8a03');
set local role authenticated;
do $$
declare
  r record;
begin
  select * into r from public.app_my_inviter();
  if r.id is distinct from pg_temp.g('8a02') or r.following or r.username <> 'ou_c' or r.posting_topics <> array['food', 'music'] then
    raise exception 'FAIL: N should see C as the inviter, not yet followed: %', r;
  end if;
  perform public.app_follow(pg_temp.g('8a02'));
  if not (select following from public.app_my_inviter()) then
    raise exception 'FAIL: following the inviter is not reflected';
  end if;
  raise notice 'PASS: a new member sees who invited them and follows only by choice';
end $$;
commit;

-- 4. Founder invitation tools.
begin;
select pg_temp.as_member('8a04');
set local role authenticated;
do $$
begin
  perform pg_temp.expect_error('select public.app_founder_invitation_links()', 'not_founder', 'a member listing invitation links');
  perform pg_temp.expect_error('select public.app_founder_create_creator_invitation(''ou_c'', 10, 14)', 'not_founder', 'a member creating a creator link');
  perform pg_temp.expect_error('select public.app_founder_revoke_invitation_link(''0123456789abcdef'')', 'not_founder', 'a member revoking a link');
  raise notice 'PASS: only the founder manages invitation links';
end $$;
commit;
begin;
select pg_temp.as_member('8a01');
set local role authenticated;
do $$
declare
  v_code text;
  r record;
begin
  perform pg_temp.expect_error('select public.app_founder_create_creator_invitation(''nobody_here'', 10, 14)', 'unknown_member', 'a link for an unknown creator');
  perform pg_temp.expect_error('select public.app_founder_create_creator_invitation(''ou_c'', 10, 0)', 'invalid_expiry', 'a link that never lasts');
  perform pg_temp.expect_error('select public.app_founder_create_creator_invitation(''ou_c'', 0, 14)', 'invalid_max_uses', 'a link with no uses');
  v_code := public.app_founder_create_creator_invitation('OU_C', 25, 14);
  if v_code !~ '^[0-9a-f]{16}$' then
    raise exception 'FAIL: the creator link code is %', v_code;
  end if;
  select * into r from public.app_founder_invitation_links() where code = v_code;
  if r.creator_username <> 'ou_c' or r.max_uses <> 25 or r.uses <> 0 or r.revoked_at is not null or r.registered <> 0 then
    raise exception 'FAIL: the link list is wrong: %', r;
  end if;
  if (select count(*) from public.app_founder_invitation_links() where creator_username is null and code is null) <> 0 then
    raise exception 'FAIL: an invitation link has no code';
  end if;
  perform public.app_founder_revoke_invitation_link(v_code);
  if (select revoked_at from public.app_founder_invitation_links() where code = v_code) is null then
    raise exception 'FAIL: the link was not revoked';
  end if;
  perform pg_temp.expect_error(pg_catalog.format('select public.app_founder_revoke_invitation_link(%L)', v_code), 'not_found', 'revoking twice');
  raise notice 'PASS: the founder creates creator-attributed links, lists them with uses and joins, and revokes them';
end $$;
commit;
do $$
begin
  if (select creator_id from ops.registration_links where kind = 'invitation' order by created_at desc limit 1) <> pg_temp.g('8a02') then
    raise exception 'FAIL: the link is not attributed to the creator';
  end if;
  if (select status from ops.registration_check((select code from ops.registration_links where kind = 'invitation' order by created_at desc limit 1))) <> 'invalid' then
    raise exception 'FAIL: a revoked link still works';
  end if;
  if exists (select 1 from ops.registration_links x where x.kind = 'referral') and (
       select count(*) from ops.registration_links x where x.kind = 'invitation') <> (
       select count(*) from (select 1 from ops.registration_links x where x.kind = 'invitation' order by x.created_at desc limit 200) y) then
    raise exception 'FAIL: the invitation list is not limited to invitation links';
  end if;
  raise notice 'PASS: the link is attributed to the creator, and a revoked link no longer works';
end $$;

-- 5. Advertising from the member's own account.
begin;
select pg_temp.as_member('8a04');
set local role authenticated;
do $$
declare
  v_id uuid;
  a jsonb;
  good jsonb := '{"name": "Budgetly Ou", "website": "https://budgetly.example", "offering": "A budgeting app", "problem_solved": "Money stress",
                  "desired_outcome": "People save more", "customer_needs": "A simple plan", "objective": "sign_ups",
                  "conversion_action": "Create an account", "categories": ["software_apps"]}';
begin
  perform pg_temp.expect_error('select public.app_request_advertising(''{"name": "X"}'')', 'invalid_request', 'an incomplete request');
  perform pg_temp.expect_error('select public.app_request_advertising(' || quote_literal((good || '{"website": "http://x.example"}')::text) || ')', 'invalid_request', 'a website without https');
  perform pg_temp.expect_error('select public.app_request_advertising(' || quote_literal((good || '{"categories": ["health"]}')::text) || ')', 'invalid_ad_category', 'a sensitive category');
  v_id := public.app_request_advertising(good);
  perform pg_temp.expect_error('select public.app_request_advertising(' || quote_literal(good::text) || ')', 'request_pending', 'a second open request');
  a := public.app_my_advertising();
  if jsonb_array_length(a->'requests') <> 1 or a->'requests'->0->>'status' <> 'pending' or (a->'requests'->0->>'id')::uuid <> v_id
     or jsonb_array_length(a->'campaigns') <> 0 then
    raise exception 'FAIL: M''s advertising page is wrong: %', a;
  end if;
  raise notice 'PASS: any member can ask to advertise from their own account; one open request; the same validation as managed onboarding';
end $$;
commit;

do $$
begin
  if (select requested_by from ads.advertisers where name = 'Budgetly Ou') <> pg_temp.g('8a04') or (select status from ads.advertisers where name = 'Budgetly Ou') <> 'pending' then
    raise exception 'FAIL: the request is not a pending advertiser tied to M';
  end if;
end $$;

-- The founder sees who asked, approves, and runs a campaign for it.
begin;
select pg_temp.as_member('8a01');
set local role authenticated;
do $$
declare
  v_adv uuid := (select (x->>'id')::uuid from jsonb_array_elements(public.app_founder_ads()->'advertisers') x where x->>'name' = 'Budgetly Ou');
begin
  if (select x->>'requested_by_username' from jsonb_array_elements(public.app_founder_ads()->'advertisers') x where x->>'name' = 'Budgetly Ou') <> 'ou_m' then
    raise exception 'FAIL: the founder does not see who asked';
  end if;
  perform public.app_founder_review_advertiser(v_adv, true, 'Fits the policy');
  raise notice 'PASS: the founder sees the requesting member and approves through managed onboarding';
end $$;
commit;
insert into ads.campaigns (id, advertiser_id, name, status, placement, categories, starts_on, ends_on, headline, body, cta_label, landing_url)
select pg_temp.g('8c01'), a.id, 'Budgetly launch', 'active', 'feed', array['software_apps'], current_date, current_date + 30,
       'Save more', 'A plan that fits', 'Try it', 'https://budgetly.example/start'
from ads.advertisers a where a.name = 'Budgetly Ou';
insert into ads.advertiser_feedback (campaign_id, satisfaction) values (pg_temp.g('8c01'), 4);

begin;
select pg_temp.as_member('8a04');
set local role authenticated;
do $$
declare
  a jsonb := public.app_my_advertising();
  r jsonb;
begin
  if jsonb_array_length(a->'campaigns') <> 1 or a->'campaigns'->0->>'name' <> 'Budgetly launch' then
    raise exception 'FAIL: M does not see their campaign: %', a;
  end if;
  r := public.app_my_campaign_report(pg_temp.g('8c01'));
  if r ? 'advertiser_satisfaction' or r->'relevant' <> 'null'::jsonb or r->'reach' <> 'null'::jsonb or r->>'kind' <> 'actual observations' then
    raise exception 'FAIL: M''s report should be aggregate, without the private satisfaction note, groups under 10 withheld: %', r;
  end if;
  raise notice 'PASS: an approved advertiser sees their own campaigns and an aggregate report with groups under 10 withheld';
end $$;
commit;
begin;
select pg_temp.as_member('8a05');
set local role authenticated;
do $$
begin
  perform pg_temp.expect_error('select public.app_my_campaign_report(' || quote_literal(pg_temp.g('8c01')::text) || ')', 'not_found', 'another member reading the report');
  if jsonb_array_length(public.app_my_advertising()->'requests') <> 0 then
    raise exception 'FAIL: Z sees someone else''s requests';
  end if;
  raise notice 'PASS: no member sees another advertiser''s requests or reports';
end $$;
commit;
