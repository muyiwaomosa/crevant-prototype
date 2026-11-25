# Governance (IP-3): review guide

Migration: `supabase/migrations/20261206000000_governance.sql` (checksum recorded; merging approves it, D7). It builds on moderation (20261124000000) and rewards (20261205000000).

| Capability | How | Requirements |
|---|---|---|
| Blocking | `app_block` / `app_unblock` / `app_my_blocks`. Two way and immediate: neither member sees the other's profile, posts, comments, reposts or search results, and neither can follow or comment on the other. Follows and Clique memberships between them end, recorded with the reason `block`. Unblocking restores nothing automatically. The blocked member is never told | GOV-01 |
| One place for it | Blocks and suspensions are applied in `social.visible_members`, the view every member function already uses, so Home, profiles, Discover, search, comments, Clique catch-up and rewards respect them with no function left out. Signed-out previews are unaffected by blocks (a visitor has none) but do exclude suspended members | GOV-01, integration |
| Reporting someone you blocked | Reporting uses `social.listed_members` (membership without blocks), so a block never stops a report | GOV-02 |
| Comment reports | Reports can name a comment. Moderators hide and restore comments like posts; a hidden comment is always also deleted, so every function excludes it | GOV-02 |
| Enforcement ladder | `app_mod_enforce`: warning, then restriction (1 to 30 days, default 7: no posting, commenting or reposting), then suspension (1 to 90 days or until lifted: hidden from other members, no activity). Each step needs the one before it within 180 days, except threats, self-harm and hate. `app_mod_lift` ends one early. Enforced by triggers on the tables themselves, so no function can be missed | GOV-03 |
| Author notices | The author is told when content is hidden or restored and when a limit starts or ends, with the reason category and their own excerpt. Never who reported. Home shows a banner for a limit or a new notice | GOV-04 |
| Appeals | `app_appeal`: one per notice, within 30 days, up to 1,000 characters. `app_mod_decide_appeal`: a different moderator decides whenever one exists. Reversing restores the content or lifts the limit; the member is told | GOV-05 |
| Audit | Every block, enforcement, lift and appeal decision is recorded; histories are append-only (notices may only be marked read; appeals are decided once) | GOV-06 |
| Rewards | Points earned on a hidden post or comment are reversed (new rows). A restore after appeal does not re-award. Restricted and suspended members earn nothing while it lasts because they cannot act | RWD-12 |

## Decisions taken within the authorization

* **Suspension is not removal.** A suspended member can still sign in to read notices and appeal. Removing an account from the pilot stays the founder's `ops.revoke_member_access`.
* **The ladder is enforced, not advisory.** Threats, self-harm and hate may go straight to any step, because waiting would be unsafe.
* **Appeals on a sole moderator's actions.** During the pilot there may be one moderator. They may then decide appeals on their own actions, and the screen says so. Once a second moderator exists, the database refuses.

## Evidence (local)

* Staging-safe check `022_governance.sql` and behaviour tests `180_governance.sql` (blocking both ways, follows and Clique ended and recorded, the blocked member not told, reporting still allowed; comment reports; points reversed on hidden content; the ladder and its exceptions; restriction and suspension; notices; appeals once, in time, decided independently, reversing restores).
* Rollback `scripts/db/staging-rollback-governance.sql`, tested by `rollback-governance-test.sh` (15 checks) within the full chain (92).
* Unit tests for blocking, the blocked list, comment reports, the Home banner, notices and appeals, the account panel and the appeals page.
* Browser journey `e2e/governance-journey.e2e.cjs` (30 checks, WCAG 2.2 AA at 320 and 390 px).
