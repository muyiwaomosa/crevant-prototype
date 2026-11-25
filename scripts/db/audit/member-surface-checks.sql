-- The checks of the member authorization surface audit (see
-- member-surface.sql, which runs them READ ONLY and rolls back). Kept
-- separate so CI can replay them inside its own rolled-back transaction after
-- a deliberate violation (scripts/db/test.sh, scripts/db/audit/violations/).
-- Catalog reads only: no table rows, no personal data, no changes.

-- 1. Member-callable functions in the owned schemas: exactly the allow-list.
do $$
declare
  expected text[] := array[
    'public.app_access_state()',
    'public.app_add_comment(uuid,text)',
    'public.app_add_comment(uuid,text,uuid)',
    'public.app_catch_up(uuid,timestamp with time zone,uuid)',
    'public.app_clique_add(uuid)',
    'public.app_clique_remove(uuid)',
    'public.app_clique_replace(uuid,uuid)',
    'public.app_comments(uuid)',
    'public.app_create_post(text)',
    'public.app_create_post(text,uuid)',
    'public.app_delete_comment(uuid)',
    'public.app_delete_post(uuid)',
    'public.app_discover(text,integer)',
    'public.app_feed(timestamp with time zone,integer)',
    'public.app_follow(uuid)',
    'public.app_following()',
    'public.app_like(uuid)',
    'public.app_mark_viewed(uuid[],text)',
    'public.app_me()',
    'public.app_member(text)',
    'public.app_member_posts(uuid,timestamp with time zone,integer)',
    'public.app_post(uuid)',
    'public.app_set_profile(text,text)',
    'public.app_unfollow(uuid)',
    'public.app_unlike(uuid)',
    'public.app_unseen_creators()'
  ];
  -- Profile details (20261123000000), once applied. Before it, exactly the
  -- list above; after it, exactly the list above plus these.
  details text[] := array[
    'public.app_discover_people(text,text,integer)',
    'public.app_member_details(uuid)',
    'public.app_my_details()',
    'public.app_set_profile_details(text,text,text,text[])',
    'public.app_suggested_creators(integer)',
    'public.app_topics()'
  ];
  -- Moderation (20261124000000), once applied.
  moderation text[] := array[
    'public.app_is_moderator()',
    'public.app_mod_dismiss(uuid,text)',
    'public.app_mod_hide(uuid,text)',
    'public.app_mod_queue(text)',
    'public.app_mod_report(uuid)',
    'public.app_mod_restore(uuid,text)',
    'public.app_report(text,uuid,text,text)'
  ];
  -- Profile pictures (20261125000000), once applied.
  avatars text[] := array[
    'public.app_avatar_begin()',
    'public.app_avatar_remove()',
    'public.app_avatars(uuid[])',
    'public.app_mod_storage_cleanup_finish(uuid)',
    'public.app_mod_storage_cleanup_start(uuid,text)',
    'public.app_mod_storage_preview()'
  ];
  -- Feedback (20261126000000), once applied.
  feedback text[] := array[
    'public.app_feedback_submit(text,text,text,uuid)',
    'public.app_founder_feedback(uuid)',
    'public.app_founder_feedback_add_note(uuid,text)',
    'public.app_founder_feedback_list(text,text,text,timestamp with time zone,uuid,integer)',
    'public.app_founder_feedback_set_status(uuid,text)',
    'public.app_is_founder()'
  ];
  -- Photo posts (20261127000000), once applied.
  photos text[] := array[
    'public.app_create_post(text,uuid,uuid,text)',
    'public.app_mod_media_status()',
    'public.app_mod_report_media(uuid)',
    'public.app_photo_status()',
    'public.app_photo_upload_begin()',
    'public.app_post_photos(uuid[])'
  ];
  -- Foundation v2 (20261130000000), once applied.
  foundation text[] := array[
    'public.app_attest_adult(text)',
    'public.app_claim_access(text,boolean,text)',
    'public.app_feed_page(timestamp with time zone,uuid,integer,text)',
    'public.app_founder_create_invitation_link(text,integer,integer)',
    'public.app_founder_registration()',
    'public.app_founder_set_registration(boolean,integer,integer,integer,text)',
    'public.app_member_posts_page(uuid,timestamp with time zone,uuid,integer)',
    'public.app_my_referral_link()'
  ];
  -- Relationships (20261201000000), once applied. app_follow gains an optional
  -- source, so its one-argument version is replaced.
  relationships text[] := array[
    'public.app_follow(uuid,text)',
    'public.app_home_priority(integer)',
    'public.app_mute(uuid)',
    'public.app_my_audience()',
    'public.app_my_relationships()',
    'public.app_record_support_intent(uuid,text)',
    'public.app_support_intent(uuid)',
    'public.app_unmute(uuid)'
  ];
  -- Content (20261202000000), once applied.
  content text[] := array[
    'public.app_edit_post(uuid,text,text)',
    'public.app_feed_items_page(timestamp with time zone,uuid,integer,text)',
    'public.app_post_edits(uuid)',
    'public.app_post_meta(uuid[])',
    'public.app_repost(uuid)',
    'public.app_save(uuid)',
    'public.app_saved_page(timestamp with time zone,uuid,integer)',
    'public.app_set_post_topic(uuid,text)',
    'public.app_unrepost(uuid)',
    'public.app_unsave(uuid)'
  ];
  -- Discovery (20261203000000), once applied.
  discovery text[] := array[
    'public.app_discover_content(text,integer)',
    'public.app_record_share(uuid,text)',
    'public.app_search_posts(text,integer)'
  ];
  -- Previews and search measurement (20261204000000), once applied.
  previews text[] := array[
    'public.app_founder_search_metrics(integer)',
    'public.app_note_search(text,boolean,text)',
    'public.app_note_search_selection(text,text)',
    'public.app_public_post(uuid,text)',
    'public.app_public_previews_allowed()',
    'public.app_set_public_previews(boolean,text)'
  ];
  -- Rewards (20261205000000), once applied.
  rewards text[] := array[
    'public.app_founder_close_month(date)',
    'public.app_founder_record_sim_revenue(date,text,uuid,uuid,bigint,text)',
    'public.app_founder_referral_queue()',
    'public.app_founder_review_referral(bigint,boolean)',
    'public.app_founder_rewards_overview()',
    'public.app_founder_set_rewards(boolean,integer)',
    'public.app_my_points()',
    'public.app_my_points_history(bigint,integer)',
    'public.app_my_simulated_earnings()'
  ];
  -- Governance (20261206000000), once applied.
  governance text[] := array[
    'public.app_appeal(bigint,text)',
    'public.app_block(uuid)',
    'public.app_mark_notices_read()',
    'public.app_mod_appeals(text)',
    'public.app_mod_decide_appeal(uuid,boolean,text)',
    'public.app_mod_enforce(uuid,text,text,uuid,integer,text)',
    'public.app_mod_lift(bigint,text)',
    'public.app_mod_member_record(uuid)',
    'public.app_my_blocks()',
    'public.app_my_notices()',
    'public.app_my_standing()',
    'public.app_unblock(uuid)'
  ];
  -- Advertising (20261208000000), once applied.
  advertising text[] := array[
    'public.app_ad_categories()',
    'public.app_ad_event(uuid,text)',
    'public.app_ad_for(text,uuid)',
    'public.app_clear_ad_preferences()',
    'public.app_founder_ad_demand()',
    'public.app_founder_ads()',
    'public.app_founder_attribute_campaign_revenue(uuid,date,bigint)',
    'public.app_founder_campaign_report(uuid)',
    'public.app_founder_record_advertiser_feedback(uuid,integer,text)',
    'public.app_founder_record_conversions(uuid,date,integer,text)',
    'public.app_founder_review_advertiser(uuid,boolean,text)',
    'public.app_founder_save_advertiser(jsonb)',
    'public.app_founder_save_campaign(jsonb)',
    'public.app_founder_set_campaign_status(uuid,text)',
    'public.app_my_ad_exclusions()',
    'public.app_remove_ad_exclusion(text,text)',
    'public.app_set_ad_preference(text,text)'
  ];
  -- Intelligence (20261210000000), once applied.
  intelligence text[] := array[
    'public.app_creator_insights(integer)',
    'public.app_founder_overview()',
    'public.app_my_contribution_insights()',
    'public.app_note_open(uuid)'
  ];
  -- Unified onboarding (20261211000000), once applied.
  onboarding text[] := array[
    'public.app_founder_create_creator_invitation(text,integer,integer)',
    'public.app_founder_invitation_links()',
    'public.app_founder_revoke_invitation_link(text)',
    'public.app_member_creator_topics(uuid)',
    'public.app_my_advertising()',
    'public.app_my_campaign_report(uuid)',
    'public.app_my_creator_setup()',
    'public.app_my_inviter()',
    'public.app_request_advertising(jsonb)',
    'public.app_set_creator_topics(text[])'
  ];
  -- Privacy requests and switches (20261212000000), once applied.
  privacy text[] := array[
    'public.app_features()',
    'public.app_founder_delete_member(bigint,text)',
    'public.app_founder_member_requests()',
    'public.app_founder_resolve_member_request(bigint,boolean,text)',
    'public.app_founder_set_switch(text,boolean,text)',
    'public.app_founder_switches()',
    'public.app_my_member_requests()',
    'public.app_submit_member_request(text,text)',
    'public.app_withdraw_member_request(bigint)'
  ];
  -- Video posts (20261213000000), once applied.
  video text[] := array[
    'public.app_founder_record_device_test(text,boolean,text)',
    'public.app_founder_set_video_cap(integer)',
    'public.app_founder_video_status()',
    'public.app_post_videos(uuid[])',
    'public.app_video_status()',
    'public.app_video_upload_begin(integer,integer,text)',
    'public.app_video_upload_paths(uuid)'
  ];
  -- The one function visitors may call, once previews exist.
  anon_allowed text[] := '{}';
  actual text[];
  extra text[];
  missing text[];
  anon_fns text[];
