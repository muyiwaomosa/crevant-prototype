-- Staging only: a review fixture for founder acceptance (SP-UX-003, check 8).
--
-- Prepares ONE dedicated fixture supporter account that has met the
-- APPROVED supporter (consumer) goals for real, so the real
-- sim.check_qualification records it and it shows "Under review"; the founder
-- then signs in as it and approves it in Control Center. Nothing about the
-- goals, the rewards rules or eligibility changes: no write to
-- sim.goal_versions, sim.qualifications is only written by
-- sim.check_qualification itself, and every action goes through the member
-- functions (app_*) as the fixture accounts, so caps, deduplication and
-- integrity rules apply.
--
-- Test data, classified as test data: every account this script creates is
-- an active member of the 'tester' cohort (the cohort the North Star,
-- activation and progression scorecard already exclude), granted by
-- 'staging-review-fixture', and marked {"staging_review_fixture": true} in
-- its auth metadata. Names say so: "Review fixture ...". The supporting
-- accounts (10 creators, 5 referred members) use addresses on the reserved
-- .invalid domain, have no password and are banned in Auth: they can never
-- sign in. The fixture supporter's address comes only from the staging
-- environment secret STAGING_FIXTURE_MEMBER_EMAIL (never printed); it has no
-- password either: the founder sets one with "Forgot password".
--
-- Run by .github/workflows/staging-review-fixture.yml (tested by
-- scripts/db/staging-review-fixture-test.sh). psql variables:
--   -v mode=seed      prepare it (committed). Idempotent: once the fixture
--                     supporter has its qualification, a re-run changes nothing.
--   -v mode=dry-run   the same, then ROLLBACK: changes nothing (optional).
--   -v mode=remove    delete every fixture account and, through the same
--                     deletion as an account deletion (auth.users cascade and
--                     the deletion register trigger), everything they made.
--   -v journey=supporter   the journey to prepare (only supporter for now; a
--                     creator journey can be added as another branch below).
-- Environment: STAGING_FOUNDER_ACCOUNT_ID (the staging launch founder, the
-- database's own proof that this is staging) and, for seed and dry-run,
-- STAGING_FIXTURE_MEMBER_EMAIL.
--
-- Backdating (the only one, documented): "Support your Clique in different
-- weeks" needs meaningful support in 4 distinct UTC weeks of the last 28
-- days, and a single run happens in one week. Three supporting saves are
-- therefore recorded 7, 14 and 21 days ago: for each, the post (by a fixture
-- creator) is written an hour earlier, then the ledger award exactly as
-- sim.award writes it (same rule version, points, status and source key),
-- then the save itself with the same time, so the save trigger finds the
-- award and adds nothing. Everything else happens now, through the app.
--
-- Referrals: five fixture members join through the fixture supporter's own
-- referral link (a registration row, as a claim writes it, and the link's use
-- counted) and follow a creator, so the real trigger records each qualified
-- referral, pending review. The fixture then records the review as the
-- founder's review function would, with the key suffix
-- 'staging-review-fixture' so it is never mistaken for the founder's own.

\set ON_ERROR_STOP on
\pset footer off

\if :{?mode}
\else
  do $$ begin raise exception 'refused: set -v mode=seed, dry-run or remove'; end $$;
\endif
\if :{?journey}
\else
  \set journey supporter
\endif
\getenv fx_founder STAGING_FOUNDER_ACCOUNT_ID
\getenv fx_email STAGING_FIXTURE_MEMBER_EMAIL
\if :{?fx_founder}
\else
  \set fx_founder ''
\endif
\if :{?fx_email}
\else
  \set fx_email ''
\endif

select count(*) as fx_before from auth.users u where u.raw_user_meta_data ->> 'staging_review_fixture' = 'true' \gset

begin;
set local lock_timeout = '10s';
set local statement_timeout = '300s';
-- Only booleans are shown, never the address or the founder's id.
select set_config('fx.mode', :'mode', true) as mode,
       set_config('fx.journey', :'journey', true) as journey,
       set_config('fx.founder', lower(btrim(:'fx_founder')), true) <> '' as founder_given,
       set_config('fx.email', lower(btrim(:'fx_email')), true) <> '' as address_given;

-- Runs one statement as a member (their JWT, the authenticated role), then
-- returns to the script's own role. Errors stop everything (one transaction).
create function pg_temp.fx_as(p_member uuid, p_sql text) returns void language plpgsql as $$
begin
  perform pg_catalog.set_config('request.jwt.claims',
    pg_catalog.jsonb_build_object('sub', p_member, 'role', 'authenticated')::text, true);
  set local role authenticated;
  execute p_sql;
  reset role;
  perform pg_catalog.set_config('request.jwt.claims', '', true);
end $$;

-- A fixture account: created once, an active tester, adult confirmed, named.
-- p_can_sign_in: only the fixture supporter; the others are banned in Auth.
create function pg_temp.fx_account(p_id uuid, p_email text, p_username text, p_display text, p_can_sign_in boolean)
returns uuid language plpgsql as $$
declare
  v_cols text := 'id, email, email_confirmed_at, raw_user_meta_data, created_at';
  v_vals text;
  c record;
begin
  if not exists (select 1 from auth.users u where u.id = p_id) then
    v_vals := pg_catalog.format('%L, %L, now(), %L, now()', p_id, p_email, '{"staging_review_fixture": true}');
    -- Hosted Auth columns, where present: string columns Auth reads must not be null.
    for c in select x.col, x.val from (values
        ('instance_id', pg_catalog.quote_literal('00000000-0000-0000-0000-000000000000')),
        ('aud', '''authenticated'''), ('role', '''authenticated'''),
        ('raw_app_meta_data', pg_catalog.quote_literal('{"provider": "email", "providers": ["email"], "staging_review_fixture": true}')),
        ('updated_at', 'now()'),
        ('confirmation_token', ''''''), ('recovery_token', ''''''), ('email_change_token_new', ''''''),
        ('email_change_token_current', ''''''), ('email_change', ''''''), ('phone_change', ''''''),
        ('phone_change_token', ''''''), ('reauthentication_token', ''''''),
        ('banned_until', case when p_can_sign_in then 'null' else 'now() + interval ''100 years''' end)) x(col, val)
      where exists (select 1 from information_schema.columns i
                    where i.table_schema = 'auth' and i.table_name = 'users' and i.column_name = x.col and i.is_generated = 'NEVER') loop
      v_cols := v_cols || ', ' || c.col;
      v_vals := v_vals || ', ' || c.val;
    end loop;
    execute pg_catalog.format('insert into auth.users (%s) values (%s)', v_cols, v_vals);
    -- The supporter can recover a password by email: Auth needs its email identity.
    if p_can_sign_in and pg_catalog.to_regclass('auth.identities') is not null then
      v_cols := 'user_id, identity_data, provider';
      v_vals := pg_catalog.format('%L, %L, %L', p_id,
                  pg_catalog.jsonb_build_object('sub', p_id::text, 'email', p_email, 'email_verified', true), 'email');
      for c in select x.col, x.val from (values
          ('provider_id', pg_catalog.quote_literal(p_id::text)), ('created_at', 'now()'), ('updated_at', 'now()')) x(col, val)
        where exists (select 1 from information_schema.columns i
                      where i.table_schema = 'auth' and i.table_name = 'identities' and i.column_name = x.col and i.is_generated = 'NEVER') loop
        v_cols := v_cols || ', ' || c.col;
        v_vals := v_vals || ', ' || c.val;
      end loop;
      execute pg_catalog.format('insert into auth.identities (%s) values (%s)', v_cols, v_vals);
    end if;
  end if;
  if not exists (select 1 from ops.member_access a where a.user_id = p_id and a.status = 'active' and a.cohort = 'tester') then
    perform ops.grant_member_access(p_id, 'tester', 'staging-review-fixture', null, 'Staging review fixture: test data');
  end if;
  perform pg_temp.fx_as(p_id, $q$select public.app_attest_adult('adult-v1')$q$);
  if not exists (select 1 from public.profiles p where p.id = p_id and p.username = p_username) then
    perform pg_temp.fx_as(p_id, pg_catalog.format('select public.app_set_profile(%L, %L)', p_username, p_display));
  end if;
  return p_id;
end $$;

-- Fixture ids that never change between runs (so every step is idempotent).
create function pg_temp.fx_id(p_what text) returns uuid language sql immutable as $$
  select pg_catalog.md5('staging-review-fixture:' || p_what)::uuid $$;

-- 0. Preconditions. Nothing has been changed yet.
do $$
declare
  v_mode text := current_setting('fx.mode');
  v_founder text := current_setting('fx.founder');
  v_email text := current_setting('fx.email');
begin
  if v_mode not in ('seed', 'dry-run', 'remove') then
    raise exception 'refused: mode must be seed, dry-run or remove';
  end if;
  if v_mode <> 'remove' and current_setting('fx.journey') <> 'supporter' then
    raise exception 'refused: journey must be supporter (the only journey this fixture prepares for now)';
  end if;
  -- Member Production carries its environment marker: never there.
  if pg_catalog.to_regclass('env_identity.marker') is not null then
    raise exception 'refused: this is the member Production database (env_identity.marker); the review fixture runs on staging only';
  end if;
  -- The database's own proof that it is staging: its launch founder is the
  -- staging founder account (a staging environment secret). Member
  -- Production has its own founder account, so this can never match there.
  if v_founder !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     or not exists (select 1 from ops.member_launch_settings s where s.id and s.founder_user_id = v_founder::uuid) then
    raise exception 'refused: this database''s launch founder is not the staging founder account (STAGING_FOUNDER_ACCOUNT_ID); the review fixture runs on staging only';
  end if;
  -- A marked account that isn't a tester granted by the fixture is not ours to touch.
  if exists (select 1 from auth.users u
             where u.raw_user_meta_data ->> 'staging_review_fixture' = 'true'
               and not exists (select 1 from ops.member_access a
                               where a.user_id = u.id and a.cohort = 'tester' and a.updated_by = 'staging-review-fixture')) then
    raise exception 'refused: an account marked as fixture data is not a fixture tester; nothing was changed';
  end if;
  if v_mode = 'remove' then
    return;
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'refused: STAGING_FIXTURE_MEMBER_EMAIL is not set to an address';
  end if;
  -- The address must be the fixture supporter's own, never a real account's.
  if exists (select 1 from auth.users u where lower(u.email) = v_email
             and coalesce(u.raw_user_meta_data ->> 'staging_review_fixture', '') <> 'true') then
    raise exception 'refused: STAGING_FIXTURE_MEMBER_EMAIL belongs to an existing account that is not the fixture supporter';
  end if;
  if not ops.feature_on('sharing') then
    raise exception 'refused: sharing is switched off on staging, so "Share posts outside Splitpost" cannot be met; switch it on in Control Center first';
  end if;
  if (select r.paused from sim.reward_settings r where r.id) then
    raise exception 'refused: rewards are paused on staging, so no contribution can be recognized; resume them first';
  end if;
end $$;

-- 1. Seed (seed and dry-run): the supporter journey.
do $$
declare
  v_member uuid;
  v_creators uuid[] := '{}';
  v_posts uuid[] := '{}';
  v_post uuid;
  v_ref uuid;
  v_link uuid;
  v_award bigint;
  v_rule sim.point_rules%rowtype;
  v_version text;
  k integer;
  w integer;
begin
  if current_setting('fx.mode') = 'remove' then
    return;
  end if;
  select u.id into v_member from auth.users u where lower(u.email) = current_setting('fx.email');
  -- Already recorded (under review, or decided since): nothing more to do.
  if v_member is not null and exists (select 1 from sim.qualifications q where q.member_id = v_member and q.audience = 'consumer') then
    raise notice 'The fixture supporter already has its supporter qualification recorded: nothing changed.';
    return;
  end if;
  v_member := pg_temp.fx_account(coalesce(v_member, pg_catalog.gen_random_uuid()), current_setting('fx.email'),
                                 'review_fixture_supporter', 'Review fixture supporter', true);

  -- Ten fixture creators, three posts each (made now, through the app).
  for k in 1 .. 10 loop
    v_creators := v_creators || pg_temp.fx_account(pg_temp.fx_id('creator:' || k),
      'review-fixture-creator-' || k || '@staging-fixture.invalid',
      'review_fixture_c' || pg_catalog.lpad(k::text, 2, '0'), 'Review fixture creator ' || k, false);
    for w in 1 .. 3 loop
      perform pg_temp.fx_as(v_creators[k], pg_catalog.format(
        'select public.app_create_post(%L, %L::uuid)',
        pg_catalog.format('Review fixture post %s.%s: sample content for staging acceptance (test data).', k, w),
        pg_temp.fx_id('post:' || k || ':' || w)));
      v_posts := v_posts || (select s.id from social.posts s
                             where s.author_id = v_creators[k] and s.client_request_id = pg_temp.fx_id('post:' || k || ':' || w));
    end loop;
  end loop;

  -- FQ-01: the supporter follows all ten and keeps them in their Clique.
  for k in 1 .. 10 loop
    perform pg_temp.fx_as(v_member, pg_catalog.format('select public.app_follow(%L::uuid, %L)', v_creators[k], 'other'));
    perform pg_temp.fx_as(v_member, pg_catalog.format('select public.app_clique_add(%L::uuid)', v_creators[k]));
  end loop;

  -- FQ-02 (with ten creators engaged): 27 meaningful engagements now, all with Clique creators.
  for k in 1 .. 10 loop
    perform pg_temp.fx_as(v_member, pg_catalog.format('select public.app_save(%L::uuid)', v_posts[(k - 1) * 3 + 1]));
    perform pg_temp.fx_as(v_member, pg_catalog.format('select public.app_add_comment(%L::uuid, %L, %L::uuid)', v_posts[(k - 1) * 3 + 2],
      'Thank you, this is a helpful post for the staging review fixture.', pg_temp.fx_id('comment:' || k)));
    if k <= 7 then
      perform pg_temp.fx_as(v_member, pg_catalog.format('select public.app_repost(%L::uuid)', v_posts[(k - 1) * 3 + 3]));
    end if;
  end loop;

  -- FQ-03: three more saves, 7, 14 and 21 days ago (the documented backdating).
  select r.rule_version into v_version from sim.reward_settings r where r.id;
  select * into v_rule from sim.point_rules r where r.version = v_version and r.action = 'save';
  for w in 1 .. 3 loop
    v_post := pg_temp.fx_id('earlier-post:' || w);
    if not exists (select 1 from social.posts s where s.id = v_post) then
      insert into social.posts (id, author_id, body, created_at)
      values (v_post, v_creators[w], pg_catalog.format('Review fixture earlier post %s (test data).', w),
              pg_catalog.now() - pg_catalog.make_interval(days => 7 * w, hours => 1));
    end if;
    if not exists (select 1 from sim.points_ledger l where l.source_key = 'save:' || v_member || ':' || v_post) then
      insert into sim.points_ledger (member_id, action, points, redeemable, status, rule_version, source_key, creator_id, post_id, created_at)
      values (v_member, 'save', v_rule.points, v_rule.redeemable, 'recognized', v_version,
              'save:' || v_member || ':' || v_post, v_creators[w], v_post, pg_catalog.now() - pg_catalog.make_interval(days => 7 * w));
      insert into social.saves (member_id, post_id, saved_at)
      values (v_member, v_post, pg_catalog.now() - pg_catalog.make_interval(days => 7 * w))
      on conflict do nothing;
    end if;
  end loop;

  -- FQ-04: five shares outside Splitpost.
  for k in 1 .. 5 loop
    perform pg_temp.fx_as(v_member, pg_catalog.format('select public.app_record_share(%L::uuid, %L)', v_posts[(k - 1) * 3 + 1], 'copy_link'));
  end loop;

  -- FQ-05: five people join through the supporter's own referral link and follow a creator.
  perform pg_temp.fx_as(v_member, 'select public.app_my_referral_link()');
  select l.id into v_link from ops.registration_links l where l.owner_id = v_member and l.kind = 'referral' and l.revoked_at is null;
  for k in 1 .. 5 loop
    v_ref := pg_temp.fx_account(pg_temp.fx_id('referred:' || k),
      'review-fixture-referral-' || k || '@staging-fixture.invalid',
      'review_fixture_r' || k, 'Review fixture referral ' || k, false);
    if not exists (select 1 from ops.registrations r where r.user_id = v_ref) then
      insert into ops.registrations (user_id, link_id, kind, referrer_id, cohort, account_created_at)
      values (v_ref, v_link, 'referral', v_member, 'tester', (select u.created_at from auth.users u where u.id = v_ref));
      update ops.registration_links set uses = uses + 1 where id = v_link;
    end if;
    perform pg_temp.fx_as(v_ref, pg_catalog.format('select public.app_follow(%L::uuid, %L)', v_creators[k], 'other'));
    v_award := null;
    select l.id into v_award from sim.points_ledger l
    where l.source_key = 'referral:' || v_ref and l.action = 'qualified_referral' and l.reverses is null;
    if v_award is null then
      raise exception 'the referral of fixture member % was not recognized (today''s referral limit may be reached; try again tomorrow)', k;
    end if;
    -- The review, as app_founder_review_referral records it, marked as the fixture's.
    if sim.award_state(v_award) = 'pending_review' then
      insert into sim.points_ledger (member_id, action, points, redeemable, status, rule_version, source_key, creator_id, post_id, reverses)
      select l.member_id, l.action, 0, true, 'approved', l.rule_version, 'review:' || l.id || ':staging-review-fixture', l.creator_id, null, l.id
      from sim.points_ledger l where l.id = v_award;
    end if;
  end loop;

  -- The real check records the qualification once every approved goal is met.
  perform sim.check_qualification(v_member, 'consumer');
end $$;

-- 2. Verify (seed and dry-run): under review, every approved goal met, the rules unchanged.
do $$
declare
  v_member uuid;
  v_values jsonb;
  v_targets jsonb;
  v_status text;
begin
  if current_setting('fx.mode') = 'remove' then
    return;
  end if;
  select u.id into v_member from auth.users u where lower(u.email) = current_setting('fx.email');
  v_values := sim.goal_values(v_member, 'consumer');
  select g.targets into v_targets from sim.goal_versions g where g.audience = 'consumer' order by g.id desc limit 1;
  v_status := sim.qualification_status(v_member, 'consumer');
  if v_targets is distinct from '{"clique_creators": 10, "meaningful_engagements": 30, "engaged_creators": 3, "supporting_weeks": 4, "external_shares": 5, "qualified_referrals": 5}'::jsonb then
    raise exception 'refused: the supporter goals in force are not the approved benchmarks';
  end if;
  if v_status not in ('under_review', 'qualified', 'eligibility_paused') then
    raise exception 'the fixture supporter did not reach review (status %): goal values % against targets %', v_status, v_values, v_targets;
  end if;
  raise notice 'Fixture supporter @review_fixture_supporter: status %; goal values %', v_status, v_values;
end $$;

-- 3. Remove: every fixture account, through the same deletion as an account
-- deletion (the auth.users cascade, with the deletion register trigger).
do $$
declare
  v_n integer;
begin
  if current_setting('fx.mode') <> 'remove' then
    return;
  end if;
  delete from auth.users u
  where u.raw_user_meta_data ->> 'staging_review_fixture' = 'true'
    and exists (select 1 from ops.member_access a where a.user_id = u.id and a.cohort = 'tester' and a.updated_by = 'staging-review-fixture');
  get diagnostics v_n = row_count;
  raise notice 'Removed % fixture account(s) and everything they made.', v_n;
  if exists (select 1 from auth.users u where u.raw_user_meta_data ->> 'staging_review_fixture' = 'true') then
    raise exception 'a fixture account is still there after removal';
  end if;
end $$;

select (:'mode' in ('seed', 'remove')) as fx_commit \gset
\if :fx_commit
commit;
\else
rollback;
\endif

-- 4. After the transaction (read only): what the database now holds.
select count(*) as fx_after from auth.users u where u.raw_user_meta_data ->> 'staging_review_fixture' = 'true' \gset
\if :fx_commit
\echo 'Committed. Fixture accounts before:' :fx_before 'after:' :fx_after
\else
select (:fx_after = :fx_before) as fx_unchanged \gset
\if :fx_unchanged
\echo 'Dry run: rolled back; nothing changed (fixture accounts:' :fx_after ')'
\else
do $$ begin raise exception 'FAIL: the dry run left fixture accounts behind'; end $$;
\endif
\endif
