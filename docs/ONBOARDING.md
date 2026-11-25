# One account, progressive onboarding, privacy and switches: review guide

Migrations: `supabase/migrations/20261211000000_unified_onboarding.sql` and
`20261212000000_privacy_and_switches.sql` (checksums recorded; merging approves
them, D7). The founder decision: one registration, one account. Consuming,
creating and advertising are capabilities of every member, never account
types, and setup asks only what is relevant when it becomes relevant.

| Capability | How | Requirement |
|---|---|---|
| One registration | Unchanged: an invitation or a member's personal link, email confirmation, adults only. No creator, fan or advertiser sign-up forms | Founder decision |
| What brings you here | Optional first question ("Share my own work", "Find creators I'll love", "A bit of both"). Continue works without an answer. It only chooses the next suggestion; it is never shown publicly (the old Creator and Fan badges are gone) and grants or restricts nothing | Founder decision |
| Who invited you | After joining, setup shows the member whose link brought you, with Follow and Not now. Nobody is followed automatically | ACQUISITION phases 2 and 3 |
| My Split education | The last setup step: three points on how contributions are recognized, that some points become redeemable after review, and that everything is simulated and nothing is paid. The Splitpost symbol, no percentages (legal safeguard) | SP-TA-001 §9 |
| Creator setup | On your own Profile: up to 3 posting topics, a first post prompt (and a short guide on Create before the first post), your personal invitation link with how many joined through it, and where your insights live | DSC-04, ACQUISITION phase 3 |
| Creator suggestions | Members who chose posting topics, or who have published, are suggested as creators, best topic match first. Members who only read are not suggested. (DSC-04 asks for posting topics to be required; publishing also qualifies so nobody who posts is hidden) | DSC-04 |
| Founder invitation tools | Control Center: pause or open registration and set the limits (recorded with a reason), create invitation links (optionally for a creator, so their audience sees who invited them), see uses and joins, stop a link | BRD-07 |
| Advertising from your account | Profile, Advertise with Splitpost: business, offering, problem, customer needs, desired outcome, objective, conversion action, categories. One open request at a time; it arrives on the founder's Advertising page as "Requested by @member" for managed onboarding and approval. Once approved, the member sees their campaigns and an aggregate report (groups under 10 withheld, including feedback counts). No self-serve campaign management | Founder decision, ADV-02 |
| Privacy requests | Profile, Your data and privacy: a copy of my data, a correction, or deleting my account (with a confirmation). One open request of each kind; withdrawable | GOV-C11 |
| Account deletion | Control Center, only through an open deletion request, with the username typed, never a founder account. It forfeits unsettled simulated points as recorded reversals, removes the account and its content, queues its files through the existing media deletion queue, and keeps the simulated ledger and ad observations without the member, so every closed month still reconciles | GOV-C12 |
| Switches | Control Center: advertising, sharing and video posts, each with a recorded reason, enforced by the server (no ads served, shares refused). Video posts cannot be turned on until the device test passes. Registration, rewards, photos and external access are shown alongside | REL-12 |

Nothing here is callable by visitors, and nothing changes the launch gate,
reward rules, advertising matching or Production.

## Evidence (local)

* Staging-safe checks `027_unified_onboarding.sql` and `028_privacy_and_switches.sql`.
* Behaviour tests `230_unified_onboarding.sql` (topics, suggestions, hidden
  details, inviter, founder links, advertising requests and reports) and
  `240_privacy_and_switches.sql` (switches enforced, requests, deletion of a
  member with posts, comments, feedback, points and ad impressions; ledger and
  ad counts intact; founder never deleted).
* Rollbacks with tests, in the full chain (110 checks).
* Unit tests for setup, the inviter, My Split education, creator setup,
  advertising requests, privacy requests and the Control Center panels (844 in
  total); all 14 browser journeys pass in CI order.