begin
  if to_regclass('social.profile_details') is not null then
    expected := expected || details;
  end if;
  if to_regclass('ops.content_reports') is not null then
    expected := expected || moderation;
  end if;
  if to_regclass('social.avatars') is not null then
    expected := expected || avatars;
  end if;
  if to_regclass('ops.feedback') is not null then
    expected := expected || feedback;
  end if;
  if to_regclass('social.post_media') is not null then
    expected := expected || photos;
  end if;
  if to_regclass('ops.registrations') is not null then
    expected := expected || foundation;
  end if;
  if to_regclass('social.mutes') is not null then
    expected := array_remove(expected, 'public.app_follow(uuid)') || relationships;
  end if;
  if to_regclass('social.saves') is not null then
    expected := expected || content;
  end if;
  if to_regclass('social.shares') is not null then
    expected := expected || discovery;
  end if;
  if to_regclass('social.preview_consents') is not null then
    expected := expected || previews;
    anon_allowed := array['public.app_public_post(uuid, text)'];
  end if;
  if to_regclass('sim.points_ledger') is not null then
    expected := expected || rewards;
  end if;
  if to_regclass('social.blocks') is not null then
    expected := expected || governance;
  end if;
  if to_regclass('ads.campaigns') is not null then
    expected := expected || advertising;
  end if;
  if to_regclass('social.post_opens') is not null then
    expected := array_replace(expected, 'public.app_founder_record_conversions(uuid,date,integer,text)', 'public.app_founder_record_conversions(uuid,date,integer,text,integer)')
                || intelligence;
  end if;
  if to_regclass('social.creator_topics') is not null then
    expected := expected || onboarding;
  end if;
  if to_regclass('ops.feature_switches') is not null then
    expected := expected || privacy;
  end if;
  if to_regclass('ops.video_device_tests') is not null then
    expected := expected || video;
  end if;
  -- Governance refinements (20261207000000): app_mod_enforce gains p_immediate.
  if to_regprocedure('ops.other_moderator_available(uuid, uuid)') is not null then
    expected := array_replace(expected, 'public.app_mod_enforce(uuid,text,text,uuid,integer,text)', 'public.app_mod_enforce(uuid,text,text,uuid,integer,text,boolean)');
  end if;
  select coalesce(array_agg(n.nspname || '.' || p.proname || '(' || pg_catalog.oidvectortypes(p.proargtypes) || ')' order by 1), '{}')
    into actual
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'ops', 'social', 'waitlist_api', 'intent', 'sim', 'ads')
    and pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE');
  -- Normalise argument lists to the same spelling as the allow-list (no spaces after commas).
  actual := (select coalesce(array_agg(replace(a, ', ', ',') order by 1), '{}') from unnest(actual) a);
  extra := (select coalesce(array_agg(a), '{}') from unnest(actual) a where a <> all (expected));
  missing := (select coalesce(array_agg(e), '{}') from unnest(expected) e where e <> all (actual));
  if cardinality(extra) > 0 then
    raise exception 'FAIL: signed-in accounts can run functions outside the allow-list: %', extra;
  end if;
  if cardinality(missing) > 0 then
    raise exception 'FAIL: expected member functions are missing or not callable: % (update the allow-list in the same pull request as the migration)', missing;
  end if;

  select coalesce(array_agg(n.nspname || '.' || p.proname || '(' || pg_catalog.oidvectortypes(p.proargtypes) || ')'), '{}')
    into anon_fns
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'ops', 'social', 'waitlist_api', 'intent', 'sim', 'ads')
    and pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE');
  anon_fns := (select coalesce(array_agg(a), '{}') from unnest(anon_fns) a where a <> all (anon_allowed));
  if cardinality(anon_fns) > 0 then
    raise exception 'FAIL: anonymous visitors can run functions: %', anon_fns;
  end if;
  raise notice 'PASS: exactly % member functions are callable by signed-in accounts, none by anonymous visitors', cardinality(expected);
