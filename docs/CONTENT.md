# Content (IP-4a): review guide

Migration: `supabase/migrations/20261202000000_content.sql` (checksum recorded; merging approves it, D7). Part one of IP-4 (SP-TA-001 v2, WP-04). Discovery and sharing follow in IP-4b.

| Capability | How | Requirements |
|---|---|---|
| Post topic | One optional topic from the approved list, chosen in the composer (Home and Create). Shown on the card. Uncategorized posts still reach every follower | DSC-05, CNT-01 |
| Editing | The author edits the text and topic of their own live post (pencil on the card). The card shows "Edited"; every earlier version is kept in `social.post_edits` (append-only), so editing a reported post never removes evidence. Photos can't be replaced; hidden or deleted posts can't be edited; the post id never changes | CNT-12, CNT-15 |
| Saves | Bookmark on every card; private Saved list (Profile, Saved) | CNT-08 |
| Reposts | Repost someone else's post to your followers. The original creator stays the author; the card says "Reposted by …". On Home a follower sees a repost only if they don't already follow the creator, once per post, so every post still appears once | CNT-09 |
| Home with reposts | `app_feed_items_page`: own and followed posts plus reposts, paged on (activity time, post id). My Clique stays the Clique's own posts. Mutes apply to creators and reposters | CON-08 (coverage proven: 6 of 6 eligible posts, each once) |
| Active Supporter | Now also a save or a repost of the creator's posts in 28 days, not only a meaningful comment (provisional until metric decision N8) | CON-03 |
| Events | `post_edited`, `post_saved`, `post_unsaved`, `post_reposted`, `post_unreposted`, by triggers (the inputs the rewards package needs) | CNT-13 |
| Limits | Edits 30 an hour, saves 200, reposts 60 | CNT-15 |

Card details (topic, edited, saved, reposted, repost count) come from one batched call per screen (`app_post_meta`), so the existing post lists are unchanged and the app works before the migration (the new buttons simply don't appear).

## Evidence (local)

Typecheck, build, unit tests (779), guard tests (291 and 153), database suite with the new `018_content.sql` and `140_content.sql`, activation (38), CLI compatibility (7), member Production sequence (79), Auth integration (135), rollback chain with the new `rollback-content-test.sh` (80 passed), and the browser journeys including the new `e2e/content-journey.e2e.cjs`.

## Applying it

Staging: the database deploy workflow after merge (no dashboard step). Member Production: PB-2. Undo on staging: `scripts/db/staging-rollback-content.sql` (phrase `REMOVE THE STAGING CONTENT`), only until any topic, edit, save or repost exists.
