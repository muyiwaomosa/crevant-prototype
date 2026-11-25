-- Release 1 social core guarantees (staging-safe: read-only checks, no data).
-- Each block raises an exception on failure, so psql with ON_ERROR_STOP fails.
--
-- 1. The social schema is private: members and anonymous visitors cannot use
--    it or its tables; row level security is on, with no policies.
-- 2. Members reach it only through the public.app_* functions, which run as
--    their owner with an empty search path, and which only signed-in members
--    may call.
-- 3. Internal helpers and trigger functions are not callable by members.
-- 4. The Clique and history guards are in place.
-- 5. Release 1 stores no Connection Points, money, email or role.
-- 6. Nothing here reaches private admin, waitlist or acquisition data.

-- 1. Private schema and tables.
do $$
declare
  t text;
  r text;
begin
  if not exists (select 1 from pg_namespace where nspname = 'social') then
    raise exception 'FAIL: the social schema is missing';
  end if;
  foreach r in array array['anon', 'authenticated'] loop
    if has_schema_privilege(r, 'social', 'USAGE') then
      raise exception 'FAIL: role % can use schema social', r;
    end if;
  end loop;
  foreach t in array array['social.posts', 'social.follows', 'social.follow_events', 'social.clique_members', 'social.likes', 'social.comments', 'social.post_views'] loop
    if not (select relrowsecurity from pg_class where oid = t::regclass) then
      raise exception 'FAIL: row level security is off on %', t;
    end if;
    foreach r in array array['anon', 'authenticated'] loop
      if has_table_privilege(r, t, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') then
        raise exception 'FAIL: role % has privileges on %', r, t;
      end if;
    end loop;
  end loop;
  if exists (select 1 from pg_policies where schemaname = 'social') then
    raise exception 'FAIL: a social table has a row level security policy (members must use the app functions)';
  end if;
  if exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'social' and c.relkind in ('r', 'p')
      and c.relname not in ('posts', 'follows', 'follow_events', 'clique_members', 'likes', 'comments', 'post_views',
                            -- profile details (20261123000000), once applied
                            'topics', 'profile_details', 'member_topics',
                            -- profile pictures (20261125000000), once applied
                            'avatars', 'avatar_uploads', 'avatar_events',
                            -- photo posts (20261127000000), once applied
                            'media_uploads', 'post_media',
                            -- relationships (20261201000000), once applied
                            'mutes', 'mute_events',
                            -- content (20261202000000), once applied
                            'post_edits', 'saves', 'reposts', 'content_actions',
                            -- discovery (20261203000000), once applied
                            'shares',
                            -- previews and search measurement (20261204000000), once applied
                            'search_metrics_daily', 'preview_consents', 'preview_visits', 'preview_rate',
                            -- governance (20261206000000), once applied
                            'blocks', 'block_events',
                            -- intelligence (20261210000000), once applied
                            'post_opens')
  ) then
    raise exception 'FAIL: the social schema has an unexpected table';
  end if;
  raise notice 'PASS: the social schema and its tables are private';
end $$;

