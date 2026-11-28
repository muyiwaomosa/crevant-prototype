# Waitlist to member journey (BL-009)

Founder decision D1, option A, approved Nov 28, 2026, with nine safeguards.
This page covers what was built, how each safeguard is met, the one-time setup,
and the staging acceptance test. Registration, invitations, public previews and
the waitlist stay closed until separately authorized. Nothing here opens them.

## How it works

```
Visitor joins on www.splitpost.ca
  -> join-waitlist (waitlist project) stores the entry and emails a
     verification link (48 hours, single use, only its hash is stored)
  -> /waitlist/verify#<token> confirms the address

Founder, in Control Center (app.splitpost.ca, Operations, "Waitlist and invitations")
  Import  -> waitlist-bridge (member project) -> waitlist-handoff (waitlist project)
             exports verified, consenting applicants: the minimum fields only
          -> temporary review copies in the member project (30 days at most)
  Approve into a cohort, or decline
  Send    -> recheck each one with the waitlist
          -> single-use personal invitation link (14 days), emailed
          -> outcome recorded on the waitlist
Invitee registers through the link -> the invitation is marked accepted
Control Center shows sent, failed, accepted, onboarded, open and expired
```

Three functions, two databases:

| Piece | Project | What it may do |
|---|---|---|
| `join-waitlist` | waitlist | As before, plus issue and check verification links |
| `waitlist-handoff` (new) | waitlist | The only way into the waitlist for the member project. Server to server, with a shared key. Runs as the new `waitlist_handoff` login, which can run six functions and read no table |
| `waitlist-bridge` (new) | member | Control Center's Import, Send and Delete by email. Lets only the founder through, and the database decides who that is. Holds no database password of any project |

Migrations: `20261223000000_waitlist_handoff.sql` (waitlist side; also on
staging and, unused and locked, on member Production) and
`20261224000000_waitlist_invitations.sql` (member side).

## The founder's safeguards, and where each is enforced

| Safeguard | How it is met |
|---|---|
| 1. The waitlist stays authoritative | Entries live only in the waitlist project. Member copies are temporary, and every decision is recorded back on the waitlist (`handoff_record`) |
| 2. Only verified, consenting applicants, minimum information | `handoff_export` returns only entries that are verified, hold a granted waitlist consent, sit inside the 12-month retention window and are undecided. It sends 13 fields: id, email, join and verification times, consent version and time, participant groups, intent, platform, audience band, the creator question, source and creator link code. Interests, free text and rate limit data never leave. Checked by test 340 |
| 3. Restricted, server-side transfer | `waitlist_handoff` has no special powers, up to 3 connections, and executes exactly six functions (check 003, check 039). Only `waitlist-handoff` uses it, on its own project (the same project check as `join-waitlist`). Browsers are refused. The member side holds a shared key, never a database credential |
| 4. No duplicate applicants or invitations | One copy per applicant and per address (primary key and a unique address). One invitation per applicant ever (`invitations_one_per_applicant`), one per link, and at most one open invitation per address (already enforced). Anyone already a member is skipped |
| 5. Automatic expiry and cleanup | Copies expire 30 days after import (a database constraint) and are removed whenever Control Center loads or imports. They are deleted as soon as the applicant is invited or declined. Verification links last 48 hours. Withdrawal records are kept 13 months, then purged |
| 6. Consent evidence, invitation history, attribution and conversion | Consent records stay on the waitlist; the copy carries the version and time. Invitations keep cohort, source `waitlist`, creator link code, delivery status, send attempts and acceptance. Control Center shows sent, failed, accepted, onboarded, open, expired and from creator links |
| 7. Recheck before sending | Send asks the waitlist again (`handoff_recheck`). Anyone no longer verified, consenting, in retention or undecided is dropped, not invited. The database also refuses to create an invitation while external access is not approved or registration is paused (check 040) |
| 8. Deletion and withdrawal across both environments | Removing a handed-off entry on the waitlist leaves an id-only withdrawal; the next Import or Send removes the copy and any open invitation and its link. "Delete on request" and "Delete a waitlist applicant by email" in Control Center delete in both projects. A member who came from the waitlist and deletes their account has their waitlist entry deleted too |
| 9. Privacy notice and counsel package | `docs/PRIVACY-NOTICE-WAITLIST-V1.1-DRAFT.md`, the member notice draft (section 2) and counsel package version 3 (question 50) |

