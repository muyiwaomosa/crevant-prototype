-- Staging-safe, read-only: relationships (20261201000000). Catalog reads
-- only: no member data or account ids are read out. Skipped until the
-- migration is applied.

\set ON_ERROR_STOP on
select to_regclass('social.mutes') is not null
       or case when to_regclass('supabase_migrations.schema_migrations') is null then false
               else (xpath('/row/n/text()', query_to_xml(
                       'select count(*) as n from supabase_migrations.schema_migrations where version = ''20261201000000''',
                       false, true, '')))[1]::text::int > 0
          end as relationships_applied \gset
\if :relationships_applied

do $$
declare
  t text;
  bad text[] := '{}';
  feed_src text := (select prosrc from pg_proc where oid = to_regprocedure('public.app_feed_page(timestamp with time zone, uuid, integer, text)'));
  unseen_src text := (select prosrc from pg_proc where oid = to_regprocedure('public.app_unseen_creators()'));
  priority_src text := (select prosrc from pg_proc where oid = to_regprocedure('public.app_home_priority(integer)'));
  record_src text := (select prosrc from pg_proc where oid = to_regprocedure('public.app_record_support_intent(uuid, text)'));
begin
  -- 1. The private tables exist, have row level security and give members nothing.
  foreach t in array array['social.mutes', 'social.mute_events', 'intent.support_intents'] loop
    if to_regclass(t) is null then bad := bad || (t || ' missing'); continue; end if;
    if not (select relrowsecurity from pg_class where oid = to_regclass(t)) then bad := bad || (t || ' without row level security'); end if;
    if has_table_privilege('anon', t, 'SELECT,INSERT,UPDATE,DELETE') or has_table_privilege('authenticated', t, 'SELECT,INSERT,UPDATE,DELETE') then
      bad := bad || (t || ' reachable by members or visitors');
    end if;
  end loop;
  -- 2. Histories are append-only.
  foreach t in array array['social.mute_events:mute_events_append_only', 'intent.support_intents:support_intents_append_only'] loop
    if not exists (select 1 from pg_trigger where tgrelid = to_regclass(split_part(t, ':', 1)) and tgname = split_part(t, ':', 2) and tgenabled <> 'D') then
      bad := bad || ('history editable: ' || t);
    end if;
  end loop;
  -- 3. Mute leaves Home only, by the member's own choice; the Clique first group is bounded.
  if position('social.mutes' in coalesce(feed_src, '')) = 0 or position('social.mutes' in coalesce(unseen_src, '')) = 0 then
    bad := bad || 'Home does not honour mutes'::text;
  end if;
  if position('(s.created_at, s.id) < (p_before_at, p_before_id)' in coalesce(feed_src, '')) = 0 then bad := bad || 'feed paging not on (created_at, id)'::text; end if;
  if position('least(greatest(coalesce(p_limit, 10), 1), 20)' in coalesce(priority_src, '')) = 0 or position('social.post_views' in coalesce(priority_src, '')) = 0 then
    bad := bad || 'the Clique first group is not bounded to unseen posts'::text;
  end if;
  -- 4. Support Intent: known options only, rate limited, never money.
  if position('''usd_3'', ''usd_5'', ''usd_10'', ''not_sure'', ''withdrawn''' in coalesce(record_src, '')) = 0
     or position('rate_limited' in coalesce(record_src, '')) = 0 then
    bad := bad || 'Support Intent options or limit changed'::text;
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'intent'
             and column_name ~* '(balance|payout|paid|charge|card|cash|point)') then
    bad := bad || 'Support Intent stores a payment-like column'::text;
  end if;
  -- 5. Events: mutes and Support Intent are recorded by triggers.
  foreach t in array array['social.mute_events:events_mute_events', 'intent.support_intents:events_support_intents'] loop
    if not exists (select 1 from pg_trigger where tgrelid = to_regclass(split_part(t, ':', 1)) and tgname = split_part(t, ':', 2)) then
      bad := bad || ('event trigger missing: ' || t);
    end if;
  end loop;
  -- 6. Follow sources are a fixed list.
  if not exists (select 1 from pg_constraint where conrelid = to_regclass('social.follow_events') and conname = 'follow_events_source') then
    bad := bad || 'follow source not constrained'::text;
  end if;
  if cardinality(bad) > 0 then
    raise exception 'FAIL: relationships: %', bad;
  end if;
  raise notice 'PASS: relationships: mutes, mute history and Support Intent are private and append-only; Home honours mutes; the Clique first group is bounded; events are recorded';
end $$;

\else
\echo 'Skipped 017_relationships.sql: 20261201000000 is not applied here.'
\endif
