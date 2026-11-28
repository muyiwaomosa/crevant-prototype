# SP-UX-003: guided experience and progression remediation

Approved by the founder on Nov 28, 2026. This is a remediation of the
existing member experience, not new business scope. It is front end only.

It does not change:

* the progression engine, the approved benchmarks or the eligibility rules;
* the financial rules, the integrity rules or the recognition rules;
* the primary navigation or the distribution principles.

It adds nothing new:

* no migration;
* no currency, leaderboard or streak.

External access stays closed, and every reward stays simulated.

It replaces the parts of SP-UX-002 that describe My Split's three faces, the Home first steps and goal strip, Discover's three ways in, and the insight faces. The five welcome screens from SP-UX-002 stay as they are.

## What changed

| Area | Before | Now |
|---|---|---|
| **My Split** | Three faces: My Split, My Goals, My Activity | One scrolling page. In order:<br>1. The simulated split (unlocked and locked).<br>2. How My Split works, one tap away, with the breakdown.<br>3. Connection Points (recognized apart from redeemable).<br>4. The simulated creator share by month, when there is one.<br>5. Both journeys.<br>6. Recent activity, with the full history on request.<br>7. The invitation link.<br><br>Each journey always shows its title, goals met and status (In progress, Under review, Qualified, Eligibility paused or Qualification revoked). Notices also stay visible when collapsed.<br><br>A journey's milestones open and close, and so does each milestone. The suggested one starts open.<br><br>The rule is stated on the page: "Meeting all 5 goals starts an eligibility review. Nothing unlocks automatically: locked amounts unlock only if the review is approved."<br><br>Old `?face=goals` and `?face=activity` links land on the page. |
| **Your Insights** | Three faces on Profile (Reach, Connection, Earnings). Audience sat inside Edit profile and the supporter's week inside My Split. | One page at `/app/insights`, opened from the Your Insights card on Profile. Every member sees every section: Reach, Content, Audience, Connection, Your support and Monetization.<br><br>Each section keeps What happened, What it means and What to do next (IP-8). With nothing to count yet, a section says "Not yet measured" and how to start. Without the intelligence functions, it says the section isn't available yet.<br><br>Availability ("in every follower's Home feed") and actual reach (followers who viewed a post) are shown apart.<br><br>Simulated amounts moved to My Split. Monetization shows ad performance and actual income, and points to My Split. |
| **Discover** | A first screen with three large cards, then a different focused screen | The header, search box and three compact tabs (For you, People, Topics) stay in place. Only the results change, and searching keeps the tabs. The tab is kept in the URL.<br><br>People are compact rows. Each row has:<br>* the avatar and name;<br>* a reason from existing data only (shared interests or the topic they post about, then their post count, then their username);<br>* the bio on one line;<br>* one button: Follow, then Join Clique, then In Clique. |
| **Home** | First steps with a permanent Hide, plus a separate goal strip hidden for the day | One compact guide:<br>* the getting-started checklist: follow 3 people, add a creator to your Clique, support a post, publish your first post (optional), complete your profile;<br>* both journeys, shown from day one and never waiting for the checklist.<br><br>Minimize turns it into one line that still shows both journeys, and Show brings it back. When the required steps are done, the checklist retires from Home and the goals stay. Members who hid the old guidance start minimized. Nobody has to post to finish it or to pursue the supporter journey. |
| **Help & getting started** | How Splitpost works was a Settings row | One entry on Profile, holding:<br>* the checklist, which stays here after it leaves Home;<br>* Take the app tour;<br>* How Splitpost works (the five welcome screens). |
| **App tour** | None | Optional, skippable and replayable: five stops (Home, Discover, Create, My Split, Profile).<br><br>It is offered once inside the Home guide, never as a card of its own. It highlights the navigation item and never navigates or changes anything. Escape closes it, focus stays in the card, and it works on phones and desktops. |
| **Recognition** | Saves, comments, reposts, shares and posts; a goal-met banner only on My Goals | The same, plus:<br>* Joining a Clique shows how far the supporter goal has come, read back from the server.<br>* App-wide, once: a goal met, all 5 met (review started), and Qualified. These include goals moved by other people, read whenever progress is refreshed (on navigation and on return to the app, at most every 20 seconds).<br><br>One message at a time. |

## Wording corrections

* **Discover hint.** It no longer says following counts toward "Keep creators in your Clique". It now says following doesn't add anyone to a Clique.
* **Getting started.** The Clique step says following doesn't add anyone, and that the goal counts 10 creators.
* **Welcome screen 4.** It now says goals lead to an eligibility review before anything unlocks. The badge reads "Reviewed at 5 of 5".
* **Composer, first-post guide and empty profile.** These now say a post "goes into the Home feed" of followers. They no longer say followers "see it".
* **Next-step explanations, journey status lines and the My Split terms.** These now describe the review step and never an automatic unlock.

## State kept on the device (approved for the MVP)

Each of these is kept in `localStorage` only:

* `splitpost.guide.<id>`: the guide is minimized or open.
* `splitpost.tour.<id>`: the tour has been seen.
* `splitpost.milestones.<id>`: the last progress the member was told about. The first visit on a device records it silently.

## Removed

* The unused identity picker and its text.
* The unused creator setup card.
* The old goal strip, the journey intro line and the three-face My Split.

## Acceptance

Only the items affected by this change are retested: UAT-001-3, UAT-001-4 and the onboarding items. The steps are in `docs/FOUNDER-TESTING-GUIDE.md`, rows 1, 3, 9, 10 and 11.

**Automated checks:**

* the unit suite (app, journey and progression);
* the browser journeys, which are updated to the new screens: content, consumer, creator, registration, rewards, progression, intelligence, advertising, relationships and social.
