-- Staging-safe, read-only: profile details and interests (20261123000000).
-- Catalog reads only (plus a count of topics): no member data is read.
-- Before the migration is applied (staging, until it is deployed) this file
-- only confirms that nothing of it exists yet; once it is recorded, every
-- check below must pass.

\set ON_ERROR_STOP on
-- (The history table is read through query_to_xml, so a database without
-- one, such as a plain test database, is not an error.)
select to_regclass('social.profile_details') is not null
       or case when to_regclass('supabase_migrations.schema_migrations') is null then false
               else (xpath('/row/n/text()', query_to_xml(
                       'select count(*) as n from supabase_migrations.schema_migrations where version = ''20261123000000''',
                       false, true, '')))[1]::text::int > 0
          end as details_applied \gset
\if :details_applied

-- 1. The tables are private: row level security on, nothing for members or visitors.
do $$
declare
  t text;
begin
  foreach t in array array['social.topics', 'social.profile_details', 'social.member_topics'] loop
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
      raise exception 'FAIL: % has a row level security policy (members reach it only through functions)', t;
    end if;
  end loop;
  raise notice 'PASS: profile details, interests and topics are private, reached only through the member functions';
end $$;

-- 2. The rules the app relies on are in the database.
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'social.profile_details'::regclass and contype = 'c'
                 and pg_get_constraintdef(oid) ~ 'identity' and pg_get_constraintdef(oid) ~ 'creator' and pg_get_constraintdef(oid) ~ 'fan' and pg_get_constraintdef(oid) ~ 'both') then
    raise exception 'FAIL: the identity preference is not limited to creator, fan or both';
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'social.profile_details'::regclass and contype = 'c' and pg_get_constraintdef(oid) ~ 'bio.*160')
     or not exists (select 1 from pg_constraint where conrelid = 'social.profile_details'::regclass and contype = 'c' and pg_get_constraintdef(oid) ~ 'follow_reason.*140') then
    raise exception 'FAIL: the bio (160) or follow reason (140) length limit is missing';
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'social.member_topics'::regclass and contype = 'f' and confrelid = 'social.topics'::regclass) then
    raise exception 'FAIL: interests are not limited to the topic list';
  end if;
  if position('too_many_topics' in (select prosrc from pg_proc where oid = 'public.app_set_profile_details(text, text, text, text[])'::regprocedure)) = 0
     or position('cardinality(v_topics) > 5' in (select prosrc from pg_proc where oid = 'public.app_set_profile_details(text, text, text, text[])'::regprocedure)) = 0 then
    raise exception 'FAIL: app_set_profile_details does not limit interests to 5';
  end if;
  if (select count(*) from social.topics where active) < 1 then
    raise exception 'FAIL: the topic list is empty';
  end if;
  raise notice 'PASS: identity is creator, fan or both; bio, follow reason and interest limits are enforced by the database';
end $$;

-- 3. The identity preference is descriptive only: no access check reads the
--    details, and membership still comes only from ops.member_access.
do $$
begin
  if exists (select 1 from pg_proc
             where oid in ('social.current_access()'::regprocedure, 'social.current_member()'::regprocedure,
                           'ops.member_access_active(uuid)'::regprocedure, 'social.is_member(uuid)'::regprocedure,
                           'public.app_access_state()'::regprocedure)
               and prosrc ~* '(profile_details|member_topics|identity)')
     or pg_get_viewdef('social.visible_members'::regclass) ~* '(profile_details|identity)' then
    raise exception 'FAIL: an access check reads the profile details or identity preference';
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'ops' and p.prosrc ~* '(profile_details|member_topics)') then
    raise exception 'FAIL: membership code reads the profile details';
  end if;
  if exists (select 1 from pg_trigger where tgrelid in ('social.profile_details'::regclass, 'social.member_topics'::regclass) and not tgisinternal) then
    raise exception 'FAIL: a trigger on the profile details could change something else';
  end if;
  raise notice 'PASS: the identity preference grants nothing: no access check, membership code or trigger reads it';
end $$;
\else
do $$
begin
  if to_regclass('social.topics') is not null or to_regclass('social.member_topics') is not null
     or exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                where n.nspname = 'public' and p.proname in ('app_topics', 'app_my_details', 'app_set_profile_details',
                                                             'app_member_details', 'app_discover_people', 'app_suggested_creators')) then
    raise exception 'FAIL: part of the profile details migration exists, but not all of it';
  end if;
  raise notice 'SKIP: profile details (20261123000000) are not applied here yet, and none of it exists';
end $$;
\endif
