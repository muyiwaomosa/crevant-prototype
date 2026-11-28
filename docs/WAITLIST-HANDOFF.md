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
| `waitlist-handoff` (new) | waitlist | The only way into the waitlist for the member project. Server to server, with a shared key. Runs as the new `waitlist_handoff` login, which can run seven functions and read no table |
| `waitlist-bridge` (new) | member | Control Center's Import, Send, Replace and Delete by email, plus Resend's signed delivery events. Lets only the founder through (the database decides who that is), except the signed delivery events. Holds no database password of any project |

Migrations: `20261223000000_waitlist_handoff.sql` (waitlist side; also on
staging and, unused and locked, on member Production) and
`20261224000000_waitlist_invitations.sql` (member side).

## The founder's safeguards, and where each is enforced

| Safeguard | How it is met |
|---|---|
| 1. The waitlist stays authoritative | Entries live only in the waitlist project. Member copies are temporary, and every decision is recorded back on the waitlist (`handoff_record`) |
| 2. Only verified, consenting applicants, minimum information | `handoff_export` returns only entries that are verified, hold a granted waitlist consent, sit inside the 12-month retention window and are undecided. It sends 13 fields: id, email, join and verification times, consent version and time, participant groups, intent, platform, audience band, the creator question, source and creator link code. Interests, free text and rate limit data never leave. Checked by test 340 |
| 3. Restricted, server-side transfer | `waitlist_handoff` has no special powers, up to 3 connections, and executes exactly six functions (check 003, check 039). Only `waitlist-handoff` uses it, on its own project (the same project check as `join-waitlist`). Browsers are refused. The member side holds a shared key, never a database credential |
| 4. No duplicate applicants or invitations | One copy per applicant and per address (primary key and a unique address). At most one open and one accepted invitation per applicant (`invitations_one_open_per_applicant`, `invitations_one_accepted_per_applicant`), one per link, and at most one open invitation per address. Anyone already a member is skipped. An expired, failed or bounced invitation can be replaced (see "Recovery") |
| 5. Automatic expiry and cleanup | Copies expire 30 days after import (a database constraint) and are removed whenever Control Center loads or imports. They are deleted as soon as the applicant is invited or declined. Verification links last 48 hours. Withdrawal records are kept 13 months, then purged |
| 6. Consent evidence, invitation history, attribution and conversion | Consent records stay on the waitlist; the copy carries the version and time. Invitations keep cohort, source `waitlist`, creator link code, delivery status, send attempts and acceptance. Control Center shows sent, failed, accepted, onboarded, open, expired and from creator links |
| 7. Recheck before sending | Send asks the waitlist again (`handoff_recheck`). Anyone no longer verified, consenting, in retention or undecided is dropped, not invited. The database also refuses to create an invitation while external access is not approved or registration is paused (check 040) |
| 8. Deletion and withdrawal across both environments, without silent loss (see "Recovery and reconciliation") | Removing a handed-off entry on the waitlist leaves an id-only withdrawal; the next Import or Send removes the copy and any open invitation and its link. "Delete on request" and "Delete a waitlist applicant by email" in Control Center delete in both projects. A member who came from the waitlist and deletes their account has their waitlist entry deleted too |
| 9. Privacy notice and counsel package | `docs/PRIVACY-NOTICE-WAITLIST-V1.1-DRAFT.md`, the member notice draft (section 2) and counsel package version 3 (question 50) |

## Delivery tracking

The panel never calls an email delivered without the provider saying so:

| Status | Means | Comes from |
|---|---|---|
| Being sent | Created; the provider hasn't answered | the bridge |
| Accepted by the email provider | Resend took the message. **Not proof of delivery** | Resend's answer to the send |
| Delivery delayed | Resend is still trying | signed `email.delivery_delayed` event |
| Delivery confirmed | The receiving server accepted it | signed `email.delivered` event |
| Bounced | Rejected by the receiving server; never retried automatically | signed `email.bounced` event |
| Delivered, marked as spam | Delivered, then reported as spam | signed `email.complained` event |
| Email failed | Resend refused it or couldn't be reached (fixed code); retried | the bridge |
| Invitation accepted | The person registered through the link | the database, on registration |

Events are accepted only with a valid Resend (Svix) signature less than five
minutes old. An older event never overwrites a newer one, and a delay never
replaces a final state. Without the webhook secret, every event is refused,
and invitations stay at "Accepted by the email provider".

## Recovery and reconciliation

* **Expired, failed or bounced invitation.** Its row in Control Center offers
  **Send a new invitation**. The founder triggers it. The waitlist is asked
  again: the person must still be verified, consenting and in retention. The
  old invitation and its link are revoked first, so no one ever has two open.
  It's never offered once the person accepted an invitation.
