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
                            'media_uploads', 'post_media')
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
  -- Open registration (20261130000000), once applied.
  if to_regprocedure('public.app_claim_access()') is not null then
    expected := (select array_agg(x order by x collate "C") from unnest(expected || array['app_claim_access']) x);
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
    if has_function_privilege('anon', f.oid, 'EXECUTE') then
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
          else array['avatar_lock', 'avatar_rate_check', 'clique_members_guard', 'current_access', 'current_founder', 'current_member', 'current_moderator', 'history_is_append_only', 'is_member', 'post_media_json', 'post_views_are_permanent', 'rate_check']
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
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'social' and p.proname = 'clique_members_guard' and p.prosrc ~ '>= 25') then
    raise exception 'FAIL: the Inner Clique limit is not 25';
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
               -- audit trail, moderators, the retention purge, the note check), and
               -- the launch gate's open flag, read by app_claim_access (20261130000000).
               and regexp_replace(p.prosrc, 'ops\.(member_access(_active)?|member_launch_settings|content_reports|moderation_actions|moderator_active|purge_expired_report_data|clean_note|storage_cleanup_plans|storage_cleanup_candidates|storage_orphans|history_append_only|feedback|feedback_notes|feedback_actions|media_settings|media_deletions|media_drain_runs|media_admin_events|photos_open|photo_storage_used|queue_media_deletion)\M', '', 'g') ~* '\m(ops|waitlist_api|intent|sim|analytics)\.') then
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
