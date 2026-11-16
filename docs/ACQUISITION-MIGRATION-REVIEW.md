# Migration review: 20261116000000_creator_acquisition

For the founder's approval decision. **Not approved:** the migration is not in
`supabase/approved-migrations.sha256`, and CI's Database job stops at that
gate by design. Nothing has been applied anywhere but throwaway local
databases.

## What it adds

It **redefines nothing** that earlier migrations own. `ops.join_waitlist`,
`waitlist_api.submit`, the waitlist switches and every earlier table and
grant are unchanged.

### New tables (all in the private `ops` schema)

| Table | Holds |
| --- | --- |
| `ops.pilot_creators` | Accepted creators: account id, status (accepted / paused / removed), up to 3 categories, agreed public name and agreement time |
| `ops.creator_links` | Invitation links: random 20 hex code, creator, optional campaign label, created, expiry (≤ 1 year), revoked time |
| `ops.creator_link_redemptions` | Accounts that joined through a link. The follow decision is held at `pending` by a constraint until real-account follows exist |
| `ops.acquisition_events` | Step counts: event, hour, channel label, link. No identifier |
| `ops.invite_preview_limits` | Preview rate limits and visit de-duplication: salted hashes only, 2 days |

### New columns
- **`ops.waitlist`:**
  - `intent` (create / discover / both);
  - `introduced_by_creator` (yes / no, names nobody);
  - `creator_link_id` (set by the server only, from a usable code).
- **`ops.invitations`:** `creator_link_id`, copied from the waitlist entry by a trigger.

**Removed in this revision:** the typed creator name or handle, its column,
its two constraints and its parameter. The form, server function, tests and
privacy draft match.

### Triggers
- Only accepted creators can hold an active link.
- A revoked link can never be restored.
- Invitations copy the waitlist entry's link.
- Accepting an invitation records a `pending` redemption.

### Functions
- **`waitlist_api` (security definer, fixed empty search path):**
  - `submit_v2` and `invite_preview` for `waitlist_writer`;
  - `admin_accept_creator`, `admin_set_creator_status`,
    `admin_set_creator_public_name`, `admin_issue_creator_link`,
    `admin_revoke_creator_link`, `admin_acquisition_summary` and `admin_purge_acquisition_events` for
    `waitlist_admin`.
- **Internal `ops` functions** for server code only.

## Permissions

| Who | Can |
| --- | --- |
| Visitors (`anon`), members (`authenticated`) | Nothing. RLS on, no policies, no grants, no schema usage |
| `waitlist_writer` (the server function) | `submit`, `submit_v2`, `invite_preview`. No table access |
| `waitlist_admin` (the founder's workflow) | The existing admin functions, plus the seven above. No table access |
| `service_role` (server code) | The acquisition tables and link resolution. **Cannot issue links, purge counts, or record a follow decision** (the constraint refuses it) |
| Creators | Nothing directly. They never issue, see or change links |

These are enforced by `supabase/tests/003` and `004` on every CI run and
deploy. 52 deliberate violations are each caught, including:
- the public calling the preview;
- server code issuing links;
- a name shown without agreement;
- a typed creator name column;
- an invitation marked followed when no real follow exists.

## Stored data and retention

| Data | Personal? | Retention |
| --- | --- | --- |
| Intent, yes/no introduction, verified link on the waitlist entry | Yes | Deleted with the entry (proposed 12 months, existing purge) |
| Link on invitation, redemption and follow decision | Yes, account linked | With the account (**to confirm in legal review**) |
| Pilot creator record and agreed public name | Yes, the creator's | While a pilot creator; name cleared at once when agreement is withdrawn |
| Hourly step counts | No identifier, but small counts can be narrowed down | **Proposed 90 days** (pending privacy/legal approval). Manual, bounded admin purge; no schedule |
| Preview limits and visit de-duplication | **Pseudonymous** (salted HMAC of network address) | Deleted after 2 days, on every preview |

Visits are **estimates**:
- they're counted once per salted client key, link and UTC day;
- NAT undercounts, network changes overcount;
- anyone can call the preview directly, which can inflate them.

The admin summary labels them `visits_estimate`. Conversion rates are
estimates, not counts of unique people.

## Invitation preview: security review

**Boundary.** The preview is reached only through the server function, as the
`waitlist_writer` login.
- **Answer:** exactly `{status, invite, name}`; the function rejects any other
  shape.
- **Never reveals:** the creator's account id, email, username, categories or
  status, why a link is unusable, or anything about the waitlist.
- **Name:** only an agreed public name, 1 to 40 safe characters (enforced by
  the database).
- **Gating:** it follows the same three switches as the waitlist. While closed
  it answers `closed` and writes nothing.

| Concern | Control | Residual risk |
| --- | --- | --- |
| Guessing codes | 80-bit random codes; 30 previews an hour per client, 300 a minute overall; malformed codes never reach the database | Negligible |
| Learning why a link fails | Unknown, expired, revoked and paused links answer identically | Validity of a held code is visible, by design |
| Exposing the creator | Only the agreed name; a strict response shape check | Name is public by the creator's choice |
| Scraping or abuse without Turnstile | Origin allowlist (browsers only, not a security boundary), 4 KB JSON, per-client and global limits | A script can call it; it learns only validity and an agreed name |
| Inflating visit counts | Once per client key per link per day; rate-limited requests record nothing; only usable links count | Rotating addresses can inflate. **Visits are estimates** |
| Denying previews to others | Exhausting the global 300 a minute hides banners for that minute | Signups are unaffected (separate limits). Accepted |
| Visitors whose address can't be trusted | They share one "unknown" key, as signups already do | They may see no banner when busy. Accepted |
| Growth of the limits table | Rows bounded by the global limit; 2-day cleanup, indexed by time | Low |
| A leaked `waitlist_writer` password | It can call the preview with any client key | It could inflate visits and read agreed names, nothing more. Same login as signups; rotate if leaked |

**Checked by:**
- unit tests (handler and form);
- database tests (`050`, sections 0 and 9);
- the Edge runtime end-to-end checks against real local Supabase.

## Rollback

`scripts/db/staging-rollback-acquisition.sql` removes exactly the 30
inventory items, never cascades, and checks the result.
- **Refuses, changing nothing,** if any creator, link, redemption, event,
  preview record, waitlist answer or invitation link exists, or if a later
  migration is recorded.
- **The waitlist rollback is unchanged** and still refuses while this
  migration is recorded.
- **CI proves both orders** on every run. It removes acquisition, then the
  waitlist, then reapplies both, and checks that the waitlist rollback
  refuses again.

A rollback after real use is refused by design: data must be deleted
deliberately first.

## Unresolved risks before approval

1. **The staging rollback is wired but switched off.** It runs only through the
   existing rollback workflow (`target: creator_acquisition`), with the same
   safeguards. Its switch, `WAITLIST_ROLLBACK_ENABLED`, isn't set, and it has
   never run against staging.
2. **Retention is proposed, not approved.** The 90-day purge exists and is
   tested, but it's manual and has never run; nothing schedules it.
3. **Legal review of the privacy draft** (`PRIVACY-NOTICE-ACQUISITION-DRAFT.md`),
   including the pseudonymous temporary codes.
4. **Real-account follows don't exist yet.** Invitation decisions stay
   `pending` (enforced) until that work is built and reviewed.
