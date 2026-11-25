-- Staging-safe, read-only: member feedback and the founder's inbox (20261126000000).
-- Catalog reads only: no member data.
-- Before the migration is applied this file only confirms that nothing of it
-- exists yet; once it is recorded, every check below must pass.

\set ON_ERROR_STOP on
select to_regclass('ops.feedback') is not null
       or case when to_regclass('supabase_migrations.schema_migrations') is null then false
               else (xpath('/row/n/text()', query_to_xml(
                       'select count(*) as n from supabase_migrations.schema_migrations where version = ''20261126000000''',
                       false, true, '')))[1]::text::int > 0
          end as feedback_applied \gset
\if :feedback_applied

-- 1. Feedback, notes and the audit trail are private.
do $$
declare
  t text;
begin
  foreach t in array array['ops.feedback', 'ops.feedback_notes', 'ops.feedback_actions'] loop
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
      raise exception 'FAIL: % has a row level security policy', t;
    end if;
  end loop;
  raise notice 'PASS: feedback, private notes and their audit trail are private';
end $$;

-- 2. Every founder function requires membership AND the founder cohort; the
--    member functions require membership; nothing else is exposed.
do $$
declare
  r record;
  bad text[] := '{}';
begin
  if (select array_agg(p.proname::text order by p.proname collate "C")
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname like 'app\_founder\_%'
        -- Foundation v2 (20261130000000) adds the founder's registration functions; checked in 016.
        and p.proname not in ('app_founder_create_invitation_link', 'app_founder_registration', 'app_founder_set_registration',
                              -- 20261204000000 adds the founder's search counts; checked in 020.
                              'app_founder_search_metrics',
                              -- 20261205000000 adds the founder's rewards functions; checked in 021.
                              'app_founder_close_month', 'app_founder_record_sim_revenue', 'app_founder_referral_queue',
                              'app_founder_review_referral', 'app_founder_rewards_overview', 'app_founder_set_rewards',
                              -- 20261208000000 adds the founder's advertising functions; checked in 024.
                              'app_founder_ad_demand', 'app_founder_ads', 'app_founder_attribute_campaign_revenue', 'app_founder_campaign_report',
                              'app_founder_record_advertiser_feedback', 'app_founder_record_conversions', 'app_founder_review_advertiser',
                              'app_founder_save_advertiser', 'app_founder_save_campaign', 'app_founder_set_campaign_status',
                              -- 20261210000000 adds the founder's overview; checked in 026.
                              'app_founder_overview'))
     is distinct from array['app_founder_feedback', 'app_founder_feedback_add_note', 'app_founder_feedback_list', 'app_founder_feedback_set_status'] then
    bad := bad || 'the set of app_founder_* functions'::text;
  end if;
  for r in select p.proname, p.prosrc, p.prosecdef, p.proconfig, p.oid
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and (p.proname like 'app\_founder\_%' or p.proname in ('app_feedback_submit', 'app_is_founder')) loop
    if not r.prosecdef or r.proconfig is null or not ('search_path=""' = any (r.proconfig) or 'search_path=' = any (r.proconfig)) then
      bad := bad || (r.proname || ': not security definer with an empty search path');
    end if;
    if has_function_privilege('anon', r.oid, 'EXECUTE') then
      bad := bad || (r.proname || ': callable by visitors');
    end if;
    if r.proname like 'app\_founder\_%' and position('social.current_founder()' in r.prosrc) = 0 then
      bad := bad || (r.proname || ': does not check social.current_founder()');
    end if;
    if r.proname in ('app_feedback_submit', 'app_is_founder') and position('social.current_member()' in r.prosrc) = 0 then
      bad := bad || (r.proname || ': does not check social.current_member()');
    end if;
  end loop;
  if to_regprocedure('social.current_founder()') is null
     or position('social.current_member()' in (select prosrc from pg_proc where oid = to_regprocedure('social.current_founder()'))) = 0
     or position('a.cohort = ''founder''' in (select prosrc from pg_proc where oid = to_regprocedure('social.current_founder()'))) = 0 then
    bad := bad || 'social.current_founder: does not require membership and the founder cohort'::text;
  end if;
  if has_function_privilege('authenticated', 'social.current_founder()', 'EXECUTE')
     or has_function_privilege('authenticated', 'ops.purge_feedback(integer, text, text)', 'EXECUTE')
     or has_function_privilege('anon', 'ops.purge_feedback(integer, text, text)', 'EXECUTE') then
    bad := bad || 'the founder check or the retention purge is callable by members or visitors'::text;
  end if;
  if cardinality(bad) > 0 then
    raise exception 'FAIL: feedback functions without the expected safeguards: %', bad;
  end if;
  raise notice 'PASS: founder functions require the founder cohort, member functions require membership, and the purge is server only';
