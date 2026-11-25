-- TEST ONLY (throwaway databases). Rewards (20261205000000): Connection
-- Points awarded server-side from the D6 table, integrity (dedup, self, caps,
-- reversals, pause), qualified referrals and their review, the simulated
-- 40/20/40 split, valuation and a reconciled simulated month close.
--
--   F = ...6101 the founder     C = ...6102 a creator     M = ...6103 a member
--   R = ...6104 a referrer      N = ...6105 joined through R's referral link
\set ON_ERROR_STOP on

set role supabase_auth_admin;
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-4000-8000-fdfdfd006101', 'rw-f@example.test', now(), '{}'),
  ('00000000-0000-4000-8000-fdfdfd006102', 'rw-c@example.test', now(), '{}'),
  ('00000000-0000-4000-8000-fdfdfd006103', 'rw-m@example.test', now(), '{}'),
  ('00000000-0000-4000-8000-fdfdfd006104', 'rw-r@example.test', now(), '{}'),
  ('00000000-0000-4000-8000-fdfdfd006105', 'rw-n@example.test', now(), '{}');
reset role;
update public.profiles p set username = 'rw_' || v.u, display_name = 'Rw ' || upper(v.u)
from (values ('6101', 'f'), ('6102', 'c'), ('6103', 'm'), ('6104', 'r'), ('6105', 'n')) v(n, u)
where p.id = ('00000000-0000-4000-8000-fdfdfd00' || v.n)::uuid;
update ops.member_launch_settings set founder_user_id = '00000000-0000-4000-8000-fdfdfd006101' where id;
select ops.grant_member_access('00000000-0000-4000-8000-fdfdfd006101', 'founder', 'rw-test');
select ops.grant_member_access(('00000000-0000-4000-8000-fdfdfd00' || n)::uuid, 'fan', 'rw-test') from unnest(array['6102', '6103', '6104', '6105']) n;
insert into ops.age_attestations (user_id, wording_version, source)
select ('00000000-0000-4000-8000-fdfdfd00' || n)::uuid, 'adult-v1', 'test' from unnest(array['6101', '6102', '6103', '6104', '6105']) n
on conflict do nothing;
-- N joined through R's referral link.
insert into ops.registrations (user_id, kind, referrer_id, cohort, account_created_at)
values ('00000000-0000-4000-8000-fdfdfd006105', 'referral', '00000000-0000-4000-8000-fdfdfd006104', 'fan', now());

create function pg_temp.expect_error(sql text, expected text, what text)
returns void language plpgsql as $$
declare got text;
begin
  begin execute sql; exception when others then got := sqlerrm; end;
  if got is null then raise exception 'FAIL: % succeeded, expected "%"', what, expected; end if;
  if got !~ expected then raise exception 'FAIL: % failed with "%", expected "%"', what, got, expected; end if;
end; $$;
grant execute on function pg_temp.expect_error(text, text, text) to authenticated, anon;
create function pg_temp.w(n text) returns uuid language sql immutable as $$ select ('00000000-0000-4000-8000-fdfdfd00' || n)::uuid $$;
grant execute on function pg_temp.w(text) to authenticated, anon;
create function pg_temp.pts(m text) returns text language sql as $$
  select (select string_agg(action || ':' || points || ':' || status, ',' order by id) from sim.points_ledger where member_id = pg_temp.w(m)) $$;

insert into social.posts (id, author_id, body) values
  (pg_temp.w('6201'), pg_temp.w('6102'), 'C post one'),
  (pg_temp.w('6202'), pg_temp.w('6102'), 'C post two'),
  (pg_temp.w('6203'), pg_temp.w('6103'), 'M own post');

