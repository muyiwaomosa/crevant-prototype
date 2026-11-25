-- Staging-safe, read-only: governance (20261206000000). Catalog reads only.
-- Skipped until the migration is applied.

\set ON_ERROR_STOP on
select to_regclass('social.blocks') is not null
       or case when to_regclass('supabase_migrations.schema_migrations') is null then false
               else (xpath('/row/n/text()', query_to_xml(
                       'select count(*) as n from supabase_migrations.schema_migrations where version = ''20261206000000''',
                       false, true, '')))[1]::text::int > 0
          end as governance_applied \gset
\if :governance_applied

do $$
declare
  t text;
  f text;
  bad text[] := '{}';
  v text := coalesce(pg_catalog.pg_get_viewdef(to_regclass('social.visible_members')), '');
begin
  -- Private tables, row level security on, unreachable by members and visitors.
  foreach t in array array['social.blocks', 'social.block_events', 'ops.enforcements', 'ops.enforcement_lifts', 'ops.member_notices', 'ops.appeals'] loop
    if to_regclass(t) is null then bad := bad || (t || ' missing'); continue; end if;
    if not (select relrowsecurity from pg_class where oid = to_regclass(t)) then bad := bad || (t || ' without row level security'); end if;
    if has_table_privilege('anon', t, 'SELECT,INSERT,UPDATE,DELETE') or has_table_privilege('authenticated', t, 'SELECT,INSERT,UPDATE,DELETE') then
      bad := bad || (t || ' reachable by members or visitors');
    end if;
  end loop;
  if has_table_privilege('authenticated', 'social.listed_members', 'SELECT') or has_table_privilege('anon', 'social.listed_members', 'SELECT') then
    bad := bad || 'social.listed_members readable by members'::text;
  end if;
  -- History that cannot be rewritten.
  foreach t in array array['social.block_events:block_events_append_only', 'ops.enforcements:enforcements_no_update',
                           'ops.enforcement_lifts:enforcement_lifts_no_update', 'ops.member_notices:member_notices_read_only',
                           'ops.appeals:appeals_decided_once'] loop
    if not exists (select 1 from pg_trigger where tgrelid = to_regclass(split_part(t, ':', 1)) and tgname = split_part(t, ':', 2) and tgenabled <> 'D') then
      bad := bad || ('editable: ' || t);
    end if;
  end loop;
  -- Blocks and suspensions are applied in the one shared view, with membership still required.
  if position('social.blocks' in v) = 0 or position('auth.uid()' in v) = 0 or position('ops.enforcements' in v) = 0
     or position('member_access' in v) = 0 then
    bad := bad || 'social.visible_members does not apply membership, blocks and suspensions'::text;
  end if;
  -- Restrictions and suspensions are enforced on the tables themselves.
  foreach t in array array['social.posts', 'social.comments', 'social.reposts', 'social.saves', 'social.shares', 'social.follows'] loop
    if not exists (select 1 from pg_trigger where tgrelid = to_regclass(t) and tgname = 'standing_guard' and tgenabled <> 'D'
                   and tgfoid = 'ops.standing_guard()'::regprocedure) then
      bad := bad || ('no standing guard on ' || t);
    end if;
  end loop;
  -- Hidden comments are always also deleted, so every function excludes them.
  if not exists (select 1 from pg_constraint where conname = 'comments_hidden_is_deleted' and conrelid = 'social.comments'::regclass) then
    bad := bad || 'a hidden comment is not guaranteed to be excluded'::text;
  end if;
  -- The ladder, independent appeals, and nothing that names a reporter.
  if (select prosrc from pg_proc where oid = 'public.app_mod_enforce(uuid, text, text, uuid, integer, text)'::regprocedure) !~ 'ladder_step_required' then
    bad := bad || 'the enforcement ladder is not enforced'::text;
  end if;
  if (select prosrc from pg_proc where oid = 'public.app_mod_decide_appeal(uuid, boolean, text)'::regprocedure) !~ 'needs_another_moderator' then
    bad := bad || 'appeals are not decided independently'::text;
  end if;
  foreach f in array array['public.app_my_notices()', 'public.app_mod_appeals(text)', 'public.app_mod_member_record(uuid)', 'public.app_my_blocks()'] loop
    if pg_get_function_result(f::regprocedure) ~* 'reporter' or (select prosrc from pg_proc where oid = f::regprocedure) ~* 'reporter_id' then
      bad := bad || ('names a reporter: ' || f);
    end if;
  end loop;
  -- Points earned on hidden posts are reversed.
  if (select prosrc from pg_proc where oid = 'public.app_mod_hide(uuid, text)'::regprocedure) !~ 'sim\.reverse' then
    bad := bad || 'hiding a post does not reverse its points'::text;
  end if;
  if cardinality(bad) > 0 then
    raise exception 'FAIL: governance: %', bad;
  end if;
  raise notice 'PASS: governance: blocks, enforcement, notices and appeals are private and append-only; blocks and suspensions apply in the shared view; restrictions are enforced on the tables; the ladder and independent appeals are in place; points on hidden posts are reversed';
end $$;

\else
\echo 'Skipped 022_governance.sql: 20261206000000 is not applied here.'
\endif