-- 2. The member functions: exactly the approved set, owner-run, empty search
--    path, signed-in members only.
do $$
declare
  f record;
  expected text[] := array[
    -- app_add_comment and app_create_post have two versions each: the original,
    -- and the one with a request id (20261119000000_publishing_request_ids).
    -- app_access_state and app_set_profile: the pilot membership gate (20261122000000).
    -- app_topics, app_my_details, app_set_profile_details, app_member_details,
    -- app_discover_people and app_suggested_creators: profile details (20261123000000).
    -- The set depends on whether that migration is applied yet (staging before
    -- and after it); either way it must be exactly one of the two.
    'app_access_state', 'app_add_comment', 'app_add_comment', 'app_catch_up', 'app_clique_add', 'app_clique_remove', 'app_clique_replace', 'app_comments',
    'app_create_post', 'app_create_post', 'app_delete_comment', 'app_delete_post', 'app_discover', 'app_feed', 'app_follow', 'app_following',
    'app_like', 'app_mark_viewed', 'app_me', 'app_member', 'app_member_posts', 'app_post', 'app_set_profile', 'app_unfollow', 'app_unlike', 'app_unseen_creators'
  ];
  details text[] := array['app_discover_people', 'app_member_details', 'app_my_details', 'app_set_profile_details', 'app_suggested_creators', 'app_topics'];
  -- Moderation (20261124000000), once applied.
  moderation text[] := array['app_is_moderator', 'app_mod_dismiss', 'app_mod_hide', 'app_mod_queue', 'app_mod_report', 'app_mod_restore', 'app_report'];
  -- Profile pictures (20261125000000), once applied.
  avatars text[] := array['app_avatar_begin', 'app_avatar_remove', 'app_avatars', 'app_mod_storage_cleanup_finish', 'app_mod_storage_cleanup_start', 'app_mod_storage_preview'];
  -- Photo posts (20261127000000), once applied.
  -- (app_create_post gains a third version, with a photo.)
  photos text[] := array['app_create_post', 'app_mod_media_status', 'app_mod_report_media', 'app_photo_status', 'app_photo_upload_begin', 'app_post_photos'];
  -- Feedback (20261126000000), once applied.
  feedback text[] := array['app_feedback_submit', 'app_founder_feedback', 'app_founder_feedback_add_note', 'app_founder_feedback_list', 'app_founder_feedback_set_status', 'app_is_founder'];
  -- Foundation v2 (20261130000000), once applied: adult confirmation, link
  -- registration, referral links, founder registration settings, keyset paging.
  foundation text[] := array['app_attest_adult', 'app_claim_access', 'app_feed_page', 'app_founder_create_invitation_link', 'app_founder_registration', 'app_founder_set_registration', 'app_member_posts_page', 'app_my_referral_link'];
  -- Relationships (20261201000000), once applied: mute, Clique first Home,
  -- Support Intent, relationship lists and audience insight.
  relationships text[] := array['app_home_priority', 'app_mute', 'app_my_audience', 'app_my_relationships', 'app_record_support_intent', 'app_support_intent', 'app_unmute'];
  -- Content (20261202000000), once applied: topics, editing, saves, reposts, Home with reposts.
  content text[] := array['app_edit_post', 'app_feed_items_page', 'app_post_edits', 'app_post_meta', 'app_repost', 'app_save', 'app_saved_page', 'app_set_post_topic', 'app_unrepost', 'app_unsave'];
  -- Discovery (20261203000000), once applied: content discovery, post search, sharing.
  discovery text[] := array['app_discover_content', 'app_record_share', 'app_search_posts'];
  -- Previews and search measurement (20261204000000), once applied. app_public_post is
  -- the one function visitors may call (checked below and in 006).
  previews text[] := array['app_founder_search_metrics', 'app_note_search', 'app_note_search_selection', 'app_public_post', 'app_public_previews_allowed', 'app_set_public_previews'];
  -- Rewards (20261205000000), once applied: points, simulated earnings, founder review, revenue and month close.
  rewards text[] := array['app_founder_close_month', 'app_founder_record_sim_revenue', 'app_founder_referral_queue', 'app_founder_review_referral', 'app_founder_rewards_overview', 'app_founder_set_rewards', 'app_my_points', 'app_my_points_history', 'app_my_simulated_earnings'];
  -- Governance (20261206000000), once applied: blocking, enforcement, notices and appeals.
  governance text[] := array['app_appeal', 'app_block', 'app_mark_notices_read', 'app_mod_appeals', 'app_mod_decide_appeal', 'app_mod_enforce', 'app_mod_lift', 'app_mod_member_record', 'app_my_blocks', 'app_my_notices', 'app_my_standing', 'app_unblock'];
  -- Advertising (20261208000000), once applied: preferences, serving, measurement, founder management.
  advertising text[] := array['app_ad_categories', 'app_ad_event', 'app_ad_for', 'app_clear_ad_preferences', 'app_founder_ad_demand', 'app_founder_ads',
                              'app_founder_attribute_campaign_revenue', 'app_founder_campaign_report', 'app_founder_record_advertiser_feedback',
                              'app_founder_record_conversions', 'app_founder_review_advertiser', 'app_founder_save_advertiser', 'app_founder_save_campaign',
                              'app_founder_set_campaign_status', 'app_my_ad_exclusions', 'app_remove_ad_exclusion', 'app_set_ad_preference'];
  -- Intelligence (20261210000000), once applied.
  intelligence text[] := array['app_creator_insights', 'app_founder_overview', 'app_my_contribution_insights', 'app_note_open'];
  found text[];