end;
$$;

-- 2. Every member function runs as its owner with an empty search path and
--    checks the caller, including pilot membership:
--      * app_me and app_set_profile: social.current_access() (signed in AND an
--        active pilot membership; the profile may still be incomplete);
--      * app_access_state: auth.uid() only, returning the caller's own state;
--      * every other function: social.current_member() (signed in, active
--        membership, complete profile).
--    And the chain itself: current_member() goes through current_access(),
--    which requires ops.member_access_active(), which reads an active,
--    unexpired ops.member_access row.
do $$
declare
  r record;
  bad text[] := '{}';
begin
  for r in
    select p.oid, p.proname, p.prosecdef, p.proconfig, p.prosrc
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')
  loop
    if not r.prosecdef then bad := bad || (r.proname || ': not security definer'); end if;
    if r.proconfig is null or not ('search_path=""' = any (r.proconfig) or 'search_path=' = any (r.proconfig)) then
      bad := bad || (r.proname || ': search path not empty');
    end if;
    if r.proname in ('app_me', 'app_set_profile') then
      if position('social.current_access()' in r.prosrc) = 0 then
        bad := bad || (r.proname || ': does not check social.current_access()');
      end if;
    elsif r.proname = 'app_attest_adult' then
      -- Foundation v2 (20261130000000): the caller's own adult confirmation, active membership required.
      if position('auth.uid()' in r.prosrc) = 0 or position('ops.member_access_active(v_uid)' in r.prosrc) = 0 then
        bad := bad || (r.proname || ': does not require the caller''s active membership');
      end if;
    elsif r.proname = 'app_claim_access' then
      -- Foundation v2: membership only through a verified email, the adult confirmation and the registration check.
      if position('auth.uid()' in r.prosrc) = 0 or position('ops.registration_check(v_code)' in r.prosrc) = 0
         or position('email_confirmed_at is null' in r.prosrc) = 0 or position('p_adult_attested is not true' in r.prosrc) = 0 then
        bad := bad || (r.proname || ': does not claim only through the registration check');
      end if;
    elsif r.proname like 'app\_mod\_%' then
      -- Moderators only: membership AND an active moderator row.
      if position('social.current_moderator()' in r.prosrc) = 0 then
        bad := bad || (r.proname || ': does not check social.current_moderator()');
      end if;
    elsif r.proname = 'app_public_post' then
      -- Public previews (20261204000000): visitors, but only eligible posts, only while on, rate limited.
      if position('ops.public_preview_settings' in r.prosrc) = 0 or position('social.visible_members' in r.prosrc) = 0 or position('s.deleted_at is null' in r.prosrc) = 0 or position('social.preview_consents' in r.prosrc) = 0 or position('ops.content_reports' in r.prosrc) = 0 or position('rate_limited' in r.prosrc) = 0 then
        bad := bad || (r.proname || ': public preview without its eligibility, switch or limits');
      end if;
    elsif r.proname like 'app\_founder\_%' then
      -- The founder only (20261126000000): membership AND the founder cohort.
      if position('social.current_founder()' in r.prosrc) = 0 then
        bad := bad || (r.proname || ': does not check social.current_founder()');
      end if;
    elsif r.proname = 'app_access_state' then
      if position('auth.uid()' in r.prosrc) = 0 or position('ops.member_access a on a.user_id = v_uid' in r.prosrc) = 0 then
        bad := bad || (r.proname || ': does not read only the caller''s own membership');
      end if;
    elsif position('social.current_member()' in r.prosrc) = 0 then
      bad := bad || (r.proname || ': does not check social.current_member()');
    end if;
  end loop;
  -- The moderator check goes through the membership check.
  if pg_catalog.to_regprocedure('social.current_moderator()') is not null
     and (position('social.current_member()' in (select prosrc from pg_catalog.pg_proc where oid = pg_catalog.to_regprocedure('social.current_moderator()'))) = 0
          or position('ops.moderator_active(v_uid)' in (select prosrc from pg_catalog.pg_proc where oid = pg_catalog.to_regprocedure('social.current_moderator()'))) = 0) then
    bad := bad || 'social.current_moderator: does not require membership and an active moderator row'::text;
  end if;
  -- The founder check goes through the membership check.
  if pg_catalog.to_regprocedure('social.current_founder()') is not null
     and (position('social.current_member()' in (select prosrc from pg_catalog.pg_proc where oid = pg_catalog.to_regprocedure('social.current_founder()'))) = 0
          or position('a.cohort = ''founder''' in (select prosrc from pg_catalog.pg_proc where oid = pg_catalog.to_regprocedure('social.current_founder()'))) = 0) then
    bad := bad || 'social.current_founder: does not require membership and the founder cohort'::text;
  end if;
  -- The membership chain.
  if position('social.current_access()' in coalesce((select prosrc from pg_catalog.pg_proc where oid = to_regprocedure('social.current_member()')), '')) = 0 then
    bad := bad || 'social.current_member: does not go through social.current_access()'::text;
  end if;
  if position('ops.member_access_active(v_uid)' in coalesce((select prosrc from pg_catalog.pg_proc where oid = to_regprocedure('social.current_access()')), '')) = 0 then
    bad := bad || 'social.current_access: does not require ops.member_access_active()'::text;
  end if;
  if coalesce((select prosrc from pg_catalog.pg_proc where oid = to_regprocedure('ops.member_access_active(uuid)')), '')
       !~ 'ops\.member_access a\s+where a\.user_id = p_user and a\.status = ''active'' and \(a\.expires_at is null or a\.expires_at > pg_catalog\.now\(\)\)' then
    bad := bad || 'ops.member_access_active: does not require an active, unexpired membership'::text;
  end if;
  if cardinality(bad) > 0 then
    raise exception 'FAIL: member functions without the expected safeguards: %', bad;
  end if;
  raise notice 'PASS: every member function runs as its owner with an empty search path and checks the caller and their pilot membership';
