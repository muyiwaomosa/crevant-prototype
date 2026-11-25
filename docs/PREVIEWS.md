# Fair rotation, search measurement and public previews (IP-4c): review guide

Migration: `supabase/migrations/20261204000000_previews_and_search.sql` (checksum recorded; merging approves it, D7). Founder decisions of November 25, 2026.

## 1. Fair discovery rotation

The founder asked whether newest-first with a per-creator cap disadvantages creators who post less often. It did, at scale: once more than about 30 eligible posts existed, a creator whose only post was a few days old could fall below creators posting several times a day. Fixed:

* **Round one first:** every eligible creator's newest post comes before any creator's second post.
* **A daily rotation decides who leads each round,** not how recently or how often a creator posts.
* Unchanged: the 30-day window, at most two posts per creator, interests or the visit's focus, reasons on every suggestion, and no popularity signal.

Proven in `supabase/tests-local/160_previews_and_search.sql`: a creator with one 20-day-old post appears in round one ahead of a daily poster's second post.

## 2. Search measurement without search histories

| Measure | How | Personal data |
|---|---|---|
| Search volume | `social.search_metrics_daily.searches`, per day and surface (search, focus) | None |
| Successful result delivery | `with_results` | None |
| Result selection | `selections` (a person, post or topic opened from results) | None |
| Search-to-follow conversion | Follows whose source is `search` (follow history already exists) divided by searches | Follow history only, as before |
| Aggregated demand by topic | The approved topic a search or focus matched, else none | None |

No words, member, results or session are stored; a staging check fails if such a column ever appears. Founder read: `app_founder_search_metrics(days)`. The intelligence package (IP-8) reads the same table.

## 3. Public previews (a narrow exception to "visitors can call nothing")

* **One function** visitors may call: `public.app_public_post(post, referral)`. Every other function still refuses visitors, checked by `005`, `006`, `020`, the member surface audit and `070`.
* **Eligible content only:** previews switched on for the environment; the post is live (not deleted or hidden), has text and no open report; its creator is an active member and hasn't turned previews off (Profile, "Sharing outside Splitpost", on by default).
* **What a visitor sees:** the text, time, topic, "Edited", whether it has a photo (never the photo), and the creator's name and username. No counts, comments or other members.
* **Attribution and the way in:** shared links are `/p/<post>?r=<sharer's referral link>`. The page offers "Join with this invitation" (that referral link, so registration is attributed as today) or "I'm a member: sign in and follow" (straight to the creator). After joining, Home offers to see the creator they came for; nothing is followed automatically.
* **Abuse prevention:** 600 previews a minute overall and 60 per post; visits are counted per day, post and referral link with no visitor identity.
* **Activation:** off by default on every database. Staging: `select ops.set_public_previews('founder', true, 'staging acceptance');`. Production: only after the founder's legal, security and pilot readiness approval (PB-4 or earlier by decision). Every change is recorded in `ops.public_preview_events`.

## Evidence (local)

Database suite with `020_previews_and_search.sql` and `160_previews_and_search.sql` (anonymous access, boundaries, off by default, deletion, open reports, opt-out, ended membership, referral counting, rate limits, switch history, rotation, search counts), rollback chain 86 passed with `rollback-previews-test.sh`, Auth integration 135, activation 38, member Production sequence 79, unit tests 789, and the browser journey `e2e/preview-journey.e2e.cjs`.
