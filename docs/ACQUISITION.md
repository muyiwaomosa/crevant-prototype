# Creator–fan acquisition, attribution and onboarding

Status: **built and switched off.** Nothing here is deployed, activated or
sending anything. The waitlist stays closed behind its existing switches
(build flag, function switch, database switch plus approved notice version).
The invitation preview follows the same switches. No link exists until the
founder issues one.

Privacy notice wording for all of this: `docs/PRIVACY-NOTICE-ACQUISITION-DRAFT.md`
(draft, not published).

## Five separate concepts

| Concept | What it is | Where it lives | Can it create a follow, Connection Points or money? |
| --- | --- | --- | --- |
| Self-reported attribution | "A creator introduced me", and optionally the name or handle the visitor typed | `ops.waitlist.introduced_by_creator`, `introducer_reported` | **No.** Never matched to an account, never a verified referral. |
| Verified invitation | An accepted pilot creator's link, issued by the admin and resolved by the server | `ops.creator_links`, `ops.waitlist.creator_link_id`, `ops.invitations.creator_link_id`, `ops.creator_link_redemptions` | **No.** Attribution only. |
| Link visit | Someone opened a usable link (anonymous count) | `ops.acquisition_events` (`creator_link_visit`) | **No.** A visit is not a signup and not a follow. |
| Following | The person's own explicit choice | Tour today; real-account follows don't exist yet | Only when the person chooses it. A redemption starts `pending`. |
| Connection Points / future money | Recognition with one creator; any future monetary eligibility | Tour CP rules; nothing in the database | **Nothing extra for invitations.** A genuine follow earns the normal follow bonus only; "Not now", visits, signups and attribution earn nothing. Tests fail otherwise. |

## Phase 1: the waitlist (one waitlist, no second signup system)

New optional questions in the existing form, after email and before the 18+
and consent boxes:

- **How do you plan to use Splitpost?** Create content / Discover and support
  creators / Both. Recruitment only. Choosing *Discover* hides the
  creator-only sharing questions.
- **Did a creator introduce you to Splitpost?** Yes / No.
- **Their name or handle** (only after Yes, optional). 1 to 60 letters,
  numbers, spaces and `@ . _ ' -`. Links, email addresses and phone numbers are
  refused in the browser *and* in the database. The form says: "We won't
  contact them, and it doesn't link you to them or follow anyone."
- **`?ref=<code>`** carries a creator invitation code, separate from `?src=`.
  The database resolves it at signup; anything unusable is ignored and the
  signup still succeeds, with the same `ok` reply either way.

Unchanged: email, 18+, consent with the notice version, Turnstile, the
honeypot, salted rate limits, "a repeat signup changes nothing", verification
before invitation, deletion and retention. `ops.join_waitlist` and
`waitlist_api.submit` are **not redefined**: the new fields go through
`waitlist_api.submit_v2`, so the migration can be removed on its own.

## Phase 2: accepted-creator invitation links

### Pilot invitation policy (proposed, built as the default)