begin
  if to_regclass('social.profile_details') is not null then
    expected := (select array_agg(x order by x collate "C") from unnest(expected || details) x);
  end if;
  if to_regclass('ops.content_reports') is not null then
    expected := (select array_agg(x order by x collate "C") from unnest(expected || moderation) x);
  end if;
  if to_regclass('social.avatars') is not null then
    expected := (select array_agg(x order by x collate "C") from unnest(expected || avatars) x);
  end if;
  if to_regclass('ops.feedback') is not null then
    expected := (select array_agg(x order by x collate "C") from unnest(expected || feedback) x);
  end if;
  if to_regclass('social.post_media') is not null then
    expected := (select array_agg(x order by x collate "C") from unnest(expected || photos) x);
  end if;
  if to_regclass('ops.registrations') is not null then
    expected := (select array_agg(x order by x collate "C") from unnest(expected || foundation) x);
  end if;
  if to_regclass('social.mutes') is not null then
    expected := (select array_agg(x order by x collate "C") from unnest(expected || relationships) x);
  end if;
  if to_regclass('social.saves') is not null then
    expected := (select array_agg(x order by x collate "C") from unnest(expected || content) x);
  end if;
  if to_regclass('social.shares') is not null then
    expected := (select array_agg(x order by x collate "C") from unnest(expected || discovery) x);
  end if;
  if to_regclass('social.preview_consents') is not null then
    expected := (select array_agg(x order by x collate "C") from unnest(expected || previews) x);
  end if;
  if to_regclass('sim.points_ledger') is not null then
    expected := (select array_agg(x order by x collate "C") from unnest(expected || rewards) x);
  end if;
  if to_regclass('social.blocks') is not null then
    expected := (select array_agg(x order by x collate "C") from unnest(expected || governance) x);
  end if;
  if to_regclass('ads.campaigns') is not null then
    expected := (select array_agg(x order by x collate "C") from unnest(expected || advertising) x);
  end if;
  if to_regclass('social.post_opens') is not null then
    expected := (select array_agg(x order by x collate "C") from unnest(expected || intelligence) x);
  end if;
  select coalesce(array_agg(p.proname::text order by p.proname), '{}') into found
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname like 'app\_%';
  if found <> expected then
    raise exception 'FAIL: the public.app_* functions are not the approved set: %', found;
  end if;
  for f in
    select p.oid, p.proname, p.prosecdef, p.proconfig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'app\_%'
  loop
    if not f.prosecdef then
      raise exception 'FAIL: public.% must run as its owner (security definer)', f.proname;
    end if;
    if not ('search_path=""' = any (coalesce(f.proconfig, '{}')) or 'search_path=' = any (coalesce(f.proconfig, '{}'))) then
      raise exception 'FAIL: public.% does not pin an empty search_path (%)', f.proname, f.proconfig;
    end if;
    -- The single exception (20261204000000): the read-only public preview.
    if has_function_privilege('anon', f.oid, 'EXECUTE') and f.oid <> coalesce(to_regprocedure('public.app_public_post(uuid, text)'), 0::oid) then
      raise exception 'FAIL: anonymous visitors can call public.%', f.proname;
    end if;
    if not has_function_privilege('authenticated', f.oid, 'EXECUTE') then
      raise exception 'FAIL: signed-in members cannot call public.%', f.proname;
    end if;
  end loop;
  raise notice 'PASS: the member functions are the approved set, owner-run, with a fixed search path, for signed-in members only';