end;
$$;

-- 3. Tables, views and sequences in the owned schemas: anonymous visitors
--    reach none; signed-in accounts reach only public.profiles (read their own
--    row), and only through row level security. Profile changes go through
--    public.app_set_profile, which checks pilot membership.
do $$
declare
  rel_anon text[];
  rel_auth text[];
  cols_update text[];
  cols_insert text[];
begin
  select coalesce(array_agg(c.oid::regclass::text), '{}') into rel_anon
  from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('public', 'ops', 'social', 'waitlist_api') and c.relkind in ('r', 'v', 'm', 'f', 'p', 'S')
    and (pg_catalog.has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      or exists (select 1 from pg_catalog.pg_attribute a where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
                 and pg_catalog.has_column_privilege('anon', c.oid, a.attnum, 'SELECT,INSERT,UPDATE,REFERENCES')));
  if cardinality(rel_anon) > 0 then
    raise exception 'FAIL: anonymous visitors have privileges on: %', rel_anon;
  end if;

  select coalesce(array_agg(c.oid::regclass::text), '{}') into rel_auth
  from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('public', 'ops', 'social', 'waitlist_api') and c.relkind in ('r', 'v', 'm', 'f', 'p', 'S')
    and c.oid <> 'public.profiles'::regclass
    and (pg_catalog.has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      or exists (select 1 from pg_catalog.pg_attribute a where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
                 and pg_catalog.has_column_privilege('authenticated', c.oid, a.attnum, 'SELECT,INSERT,UPDATE,REFERENCES')));
  if cardinality(rel_auth) > 0 then
    raise exception 'FAIL: signed-in accounts have privileges beyond public.profiles: %', rel_auth;
  end if;

  if pg_catalog.has_table_privilege('authenticated', 'public.profiles', 'INSERT,DELETE,TRUNCATE,REFERENCES,TRIGGER') then
    raise exception 'FAIL: signed-in accounts can insert, delete or otherwise change public.profiles';
  end if;
  if not pg_catalog.has_table_privilege('authenticated', 'public.profiles', 'SELECT') then
    raise exception 'FAIL: signed-in accounts can no longer read their own profile (expected SELECT on public.profiles)';
  end if;
  select coalesce(array_agg(a.attname::text order by a.attname), '{}') into cols_update
  from pg_catalog.pg_attribute a
  where a.attrelid = 'public.profiles'::regclass and a.attnum > 0 and not a.attisdropped
    and pg_catalog.has_column_privilege('authenticated', 'public.profiles'::regclass, a.attnum, 'UPDATE');
  if cardinality(cols_update) > 0 or pg_catalog.has_table_privilege('authenticated', 'public.profiles', 'UPDATE') then
    raise exception 'FAIL: signed-in accounts can update profile columns directly: % (profile changes must go through public.app_set_profile)', cols_update;
  end if;
  select coalesce(array_agg(a.attname::text), '{}') into cols_insert
  from pg_catalog.pg_attribute a
  where a.attrelid = 'public.profiles'::regclass and a.attnum > 0 and not a.attisdropped
    and pg_catalog.has_column_privilege('authenticated', 'public.profiles'::regclass, a.attnum, 'INSERT,REFERENCES');
  if cardinality(cols_insert) > 0 then
    raise exception 'FAIL: signed-in accounts can insert or reference profile columns: %', cols_insert;
  end if;
  raise notice 'PASS: anonymous visitors reach no tables; signed-in accounts reach only public.profiles (read own row)';