- **Founder/admin-controlled issuance.** Only the `waitlist_admin` login (the
  founder's admin workflow) can:
  - accept a creator: `admin_accept_creator`;
  - pause, remove or re-accept one: `admin_set_creator_status`;
  - record the public name a creator agreed to show: `admin_set_creator_public_name`;
  - issue a link: `admin_issue_creator_link`;
  - revoke one: `admin_revoke_creator_link`.

  Not server code (`service_role` can no longer call `ops.create_creator_link`), not the
  public login, and never the creator themselves.
- **90-day default expiry.** 1 to 365 days if the admin says so; never more
  than a year (database constraint).
- **Explicit revocation.** Revoking is a deliberate admin action and is
  final: a revoked link can't be restored (the trigger refuses). Issue a new
  one instead. Pausing or removing a creator stops all their links at once.
- **Only accepted creators** can hold an active link (trigger).
- Codes are 20 random hex characters (80 bits) and reveal nothing about the
  creator.

### What the fan sees

On `/join?ref=<code>` (only when the waitlist form itself is on), the page
asks the server function for a preview (`waitlist_api.invite_preview`, as
the restricted `waitlist_writer` login):

| Link | Page shows |
| --- | --- |
| Valid, creator agreed to a public name | "**Priya Raman** invited you to Splitpost." |
| Valid, no agreed name | "A creator in the Splitpost pilot invited you." |
| Unknown, malformed, expired, revoked, or the creator paused or removed | "This invitation link isn't active any more. You can still join the waitlist below." |
| Waitlist closed, rate limited, offline | Nothing |

Under a valid invitation: "If you're invited to the pilot, we'll ask whether
you'd like to follow <name> when you set up your account. You choose Follow
or Not now. Nobody is followed for you, and an invitation earns nothing for
anyone." There is **no follow button on /join**: the person has no account
yet.

**What the lookup can never reveal.** It answers exactly
`{status, invite, name}` (the server function rejects any other shape). It
never returns:
- the creator's account id, email, username, categories or pilot status;
- why a link is unusable (every unusable link looks the same);
- whether an address is on the waitlist.

The name is shown only if the creator agreed. The admin records when they
agreed, and the database refuses a name without that time or in an unsafe
format.

**The follow choice** happens once the invited person has an account:
- The redemption starts `pending`.
- The onboarding screen shows the inviting creator first, with explicit
  **Follow** / **Not now**.
- `ops.record_invite_follow_decision` records the answer once.
- In the tour this is built and tested (`/tour/welcome?invite=<code>`). For
  real accounts it needs the follow work below.

Attribution carries through: waitlist entry → invitation (copied by trigger)
→ account (a `pending` redemption when the invitation is accepted) → the
person's own decision.

## Phase 3: personalized onboarding (in the tour today)

1. Welcome, with the invitation banner or the "isn't active any more" note.
2. **What are you into?** Intent, topics you enjoy, and (for Create or Both)
   up to three topics you'll post about. Never follows anyone.
3. **Who do you want to follow?** The inviting creator first, with explicit
   *Follow* / *Not now*. Then suggestions, matches to your topics first.
4. Done.

Following stays newest first from people someone chose. Discover groups
"Matches your interests" first; searching or filtering shows one plain list.
No engagement ranking and no AI model.

## Phase 4: measurement

`src/lib/pilotEvents.ts` is the catalog. No event carries an email, name,
handle, account id, IP address or free text.

**Visits, signups and follows are separate events.** A visit becomes a
signup only if the person joins. A signup becomes an account only if they're
invited and accept. Only their own choice is a follow.

| Metric | Definition | Recorded |
| --- | --- | --- |
| Waitlist signup source | `waitlist_signup` by `source` | Database |
| Self-reported creator referral | share of `waitlist_signup` with `self_reported_referral` | Database |
| Verified creator invitation | `waitlist_signup` with a link; `invitation_accepted` | Database |
| Link visits | `creator_link_visit`: a usable link opened, at most once per visitor per link per day | Database (invitation preview) |
| Invitation-to-signup conversion | signups through a link ÷ visits to it | Database |
| Invitation-to-follow conversion | `invite_follow_confirmed` ÷ (`confirmed` + `declined`) | Database |
| Interest selection | `interests_selected`: topics, count, plans to create | App, once real accounts exist |
| Discovery-to-follow conversion | `discover_follow` ÷ `discover_suggestion_shown`, split by matched interest | App, once real accounts exist |
| Returning fan engagement | accounts that engage with someone they follow in a later week, in aggregate | Derived, once real accounts exist |

**How visits stay anonymous:**
- The event row has only the event, the time and the link.
- To count a visitor once a day, the preview keeps a hash of (link, salted
  client key) in `ops.invite_preview_limits` for up to two days. The client key
  is the HMAC the waitlist already uses, never an address.
- Only usable links count; unusable ones record nothing.
- It counts lookups by the join page, so a visitor with JavaScript off, or a
  crawler that doesn't run it, isn't counted. Treat it as a floor, not an exact
  number.

`waitlist_api.admin_acquisition_summary()` gives the admin totals, plus a
per-link funnel. Each link is identified only by its first six characters,
with its campaign, state, expiry and its visits, signups, accounts, follows
confirmed and follows declined. It never shows a full code, an address or a
name.

## Rolling back

`scripts/db/staging-rollback-acquisition.sql` removes exactly what the
migration added. It is built the same way as the waitlist rollback:
- **Modes:** check (dry run) and apply, with its own confirmation phrase.
- **Refuses, changing nothing,** if any creator, link, redemption, event,
  preview record, acquisition answer or invitation attribution exists, or if
  a later migration is recorded.
- **Never cascades,** and every drop is checked afterwards.

**Order:** acquisition first, then the waitlist. The waitlist rollback is
unchanged: it still refuses while any later migration is recorded. CI now:
1. tests the acquisition rollback (`scripts/db/rollback-acquisition-test.sh`, 20 checks);
2. removes it;
3. runs every existing waitlist rollback test;
4. reapplies both migrations;
5. proves the order holds: the waitlist rollback refuses while acquisition is
   recorded, and the acquisition check passes again.

It is **not wired to a staging workflow.** That is a decision below. A guard
test fails if anything but the local tests runs it.

## Real accounts: the minimum to make Following, Discover and interests real

The tour (`/tour`) is a demonstration with sample data in the browser. Real
accounts today have a profile only. Nothing in the tour is reused as real
data, and none of this is built yet. The minimum, in order:

1. **Schema (one migration, its own rollback, row level security on every table):**
   - `public.follows (follower_id, creator_id, created_at)`, unique pair, not self. Members read their own; insert and delete their own only.
   - `public.member_interests (user_id, topic)` from the fixed nine topics; own rows only. Intent and posting categories live on the profile or here.
   - `public.posts (id, author_id, body, created_at, …)` with a visibility rule, or the feed has nothing to show.
2. **Server entry points:**
   - follow and unfollow (self only, rate limited);
   - Following feed: posts from people I follow, newest first, paged;
   - Discover suggestions: creators matching my topics first, then A to Z, nobody I already follow, no engagement ranking;
   - record my invitation follow decision, as a wrapper on `ops.record_invite_follow_decision` that only ever acts for the signed-in person, and that performs the follow only on Follow.
3. **Onboarding screens for real accounts,** porting the tour's steps (intent, topics, inviting creator with Follow / Not now, suggestions).
4. **Measurement:** record `interests_selected`, `discover_suggestion_shown` and `discover_follow` as anonymous counts. Derive returning engagement from aggregates.
5. **Connection Points:** if real CP exists by then, an invitation follow uses the **normal** follow rule and nothing else. If not, no CP at all. Never a separate invitation award.

Each step needs its own review. Steps 1 and 2 are database changes that need
migration approval.

## CI status on this PR

| Job | Status | Why |
| --- | --- | --- |
| App, Public site, Browser | Pass | |
| Integration | **Expected to pass now** | It used to fail on the staging rollback test (a genuine defect: the waitlist rollback couldn't run with this migration present). Fixed by the acquisition rollback above; all 30 rollback checks pass locally on real Supabase. |
| Database | **Fails at the approval gate, by design** | The guard test "approved migrations unchanged" (and then `check-approved-migrations.sh`) refuses an unapproved migration. Adding it to `supabase/approved-migrations.sha256` **is** the approval. Every other guard (54) and every database check passes locally. |

## Decisions that need the founder

1. **Approve the migration** (`20261116000000_creator_acquisition.sql`) by
   adding it to `supabase/approved-migrations.sha256`. Until then the
   Database job stops at that gate.
2. **Wire the acquisition rollback into a staging workflow,** with the same
   safeguards as the waitlist one, before the migration is applied to
   staging. It is built and tested but deliberately runs nowhere yet.
3. **Approve the privacy notice wording** (draft linked above), after legal
   review. This includes whether to keep the typed creator name at all.
4. **Approve the invitation preview** as a new public capability of the
   existing server function (no new function, no new secret, same switches).
5. **Confirm the invitation policy:** admin-only issuance, 90 days by
   default, a year at most, final revocation, names only with recorded
   agreement. Also decide who in the team acts as admin, and how the creator's
   agreement to a public name is captured (the pilot creator agreement is
   suggested).
6. **Admin workflow commands** for accepting creators and issuing links.
   The database functions exist; the founder's admin workflow
   (`scripts/db/waitlist-admin.sh`) doesn't expose them yet, by choice.
7. **Real-account follows, feed and interests** (the list above), and the
   rule that an invitation follow earns only the normal follow bonus.
8. **Deploy order:**
   1. the migration;
   2. its staging rollback workflow;
   3. the server function (it calls `submit_v2` and `invite_preview`);
   4. the build flag.

   All of it stays off until the existing waitlist activation is approved.
