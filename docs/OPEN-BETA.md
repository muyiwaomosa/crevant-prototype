# Open beta: self-service registration

Anyone can create an account at `app.splitpost.ca/sign-up`, confirm their
email and use Splitpost. There are no invitation codes, allowlists or manual
approvals. The membership system stays: it is what lets a moderator remove
someone, and what closes registration without touching existing members.

**State of this change:** the code is in place, but registration is closed
everywhere. Three independent switches must all be on before a stranger can
get in (below), and none is turned on by this pull request.

## How an account gets access

| Step | What happens | If it fails |
| --- | --- | --- |
| 1. Sign up (`/sign-up`) | Email, password (10 characters or more), "I am 18 or older", agreement to the community rules, the Turnstile check. Supabase creates the account, unconfirmed, and sends the confirmation email (through Resend). | A wrong field is caught before anything is sent. Rate limits and "sign-up is off" are said plainly. Every other outcome, including an address that already has an account, gets the same "check your email" reply, so the page reveals nothing. |
| 2. Confirm (`/auth/confirm#token_hash=...&type=email`) | Opening the link does nothing (email scanners are harmless). Pressing Continue verifies it; Supabase marks the email confirmed and signs the person in. The profile row is created by the existing confirmation trigger. | An expired or used link says so and points to sign in, which offers "Send the confirmation link again". The sign-up page has the same button. |
| 3. Claim (automatic, on the first page of `/app`) | The app reads its access state; with no membership at all it calls `public.app_claim_access()`. The database adds an active `tester` membership if the email is confirmed and registration is open. The launch gate checks the same insert again. Recorded in `ops.member_access_events` by self-service. | Not open: "Splitpost isn't open for new members yet", with Try again. A failed call: "We couldn't set up your access just now", with Try again. The next page load always claims again; claiming is idempotent. |
| 4. Profile | The existing first-run setup: username and display name, then the optional details. | As before. |

Why a claim and not a trigger on `auth.users`: a trigger runs inside Supabase
Auth's own confirmation, so any error there would break confirming the email.
The claim is a separate call that can always be retried, and email
confirmation never depends on it.

Claiming **never** reopens a membership that exists: a revoked (suspended) or
expired account answers `revoked` or `expired` and stays so. It never gives
the founder cohort, and only works for the signed-in caller.

## The three switches (all must be on)

| Switch | Where | Off means |
| --- | --- | --- |
| **Sign-ups** | Supabase: Authentication, Sign In / Providers, "Allow new users to sign up" | Nobody can create an account. Existing accounts sign in as normal. |
| **External access (the launch gate)** | The database, `ops.set_external_access` (owner only, recorded) | New accounts can't claim membership ("isn't open yet"). Existing members keep their access. |
| **The beta documents** | `src/public/beta/documents.ts` (reviewed PR) | The sign-up page shows "Sign-up opens soon". |

`config/member-production.json` `openRegistrationApproved` is not a switch:
it is the reviewed approval that lets the gate be open. While it is false,
every member workflow fails if the gate is open, so an unapproved opening is
caught on the next run.

### Why a separate `openRegistrationApproved`

`invitationsApproved` means "invitations may be sent". Reusing it would have
approved invitations as a side effect of opening registration, and the member
check would then accept invitation rows. With its own flag, open registration
allows the gate to be open, and nothing else: invitation rows still fail the
member check unless invitations are separately approved.

## Closing registration versus suspending members

These are different operations, and neither implies the other.

**Close new registrations** (existing members keep everything):

1. Supabase: turn off "Allow new users to sign up". Takes effect at once.
2. Optionally also close the gate, so accounts created but not yet claimed
   stay out. In the SQL Editor:

   ```sql
   select ops.set_external_access('founder', false);
   ```

   Recorded in `ops.member_launch_events`. Nobody's existing access changes.

**Suspend one member** (takes effect on their very next request; their
posts and profile disappear from every feed):

```sql
select ops.revoke_member_access('<account id>', 'founder', 'reason, no email addresses');
```

They see "Your pilot access isn't active" and can't claim again. To restore,
use `ops.grant_member_access('<account id>', 'tester', 'founder')`, which is
recorded as restored.

**Suspend everyone except the founder** (an emergency):

```sql
select ops.revoke_member_access(user_id, 'founder', 'beta paused')
from ops.member_access
where status = 'active' and cohort <> 'founder';
```

