-- Staging-safe, read-only: foundation v2 (20261130000000). Catalog reads and
-- counts only: no member data or account ids are read out. Skipped until the
-- migration is applied.

\set ON_ERROR_STOP on
select to_regclass('ops.registrations') is not null
       or case when to_regclass('supabase_migrations.schema_migrations') is null then false
               else (xpath('/row/n/text()', query_to_xml(
                       'select count(*) as n from supabase_migrations.schema_migrations where version = ''20261130000000''',
                       false, true, '')))[1]::text::int > 0
          end as foundation_applied \gset
\if :foundation_applied

do $$
declare
  t text;
  bad text[] := '{}';
  access_src text := (select prosrc from pg_proc where oid = to_regprocedure('social.current_access()'));
  claim_src text := (select prosrc from pg_proc where oid = to_regprocedure('public.app_claim_access(text, boolean, text)'));
  feed_src text := (select prosrc from pg_proc where oid = to_regprocedure('public.app_feed_page(timestamp with time zone, uuid, integer, text)'));
  hook regprocedure := to_regprocedure('public.hook_before_user_created(jsonb)');
begin
  -- 1. The private tables exist, have row level security and give members nothing.
  foreach t in array array['ops.age_attestations', 'ops.registration_settings', 'ops.registration_setting_events',
                           'ops.registration_links', 'ops.registrations', 'ops.blocked_email_domains', 'analytics.events'] loop
    if to_regclass(t) is null then bad := bad || (t || ' missing'); continue; end if;
    if not (select relrowsecurity from pg_class where oid = to_regclass(t)) then bad := bad || (t || ' without row level security'); end if;
    if has_table_privilege('anon', t, 'SELECT,INSERT,UPDATE,DELETE') or has_table_privilege('authenticated', t, 'SELECT,INSERT,UPDATE,DELETE') then
      bad := bad || (t || ' reachable by members or visitors');
    end if;
  end loop;
  -- 2. Access requires the adult confirmation; confirmations and registrations are never edited.
  if position('ops.adult_attested(v_uid)' in coalesce(access_src, '')) = 0 then bad := bad || 'social.current_access does not require the adult confirmation'::text; end if;
  if not exists (select 1 from pg_trigger where tgrelid = to_regclass('ops.age_attestations') and tgname = 'age_attestations_permanent') then bad := bad || 'attestations editable'::text; end if;
  if not exists (select 1 from pg_trigger where tgrelid = to_regclass('ops.registrations') and tgname = 'registrations_guard') then bad := bad || 'registrations editable'::text; end if;
  if not exists (select 1 from pg_trigger where tgrelid = to_regclass('ops.registration_setting_events') and tgname = 'registration_setting_events_no_update') then bad := bad || 'settings history editable'::text; end if;
  -- 3. The settings row exists (one row).
  if (select count(*) from ops.registration_settings) <> 1 then bad := bad || 'registration settings row missing'::text; end if;
  -- 4. The account creation hook: only Supabase Auth may run it.
  if hook is null then bad := bad || 'hook missing'::text;
  elsif has_function_privilege('anon', hook, 'EXECUTE') or has_function_privilege('authenticated', hook, 'EXECUTE')
        or not has_function_privilege('supabase_auth_admin', hook, 'EXECUTE') then
    bad := bad || 'hook privileges wrong'::text;
  end if;
  -- 5. Claiming goes through verification, the adult confirmation, one lock and the shared check.
  foreach t in array array['email_confirmed_at is null', 'p_adult_attested is not true', 'pg_advisory_xact_lock', 'ops.registration_check(v_code)'] loop
    if position(t in coalesce(claim_src, '')) = 0 then bad := bad || ('claim without ' || t); end if;
  end loop;
  -- 6. Home pages on (created_at, id).
  if position('(s.created_at, s.id) < (p_before_at, p_before_id)' in coalesce(feed_src, '')) = 0 then bad := bad || 'feed paging not on (created_at, id)'::text; end if;
  -- 7. Events come from triggers on the authoritative tables, never from viewed state.
  foreach t in array array['social.posts:events_posts', 'social.comments:events_comments', 'social.likes:events_likes',
                           'social.follow_events:events_follow_events', 'social.clique_members:events_clique_members', 'ops.registrations:events_registrations'] loop
    if not exists (select 1 from pg_trigger where tgrelid = to_regclass(split_part(t, ':', 1)) and tgname = split_part(t, ':', 2)) then
      bad := bad || ('event trigger missing: ' || t);
    end if;
  end loop;
  if exists (select 1 from pg_trigger where tgrelid = to_regclass('social.post_views') and tgfoid = to_regprocedure('analytics.capture()')) then
    bad := bad || 'viewed state feeds events'::text;
  end if;
  if cardinality(bad) > 0 then
    raise exception 'FAIL: foundation v2 safeguards: %', bad;
  end if;
  raise notice 'PASS: foundation v2: private tables, adult confirmation required, Auth-only hook, guarded claim, complete paging, server events';
end $$;

\else
\echo 'SKIP: 016_foundation_v2.sql: migration 20261130000000 not applied'
\endif
