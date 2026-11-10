-- EMERGENCY: close the waitlist at once, directly in the Supabase SQL editor.
-- Use this only if the "Waitlist admin (staging)" workflow can't run (GitHub
-- down, approvals unavailable). It takes effect on the next submission.
--
-- 1. Supabase dashboard, staging project kpudeppgokpjhvaqrprn, SQL editor.
-- 2. Paste this whole file and run it.
-- 3. The result must show submissions OFF.
--
-- It only turns the database switch off. It reads and changes nothing else,
-- and it is safe to run more than once. Reopening needs the normal approved
-- process (docs/WAITLIST-OPERATIONS.md). Tested by
-- supabase/tests-local/041_waitlist_operations.sql.

update ops.settings set enabled = false, updated_at = now() where key = 'waitlist_submissions';

select key, case when enabled then 'ON' else 'OFF' end as submissions, updated_at
from ops.settings
where key = 'waitlist_submissions';
