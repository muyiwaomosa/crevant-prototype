# Governance (IP-3): review guide

Migrations: `supabase/migrations/20261206000000_governance.sql` (merged) and `20261207000000_governance_refinements.sql` (checksum recorded; merging approves it, D7). It builds on moderation (20261124000000) and rewards (20261205000000).

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

## Founder decisions (November 25) and how they are built

* **Suspension is not removal** (accepted). A suspended member can still sign in to read notices and appeal. Removing an account from the pilot stays the founder's `ops.revoke_member_access`.
* **Proportionate immediate enforcement** (refinements, 20261207000000). Threats, self-harm and hate skip the ladder. Beyond those, a moderator may mark any restriction or suspension **immediate** for a serious violation; the database then requires a justification, records `immediate` on the enforcement and "(immediate)" in the audit trail.
* **The sole-moderator appeal exception** (accepted with conditions, 20261207000000). A moderator may decide an appeal on their own action only while no other **eligible** moderator exists (an active pilot member who is not the appellant). Then:
  * the moderator must record a reason, or the database refuses;
  * the appeal is marked `same_moderator`, the audit trail says "Sole moderator, conflict of interest disclosed", and the member's notice says the same moderator reviewed it;
  * the exception ends by itself: the moment another eligible moderator exists, the database refuses and the screen disables the buttons.
* **Restoring legitimate rewards** (20261207000000). When a moderator restores hidden content, or an appeal reverses the hide, the Connection Points the hide took back come back as **compensating ledger entries** (one per reversal, keyed `restored:<reversal key>`, so never twice). Nothing historical is edited. Only reversals caused by the hide are restored: points reversed for any other reason (for example, the author deleting the comment) stay reversed, and only content that is live again qualifies. Hiding it again takes them back again.

### Accounting constraints (for review)

* Moderation only ever reverses **recognized** (non-redeemable) points. Qualified referrals, the only redeemable points, are never reversed by moderation, so no redeemable balance and no closed settlement is affected by a hide or a restore. A restore is dated now, in the open period. If moderation ever needs to touch redeemable points, the adjustment would go into the open month the same way, with closed months left unchanged.
* A restored entry counts like any award made that day for that day's caps (a member restored at the cap could earn slightly less for the rest of that day). Proportionate for the MVP; noted for the metric review.

## Evidence (local)

* Staging-safe checks `022_governance.sql` and `023_governance_refinements.sql`; behaviour tests `180_governance.sql` and `190_governance_refinements.sql` (restores once, never for author-deleted content, re-hide takes back again; the sole-moderator exception with an inactive second moderator; immediate enforcement) (blocking both ways, follows and Clique ended and recorded, the blocked member not told, reporting still allowed; comment reports; points reversed on hidden content; the ladder and its exceptions; restriction and suspension; notices; appeals once, in time, decided independently, reversing restores).
* Rollbacks `staging-rollback-governance.sql` (15 checks) and `staging-rollback-governance-refinements.sql` (12 checks) within the full chain (95).
* Unit tests for blocking, the blocked list, comment reports, the Home banner, notices and appeals, the account panel and the appeals page.
* Browser journey `e2e/governance-journey.e2e.cjs` (33 checks, WCAG 2.2 AA at 320 and 390 px).
