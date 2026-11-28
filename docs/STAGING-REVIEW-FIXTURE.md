# Staging review fixture (SP-UX-003, check 8)

Check 8 needs a member who has met all five goals of one journey. Doing that by hand takes weeks: one goal asks for support in four different weeks. The review fixture prepares that member for you on staging, using clearly labelled test data. You then sign in as them, see "Under review", and approve them in Control Center.

Nothing about the goals changes. The fixture never edits the approved goal values and never writes a qualification directly. The fixture accounts do the real things (follow, join a Clique, save, comment, repost, share, refer), and the app's own check records the qualification, exactly as it would for anyone else.

It runs on staging only. No member Production workflow, secret or configuration refers to it, and a test on every pull request makes sure that stays true (`scripts/staging-review-fixture.test.mjs`).

## What it creates

All of it is test data, and all of it says so.

* **The fixture supporter**, `@review_fixture_supporter` ("Review fixture supporter"). This is the one account you sign in to. Its address is the staging secret `STAGING_FIXTURE_MEMBER_EMAIL`, which is never printed.
* **10 fixture creators**, `@review_fixture_c01` to `@review_fixture_c10`, with 3 short posts each.
* **5 referred fixture members**, `@review_fixture_r1` to `@review_fixture_r5`.

The 15 supporting accounts use addresses on the reserved `.invalid` domain. They have no password and are blocked in Auth, so nobody can sign in to them.

Every fixture account is in the **tester** cohort. The North Star, active members, retention, activation and the progression scorecard already leave testers out, so the fixture doesn't change those figures. The automated test proves it.

A few founder overview counts include every account, testers too, so these will rise while the fixture exists. That is how those counts are defined; the fixture doesn't change their definitions.

* Posts, posting creators and meaningful comments this week
* Follows this week
* Members by referral, registrations this week, and test members
* Recognized points
* The scorecard's referral and status counts

`remove` brings them back down.

## How each supporter goal is met

| Goal (approved target) | How the fixture meets it |
|---|---|
| Creators in your Clique (10) | Follows all 10 fixture creators and adds each to its Clique |
| Meaningful engagements (30) | 10 saves, 10 comments and 7 reposts today, plus 3 saves in earlier weeks |
| Creators engaged with (3) | Engages with all 10 |
| Supporting weeks (4) | This week, plus one save in each of the 3 previous weeks |
| External shares (5) | Shares 5 posts with "Copy link" |
| Qualified referrals (5) | 5 fixture members join through its referral link and follow a creator, then each referral is recorded as reviewed |

**One thing is backdated, and only this.** The weeks goal needs support in 4 different weeks, but the fixture runs in one go. So 3 of the saves are dated 7, 14 and 21 days ago, along with the posts they save and their points, written exactly the way the app records a save. Everything else happens at the moment you run it.

**Referral reviews** are recorded the same way your review in Control Center records them, but marked `staging-review-fixture` so they can't be mistaken for your own decisions.

## Before you run it (once)

1. **Pick an address you can read.** It must not already belong to a staging account. Something like your own address with a `+review` tag works if your mail provider supports it.
2. **Add the secret.** GitHub, the repository, Settings, Environments, **staging**, then Add environment secret:
   * Name: `STAGING_FIXTURE_MEMBER_EMAIL`
   * Value: that address.

   Add it to the **staging environment only**. The workflow refuses to run if it also exists at repository or organization level.
3. **Check staging's switches.** `STAGING_FOUNDER_ACCOUNT_ID` is already set from the activation workflow. Sharing must be on and rewards not paused (both are on staging by default). External member access must be open, which it is since setup step D.

## The steps

1. **Seed.** GitHub, Actions, **Staging review fixture**, Run workflow, from `main`. Leave mode on **seed** and journey on **supporter**. It takes under a minute. The log ends with:
   * `Fixture supporter @review_fixture_supporter: status under_review; goal values {...}`
   * `Committed.`

   Want to try it first? Choose **dry-run**. It does everything, shows the same result, then undoes it all.
2. **Set a password.** On the staging app, choose Sign in, then **Forgot password**, and enter the fixture address. Open the email and choose a password.
3. **Check "Under review".** Signed in as the fixture supporter, go to Home and My Split. The badge reads **Under review**, and locked amounts stay locked. The one-time message "All 5 supporter goals met · Your eligibility review has started" may not appear here: the app shows milestone messages only for changes it sees happen, and on a device's first visit it just notes where things stand. This visit is still needed, because it is what lets the next step's message appear.
4. **Approve.** Sign out and sign in as yourself. Go to Control Center, **Qualification review**, find `@review_fixture_supporter`, and approve it.
5. **Check "Qualified".** Sign in as the fixture supporter again. You should see one "Qualified as a supporter" message, the badge reads **Qualified**, and locked amounts unlock.
6. **Record the result** in `docs/ACCEPTANCE-CHECKLIST.md` (check 8).
7. **Remove.** Run the workflow again with mode **remove**. It deletes all 16 fixture accounts and everything they made, using the same account deletion as a member deleting their account. Each deletion is written to the deletion register, so the register checks stay clean. The membership history keeps a "removed" entry for each account, by design. You can then delete the secret too, if you like.

Running **seed** again after it has worked changes nothing; the log says so. To start over, run **remove** first.

## Safeguards

* Started by hand only, from `main`, by the repository owner.
* Uses the staging environment and its secrets only.
* The connection must be the staging project (its reference is written into the workflow), with full certificate verification.
* The script refuses to run on any database marked as member Production, and on any database whose launch founder isn't the staging founder.
* It waits in the same queue as staging database deploys, so it never overlaps one.
* It refuses an address that belongs to a real (non-fixture) account.

## Files

* `.github/workflows/staging-review-fixture.yml` is the workflow.
* `scripts/db/staging-review-fixture.sql` is the script.
* `scripts/db/staging-review-fixture-test.sh` runs it against a throwaway database on every pull request: refusals, dry run, seed, test-data exclusion, a repeat run, your approval, and removal.
* `scripts/staging-review-fixture.test.mjs` checks the workflow's safeguards and that nothing in Production refers to the fixture.

Later, a creator journey can be added as a second choice for "journey" in the same workflow and script.
