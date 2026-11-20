# Member feedback (Build 5, Stage 5.2c)

Status: **in review; not applied.** Migration `20261126000000_feedback` is
staging only (not on `supabase/production-migrations.txt`). There is no Edge
Function and no storage: everything is database functions.

## What members get

* **Send feedback** in the header on phones and in the sidebar on larger
  screens (not a sixth tab).
* The page "Help us improve Splitpost", with the supporting text "Your
  feedback helps us build a better experience for creators and fans."
* Three choices: **Report a problem**, **Suggest an improvement**, **Share
  something I like**, each with its own example placeholder.
* A required description of 10 to 1,000 characters with a live count, and
  **Submit feedback**. On success: "Thanks for sharing! Your feedback has
  been received."
* No anonymous feedback, screenshots, attachments or public voting.

## What is recorded, and what isn't

| Recorded | Not recorded |
|---|---|
| The member (shown to the founder as name and username, never email) | The page address, query string or any id |
| Their pilot role (cohort) when they sent it | Post contents, other members, device or browser details |
| The category and the description (trimmed) | IP address or location |
| Where they opened the form from: one of `home`, `discover`, `profile`, `clique`, `post`, `create`, `catch_up`, `other` | Anything typed outside the form |

The app works out the feature name from the page the member was on when
they tapped Send feedback, passes it with the link (never in the address),
and fixes it for the life of the form. Before sending, the form shows:
"Sent from: [Feature]. We record which part of Splitpost you were using,
along with your name and pilot role, to help us understand your feedback."
Opening the form directly records `other` ("Another page"). The database
accepts only the names above. Members don't get personal replies through
Splitpost in this build, and nothing in the app suggests they will.

## How it is secured

| Safeguard | How |
|---|---|
| Private storage | `ops.feedback`, `ops.feedback_notes` and `ops.feedback_actions` have no grants for members or visitors and no row level security policy. Staging check 011 fails otherwise. |
| Sending | `app_feedback_submit` requires active pilot membership (`social.current_member()`). Members get back only the new entry's id; nobody can read feedback back, including their own. |
| Server-side validation | Category and feature from fixed lists; 10 to 1,000 characters after trimming; no control characters; a request id is required. |
| Rate limits | 3 in any 10 minutes and 10 a day per member. |
| Duplicates | One entry per member and request id (a unique index). The same text again within 10 minutes returns the first entry. Sends are serialised per member, tested with two real sessions at once. |
| Founder only | Every inbox function goes through `social.current_founder()`: active pilot membership AND the `founder` cohort. Being a moderator does not open the inbox; a founder-cohort account without active access is refused. |
| Audit | Every status change and note is recorded in the append-only `ops.feedback_actions` (who, when, from and to). It never holds feedback or note text. Notes can be added, never edited. |
| Logs | No app code or function logs feedback. Database error logs name the function and the error code (for example `rate_limited`), not the message text. |

## The founder's inbox

Send feedback > **Open the feedback inbox** (only shown to the founder), or
`/app/feedback/inbox`:

* newest first, 50 at a time with "Show older feedback";
* filters: category, status (New, Reviewing, Planned, Resolved, Closed)
  and role (founder, creator, fan, tester);
* each entry: the description, who sent it and their role when they did,
  where it was sent from, the status control, private notes and the history.

## Retention and deletion policy (approved)

* Feedback is retained throughout the 60 day pilot and its evaluation.
* Feedback is deleted within 30 days after the evaluation formally closes.
* Deleting a member's account removes their feedback and the notes on it
  at once.
* Audit records keep operational metadata (ids, statuses, times, actor
  labels, counts) without feedback or note text.

Deletion is started by hand, with the existing purge function. Nothing
deletes feedback automatically.

### Retention closeout checklist

1. **Who:** the founder initiates and runs the deletion. Nobody else runs
   it, and no member can.
2. **What starts the deadline:** the formal closure of the pilot
   evaluation. Record that date; the deletion must be done within 30 days of
   it.