end $$;

-- 3. Only the feedback functions read feedback: no other member function can
--    return it, and members can't read even their own after sending.
do $$
declare
  found text[];
begin
  select coalesce(array_agg(p.proname::text order by p.proname), '{}') into found
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where (n.nspname = 'public' or n.nspname = 'social')
    and p.prosrc ~ '\mops\.feedback(_notes|_actions)?\M'
    and p.proname not in ('app_feedback_submit', 'app_founder_feedback', 'app_founder_feedback_add_note',
                          'app_founder_feedback_list', 'app_founder_feedback_set_status');
  if cardinality(found) > 0 then
    raise exception 'FAIL: other functions read feedback: %', found;
  end if;
  if position('ops.feedback' in (select prosrc from pg_proc where oid = 'public.app_feedback_submit(text, text, text, uuid)'::regprocedure)) = 0
     or (select prorettype from pg_proc where oid = 'public.app_feedback_submit(text, text, text, uuid)'::regprocedure) <> 'uuid'::regtype then
    raise exception 'FAIL: sending feedback returns more than the new entry''s id';
  end if;
  raise notice 'PASS: only the founder functions read feedback; sending returns only an id';
end $$;

-- 4. Server-side rules: allowlisted categories, features and statuses; the
--    length limit; one entry per request id; the audit trail is append-only.
do $$
declare
  defs text;
begin
  select string_agg(pg_get_constraintdef(c.oid), ' ') into defs from pg_constraint c where c.conrelid = 'ops.feedback'::regclass;
  if position('''problem''' in defs) = 0 or position('''praise''' in defs) = 0
     or position('''catch_up''' in defs) = 0 or position('''other''' in defs) = 0
     or position('''closed''' in defs) = 0 or position('char_length(body) >= 10' in defs) = 0
     or position('char_length(body) <= 1000' in defs) = 0 then
    raise exception 'FAIL: the feedback table no longer enforces its categories, features, statuses or length';
  end if;
  if not exists (select 1 from pg_index i where i.indrelid = 'ops.feedback'::regclass and i.indisunique
                   and pg_get_indexdef(i.indexrelid) like '%(submitter_id, client_request_id)%') then
    raise exception 'FAIL: feedback is not unique per member and request id';
  end if;
  if (select count(*) from pg_trigger t where t.tgrelid = 'ops.feedback_actions'::regclass and not t.tgisinternal
        and t.tgfoid = 'ops.history_append_only()'::regprocedure) < 2 then
    raise exception 'FAIL: the feedback audit trail can be edited, deleted or truncated';
  end if;
  if not exists (select 1 from pg_trigger t where t.tgrelid = 'ops.feedback_notes'::regclass and not t.tgisinternal
                   and t.tgfoid = 'ops.history_append_only()'::regprocedure) then
    raise exception 'FAIL: private notes can be edited';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'ops' and table_name = 'feedback'
               and column_name ~ '(email|url|path|ip|user_agent|screenshot|attachment)') then
    raise exception 'FAIL: feedback stores an email, address, URL or attachment';
  end if;
  raise notice 'PASS: categories, features, statuses and length are enforced; one entry per request; the audit trail is append-only';
end $$;

\else
do $$
begin
  if to_regclass('ops.feedback_notes') is not null or to_regclass('ops.feedback_actions') is not null
     or to_regprocedure('social.current_founder()') is not null
     or exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                where n.nspname = 'public' and (p.proname like 'app\_founder\_%' or p.proname in ('app_feedback_submit', 'app_is_founder'))) then
    raise exception 'FAIL: part of the feedback migration exists although it is not recorded';
  end if;
  raise notice 'PASS: feedback (20261126000000) is not applied yet, and none of it exists';
end $$;
\endif