* **Stuck or failed email.** An invitation still "being sent" after 10
  minutes, or one that failed, is resent on the next Send, up to 5 attempts.
  Bounces aren't retried; replace them instead.
* **Expired verification link.** Joining again with the same address sends a
  new link, through Turnstile and the usual submission limits. Each entry gets
  at most 3 links a day, and each new link cancels the last.
* **The waitlist can't be reached.** Nothing is lost, and Control Center shows
  what is waiting. Every step that needs the waitlist stays pending in the
  member database until the waitlist confirms it, and the next Import or Send
  carries it over:
  * deletion requests;
  * declines;
  * "invited" outcomes. An invitation still goes out when the outcome can't be
    recorded, and the outcome stays pending.
* **A failed import.** An export the member side never confirmed is offered
  again an hour later. Repeats are ignored, so no applicant is lost and none
  is duplicated.
* **Withdrawals.** These are read with an hour of overlap, so one committed
  late is never skipped. Applying one twice changes nothing.

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

**Staging is one Supabase project.** On staging the waitlist and the member
app share the project `kpudeppgokpjhvaqrprn`, and Edge Function secrets are
per project, shared by every function in it. So on staging each secret below
is set **once**:

* one `RESEND_API_KEY`: a single sending-only key restricted to
  `mail.splitpost.ca` is enough; `join-waitlist` and `waitlist-bridge` both
  read it;
* one `WAITLIST_HANDOFF_KEY`: the same value is, by design, used on both sides,
  so steps 4 and 6 set it once;
* `WAITLIST_HANDOFF_DB_URL`, `WAITLIST_VERIFY_ORIGIN` and
  `RESEND_WEBHOOK_SECRET` are set once each as well.

In Production the waitlist (`hmrliwoychnqrbbydorg`) and the member project are
separate projects, so each keeps its own `RESEND_API_KEY` (two separate
sending-only keys) and each gets the same `WAITLIST_HANDOFF_KEY` value.

### Staging baseline (rechecked Nov 28 after the founder's setup; no secret values read)

| Item | State | Evidence |
|---|---|---|
| Waitlist and BL-009 migrations on staging | Done and verified | Staging plan and apply runs; staging checks |
| Resend domain `mail.splitpost.ca`; staging Auth email | Done and verified | `docs/STAGING-ACCEPTANCE.md` step B |
| `join-waitlist` at the BL-009 version (65c2220) | Done and verified | A `verify_email` request with an unknown token answers `invalid`; the health check passes (database login, allowed origin, switch open) |
| `waitlist_handoff` password, the five secrets, the Resend webhook | Done by the founder | Confirmed in use by acceptance steps 1, 2 and 6 |
| `waitlist-handoff` deployed | Deployed, but answering `closed` (503) | It closes when `WAITLIST_HANDOFF_DB_URL` fails its checks or `WAITLIST_HANDOFF_KEY` is missing, under 32 characters or not printable; its function log names the reason, never a secret |
| `waitlist-bridge` deployed (65c2220) | Deployed; 209 of 225 independent checks pass, the build stamp matches 65c2220's source | The 16 failures are one gap: no `X-Content-Type-Options: nosniff` header. Fixed in code here; needs a redeploy, then the verification run and ledger entry |
| `WAITLIST_VERIFY_ORIGIN` | Not observable from outside | The function refuses any origin that is not https and in `WAITLIST_ALLOWED_ORIGINS` (it logs a config problem); the link opening in acceptance step 1 confirms it |

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
6. **Member project function secrets:** `WAITLIST_HANDOFF_KEY` (step 3),
   `RESEND_API_KEY` (the member project's separate key), and
   `RESEND_WEBHOOK_SECRET`. For the webhook secret, in Resend go to
   **Webhooks, Add endpoint**, use
   `https://<member project ref>.supabase.co/functions/v1/waitlist-bridge/delivery-event`,
   select the events `email.delivered`, `email.delivery_delayed`,
   `email.bounced` and `email.complained`, and copy its signing secret
   (`whsec_...`).
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
6. Control Center shows **Accepted by the email provider** 1, then
   **Delivery confirmed** 1 once Resend's event arrives, then **Invitation
   accepted** 1 and **Onboarded** 1.
7. Member Production: the panel says invitations are closed and offers no
   send. Nothing can be sent there until PB-4.

Also confirm:

* **Delete a waitlist applicant by email** removes a second test address from
  both projects.
* A test applicant deleted on the waitlist disappears from review after the
  next Import.
* An invitation to an address that can't receive mail shows **Bounced**, and
  **Send a new invitation** replaces it.