end $$;

-- 3. Internal helpers and trigger functions.
do $$
declare
  f record;
  n int := 0;
begin
  for f in
    select p.oid, p.proname, p.prosecdef, p.proconfig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'social'
  loop
    n := n + 1;
    if f.prosecdef then
      raise exception 'FAIL: social.% must run with the caller''s privileges', f.proname;
    end if;
    if not ('search_path=""' = any (coalesce(f.proconfig, '{}')) or 'search_path=' = any (coalesce(f.proconfig, '{}'))) then
      raise exception 'FAIL: social.% does not pin an empty search_path (%)', f.proname, f.proconfig;
    end if;
    if has_function_privilege('anon', f.oid, 'EXECUTE') or has_function_privilege('authenticated', f.oid, 'EXECUTE') then
      raise exception 'FAIL: members can call social.%', f.proname;
    end if;
  end loop;
  if ((select array_agg(p.proname::text order by p.proname) from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'social')
     <> case when to_regclass('ops.content_reports') is null
          then array['clique_members_guard', 'current_access', 'current_member', 'history_is_append_only', 'is_member', 'post_views_are_permanent', 'rate_check']
          -- Moderation (20261124000000) adds social.current_moderator().
          when to_regclass('social.avatars') is null
          then array['clique_members_guard', 'current_access', 'current_member', 'current_moderator', 'history_is_append_only', 'is_member', 'post_views_are_permanent', 'rate_check']
          -- Profile pictures (20261125000000) add the avatar lock and rate check.
          when to_regclass('ops.feedback') is null
          then array['avatar_lock', 'avatar_rate_check', 'clique_members_guard', 'current_access', 'current_member', 'current_moderator', 'history_is_append_only', 'is_member', 'post_views_are_permanent', 'rate_check']
          -- Feedback (20261126000000) adds social.current_founder().
          when to_regclass('social.post_media') is null
          then array['avatar_lock', 'avatar_rate_check', 'clique_members_guard', 'current_access', 'current_founder', 'current_member', 'current_moderator', 'history_is_append_only', 'is_member', 'post_views_are_permanent', 'rate_check']
          -- Photo posts (20261127000000) add the media helper.
          when to_regclass('social.mutes') is null
          then array['avatar_lock', 'avatar_rate_check', 'clique_members_guard', 'current_access', 'current_founder', 'current_member', 'current_moderator', 'history_is_append_only', 'is_member', 'post_media_json', 'post_views_are_permanent', 'rate_check']
          -- Relationships (20261201000000) add Active Supporter, meaningful activity and the mute history guard.
          when to_regclass('social.saves') is null
          then array['avatar_lock', 'avatar_rate_check', 'clique_members_guard', 'current_access', 'current_founder', 'current_member', 'current_moderator', 'history_is_append_only', 'is_active_supporter', 'is_member', 'meaningful_comment', 'mute_history_is_append_only', 'post_media_json', 'post_views_are_permanent', 'rate_check']
          -- Content (20261202000000) adds its rate limit and history guard.
          when to_regclass('social.shares') is null
          then array['avatar_lock', 'avatar_rate_check', 'clique_members_guard', 'content_history_is_append_only', 'content_rate_check', 'current_access', 'current_founder', 'current_member', 'current_moderator', 'history_is_append_only', 'is_active_supporter', 'is_member', 'meaningful_comment', 'mute_history_is_append_only', 'post_media_json', 'post_views_are_permanent', 'rate_check']
          -- Discovery (20261203000000) adds the shares history guard.
          else array['avatar_lock', 'avatar_rate_check', 'clique_members_guard', 'content_history_is_append_only', 'content_rate_check', 'current_access', 'current_founder', 'current_member', 'current_moderator', 'history_is_append_only', 'is_active_supporter', 'is_member', 'meaningful_comment', 'mute_history_is_append_only', 'post_media_json', 'post_views_are_permanent', 'rate_check', 'shares_are_append_only']
        end) then
    raise exception 'FAIL: the social helper and trigger functions are not the approved set (found %)', n;
  end if;
  raise notice 'PASS: social helpers and triggers are not callable by members';