end;
$$;

-- 4. Profiles row level security: on, and limited to the account's own row.
do $$
declare
  pol record;
  n int := 0;
begin
  if not (select relrowsecurity from pg_catalog.pg_class where oid = 'public.profiles'::regclass) then
    raise exception 'FAIL: row level security is off on public.profiles';
  end if;
  for pol in select policyname, cmd, roles, qual, with_check, permissive from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'profiles' loop
    n := n + 1;
    if pol.cmd <> 'SELECT' then
      raise exception 'FAIL: unexpected % policy "%" on public.profiles', pol.cmd, pol.policyname;
    end if;
    if pol.roles <> array['authenticated']::name[] then
      raise exception 'FAIL: policy "%" on public.profiles applies to %, expected only authenticated', pol.policyname, pol.roles;
    end if;
    if coalesce(pol.qual, '') !~ 'auth\.uid\(\)' then
      raise exception 'FAIL: policy "%" on public.profiles is not limited to the caller''s own row', pol.policyname;
    end if;
  end loop;
  if n <> 1 then
    raise exception 'FAIL: expected exactly 1 policy on public.profiles (read own), found %', n;
  end if;
  raise notice 'PASS: public.profiles has row level security on, with only the read-own policy';
end;
$$;

-- 5. The private schemas stay private, with row level security on every table.
do $$
declare
  s text;
  r text;
  off text[];
