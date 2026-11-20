-- Staging-safe, read-only: essential moderation (20261124000000).
-- Catalog reads only: no report, action or member data is read.
-- Before the migration is applied this file only confirms that nothing of it
-- exists yet; once it is recorded, every check below must pass.

\set ON_ERROR_STOP on
select to_regclass('ops.content_reports') is not null
       or case when to_regclass('supabase_migrations.schema_migrations') is null then false
               else (xpath('/row/n/text()', query_to_xml(
                       'select count(*) as n from supabase_migrations.schema_migrations where version = ''20261124000000''',
                       false, true, '')))[1]::text::int > 0
          end as moderation_applied \gset
\if :moderation_applied

-- 1. Moderation data is private: row level security on, nothing for members or visitors, no policies.
do $$
declare
  t text;
begin
  foreach t in array array['ops.moderators', 'ops.moderator_events', 'ops.content_reports', 'ops.moderation_actions'] loop
    if to_regclass(t) is null then
      raise exception 'FAIL: % is missing', t;
    end if;
    if not (select relrowsecurity from pg_class where oid = t::regclass) then
      raise exception 'FAIL: row level security is off on %', t;
    end if;
    if has_table_privilege('anon', t, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
       or has_table_privilege('authenticated', t, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER') then
      raise exception 'FAIL: members or visitors have privileges on %', t;
    end if;
    if exists (select 1 from pg_policy where polrelid = t::regclass) then
      raise exception 'FAIL: % has a row level security policy (it must be reached only through functions)', t;
    end if;
  end loop;
  raise notice 'PASS: reports, moderators and the moderation audit trail are private';
end $$;

-- 2. Only server code grants moderation, holds reports or purges them.
do $$
declare
  f text;
begin
  foreach f in array array['ops.grant_moderator(uuid, text, text)', 'ops.revoke_moderator(uuid, text, text)',
                           'ops.purge_expired_report_data(integer)', 'ops.set_report_hold(uuid, boolean, text, text)',
                           'ops.moderator_active(uuid)', 'social.current_moderator()'] loop
    if to_regprocedure(f) is null then
      raise exception 'FAIL: % is missing', f;
    end if;
    if has_function_privilege('anon', f, 'EXECUTE') or has_function_privilege('authenticated', f, 'EXECUTE') then
      raise exception 'FAIL: members or visitors can run %', f;
    end if;
  end loop;
  raise notice 'PASS: only server code can grant or revoke moderation, set holds or run the retention purge';
end $$;

-- 3. Every moderation function needs active membership AND an active
--    moderator row, and moderation is never implied by ops.admins.
do $$
declare
  bad text[] := '{}';
  r record;
begin
  for r in select p.proname, p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname like 'app\_mod\_%' loop
    if position('social.current_moderator()' in r.prosrc) = 0 then bad := bad || r.proname; end if;
  end loop;
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'app\_mod\_%') <> 5 then
    bad := bad || 'the set of app_mod_* functions'::text;
  end if;
  if position('social.current_member()' in (select prosrc from pg_proc where oid = 'social.current_moderator()'::regprocedure)) = 0
     or position('ops.moderator_active(v_uid)' in (select prosrc from pg_proc where oid = 'social.current_moderator()'::regprocedure)) = 0 then
    bad := bad || 'social.current_moderator'::text;
  end if;
  if (select prosrc from pg_proc where oid = 'ops.moderator_active(uuid)'::regprocedure) !~ 'from ops\.moderators m where m\.user_id = p_user'
     or (select prosrc from pg_proc where oid = 'ops.moderator_active(uuid)'::regprocedure) ~* '(admins|member_access|cohort)' then
    bad := bad || 'ops.moderator_active'::text;
  end if;
  if cardinality(bad) > 0 then
    raise exception 'FAIL: moderation is not limited to active members with a moderator row: %', bad;
  end if;
  raise notice 'PASS: every moderation function needs active pilot membership and a moderator row (not ops.admins)';
end $$;

-- 4. Histories and the audit trail are append-only; moderator rows are never edited.
do $$
declare
  t text;
begin
  foreach t in array array['ops.moderator_events', 'ops.moderation_actions'] loop
    if (select count(*) from pg_trigger g join pg_proc p on p.oid = g.tgfoid
        where g.tgrelid = t::regclass and not g.tgisinternal and p.proname = 'history_append_only') <> 2 then
      raise exception 'FAIL: % is not protected against edits, deletes and truncation', t;
    end if;
  end loop;
  if not exists (select 1 from pg_trigger where tgrelid = 'ops.moderators'::regclass and tgname = 'moderators_no_update')
     or not exists (select 1 from pg_trigger where tgrelid = 'ops.moderators'::regclass and tgname = 'moderator_record') then
    raise exception 'FAIL: moderator changes are not recorded, or rows can be edited';
  end if;
  raise notice 'PASS: moderator history and the moderation audit trail are append-only, and every moderator change is recorded';
end $$;

-- 5. Confidentiality and no automatic removal.
do $$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname like 'app\_%'
               and (exists (select 1 from unnest(coalesce(p.proargnames, '{}')) a where a ~* 'reporter') or pg_get_function_result(p.oid) ~* 'reporter')) then
    raise exception 'FAIL: a member function returns or takes a reporter';
  end if;
  if exists (select 1 from pg_trigger where tgrelid = 'ops.content_reports'::regclass and not tgisinternal) then
    raise exception 'FAIL: a trigger on reports could act on content automatically';
  end if;
  if (select prosrc from pg_proc where oid = 'public.app_report(text, uuid, text, text)'::regprocedure) ~* '(update|delete from)\s+social\.' then
    raise exception 'FAIL: reporting changes content';
  end if;
  raise notice 'PASS: no member function exposes a reporter, and reports never change content by themselves';
end $$;

-- 6. Hidden content is excluded everywhere, and retention runs.
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'social.posts'::regclass and conname = 'posts_hidden_is_deleted') then
    raise exception 'FAIL: a hidden post is not guaranteed to be excluded (posts_hidden_is_deleted is missing)';
  end if;
  if position('ops.purge_expired_report_data()' in (select prosrc from pg_proc where oid = 'public.app_report(text, uuid, text, text)'::regprocedure)) = 0
     or position('ops.purge_expired_report_data()' in (select prosrc from pg_proc where oid = 'public.app_mod_queue(text)'::regprocedure)) = 0 then
    raise exception 'FAIL: the 90-day retention purge is not run by reporting and the moderation queue';
  end if;
  if (select prosrc from pg_proc where oid = 'ops.purge_expired_report_data(integer)'::regprocedure) !~ 'not r\.legal_hold' then
    raise exception 'FAIL: the retention purge does not respect legal or safety holds';
  end if;
  raise notice 'PASS: hidden posts are always also deleted (so every function excludes them), and the retention purge runs and respects holds';
end $$;

\else
do $$
begin
  if to_regclass('ops.moderators') is not null or to_regclass('ops.moderation_actions') is not null
     or to_regprocedure('social.current_moderator()') is not null
     or exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                where n.nspname = 'public' and p.proname in ('app_report', 'app_is_moderator', 'app_mod_queue', 'app_mod_report', 'app_mod_hide', 'app_mod_restore', 'app_mod_dismiss'))
     or exists (select 1 from information_schema.columns where table_schema = 'social' and table_name = 'posts' and column_name = 'hidden_at') then
    raise exception 'FAIL: part of the moderation migration exists, but not all of it';
  end if;
  raise notice 'SKIP: moderation (20261124000000) is not applied here yet, and none of it exists';
end $$;
\endif