3. **How deletion is executed and verified**, in the Supabase SQL editor of
   the staging project (`kpudeppgokpjhvaqrprn`: check the project reference
   in the dashboard address first; feedback exists only on staging):
   1. Count what is there, and note the numbers:
      ```sql
      select (select count(*) from ops.feedback) as feedback, (select count(*) from ops.feedback_notes) as notes;
      ```
   2. Delete everything (0 means "older than 0 days", so all of it):
      ```sql
      select ops.purge_feedback(0, 'founder', 'DELETE PILOT FEEDBACK');
      ```
      It returns the number of entries deleted, which must match the first
      count. Notes go with their entries.
   3. Verify both are now empty, and that the purge was recorded:
      ```sql
      select (select count(*) from ops.feedback) as feedback, (select count(*) from ops.feedback_notes) as notes;
      select occurred_at, actor_label, detail from ops.feedback_actions where action = 'retention_purge' order by occurred_at desc limit 1;
      ```
      Expect 0 and 0, and a `retention_purge` entry from just now whose
      detail gives the same count.
4. **How completion is documented:** add a row to the closeout record below
   in a reviewed pull request: the evaluation closure date, the deadline,
   the deletion date, who ran it, the counts before and after, and the time
   of the `retention_purge` audit entry. No message text or member names.
5. **What is deleted and what remains:**

   | | After the purge |
   |---|---|
   | Live records (`ops.feedback`, `ops.feedback_notes`) | Deleted: every message, its category and context, its submitter link and every private note. |
   | Audit metadata (`ops.feedback_actions`) | Retained: ids, status changes, times, actor labels and purge counts. It never held message or note text. |
   | Supabase backups | Deleted rows can remain in the project's backups (and point-in-time recovery, if enabled) until those age out under the project's backup settings (Database > Backups). They aren't readable through the app. If a backup is ever restored, run this checklist again before the app is used. |

### Closeout record

| Evaluation closed | Deadline (+30 days) | Deleted on | By | Entries / notes before | After | Purge audit entry |
|---|---|---|---|---|---|---|
| | | | | | | |

### Privacy notice

The pilot privacy notice must include this wording (approved) before
external pilot invitations:

> If you send feedback, we collect your message, name, pilot role, and the
> part of Splitpost you were using. We use this information to understand
> problems, evaluate suggestions, and improve Splitpost. Feedback messages
> are retained through the pilot evaluation and deleted within 30 days after
> the evaluation closes. Limited operational audit records may be retained
> separately.

It isn't published yet: the live notice (`src/public/privacy/notice.ts`) is
public website content with its own approval and version, so the addition
is drafted in `docs/PRIVACY-NOTICE-PILOT-FEEDBACK-DRAFT.md` and goes in
through its own reviewed pull request.

## Deployment checklist (each step needs the founder's approval)

1. Merge the PR into `main`. Nothing is applied by the merge.
2. **Deploy database to staging, `plan`**: expect exactly
   `20261126000000_feedback.sql` pending. Stop if anything else is listed.
3. **Same workflow, `apply`** (staging approval): applies it and runs
   checks 001 to 011, including "founder functions require the founder
   cohort" and "only the founder functions read feedback".
4. Fast-forward the Preview branch to the merged commit (no force push, no
   Vercel change).
5. Founder phone test (below).

There is nothing to deploy outside the database.

**Rollback:** `scripts/db/staging-rollback-feedback.sql` (check, then apply
with `REMOVE THE STAGING FEEDBACK`). It refuses while any feedback, note or
audit entry exists, so it can only be used before anyone has sent feedback;
after that, fix forward. With the migration rolled back, the app hides Send
feedback and the page says it isn't available.

## Founder phone test

1. As a tester, on a phone: on Home, tap **Feedback** in the header. Check
   the title, the text, and "Sent from: Home".
2. Tap Submit feedback with nothing chosen: "Choose what kind of feedback
   this is." Choose **Report a problem**, type "Too short": "Please write at
   least 10 characters."
3. Write a real message and submit (try a quick double tap): "Thanks for
   sharing! Your feedback has been received." Only one entry appears in the
   inbox.
4. From Discover, open Send feedback again: "Sent from: Discover". Send a
   **Share something I like**.
5. As the tester, open `/app/feedback/inbox`: "This page isn't available".
6. As the founder, on a laptop: **Send feedback** in the sidebar, then
   **Open the feedback inbox**. Both entries, newest first, with the
   tester's name, role and where each was sent from. No email addresses.
7. Filter by category, status and role. Open the problem, set it to
   **Reviewing**, add a note. The history shows both.
8. Send four messages within 10 minutes as one tester: the fourth is
   refused ("You're going a little fast").
