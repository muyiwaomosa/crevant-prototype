# Release 2: One unified experience

Status: in review (not merged). Everything described here is a local, simulated prototype.

## Original assumption

Fans and creators are two different kinds of user, so they need separate interfaces. The MVP and Release 1 shipped a Fan / Creator switch: fan mode for following, engaging, points, and rewards; creator mode (the "Studio") for publishing, audience stats, and creating rewards.

## New insight

Consuming and creating are **activities**, not identities. On real social platforms the same person follows others, publishes, builds an audience, and supports other people, often in the same session:

- Someone who follows 20 creators may also post.
- A creator with 100,000 followers is still a loyal fan of others.
- People who join to watch often start publishing later.
- Two people can follow each other and each build their own community.

Making people switch modes adds an artificial boundary they should not have to think about.

## Product decision

Remove role switching. **Everyone is a participant. Everyone can create. Everyone can follow. Everyone can build relationships.**

- One navigation for everyone: **Home, Discover, Create, Rewards, Profile**.
- One profile per person, with their posts, followers, following, and picture.
- Creator capabilities (offering rewards, audience overview) live in **Profile → Creator tools**, open to anyone, with no account type to activate.
- Connection Points stay creator specific from Release 1, but are now framed as belonging to a **relationship**: CP you earn by engaging with someone's posts can only be spent on rewards that person offers. Nobody ever earns CP from their own content.

## Expected benefits (hypotheses, not validated)

1. Lower cognitive load: one identity, no switching.
2. Simpler onboarding: no "fan or creator?" question before exploring.
3. Natural progression: start by following, publish whenever ready.
4. Consistent navigation: every feature is always in the same place.
5. Stronger network effects: everyone can both support others and build an audience.
6. Easier user testing: testers explore the whole product without role instructions.

## Risks

- **Advanced creator tools may become harder to discover.** They now sit one level down, in Profile → Creator tools.
- **A unified interface may become cluttered** as creator features grow. Today the main surfaces stay simple because the tools are on their own page.
- People who think of themselves only as viewers may feel pushed to post. The Create prompts are light (one nav item and one "Share something" line) to limit this.
- Creator specific CP may be harder to explain without the fan/creator framing. Copy now says "CP with Amara" and "people", not "fans" and "creators".

## What changed

### Navigation and information architecture
| Before | After |
| --- | --- |
| Fan / Creator switch in the header and sidebar | Removed |
| Fan nav: Home, Discover, Points, Rewards, Profile | One nav: Home, Discover, **Create**, Rewards, Profile |
| Creator nav: Overview, Create, Posts, Rewards, Profile | Folded into Create, Profile, and Profile → Creator tools |
| Points page | Rewards → **My CP** tab |
| Studio → New post (`/studio/new`) | **Create** (`/create`), in the main nav, highlighted |
| Studio → Posts | Profile → Posts tab |
| Studio → Rewards and Overview | Profile → **Creator tools** (`/profile/tools`) |
| Your "creator page" (`/creator/me`) | Your one Profile (`/profile`) |

Old routes redirect: `/studio` → `/profile/tools`, `/studio/new` → `/create`, `/studio/posts` → `/profile`, `/studio/rewards` → `/profile/tools#rewards`, `/points` → `/rewards?tab=cp`, `/creator/me` → `/profile`. Old Rewards links (`?tab=all`) still work.

### Onboarding (new)
Three short, skippable steps at `/welcome`, shown once to first time visitors:

1. The value proposition, "Follow the people you love. See what they share. Get recognized for being part of their journey.", with three ideas: follow people, see posts in order, get recognized with CP and rewards.
2. Choose accounts to follow. Nothing is preselected. Each chosen follow earns the standard 10 CP follow bonus with that person.
3. "You're in", explaining that anyone can post with Create, and that rewards and audience tools are in Profile.

There is no fan/creator question. **Skip** follows four starter accounts so the feed is not empty, says so in a message, and grants no CP for them. Returning visitors are never sent through onboarding again; it can be replayed from Profile, which changes nothing unless new people are picked.

New visitors no longer start pre-following four accounts. That earlier default contradicted "accounts you intentionally follow".

