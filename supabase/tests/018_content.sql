-- Staging-safe, read-only: content (20261202000000). Catalog reads only.
-- Skipped until the migration is applied.

\set ON_ERROR_STOP on
select to_regclass('social.saves') is not null
       or case when to_regclass('supabase_migrations.schema_migrations') is null then false
               else (xpath('/row/n/text()', query_to_xml(
                       'select count(*) as n from supabase_migrations.schema_migrations where version = ''20261202000000''',
                       false, true, '')))[1]::text::int > 0
          end as content_applied \gset
\if :content_applied

do $$
declare
  t text;
  bad text[] := '{}';
  edit_src text := (select prosrc from pg_proc where oid = to_regprocedure('public.app_edit_post(uuid, text, text)'));
  items_src text := (select prosrc from pg_proc where oid = to_regprocedure('public.app_feed_items_page(timestamp with time zone, uuid, integer, text)'));
begin
  -- 1. Private tables with row level security, nothing for members or visitors.
  foreach t in array array['social.post_edits', 'social.saves', 'social.reposts', 'social.content_actions'] loop
    if to_regclass(t) is null then bad := bad || (t || ' missing'); continue; end if;
    if not (select relrowsecurity from pg_class where oid = to_regclass(t)) then bad := bad || (t || ' without row level security'); end if;
    if has_table_privilege('anon', t, 'SELECT,INSERT,UPDATE,DELETE') or has_table_privilege('authenticated', t, 'SELECT,INSERT,UPDATE,DELETE') then
      bad := bad || (t || ' reachable by members or visitors');
    end if;
  end loop;
  -- 2. Edit history and the action log are append-only.
  foreach t in array array['social.post_edits:post_edits_append_only', 'social.content_actions:content_actions_append_only'] loop
    if not exists (select 1 from pg_trigger where tgrelid = to_regclass(split_part(t, ':', 1)) and tgname = split_part(t, ':', 2) and tgenabled <> 'D') then
      bad := bad || ('history editable: ' || t);
    end if;
  end loop;
  -- 3. Editing keeps the earlier version, only for the author's live posts, rate limited.
  foreach t in array array['insert into social.post_edits', 's.author_id = v_uid and s.deleted_at is null', 'social.content_rate_check'] loop
    if position(t in coalesce(edit_src, '')) = 0 then bad := bad || ('edit without ' || t); end if;
  end loop;
  -- 4. Home with reposts pages on (activity, id) and honours mutes.
  if position('(i.at, s.id) < (p_before_at, p_before_id)' in coalesce(items_src, '')) = 0 or position('social.mutes' in coalesce(items_src, '')) = 0 then
    bad := bad || 'Home with reposts paging or mutes changed'::text;
  end if;
  -- 5. Events from triggers.
  foreach t in array array['social.post_edits:events_post_edits', 'social.saves:events_saves', 'social.reposts:events_reposts'] loop
    if not exists (select 1 from pg_trigger where tgrelid = to_regclass(split_part(t, ':', 1)) and tgname = split_part(t, ':', 2)) then
      bad := bad || ('event trigger missing: ' || t);
    end if;
  end loop;
  if cardinality(bad) > 0 then
    raise exception 'FAIL: content: %', bad;
  end if;
  raise notice 'PASS: content: edit history, saves, reposts and the action log are private; history is append-only; Home with reposts pages correctly and honours mutes; events are recorded';
end $$;

\else
\echo 'Skipped 018_content.sql: 20261202000000 is not applied here.'
\endif
