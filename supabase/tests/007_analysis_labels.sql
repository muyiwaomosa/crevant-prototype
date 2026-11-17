-- Staging-safe, read-only: Splitpost has one account and one experience for
-- everyone. The waitlist's analysis labels (participant_groups:
-- active_creator, aspiring_creator, supporter) are worked out from optional
-- answers to balance invitation waves, and must never decide what anyone can
-- do: no permission, feature or onboarding may depend on them, and no account
-- type exists anywhere.
do $$
declare
  bad text;
begin
  -- The labels live in one place: the generated column on ops.waitlist.
  select string_agg(format('%s.%s', a.attrelid::regclass, a.attname), ', ') into bad
  from pg_attribute a join pg_class c on c.oid = a.attrelid
  where a.attname ~ 'participant_group' and not a.attisdropped and a.attnum > 0
    and c.relnamespace not in ('pg_catalog'::regnamespace, 'information_schema'::regnamespace)
    and a.attrelid <> 'ops.waitlist'::regclass;
  if bad is not null then
    raise exception 'FAIL: analysis labels stored outside the waitlist: %', bad;
  end if;

  -- Only the founder's waitlist admin tools read them (counts and invitation
  -- waves). No member function, policy or trigger may.
  select string_agg(p.oid::regprocedure::text, ', ') into bad
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname not in ('pg_catalog', 'information_schema')
    and p.prosrc ~ '(participant_groups|active_creator|aspiring_creator)'
    and (n.nspname || '.' || p.proname) <> all (array[
      'waitlist_api.admin_summary', 'waitlist_api.admin_wave_preview',
      'waitlist_api.admin_wave_select', 'waitlist_api.admin_wave_summary']);
  if bad is not null then
    raise exception 'FAIL: something other than the waitlist admin tools reads the analysis labels: %', bad;
  end if;
  select string_agg(format('%s on %s', polname, polrelid::regclass), ', ') into bad
  from pg_policy
  where coalesce(pg_get_expr(polqual, polrelid), '') || coalesce(pg_get_expr(polwithcheck, polrelid), '') ~ '(participant_groups|active_creator|aspiring_creator|supporter)';
  if bad is not null then
    raise exception 'FAIL: a row level security policy depends on the analysis labels: %', bad;
  end if;

  -- None of those tools is callable by members or the public.
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'waitlist_api' and p.proname in ('admin_summary', 'admin_wave_preview', 'admin_wave_select', 'admin_wave_summary')
               and (has_function_privilege('anon', p.oid, 'EXECUTE') or has_function_privilege('authenticated', p.oid, 'EXECUTE'))) then
    raise exception 'FAIL: members can run the waitlist admin tools that read the analysis labels';
  end if;

  -- No account type anywhere: no column naming one on accounts or social data.
  select string_agg(format('%s.%s', a.attrelid::regclass, a.attname), ', ') into bad
  from pg_attribute a join pg_class c on c.oid = a.attrelid
  where not a.attisdropped and a.attnum > 0
    and c.relnamespace in ('public'::regnamespace, 'social'::regnamespace)
    and a.attname ~ '^(role|account_type|user_type|member_type|kind|intent|participant_groups?)$';
  if bad is not null then
    raise exception 'FAIL: an account type or analysis label on accounts or social data: %', bad;
  end if;
  raise notice 'PASS: one account type for everyone; the analysis labels stay in the waitlist admin tools';
end $$;
