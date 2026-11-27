-- Staging recovery exercise: the founder's SQL editor queries, in order.
-- docs/RECOVERY.md, "Staging recovery exercise". STAGING ONLY
-- (project kpudeppgokpjhvaqrprn). Never run on member Production.
--
-- Run one block at a time in the Supabase SQL editor of crevant-staging.
-- Replace the placeholders first:
--   <T>        the backup time from Database, Backups, with its time zone,
--              for example '2026-12-03 02:14:00+00'
--   <POST>     the id of the test post you delete in step 2
--   <COMMENT>  the id of the test comment you delete in step 2
-- Blocks 1 to 3 and 6 only read. Block 5 is the re-apply.
-- Nothing here starts a restore: the restore is a dashboard action that
-- happens only after your written authorization.

-- 1. Prerequisite (before step 4): every device test result is older than T.
--    Expect: every recorded_at earlier than <T>. If any is later, wait for
--    the next daily backup.
select device, passed, recorded_at
  from ops.video_device_tests
 order by recorded_at desc;

-- 2. After step 2 (your two test deletions): find their ids and confirm each
--    has its register row, reported to the function log.
--    Expect: one 'post' row and one 'comment' row, event 'deleted',
--    occurred_at after <T>, reported_at filled in (within about a minute).
select id, kind, target_id, event, occurred_at, reported_at
  from ops.deletion_register
 where occurred_at > '<T>'
 order by id;

-- 3. Step 5, the live export. Download the result as a file and keep it
--    outside Supabase. It is the complete evidence for the re-apply.
select json_agg(r order by r.id)
  from ops.deletion_register r
 where r.occurred_at > '<T>';

-- 4. Step 8, after the restore: the danger, shown.
--    Expect: both rows present with deleted_at empty (they came back).
select 'post' as kind, id, deleted_at from social.posts where id = '<POST>'
union all
select 'comment', id, deleted_at from social.comments where id = '<COMMENT>';

-- 5. Step 9, the re-apply. Paste the export from block 3 between the quotes.
--    Run it twice. The first run reports what it re-applied; the second run
--    must report nothing new.
select ops.reapply_deletions('<EXPORT FROM BLOCK 3>'::jsonb, '<T>');

-- 6. Step 10, verification. Expect: both rows with deleted_at filled in, and
--    the register showing the re-applied deletions recorded again.
select 'post' as kind, id, deleted_at from social.posts where id = '<POST>'
union all
select 'comment', id, deleted_at from social.comments where id = '<COMMENT>';

select id, kind, target_id, event, occurred_at
  from ops.deletion_register
 where target_id in ('<POST>', '<COMMENT>')
 order by id;

-- Then Claude runs the staging checks (plan mode, read only), including
-- check 032 (deletion completeness) and the reconciliation, and Verify Edge
-- Functions for post-media and avatar.
