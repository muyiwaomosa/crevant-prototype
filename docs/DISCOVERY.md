# Discovery and sharing (IP-4b): review guide

Migration: `supabase/migrations/20261203000000_discovery.sql` (checksum recorded; merging approves it, D7). Part two of IP-4 (SP-TA-001 v2, WP-02 and CNT-10).

## Value and intent based discovery

Discover starts from what the member says they care about, not from popularity:

* **Value:** the member's interests (chosen in setup or on their profile).
* **Intent:** an optional "What are you here for today?" focus on the For you view. It shapes this visit only, is kept in the browser tab, and is never stored or sent anywhere except as the topic of that one request.
* **No popularity ranking:** follower counts and engagement play no part. Newest first, at most two posts per creator, so nobody dominates and new creators are seen.
* **A reason on every suggestion:** "Because you're interested in Money & business", "In Food & cooking, the topic you chose", or, without interests, "New in Travel. Choose interests to tailor this".

| View | What it shows | Requirements |
|---|---|---|
| For you (default) | Recent (30 days) categorized posts from members the viewer doesn't follow yet, in their interests or the chosen focus. Never their own posts, muted creators, hidden or uncategorized posts | DSC-06, DSC-08, DSC-09, DSC-11 |
| Creators | People, those sharing the member's interests first; browse by interest (unchanged ranking, now one view) | DSC-04 (creators' interests are their profile topics), DSC-06 |
| Content | Latest posts for a chosen topic | DSC-05, DSC-07 |
| Search, above the views | One box for people (name or username), posts (their words, PostgreSQL full text) and topics (the approved list) | DSC-07 |
| Share | The device share sheet where there is one, otherwise copy link. Recorded once per post and channel an hour (`post_shared` event), for contribution later | CNT-10 (share initiation) |

Discovery never changes Home: it only reads, and a test proves discovered creators don't reach Home without a follow (DSC-12).

## Assessments requested by the founder

* **Optional interest prioritization.** Delivered in its lightest form, the per-visit focus. A stored ranking of interests would add a settings screen and a migration for little gain at pilot scale; recommend revisiting with pilot data rather than building it now.
* **Privacy-conscious search instrumentation.** Not built. Today nothing about a search is stored (the browser journey checks this). If search quality needs measuring, the recommended design records only counts per day (searches, searches with no results, result type opened), never the words, the member or the results, in a separate aggregate table. That is a small change for the intelligence package (IP-8) and needs no personal data.

## Not in this package

* **Public previews** of shared posts for signed-out visitors (CNT-11) need an anonymous database function, which changes the rule that visitors can call nothing. That is a security decision for the founder. Until then a shared link opens the post for signed-in members, and others are asked to sign in.
* **Link visits and qualified referrals** from shares are recorded with the contribution package (IP-6).
* **Blocked creators** join the exclusions when blocking exists (IP-3).

## Evidence (local)

Database suite with the new `019_discovery.sql` and `150_discovery.sql` (interests, focus, two per creator, reasons, exclusions, search, shares, Home untouched), rollback chain 83 passed with the new `rollback-discovery-test.sh`, Auth integration 135, unit tests including For you, search and share, and the content browser journey's discovery steps (For you with a focus, search, share recorded once, nothing about the search stored).