begin
  foreach s in array array['ops', 'social', 'waitlist_api', 'ads'] loop
    if exists (select 1 from pg_catalog.pg_namespace where nspname = s) then
      foreach r in array array['anon', 'authenticated'] loop
        if pg_catalog.has_schema_privilege(r, s, 'USAGE') then
          raise exception 'FAIL: role % can use schema %', r, s;
        end if;
      end loop;
    end if;
  end loop;
  select coalesce(array_agg(c.oid::regclass::text), '{}') into off
  from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('public', 'ops', 'social', 'ads') and c.relkind in ('r', 'p') and not c.relrowsecurity;
  if cardinality(off) > 0 then
    raise exception 'FAIL: row level security is off on: %', off;
  end if;
  raise notice 'PASS: ops, social, waitlist_api and ads are closed to members and visitors; row level security is on everywhere';
end;
$$;

-- 6. Storage: no storage policies for members or visitors, ever (every
--    upload, removal and link goes through the avatar Edge Function). No
--    buckets before profile pictures (20261125000000); after, exactly the
--    private avatars bucket with its approved limits.
do $$
declare
  buckets int;
  pols text[];
begin
  if not exists (select 1 from pg_catalog.pg_namespace where nspname = 'storage') then
    raise notice 'PASS: Supabase Storage is not installed in this database (nothing to check)';
    return;
  end if;
  if pg_catalog.to_regclass('storage.buckets') is not null then
    if pg_catalog.to_regclass('social.avatars') is null then
      execute 'select count(*) from storage.buckets' into buckets;
      if buckets > 0 then
        raise exception 'FAIL: % storage bucket(s) exist; none are expected before profile pictures (20261125000000)', buckets;
      end if;
    else
      -- Profile pictures: the private avatars bucket, JPEG only, at most 200 KB; with photo
      -- posts (20261127000000) also the private post-photos bucket, JPEG only, at most 600 KB.
      execute $q$select count(*) from storage.buckets where not (
                   (id = 'avatars' and name = 'avatars' and public is false and file_size_limit = 204800 and allowed_mime_types = array['image/jpeg'])
                   or (id = 'post-photos' and name = 'post-photos' and public is false and file_size_limit = 614400
                       and allowed_mime_types = array['image/jpeg'] and pg_catalog.to_regclass('social.post_media') is not null)
                   -- Advertising creatives (20261209000000): public by design (advertising creative only, no member data, no member writes).
                   or (id = 'ad-creatives' and name = 'ad-creatives' and public is true and file_size_limit = 8388608
                       and allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'video/mp4']
                       and pg_catalog.to_regprocedure('ads.creative_ready(uuid)') is not null)
                   -- Video posts (20261213000000): the private post-videos bucket, MP4 videos and JPEG posters, at most 110 MB.
                   or (id = 'post-videos' and name = 'post-videos' and public is false and file_size_limit = 115343360
                       and allowed_mime_types = array['video/mp4', 'image/jpeg'] and pg_catalog.to_regclass('ops.video_device_tests') is not null))$q$ into buckets;
      if buckets > 0 then
        raise exception 'FAIL: a storage bucket other than the private avatars, post-photos and post-videos buckets (and the public ad-creatives bucket) exists, or its settings changed';
      end if;
      if pg_catalog.to_regclass('ops.video_device_tests') is not null then
        execute $q$select count(*) from storage.buckets where id = 'post-videos'$q$ into buckets;
        if buckets <> 1 then
          raise exception 'FAIL: the private post-videos bucket is missing';
        end if;
      end if;
      if pg_catalog.to_regclass('social.post_media') is not null then
        execute $q$select count(*) from storage.buckets where id = 'post-photos'$q$ into buckets;
        if buckets <> 1 then
          raise exception 'FAIL: the private post-photos bucket is missing';
        end if;
      end if;
      execute $q$select count(*) from storage.buckets where id = 'avatars'$q$ into buckets;
      if buckets <> 1 then
        raise exception 'FAIL: the private avatars bucket is missing';
      end if;
    end if;
  end if;
  select coalesce(array_agg(tablename || ': ' || policyname), '{}') into pols
  from pg_catalog.pg_policies
  where schemaname = 'storage' and (roles && array['anon', 'authenticated', 'public']::name[]);
  if cardinality(pols) > 0 then
    raise exception 'FAIL: storage policies open to members or visitors: %', pols;
  end if;
  raise notice 'PASS: storage has only the approved private bucket (if any) and no storage policies for members or visitors';