end $$;

-- 4. Clique and history guards.
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'clique_members_guard'
                 and tgrelid = 'social.clique_members'::regclass and tgenabled <> 'D') then
    raise exception 'FAIL: the Inner Clique guard (follow required, at most 25) is missing or disabled';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'clique_members_append_only'
                 and tgrelid = 'social.clique_members'::regclass and tgenabled <> 'D') then
    raise exception 'FAIL: Clique history is not protected from being rewritten';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'follow_events_append_only'
                 and tgrelid = 'social.follow_events'::regclass and tgenabled <> 'D') then
    raise exception 'FAIL: follow history is not append-only';
  end if;
  if not exists (select 1 from pg_indexes where schemaname = 'social' and indexname = 'clique_one_open_per_pair') then
    raise exception 'FAIL: a fan could hold the same creator in their Clique twice';
  end if;
  if not exists (select 1 from pg_constraint where conname = 'follows_not_self' and conrelid = 'social.follows'::regclass) then
    raise exception 'FAIL: members could follow themselves';
  end if;
  -- The Clique holds at most 25 until relationships (20261201000000), which
  -- removes the limit (CON-02); a follow stays required either way.
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'social' and p.proname = 'clique_members_guard'
                   and p.prosrc ~ 'not_following'
                   and (p.prosrc ~ '>= 25') = (to_regclass('social.mutes') is null)) then
    raise exception 'FAIL: the Clique guard is not as approved (follow required; at most 25 before 20261201000000, no limit after)';
  end if;
  if to_regclass('social.mutes') is not null and not exists (select 1 from pg_trigger where tgname = 'mute_events_append_only'
                 and tgrelid = to_regclass('social.mute_events') and tgenabled <> 'D') then
    raise exception 'FAIL: mute history is not append-only';
  end if;
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname in ('app_clique_add', 'app_clique_remove')
        and p.prosrc ~ 'rate_check\(''clique''') <> 2
     or not exists (select 1 from pg_proc where oid = 'public.app_clique_replace(uuid, uuid)'::regprocedure and prosrc ~ 'rate_check\(''clique_replace''')
     or not exists (select 1 from pg_proc where oid = 'social.rate_check(text, uuid)'::regprocedure
                    and prosrc ~ '''clique_replace''' and prosrc ~ 'v_cost := 2' and prosrc ~ 'n \+ v_cost > v_limit') then
    raise exception 'FAIL: Inner Clique add, remove and replace are not all rate limited';
  end if;
  raise notice 'PASS: the Clique and history guards are in place, and Inner Clique changes are rate limited';
end $$;

-- 4b. Viewed state: one row per member and post, permanent, bounded, never a reward signal.
do $$
declare
  src text := (select prosrc from pg_proc where oid = 'public.app_mark_viewed(uuid[], text)'::regprocedure);