## Email

| | Waitlist project | Member project |
|---|---|---|
| Sends | Verification links (`join-waitlist`) | Personal invitations (`waitlist-bridge`) |
| Function secret | `RESEND_API_KEY` | `RESEND_API_KEY` |
| Key | Sending access only, domain `mail.splitpost.ca` | A separate key, same restriction |
| Sender (fixed in code) | `Splitpost <noreply@mail.splitpost.ca>` | the same |

Without a key nothing is sent. Applicants can still be imported and reviewed,
but entries stay unverified, and Send reports that email isn't set up. The
address, link and key are never logged, only fixed error codes. Both emails
identify Splitpost and say why the person received them. Counsel question 23
(CASL) covers whether more is needed, such as a mailing address.

## One-time setup (founder)

This is setup, not the invitation process: once done, everything runs from
Control Center. Do staging first. Repeat for Production only after the staging
acceptance below passes **and** the move is separately approved.

1. **Apply the migrations.** Merge the pull request (your checksum approval),
   then run the staging plan and apply as usual.
2. **Set the handoff login's password** on the waitlist database (staging:
   the staging project). Use psql's `\password waitlist_handoff` from a
   password manager, exactly as for `waitlist_writer` (`docs/WAITLIST.md`,
   "Database access"). Never type the password into the SQL editor.
3. **Make a handoff key:** 40 or more random characters from your password
   manager. The same value goes on both projects as `WAITLIST_HANDOFF_KEY`.
4. **Waitlist project function secrets** (staging: the staging project):
   * `WAITLIST_HANDOFF_DB_URL`: the pooler address, user
     `waitlist_handoff.<project ref>`, port 6543, with the password from step 2
   * `WAITLIST_HANDOFF_KEY`: from step 3
   * `RESEND_API_KEY`: the waitlist project's sending-only key
   * `WAITLIST_VERIFY_ORIGIN`: `https://www.splitpost.ca` (staging: the
     staging site's address, which must also be in `WAITLIST_ALLOWED_ORIGINS`)
5. **Deploy on the waitlist project:** `join-waitlist` and the new
   `waitlist-handoff`, both with `--no-verify-jwt` and an explicit
   `--project-ref`, as `docs/WAITLIST.md` describes.
6. **Member project function secrets:** `WAITLIST_HANDOFF_KEY` (step 3) and
   `RESEND_API_KEY` (the member project's separate key).
7. **Deploy `waitlist-bridge`** with `scripts/functions/deploy.mjs`
   (`docs/FUNCTIONS-DEPLOYMENT.md`). It deploys to staging now. Member
   Production needs `waitlistBridgeFunctionApproved: true` in
   `config/member-production.json`, which is a separate reviewed change.

## Staging acceptance (BL-009 criteria 1 to 7)

1. With the staging waitlist open, join with a test address you can read.
   The verification email arrives from Splitpost. Open the link: the page says
   the email is confirmed.
2. In Control Center, choose **Import verified applicants**. The applicant
   appears, with their answers and the date the copy expires.
3. Select them, choose a cohort, and **Approve selected**.
4. **Send approved invitations**, then confirm. The result says 1 invitation
   sent, and the email arrives with a `/register/<code>` link.
5. Register through the link and finish onboarding.
6. Control Center shows Sent 1, Accepted 1, Onboarded 1.
7. Member Production: the panel says invitations are closed and offers no
   send. Nothing can be sent there until PB-4.

Also confirm: **Delete a waitlist applicant by email** removes a second test
address from both projects, and a test applicant deleted on the waitlist
disappears from review after the next Import.
