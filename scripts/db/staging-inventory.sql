-- Staging inventory: COUNTS ONLY. Read only. No emails, names, ids, post text
-- or any other personal data; nothing is changed.
--
-- Run it in the Supabase dashboard (staging project kpudeppgokpjhvaqrprn):
-- SQL Editor, paste the whole file, Run. It works before and after
-- 20261122000000_member_access (membership counts show -1 until it exists).
-- Each number is a count; share the result row as it is. (Tables that may not
-- exist yet are counted through query_to_xml, so the query runs either way.)

begin transaction read only;

select
  (select count(*) from auth.users)                                                      as accounts,
  (select count(*) from auth.users where email_confirmed_at is not null)                 as confirmed_accounts,
  (select count(*) from auth.users where email_confirmed_at is null)                     as unconfirmed_accounts,
  (select count(*) from auth.users u where (to_jsonb(u) ->> 'last_sign_in_at')::timestamptz > now() - interval '30 days') as signed_in_last_30_days,
  (select count(*) from public.profiles)                                                 as profiles,
  (select count(*) from public.profiles where username is not null and display_name is not null) as complete_profiles,
  case when to_regclass('social.posts') is null then -1
       else (xpath('/row/n/text()', query_to_xml('select count(*) as n from social.posts where deleted_at is null', false, true, '')))[1]::text::bigint end             as live_posts,
  case when to_regclass('social.posts') is null then -1
       else (xpath('/row/n/text()', query_to_xml('select count(*) as n from social.posts where deleted_at is not null', false, true, '')))[1]::text::bigint end         as deleted_posts,
  case when to_regclass('social.posts') is null then -1
       else (xpath('/row/n/text()', query_to_xml('select count(distinct author_id) as n from social.posts', false, true, '')))[1]::text::bigint end                     as accounts_that_posted,
  case when to_regclass('social.follows') is null then -1
       else (xpath('/row/n/text()', query_to_xml('select count(*) as n from social.follows', false, true, '')))[1]::text::bigint end                                    as follows,
  case when to_regclass('social.clique_members') is null then -1
       else (xpath('/row/n/text()', query_to_xml('select count(*) as n from social.clique_members where removed_at is null', false, true, '')))[1]::text::bigint end    as clique_memberships,
  case when to_regclass('social.likes') is null then -1
       else (xpath('/row/n/text()', query_to_xml('select count(*) as n from social.likes', false, true, '')))[1]::text::bigint end                                      as likes,
  case when to_regclass('social.comments') is null then -1
       else (xpath('/row/n/text()', query_to_xml('select count(*) as n from social.comments where deleted_at is null', false, true, '')))[1]::text::bigint end          as live_comments,
  case when to_regclass('social.post_views') is null then -1
       else (xpath('/row/n/text()', query_to_xml('select count(*) as n from social.post_views', false, true, '')))[1]::text::bigint end                                 as post_views,
  case when to_regclass('ops.member_access') is null then -1
       else (xpath('/row/n/text()', query_to_xml('select count(*) as n from ops.member_access', false, true, '')))[1]::text::bigint end                                 as memberships,
  case when to_regclass('ops.member_access') is null then -1
       else (xpath('/row/n/text()', query_to_xml('select count(*) as n from ops.member_access where status = ''active'' and (expires_at is null or expires_at > now())', false, true, '')))[1]::text::bigint end as active_memberships,
  case when to_regclass('ops.member_access_events') is null then -1
       else (xpath('/row/n/text()', query_to_xml('select count(*) as n from ops.member_access_events', false, true, '')))[1]::text::bigint end                          as membership_history_rows,
  (select count(*) from ops.invitations)                                                 as invitations,
  (select count(*) from ops.admins)                                                      as admins,
  case when to_regclass('ops.waitlist') is null then -1
       else (xpath('/row/n/text()', query_to_xml('select count(*) as n from ops.waitlist', false, true, '')))[1]::text::bigint end                                      as waitlist_entries,
  case when to_regclass('ops.pilot_creators') is null then -1
       else (xpath('/row/n/text()', query_to_xml('select count(*) as n from ops.pilot_creators', false, true, '')))[1]::text::bigint end                                as pilot_creators,
  case when to_regclass('ops.creator_links') is null then -1
       else (xpath('/row/n/text()', query_to_xml('select count(*) as n from ops.creator_links', false, true, '')))[1]::text::bigint end                                 as creator_links;

rollback;