begin
  if not exists (select 1 from pg_constraint where conrelid = 'social.post_views'::regclass and contype = 'p'
                 and pg_get_constraintdef(oid) = 'PRIMARY KEY (viewer_id, post_id)') then
    raise exception 'FAIL: viewed state could record the same post twice for a member';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'post_views_permanent'
                 and tgrelid = 'social.post_views'::regclass and tgenabled <> 'D') then
    raise exception 'FAIL: viewed state is not protected from being rewritten';
  end if;
  if pg_catalog.strpos(src, 'cardinality(coalesce(p_posts, ''{}'')) > 50') = 0 or pg_catalog.strpos(src, 'v_recent + v_new > 3000') = 0
     or pg_catalog.strpos(src, 'pg_advisory_xact_lock') = 0 or pg_catalog.strpos(src, 'on conflict (viewer_id, post_id) do nothing') = 0 then
    raise exception 'FAIL: app_mark_viewed lost its batch cap, hourly cap, lock or duplicate guard';
  end if;
  if pg_catalog.strpos((select prosrc from pg_proc where oid = 'public.app_catch_up(uuid, timestamptz, uuid)'::regprocedure), '(s.created_at, s.id) < (p_before_at, p_before_id)') = 0 then
    raise exception 'FAIL: catch-up does not page on (created_at, id)';
  end if;
  if pg_catalog.strpos((select prosrc from pg_proc where oid = 'public.app_unseen_creators()'::regprocedure), 's.created_at >= f.followed_at') = 0 then
    raise exception 'FAIL: unseen counts include posts from before the follow';
  end if;
  raise notice 'PASS: viewed state is private, one row per member and post, permanent, and bounded';
end $$;

-- 5. No Connection Points, money, email or role in Release 1.
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'social'
               and column_name ~* '(email|role|point|^cp_|_cp$|amount|cash|money|reward|balance|payout)') then
    raise exception 'FAIL: a social table has a points, money, email or role column';
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname in ('public', 'social') and (p.proname like 'app\_%' or n.nspname = 'social')
               and p.prosrc ~* '\memail\M') then
    raise exception 'FAIL: a social or member function mentions email';
  end if;
  raise notice 'PASS: Release 1 stores no points, money, email or role';
end $$;

-- 6. Separation from private data. The one exception is pilot membership
--    (20261122000000_member_access): the access check may read
--    ops.member_access (no personal data: account id, cohort, status, dates)
--    through ops.member_access_active(). Any other reference into ops (the
--    waitlist, invitations, admins, acquisition) still fails.
do $$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where (n.nspname = 'social' or (n.nspname = 'public' and p.proname like 'app\_%'))
               -- Also allowed: the moderation objects of 20261124000000 (reports, the
               -- audit trail, moderators, the retention purge, the note check).
               -- And foundation v2 (20261130000000): adult confirmations, controlled
               -- registration (settings, links, records, the shared check) and the
               -- launch settings it reads. No waitlist, invitation or admin data.
               and regexp_replace(p.prosrc, 'ops\.(age_attestations|adult_attested|registration_settings|registration_links|registrations|registration_check|set_registration_settings|create_invitation_link|new_link_code|member_launch_settings|member_access(_active)?|content_reports|moderation_actions|moderator_active|purge_expired_report_data|clean_note|storage_cleanup_plans|storage_cleanup_candidates|storage_orphans|history_append_only|feedback|feedback_notes|feedback_actions|media_settings|media_deletions|media_drain_runs|media_admin_events|photos_open|photo_storage_used|queue_media_deletion|public_preview_settings|enforcements|enforcement_lifts|member_standing|member_notices|notify_member|appeals|moderators|other_moderator_available|connections|week_start)\M', '', 'g')
                  -- Relationships (20261201000000): the member's own non-binding Support Intent.
                  ~* '\m(ops|waitlist_api|analytics)\.|\mintent\.(?!support_intents\M)|\msim\.(?!(points_ledger|award_state|outstanding|open_pool_cents|split|revenue_entries|settlements|settlement_lines|reward_settings|reverse|restore_hidden)\M)') then
    raise exception 'FAIL: a social or member function reaches private admin, waitlist or analytics data';
  end if;
  if exists (
    select 1
    from pg_depend d
    join pg_rewrite rw on rw.oid = d.objid
    join pg_class v on v.oid = rw.ev_class
    join pg_namespace vn on vn.oid = v.relnamespace
    join pg_class t on t.oid = d.refobjid
    join pg_namespace tn on tn.oid = t.relnamespace
    where tn.nspname = 'social' and vn.nspname <> 'social'
  ) then
    raise exception 'FAIL: a view outside social reads a social table';
  end if;
  raise notice 'PASS: the social core is separate from private admin, waitlist and analytics data';
end $$;