### Profile and Creator tools
- Profile: picture (reuses the Release 1 uploader), name, handle, bio, category, edit profile, and Posts / Saved / Following tabs. Stats show posts, followers (marked **demo**), following, and lifetime CP earned.
- Creator tools: create and manage rewards; an audience overview where every number is labelled simulated; and a **Supporters and redemptions** section that is honestly empty ("Not in this prototype yet"). In a single browser nobody else can engage with you, so showing supporters would mean inventing them.

### Other
- Home has a "Share something with your followers" prompt and a one time note for returning users: "Fan and Creator modes are now one".
- Copy uses "people" rather than "creators" and "fans" where it is about following or relationships.
- A "Skip to content" link was added for keyboard users. Inactive navigation labels now use a darker grey for contrast.
- Two narrow screen layout bugs found during testing were fixed: the onboarding account list overflowed sideways, and long buttons overflowed at 320px.

## Data migration

Stored data moves from version 2 to **version 3**.

- **Version 2 (Release 1):** everything is kept exactly: posts, profile and picture, CP ledger and balances, follow bonuses, owed CP, redemptions, created rewards, follows, likes, saves, comments. Only the obsolete `mode` field is removed. These are returning users, so onboarding is marked complete and a one time "modes are now one" note is shown on Home.
- **Version 1 (MVP):** migrated as in Release 1 (universal CP retired with a notice), then treated the same way as a returning user.
- Unknown or corrupt data falls back to a fresh demo, which starts at the welcome.
- **Reset demo** clears everything and returns to the welcome.

No unavoidable data resets were needed for existing demo users.

## Tests performed

All run on this branch, against the production build where a browser was involved.

- **Unit tests (Vitest): 72 passed.** New in this release: version 2 → 3 migration preserving every field (including a profile picture, owed CP, and follow bonuses), a fresh state starting at onboarding with no follows, and a two participant model where mutual followers each earn CP with the other, anyone can offer a reward that supporters redeem with CP earned with them, and nobody earns from their own posts.
- **Release 2 browser checks (`e2e/release2.e2e.cjs`): 71 passed, 0 failed.** Covers all ten requested journeys (onboarding completed and skipped, following, chronological feed, publishing without modes, editing profile and picture, earning with another account, redeeming with the right balance, refresh, reset, 320px), plus: one navigation with no mode switch, every nav destination, six old route redirects, 24 unique internal links checked for "not found" pages, keyboard order through the skip link and nav, migration from real Release 1 data in the browser, self engagement, junk comments and follow cycles earning nothing, a double click on Confirm spending once, and zero console errors.
- **Release 1 regression checks (`e2e/release1.e2e.cjs`, updated for the unified flow): 64 passed, 0 failed.** Creator specific balances, all three anti farming fixes, progress maths, triple click redemption, picture validation and storage errors, version 1 migration, and 320px layouts.
- `npm run build`: passed.
- Screens were reviewed at 390px, 320px, and 1280px.

**Not verified:** behaviour with a real screen reader (only roles, labels, and focus order were checked), real touch devices, and browsers other than Chromium.

## Known limitations

- Everything is still local to one browser. A profile is not a shared account, nobody else can follow you or see your posts, and your follower count is simulated.
- "Mutual followers each earn CP" is demonstrated by unit tests with two separate states. It cannot be shown in the browser, because there is no second real person.
- Supporter insights and a redemption inbox are placeholders.
- The seeded accounts are still described as creators internally (`Creator` type). The UI is role neutral; renaming the data model is left for when real accounts arrive.
- The audit items from earlier (Back not restoring feed position, some remaining low contrast grey text) are not part of this release.

## Validation questions

Treat these as assumptions to test with real people:

1. Can first time users find the Create function without help?
2. Do people understand that anyone can publish?
3. Can users find reward management (Profile → Creator tools) when they need it?
4. Does removing role switching make the platform easier to understand?
5. Do users understand creator specific CP without separate fan and creator identities?
6. Does choosing who to follow in onboarding feel worthwhile, or do people skip it?
7. Do people who only want to read feel pushed to post?

## Role of AI assisted development

This release was implemented by Claude (an AI assistant) in Claude Code, at the founder's direction and against the founder's written specification. Claude inspected the existing code, wrote the code, migrations, tests, and documentation, ran the unit tests, production build, and browser checks, and reviewed screenshots. Design choices described above (for example skip following starter accounts, no preselected follows, the Creator tools placeholder) are proposals for the founder's review and should be validated with real users.
