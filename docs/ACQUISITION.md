# Creator–fan acquisition, attribution and onboarding

Status: **built and switched off.** Nothing here is deployed, activated or
sending anything. The waitlist stays closed behind its existing three switches
(build flag, function switch, database switch plus approved notice version).

## Four separate concepts

| Concept | What it is | Where it lives | Can it create a follow, Connection Points or money? |
| --- | --- | --- | --- |
| Self-reported attribution | "A creator introduced me", and optionally the name or handle the visitor typed | `ops.waitlist.introduced_by_creator`, `introducer_reported` | **No.** Never matched to an account, never a verified referral. |
| Verified invitation | An accepted pilot creator's link, resolved by the server | `ops.creator_links`, `ops.waitlist.creator_link_id`, `ops.invitations.creator_link_id`, `ops.creator_link_redemptions` | **No.** Attribution only. |
| Following | The person's own explicit choice | Tour today; real-account follows don't exist yet | Only when the person chooses it. A redemption starts `pending`. |
| Connection Points / future money | Recognition with one creator; any future monetary eligibility | Tour CP rules; nothing in the database | Not touched by anything in this change. Tests fail if an acquisition table gains a points, reward or money column. |

## Phase 1: the waitlist (one waitlist, no second signup system)

New optional questions in the existing form, all after email and before the
18+ and consent boxes:

- **How do you plan to use Splitpost?** Create content / Discover and support
  creators / Both. Recruitment only, stated on the form as "not an account
  type". Choosing *Discover* hides the creator-only sharing questions, so a
  fan's signup stays short.
- **Did a creator introduce you to Splitpost?** Yes / No.
- **Their name or handle** (only after Yes, optional). 1 to 60 letters,
  numbers, spaces and `@ . _ ' -`. Links, email addresses and phone numbers are
  refused in the browser *and* in the database. The form says: "We won't
  contact them, and it doesn't link you to them or follow anyone."
- **`?ref=<code>`** in the link carries a creator invitation code, separate
  from the existing `?src=` channel label. The database resolves it; anything
  unusable is ignored and the signup still succeeds, with the same `ok` reply
  either way, so codes can't be probed.

Unchanged: email, 18+, consent with the notice version, Turnstile, the
honeypot, salted rate limits, "a repeat signup changes nothing", verification
before invitation, deletion and retention. Deleting an entry deletes the typed
name with it.

## Phase 2: accepted-creator invitation links

- `ops.pilot_creators` records creators accepted into the pilot (status
  `accepted`, `paused` or `removed`, up to three categories). A programme
  record, never an account role.
- `ops.create_creator_link(creator, days, campaign)` (server code only) makes a
  link with a random 20-character code (80 bits) that reveals nothing about the
  creator. Links expire within a year and can be revoked.
- A trigger refuses an active link for anyone who isn't an accepted creator.
- `ops.resolve_creator_link(code)` answers `valid`, `unknown`, `expired`,
  `revoked` or `creator_inactive`, and returns ids only when valid.
- Attribution carries through: waitlist entry → invitation (copied by trigger)
  → account (a `pending` redemption when the invitation is accepted) → the
  person's own decision (`ops.record_invite_follow_decision`, once).
- Link format (proposed): `https://<site>/join?ref=<code>`. In the tour:
  `/tour/welcome?invite=<code>`.

## Phase 3: personalized onboarding (in the tour today)

Real accounts don't have follows, posts or a feed yet, so the flow is built in
the tour on the same rules and with logic that carries over:

1. Welcome. With a valid invitation: "<Creator> invited you to Splitpost". With
   an unusable one: a short note, then the normal welcome.
2. **What are you into?** Intent, topics you enjoy, and (for Create or Both)
   up to three topics you'll post about. Never follows anyone.
3. **Who do you want to follow?** The inviting creator first, with explicit
   *Follow* / *Not now* buttons and the line "Nobody is followed for you, and
   an invitation earns nothing for anyone." Then suggestions, matches to your
   topics first (`src/lib/matching.ts`).
4. Done.

Following stays newest first from people someone chose. Discover groups
"Matches your interests" first, then everyone else; searching or filtering
shows one plain list. No engagement ranking and no AI model.

## Phase 4: measurement

`src/lib/pilotEvents.ts` is the catalog. No event carries an email, name,
handle, account id, IP address or free text.

| Metric | Definition | Recorded |
| --- | --- | --- |
| Waitlist signup source | `waitlist_signup` by `source` | Database |
| Self-reported creator referral | share of `waitlist_signup` with `self_reported_referral` | Database |
| Verified creator invitation | `waitlist_signup` with a link; `invitation_accepted` | Database |
| Invitation-to-signup conversion | signups through a link ÷ `creator_link_visit` | Visits need a decision (below) |
| Invitation-to-follow conversion | `invite_follow_confirmed` ÷ (`confirmed` + `declined`) | Database |
| Interest selection | `interests_selected`: topics, count, plans to create | App, once real accounts exist |
| Discovery-to-follow conversion | `discover_follow` ÷ `discover_suggestion_shown`, split by matched interest | App, once real accounts exist |
| Returning fan engagement | accounts that engage with someone they follow in a later week, in aggregate | Derived, once real accounts exist |

`waitlist_api.admin_acquisition_summary()` gives the waitlist admin counts only.

## Before activation: what needs the founder

1. **Approve the migration** (`20261116000000_creator_acquisition.sql`). Adding
   it to `supabase/approved-migrations.sha256` is the approval; until then CI's
   Database job stops at that check by design. It changes two existing safety
   checks narrowly (the writer's allowed entry points; three named waitlist
   columns) — see the PR.
2. **A rollback for this migration.** The staging waitlist rollback refuses,
   by design, once anything later is applied. A matching rollback must exist
   before this goes to staging, and CI's rollback test will fail until it does.
3. **Privacy notice wording** for the new fields: intent, the self-reported
   creator name (a third party's name, kept only as typed), verified link
   attribution, and the anonymous events. Retention follows the waitlist entry.
4. **Showing the creator's name to someone holding a link** (for example
   "Invited by Priya" on `/join`). Needs a public, rate-limited lookup that
   reveals only a display name for a valid code — a new public endpoint.
5. **Counting link visits** for invitation-to-signup conversion. Needs the same
   public lookup (or a separate counter), with no IP or cookie stored.
6. **Who accepts creators and issues links**, and default expiry (proposed 90
   days), campaign labels and revocation policy.
7. **Real-account follows, feed and interests.** Phase 3 is in the tour; real
   accounts need a reviewed schema with row level security, and a decision on
   whether an explicit invitation follow earns the normal follow Connection
   Points (the tour applies the normal follow rule, nothing extra).
8. **Deploy order:** migration first, then the server function (it calls
   `submit_v2`), then the build flag. All three stay off until the existing
   waitlist activation is approved.