end;
$$;

-- 7. Pilot membership (20261122000000_member_access): the tables are private
--    with row level security; only server code can grant or revoke; every
--    change is recorded by a trigger; the history can't be edited or erased.
do $$
declare
  bad text[] := '{}';
  f text;
begin
  if pg_catalog.to_regclass('ops.member_access') is null or pg_catalog.to_regclass('ops.member_access_events') is null then
    raise exception 'FAIL: the pilot membership tables are missing';
  end if;
  foreach f in array array['ops.grant_member_access(uuid,text,text,timestamp with time zone,text)', 'ops.revoke_member_access(uuid,text,text)', 'ops.member_access_active(uuid)'] loop
    if to_regprocedure(f) is null then
      bad := bad || (f || ': missing');
    elsif pg_catalog.has_function_privilege('authenticated', to_regprocedure(f), 'EXECUTE')
       or pg_catalog.has_function_privilege('anon', to_regprocedure(f), 'EXECUTE') then
      bad := bad || (f || ': callable by members or visitors');
    end if;
  end loop;
  if not exists (select 1 from pg_catalog.pg_trigger where tgrelid = 'ops.member_access'::regclass and tgname = 'member_access_record' and tgenabled <> 'D') then
    bad := bad || 'ops.member_access: changes are not recorded (trigger member_access_record missing or disabled)'::text;
  end if;
  if not exists (select 1 from pg_catalog.pg_trigger where tgrelid = 'ops.member_access_events'::regclass and tgname = 'member_access_events_no_update' and tgenabled <> 'D') then
    bad := bad || 'ops.member_access_events: the history can be edited or deleted'::text;
  end if;
  if not exists (select 1 from pg_catalog.pg_trigger where tgrelid = 'ops.member_access_events'::regclass and tgname = 'member_access_events_no_truncate' and tgenabled <> 'D') then
    bad := bad || 'ops.member_access_events: the history can be truncated'::text;
  end if;
  if position('ops.member_access a on a.user_id = p.id' in coalesce(pg_catalog.pg_get_viewdef('social.visible_members'::regclass), '')) = 0
     and position('JOIN ops.member_access a ON' in coalesce(pg_catalog.pg_get_viewdef('social.visible_members'::regclass), '')) = 0 then
    bad := bad || 'social.visible_members: not limited to active pilot members'::text;
  end if;
  if cardinality(bad) > 0 then
    raise exception 'FAIL: pilot membership safeguards missing: %', bad;
  end if;
  raise notice 'PASS: pilot membership is private, server-granted only, fully recorded, and its history is append-only';
end;
$$;