-- ---------------------------------------------------------------------------
-- 1. Awards from real actions, once each; never for your own content.
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-fdfdfd006103","role":"authenticated"}', true);
set local role authenticated;
do $$
declare k uuid;
begin
  perform public.app_add_comment(pg_temp.w('6201'), 'Short');                                   -- not meaningful: nothing
  perform public.app_add_comment(pg_temp.w('6201'), 'This really helped me plan my month.');    -- 2
  perform public.app_add_comment(pg_temp.w('6203'), 'Commenting on my own post at length here.'); -- own: nothing
  perform public.app_save(pg_temp.w('6201'));                                                   -- 2
  perform public.app_unsave(pg_temp.w('6201'));
  perform public.app_save(pg_temp.w('6201'));                                                   -- same post again: nothing
  perform public.app_save(pg_temp.w('6203'));                                                   -- own: nothing
  perform public.app_repost(pg_temp.w('6202'));                                                 -- 5
  perform public.app_record_share(pg_temp.w('6202'), 'copy_link');                              -- 5
  perform public.app_record_share(pg_temp.w('6202'), 'share_sheet');                            -- same post: nothing
  perform public.app_like(pg_temp.w('6202'));                                                   -- 0: nothing
  perform pg_temp.expect_error('select count(*) from sim.points_ledger', 'permission denied', 'reading the ledger directly');
end $$;
commit;
do $$
begin
  if pg_temp.pts('6103') <> 'meaningful_comment:2:recognized,save:2:recognized,repost:5:recognized,external_share:5:recognized' then
    raise exception 'FAIL: M''s awards: %', pg_temp.pts('6103');
  end if;
  raise notice 'PASS: meaningful comments, saves, reposts and shares earn the D6 points once each; likes, short comments and your own content earn nothing';
end $$;