Close registration first (both switches), or new accounts keep arriving.
Content stays in the database; restoring access brings it back.

**Moderation** stays separate from both: a moderator hides a post or profile
and the member keeps their account. Make the founder a moderator once, in
the SQL Editor: `select ops.grant_moderator('<founder account id>', 'founder');`.

## Supabase Auth settings for the member Production project

* **Sign In / Providers, Email:** enabled; "Confirm email" on; secure email
  change on; "Allow new users to sign up" **off until opening**.
* **URL Configuration:** Site URL `https://app.splitpost.ca`; Redirect URLs
  exactly `https://app.splitpost.ca/auth/confirm`.
* **Emails, templates:** "Confirm signup" links to
  `{{ .SiteURL }}/auth/confirm#token_hash={{ .TokenHash }}&type=email`, and
  "Reset password" to `{{ .SiteURL }}/auth/confirm#token_hash={{ .TokenHash }}&type=recovery`.
  The code goes in the fragment (`#`), never the query string: the confirm
  page ignores `?token_hash=`, so a wrong template fails safely instead of
  sending codes to the web server.
* **Emails, SMTP:** Resend (below). Supabase's built-in sender only reaches
  your own team's addresses and a few per hour, so without custom SMTP real
  members would never get their confirmation email.
* **Passwords:** minimum length 10; leaked password protection on.
* **Attack Protection, CAPTCHA:** Cloudflare Turnstile, with the secret key
  there. The site key goes to Vercel as `VITE_AUTH_TURNSTILE_SITE_KEY`
  (Production only). Turn on CAPTCHA only once that build is live, because
  every sign-in without a token is then refused.
* **Rate Limits:** keep the defaults or lower them: sign-ups and sign-ins per
  5 minutes per IP, and emails per hour.

## Resend

Suitable for this beta: Supabase lists it as an SMTP partner, and its free
plan allows 3,000 emails a month with 100 a day, enough for confirmation and
reset emails at this size. Check the current limits on Resend's pricing page
before relying on them.

1. Create the Resend account and add the domain (for example
   `mail.splitpost.ca`, so the root domain's email isn't affected).
2. Add the DNS records Resend shows (SPF and DKIM; DMARC recommended) at the
   splitpost.ca DNS provider, and wait until Resend shows the domain verified.
3. Create an API key with sending access only. In Supabase, Emails, SMTP:
   host `smtp.resend.com`, port 465, user `resend`, the API key as the
   password, sender `no-reply@mail.splitpost.ca`, name `Splitpost`.
4. Send yourself a password reset to test it.

The beta privacy notice must name Resend (email addresses pass through it,
in the United States).

## Spending controls (what actually exists)

Supabase's **Spend Cap** (Pro plan, on by default, in the organization's
billing settings) stops usage beyond the included quota for usage-based items
such as database size, egress, Edge Function invocations, monthly active
users, Realtime and storage. It does **not** cap compute hours: each project's
compute is always billed by the hour, whatever the cap. So:

* keep the Spend Cap on;
* run as few projects as possible (delete the rehearsal projects once they're
  finished), and keep member Production on Micro compute unless it needs more;
* set a usage alert or check the organization's usage page weekly during the
  beta.

Resend's free plan simply stops sending at its limit (no charge). Vercel and
Cloudflare Turnstile have no usage cost at this size.

## Order of operations

1. Merge PR #95 (the project reference). Set up the database: `check`,
   `plan`, `apply-foundation`, `check`, then the activation (founder only).
2. Set the Vercel variables; the founder signs in and tests. Sign-ups stay
   off and the gate stays closed.
3. Merge this PR; run the database workflow's `apply` (applies
   20261130000000), then `check`.
4. Resend, the Auth settings and Turnstile, with sign-ups still off.
5. The founder approves the beta privacy notice and the community rules (a
   PR filling in `src/public/beta/documents.ts`), and
   `openRegistrationApproved: true` in `config/member-production.json`.
6. Open: turn on sign-ups, open the gate (`select ops.set_external_access('founder', true, 'APPROVE EXTERNAL MEMBER ACCESS');`),
   then run `check`. Test with a second email address of your own before
   sharing the link.
7. Make the founder a moderator.
8. Release the Sign Up and Sign In links on splitpost.ca. The waitlist stays
   until the sign-up experience has been verified.