-- A deleted comment reverses its points (a new row; nothing is edited).
begin;
select set_config('test.comment', (select id::text from social.comments where author_id = '00000000-0000-4000-8000-fdfdfd006103' and body like 'This really%'), true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-fdfdfd006103","role":"authenticated"}', true);
set local role authenticated;
select public.app_delete_comment(current_setting('test.comment')::uuid);
commit;
do $$
begin
  if (select sum(points) from sim.points_ledger where member_id = pg_temp.w('6103') and action = 'meaningful_comment') <> 0
     or (select count(*) from sim.points_ledger where member_id = pg_temp.w('6103') and status = 'reversal') <> 1 then
    raise exception 'FAIL: deleting the comment should reverse its 2 points once';
  end if;
  perform pg_temp.expect_error('update sim.points_ledger set points = 99', 'append-only', 'editing the ledger');
  perform pg_temp.expect_error('delete from sim.points_ledger', 'append-only', 'deleting from the ledger');
  raise notice 'PASS: a deleted comment reverses its points with a new ledger row; the ledger is append-only';
end $$;

-- Daily caps and the pause switch.
do $$
begin
  for i in 1..12 loop
    perform sim.award(pg_temp.w('6104'), 'repost', 'cap-test:' || i, pg_temp.w('6102'), null);
  end loop;
  if (select count(*) from sim.points_ledger where member_id = pg_temp.w('6104') and action = 'repost') <> 10 then
    raise exception 'FAIL: reposts are capped at 10 a day';
  end if;
  update sim.reward_settings set paused = true where id;
  perform sim.award(pg_temp.w('6104'), 'save', 'pause-test', pg_temp.w('6102'), null);
  update sim.reward_settings set paused = false where id;
  if exists (select 1 from sim.points_ledger where source_key = 'pause-test') then
    raise exception 'FAIL: nothing is awarded while paused';
  end if;
  perform sim.award(pg_temp.w('6104'), 'ad_view', 'ad-test', null, null);
  if exists (select 1 from sim.points_ledger where source_key = 'ad-test') then
    raise exception 'FAIL: viewing an ad earns nothing';
  end if;
  raise notice 'PASS: daily caps hold, the pause switch stops awards, and viewing ads earns nothing';
end $$;

-- ---------------------------------------------------------------------------
-- 2. Qualified referral: N's own first follow, held for review; once only.
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-fdfdfd006105","role":"authenticated"}', true);
set local role authenticated;
select public.app_follow('00000000-0000-4000-8000-fdfdfd006102', 'discover');
select public.app_follow('00000000-0000-4000-8000-fdfdfd006103', 'discover');
commit;
do $$
begin
  if (select string_agg(action || ':' || points || ':' || status, ',') from sim.points_ledger where member_id = pg_temp.w('6104') and action = 'qualified_referral')
     <> 'qualified_referral:100:pending_review' then
    raise exception 'FAIL: R should have one pending 100-point referral';
  end if;
  raise notice 'PASS: a referred member''s first intentional follow makes one qualified referral (100, redeemable), held for review';
end $$;
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-fdfdfd006103","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  perform pg_temp.expect_error('select * from public.app_founder_referral_queue()', 'not_founder', 'a member reading the referral queue');
end $$;
commit;
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-fdfdfd006101","role":"authenticated"}', true);
set local role authenticated;
do $$
declare a bigint;
begin
  select award_id into a from public.app_founder_referral_queue() where referrer_username = 'rw_r';
  if a is null or (select referred_username from public.app_founder_referral_queue() where award_id = a) <> 'rw_n' then
    raise exception 'FAIL: the queue should show R referred N';
  end if;
  perform public.app_founder_review_referral(a, true);
  perform pg_temp.expect_error(format('select public.app_founder_review_referral(%s, false)', a), 'not_found', 'reviewing twice');
end $$;
commit;

-- ---------------------------------------------------------------------------
-- 3. Simulated revenue, the 40/20/40 split, valuation and the month close.
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-fdfdfd006101","role":"authenticated"}', true);
set local role authenticated;
do $$
declare o record; c record;
begin
  perform public.app_founder_record_sim_revenue((now() - interval '1 month')::date, 'content_ad', pg_temp.w('6102'), pg_temp.w('6201'), 10001, 'simulated pilot campaign');
  perform public.app_founder_record_sim_revenue((now() - interval '1 month')::date, 'feed_ad', null, null, 5000, 'simulated feed slot');
  perform pg_temp.expect_error('select public.app_founder_record_sim_revenue(now()::date, ''content_ad'', null, null, 100, ''x'')', 'invalid_request', 'content revenue without a creator');
  select * into o from public.app_founder_rewards_overview();
  if o.revenue_cents <> 15001 or o.creator_cents <> 4000 or o.pool_cents <> 2000 or o.splitpost_cents <> 9001 or o.open_pool_cents <> 2000 then
    raise exception 'FAIL: split should be creator 4000, pool 2000, Splitpost 9001 (feed revenue all to Splitpost): %', o;
  end if;
  if o.creator_cents + o.pool_cents + o.splitpost_cents <> o.revenue_cents then
    raise exception 'FAIL: the split does not add up';
  end if;
  perform pg_temp.expect_error('select * from public.app_founder_close_month(now()::date)', 'month_not_over', 'closing the current month');
  select * into c from public.app_founder_close_month((now() - interval '1 month')::date);
  if c.pool_cents <> 2000 or c.allocated_cents <> 2000 or c.points <> 100 or c.members <> 1 then
    raise exception 'FAIL: the close should allocate the 2000-cent pool to R''s 100 points: %', c;
  end if;
  perform pg_temp.expect_error('select * from public.app_founder_close_month((now() - interval ''1 month'')::date)', 'already_closed', 'closing twice');
  raise notice 'PASS: simulated revenue splits 40/20/40 for content ads and 100%% Splitpost for feed ads; the month close reconciles to the cent and runs once';
end $$;
commit;
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-fdfdfd006104","role":"authenticated"}', true);
set local role authenticated;
do $$
declare p record;
begin
  select * into p from public.app_my_points();
  if p.settled <> 100 or p.redeemable_approved <> 0 or p.redeemable_pending <> 0 or p.recognized <> 50 then
    raise exception 'FAIL: R''s points after settlement: %', p;
  end if;
  if (select count(*) from public.app_my_points_history(null, 50)) < 3 then
    raise exception 'FAIL: R should see their history';
  end if;
  raise notice 'PASS: My Split shows recognized, redeemable and settled points from the member''s own ledger';
end $$;
commit;
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-fdfdfd006102","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  if (select creator_cents from public.app_my_simulated_earnings()) <> 4000 then
    raise exception 'FAIL: C''s simulated earnings should be 4000 cents';
  end if;
  raise notice 'PASS: creators see their simulated 40%% share, by month';
end $$;
commit;
do $$
begin
  if (select sum(value_cents) from sim.settlement_lines) <> (select sum(pool_cents) from sim.settlements) then
    raise exception 'FAIL: settlement lines do not reconcile with the pool';
  end if;
  raise notice 'PASS: every simulated settlement reconciles';
end $$;
