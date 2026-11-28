# SP-BACKLOG-001: Splitpost product backlog

The persistent record of founder feedback and the refinements it leads to.
Opened Nov 28, 2026 from Production acceptance testing. Cross-referenced
from `docs/ACCEPTANCE-CHECKLIST.md` (section 5, findings).

**Authorization.** On Nov 28 the founder authorized a controlled MVP
refinement sprint for BL-001 to BL-009 and lifted the scope freeze for these
changes only. All unrelated scope stays frozen. Registration, invitations,
public previews and the waitlist stay closed until separately authorized.
Rewards stay simulated. The approved economic model, security controls and
eligibility rules are unchanged.

**Delivery.** One pull request,
[muyiwaomosa/crevant-prototype#141](https://github.com/muyiwaomosa/crevant-prototype/pull/141),
in work packages: WP1 media, WP2 profile, WP3 sharing, WP4 waitlist to
member. Two migrations: 20261221000000 (link in bio) and 20261222000000
(previews on by default). They are applied to staging, then member
Production, through the usual approvals after merge.

**Status values:** Proposed, Approved, In progress, Built (merged, awaiting
acceptance), Accepted, Deferred.

**Severity:** P0 to P3 as defined in the checklist. **Priority:** Must
(before the external pilot), Should, Could.

## Summary

| ID | Item | Classification | Severity, priority | Milestone | Status |
|---|---|---|---|---|---|
| BL-001 | Unified media upload | Usability refinement | P2, Must | Refinement sprint (before PB-4) | Built in PR #141 (WP1) |
| BL-002 | Link in bio | New capability (small) | P3, Should | Refinement sprint | Built in PR #141 (WP2, migration 20261221000000) |
| BL-003 | Adaptive video display | Defect (rotated phone videos) and refinement | P2, Must | Refinement sprint | Built in PR #141 (WP1) |
| BL-004 | Profile video thumbnails | Defect (profile-specific rendering) | P2, Must | Refinement sprint | Built in PR #141 (WP1) |
| BL-005 | Unified profile experience | Product principle alignment | P2, Must | Refinement sprint | Built in PR #141 (WP2) |
| BL-006 | Automatic public post previews | Policy change (opt-in to on by default) | P2, Should | Refinement sprint; activation after legal clearance | Built in PR #141 (WP3, migration 20261222000000); visitors see nothing until the project switch is on |
| BL-007 | Ads and Preferences off the profile | Usability refinement | P3, Should | Refinement sprint | Built in PR #141 (WP2) |
| BL-008 | Referral and external sharing journey | Two defects, the rest intentional launch controls | P1 (dead end), Must | Refinement sprint | Built in PR #141 (WP3) |
| BL-009 | Waitlist to member journey | Missing functionality | P1 for PB-4, Must | Before PB-4 | Built (D1 option A approved Nov 28 with safeguards; migrations 20261223000000 and 20261224000000; `docs/WAITLIST-HANDOFF.md`) |
| BR-001 to BR-006 | SP-BRAND-003 follow-up (Nov 28): public website messaging and hero | Website refinement (separate from PR #144) | P2, Should | Before PB-4 | BR-001 and BR-002 built; BR-003 to BR-005 layout ready, awaiting founder copy; BR-006 safeguards in force. See below |

## BL-001: Unified media upload

* **Founder feedback.** Replace the separate photo and video options with
  one media selection that detects the file type. Keep processing,
  validation and limits.
* **Current behaviour (before).** Two buttons, Add photo and Add video, each
  with its own file picker.
* **Desired behaviour.** One button. The file type decides the pipeline.
  Text still posts on its own.
* **What was built.** One "Add photo or video" button and one file input.
  When only one kind is switched on, the button says "Add photo" or "Add
  video". The browser's file type, or the extension for files phones hand
  over without a type, routes the file to the existing pipeline: the
  browser-side photo preparation and server image checks, or video
  conversion, resumable upload and server verification. A file that is
  neither is refused with a clear message before anything is sent. A video
  chosen while video is off says so.
* **Classification.** Usability refinement. **Severity and priority:** P2,
  Must.
* **Acceptance criteria.**
  * One media button on phone and desktop.
  * A photo, a HEIC photo, an MP4 and a MOV each take their existing path.
  * A PDF is refused with a message.
  * Text-only posts work.
  * All limits are unchanged: 600 KB photo output, 5 minutes and 110 MB per
    video, server checks.
* **Dependencies.** None.
* **Milestone.** Refinement sprint.
* **Status.** Built (unit and browser journeys updated). Awaiting your
  acceptance.

## BL-002: Link in bio

* **Founder feedback.** Every member may add one optional clickable website
  link, with URL validation.
* **Current behaviour (before).** No member link field. Only advertisers
  had a website.
* **Desired behaviour.** One optional link, added, changed or removed in
  Edit Profile, shown as a clickable link on the profile.
* **What was built.**
  * Migration 20261221000000 adds `social.profile_details.website` and the
    functions `app_set_my_website`, `app_my_website` and
    `app_member_website`.
  * Safe URL rules are enforced in the table and the setter:
    * http or https only; javascript:, data: and every other scheme are
      refused;
    * a real host name, with no user name or password and no localhost;
    * no spaces, quotes or angle brackets;
    * at most 200 characters.
  * A bare address gets https:// added.
  * The link is shown only to active members. It is hidden whenever a
    moderator hides the member's details, and deleted with the account.
  * It opens in a new tab with `nofollow ugc noopener noreferrer`.
* **Classification.** New capability (small). **Severity and priority:**
  P3, Should.
* **Acceptance criteria.**
  * Add, change and remove the link from Edit profile.
  * The profile shows it as a clickable link.
  * An unsafe address is refused with a message.
  * Check 037 and behaviour test 330 pass.
* **Dependencies.** Migration approval at merge (D7), then the staging and
  member Production runs.
* **Milestone.** Refinement sprint.
* **Status.** Built.

## BL-003: Adaptive video display (targeted review)

* **Founder feedback.** Preserve portrait, square and landscape. No
  cropping or stretching. Confirm what is supported today.
* **What already worked.**
  * The player never stretched video (`object-contain`).
  * Its box followed the server's recorded width and height, held to 75% of
    the screen height.
* **Genuine defect found.** A phone's portrait video can carry its rotation
  as metadata.
  * The server reads the frame size before that rotation, so such a video
    could be recorded as landscape.
  * It then showed small, inside a landscape box with bars.
  * Very tall boxes were also held to the screen height by bars rather than
    by narrowing the box.
* **What was built.**
  * The player takes its shape from what the browser actually shows: the
    poster's size before play, and the video's own size, rotation applied,
    once it loads.
  * Tall videos narrow the box instead of adding bars.
  * New conversions bake the rotation into the frames, so the recorded size
    is right from the start.
  * Videos already posted are corrected on display; nothing has to be
    uploaded again.
* **Classification.** Defect plus refinement. **Severity and priority:**
  P2, Must.
* **Acceptance criteria.**
  * A portrait, a square and a landscape video each fill a box of their own
    shape on phone and desktop, uncropped and unstretched.
  * Your existing video shows in its true shape.
* **Dependencies.** None. Frontend only; no function deploy.
* **Milestone.** Refinement sprint.
* **Status.** Built.

## BL-004: Profile video thumbnails (targeted review)

* **Founder feedback.** Videos on the profile show a blank blue screen.
  Profile rendering, or poster generation?
* **Finding.** Profile rendering. The grid tile (`PostTile`) drew a fixed
  cobalt panel with a play mark for every video and never asked for the
  poster. Even a video with a perfect poster showed blue. Poster generation
  was a separate issue, fixed on Nov 27 in PROD-VID-1 (iPhone Safari loaded
  no frame).
* **What was built.**
  * Tiles in Profile and Discover show the poster.
  * A video without a poster, such as your first one, shows its first
    frame. Only the start of the file is read; it is muted and never plays.
  * Each tile has a small video mark with the length.
  * The cobalt panel stays only while the tile loads, or if the video can't
    be shown.
  * Existing videos need no re-upload.
* **Classification.** Defect. **Severity and priority:** P2, Must.
* **Acceptance criteria.**
  * Your profile grid shows a real image for your existing video, with the
    video mark and its length.
  * A new video shows its poster.
* **Dependencies.** None.
* **Milestone.** Refinement sprint.
* **Status.** Built.

## BL-005: Unified profile experience

* **Founder feedback.** One account and one experience. No artificial
  creator and consumer distinction. One optional interests selection,
  categorization when publishing, and the same capabilities for everyone
  under the same rules.
* **Current behaviour (before).**
  * Setup asked "What brings you to Splitpost?" (create, find, both).
  * Edit profile had that question plus a separate "Share your own work"
    card with its own "topics you post about" picker.
  * First steps differed by the answer.
  * Creator goals were hidden until a first post.
* **What was built.**
  * The question is removed from setup and Edit profile. Setup is five
    steps, interests straight after the name.
  * The separate creator setup card and posting-topic picker are gone.
  * One optional interests picker, up to 5, drives discovery as before.
  * Posts are still categorized with the topic picker when publishing.
  * Everyone gets the same first steps: find, follow, Clique, post,
    support.
  * Both goal journeys (Creator goals and Supporter goals, as SP-PRG-001
    defines them) show to every member. A brand-new member's suggested next
    goal still starts with supporting.
  * The invitation link stays in My Split, My Activity.
  * Answers and posting topics already stored are kept, and the server
    still uses them for suggestions. Nothing is deleted.
* **Classification.** Product principle alignment. **Severity and
  priority:** P2, Must.
* **Acceptance criteria.**
  * Nobody is asked whether they create or consume.
  * Edit profile shows picture, name, interests, bio, why follow and
    website.
  * Every member can post, see insights, see both goal journeys and see My
    Split.
  * Discovery suggestions still work.
* **Dependencies.** None. The economic model and eligibility rules are
  untouched.
* **Milestone.** Refinement sprint.
* **Status.** Built.

## BL-006: Automatic public post previews

* **Founder feedback.** Default-enabled previews for eligible public posts,
  with disclosure, privacy controls, withdrawal and moderation safeguards.
  Identify the policy implications first.
* **Current behaviour (before).**
  * Previews needed two things: the project-wide switch (off in member
    Production) and each creator's explicit opt-in.
  * Previews show text only, never media, counts, comments or other
    members.
  * Deleted, hidden, reported and suspended content was already never shown.
* **Policy implications.**
  * This changes the consent model that legal question 27 asks about.
  * The Terms (section 25), the Member Privacy Notice and question 27 are
    updated.
  * The counsel package is now version 2.
  * Visitors see nothing until counsel answers and you turn the
    project-wide switch on.
* **What was built.**
  * Migration 20261222000000: eligible posts can be previewed unless the
    creator switches previews off (`social.preview_optouts`, private).
  * Switching off is immediate. Switching on again records the wording
    shown.
  * Settings, Privacy, sharing and ads explains the default and the
    safeguards.
  * The share button warns a member who switched previews off.
  * Every other safeguard is unchanged, and check 038 confirms each.
* **Text, photo and video support today.** Previews show text only. A post
  with a photo or video shows its caption and the line "This post includes
  a photo or video. Members can see it on Splitpost." Media-only posts
  without text are not previewed. Showing media publicly would be a new
  capability and is not part of this item.
* **Classification.** Policy change. **Severity and priority:** P2, Should.
* **Acceptance criteria.**
  * Settings shows previews on, with the explanation.
  * Switching off stops a preview at once.
  * Check 038 and behaviour test 160 pass.
  * Production visitors still see nothing while the project switch is off.
* **Dependencies.** Counsel's answer to question 27, then your approval for
  the project switch.
* **Milestone.** Built in the sprint. Activation with PB-4 or later.
* **Status.** Built.

## BL-007: Ads and Preferences

* **Founder feedback.** Remove the prominent Ads and Preferences section
  from the profile, and keep the necessary controls in Settings.
* **What was built.**
  * Ad preferences, sharing outside Splitpost and blocked members moved
    from the foot of Edit profile to a Settings page, "Privacy, sharing and
    ads" (`/app/settings/privacy`).
  * It is linked from the Settings list and from Edit profile.
  * The controls, the advertising engine and every privacy protection are
    unchanged.
  * Without choices, ads are still not personalized.
* **Classification.** Usability refinement. **Severity and priority:** P3,
  Should.
* **Acceptance criteria.**
  * Edit profile has no ads section.
  * Settings has the page, with the same controls working.
* **Dependencies.** None.
* **Milestone.** Refinement sprint.
* **Status.** Built.

## BL-008: Referral and external sharing journey (targeted review)

**What the founder saw, and why**

| Behaviour | Cause | Classification |
|---|---|---|
| A referral link says joining is not open | Registration is closed in Production: the reviewed terms are not published (`POLICIES_PUBLISHED`) and the database refuses sign-ups until external access is approved | **Intentional launch control** |
| The "waitlist is not open" message | The waitlist is closed, at both switches, by your Nov 27 decision | **Intentional launch control** |
| The share page offered "Join with this invitation", leading to "Registration opens soon" | A call to action offered as if it worked while joining is closed | **Defect (dead end)** |
| "Join the waitlist" on the closed registration page was plain text, not a link | Missing link | **Defect** |
| Links in shared posts did not work | Post text had no link detection, in the app or on the share page; the share page's Splitpost wordmark was not a link | **Defect** |
| A visitor's referral was dropped if they never opened /register | The code was kept only on the registration page | **Defect** |
| Existing members can sign in from shared links | Sign in and follow was already there | Works |

**What was built**

* Web addresses in posts, in the feed and on the share page, are safe
  clickable links:
  * http, https and www only;
  * open in a new tab, nofollow and noopener;
  * text is never treated as markup.
* The share page's wordmark links to splitpost.ca.
* While joining is closed:
  * the share page and the registration page say plainly that Splitpost
    isn't open to new members yet;
  * they confirm the invitation is saved on the device;
  * they offer sign in, About Splitpost and the waitlist page.
* A referral code on a shared link is kept on the device (first link wins,
  7 days, as on /register).
* The share page no longer nests one main landmark inside another.

**Expected journey, before external access (now)**

1. A visitor opens a shared link.
2. They see "This post isn't available", because previews are off in
   Production.
3. They see an honest "not open yet" message and the referral is kept.
4. They can sign in, read About, or see the waitlist page, which says it
   opens soon.
5. Members sign in and land on the creator.

**Expected journey, after PB-4**

1. A visitor sees the preview, if you turned previews on and the creator
   hasn't switched them off.
2. They tap "Join with this invitation". Registration works with the
   sharer's referral attributed.
3. They go through onboarding: welcome, name, interests, about, people to
   follow, My Split.
4. Without a referral, "Join the waitlist" leads to the waitlist, which is
   open only if you open it.

**Still open, in BL-009.** Referral attribution does not yet cross from
www.splitpost.ca's waitlist into a member registration. The two codes live
in different databases.

* **Classification.** Two defects, the rest launch controls. **Severity and
  priority:** P1 (dead end), Must.
* **Acceptance criteria.**
  * On Production, a shared link and a referral link each lead to a clear
    message with working sign in, About and waitlist links.
  * Links inside posts open.
* **Dependencies.** BL-006 for previews, and BL-009 for waitlist
  attribution.
* **Milestone.** Refinement sprint.
* **Status.** Built.

## BL-009: Waitlist to member journey

* **Founder feedback.** The desired steps:
  1. People join the waitlist.
  2. Their email is verified automatically.
  3. You review verified applicants in Control Center.
  4. You select and approve a cohort.
  5. Splitpost sends personal invitations.
  6. Invitees register and onboard.
  7. Delivery, acceptance, expiry and conversion are tracked.

  Reuse Resend, Supabase and the existing invitations.
* **Current behaviour (targeted review).**
  * **Exists, in the waitlist project:**
    * the waitlist, consents and selections;
    * the join function, with Turnstile and switches;
    * cohort ("wave") tools that pick verified entries only, in the staging
      workflow only;
    * a rule that refuses invitations to unverified addresses.
  * **Exists, in the member project:**
    * `ops.invitations` (email, expiry, sent and accepted times);
    * an open invitation lets that email through account creation;
    * link-based registration with attribution;
    * Control Center invitation links, with uses and joins per link.
  * **Missing:**
    1. No verification email is ever sent, so `email_verified_at` is never
       set and cohorts are always empty.
    2. No Control Center view of applicants. The waitlist is reachable only
       through the GitHub workflow, as counts.
    3. No cohort selection in the app.
    4. No code sends an invitation email or creates an invitation row.
    5. Registering through an invitation does not mark it accepted.
    6. No tracking of email invitations.
    7. No bridge between the two databases.
* **Material decision needed (D1).** The waitlist is in a separate project
  in another region (us-west-2), and member Production is in ca-central-1.
  Reviewing applicants in Control Center means either:
  * **(A) recommended:** copying only verified applicants who consented
    into the member project, at the moment you start a review, by a founder
    run with the usual approval. Each copy is deleted from the waitlist
    project once invited or declined. This is the smallest new trust and
    the clearest privacy story; or
  * **(B):** letting the member app read the waitlist project live, which is
    a new cross-project credential; or
  * **(C):** moving the waitlist into the member project.

  Each changes where personal data lives. That needs your decision and a
  line in the privacy notice (the acquisition notice draft) before it is
  built.
* **Independent of D1, and authorized.**
  * Verification emails from the join function through Resend. You add the
    Resend key as a waitlist function secret.
  * Invitation emails from the member project through Resend.
  * Marking an invitation accepted when its member registers.
  * Delivery, expiry and conversion counts in Control Center.
* **Classification.** Missing functionality. **Severity and priority:** P1
  for PB-4, Must.
* **Acceptance criteria.**
  1. A test applicant on staging joins and verifies by email.
  2. They appear in Control Center.
  3. You approve them into a cohort.
  4. They receive a personal invitation.
  5. They register and onboard.
  6. Control Center shows sent, accepted, expired and conversion.
  7. Nothing is sent in Production until PB-4.
* **Dependencies.**
  * D1.
  * The Resend key on the waitlist project.
  * CASL elements in invitation and verification emails (counsel, question
    23).
  * An updated acquisition privacy notice.
* **Estimated effort.** About 3 to 4 working days after D1:
  * verification email, half a day;
  * applicant transfer, 1 day;
  * Control Center review and cohort, 1 day;
  * invitation sending and tracking, 1 day;
  * tests and journeys, half a day.
* **Milestone.** Before PB-4, in time for Dec 23.
* **Decision (Nov 28).** Option A, with nine safeguards: the waitlist stays
  authoritative; only verified, consenting applicants and the minimum
  information move; a restricted, server-side transfer; no duplicate
  applicants or invitations; automatic expiry and cleanup; consent evidence,
  invitation history, attribution and conversion kept; a recheck before every
  invitation; deletions and withdrawals respected in both projects; the
  privacy notice and counsel package updated. Everything runs from Control
  Center.
* **What was built.** See `docs/WAITLIST-HANDOFF.md`, which maps each safeguard
  to where it is enforced:
  * migration 20261223000000 (waitlist side): verification links, the
    handoff functions, and the `waitlist_handoff` login (six functions, no table);
  * migration 20261224000000 (member side): review copies (30 days at most),
    invitation tracking, acceptance on registration, deletions both ways, and
    founder-only Control Center functions;
  * functions: `join-waitlist` sends the verification email; the new
    `waitlist-handoff` (waitlist project) is the only way in; the new
    `waitlist-bridge` (member project) powers Control Center's Import, Send
    and Delete by email;
  * the public page `/waitlist/verify`, and the Control Center panel
    "Waitlist and invitations";
  * checks 039 and 040, behaviour tests 340 and 350, and staging rollbacks.
* **Status.** Built. Awaiting the one-time setup and the staging acceptance.
  Production stays closed: the database refuses to create an invitation while
  external access is not approved, and `waitlist-bridge` is not approved for
  member Production (`waitlistBridgeFunctionApproved: false`).

## SP-BRAND-003 follow-up (Nov 28): website messaging and hero

The founder's public website refinements of Nov 28. They are kept apart
from the member app (PR #144) and from BL-009, on their own branch
(`claude/sp-brand-website-refine`). Merging publishes the public site, so it
needs the founder's visual approval.

**Naming:** "SP-BRAND-003" already names the Nov 27 landing refinement,
which is accepted and closed (PR #134). This work is recorded as the
"SP-BRAND-003 follow-up (Nov 28)". The founder may prefer to call it
SP-BRAND-004.

| Item | What | Status |
|---|---|---|
| BR-001 | Section 2 replaced with the founder's locked wording, verbatim, one paragraph each. "Everyone contributes. Not everyone gets a split." gets display type and the apricot rule. The old eyebrow and earlier body copy are removed. | **Built.** One sentence ("…billions in advertising revenue.") trips three existing safeguard checks. It is kept word for word and listed as the only exception in `FOUNDER_LOCKED_EXCEPTIONS` (copy.ts), pending counsel review. |
| BR-002 | Hero illustration. The diagonal cut sits near the middle and keeps the logo's geometry. Above the cut is the sample creator's photo post. Below it, followers engage with that post: two comment bubbles (drawn, no words), Like, Save, Share and Follow. The headline is unchanged. | **Built.** No money, amounts or engagement figures. Previews are at 390 px and 1280 px. |
| BR-003 | Ideal creator and supporter pain points | **Layout ready** (`landing/audience.ts`, `PAIN_POINTS`), empty until the founder approves the wording |
| BR-004 | Relatable use cases in Faith & Spirituality, Personal Development, and Business & Entrepreneurship | **Layout ready** (`USE_CASES`, grouped by launch category), empty until approved |
| BR-005 | Each pain point paired with its Splitpost solution | **Layout ready** (`PROBLEM_SOLUTION`), empty until approved |
| BR-006 | Disclosures and claim safeguards | **In force.** Every pilot disclosure is unchanged. The claims checker is unchanged and still runs on every sentence. |

**Filling BR-003 to BR-005:** add the approved entries to
`src/public/landing/audience.ts` exactly as approved, and the optional
headings to `AUDIENCE_HEADINGS`. Then update `landing/audience.test.tsx`,
which pins the lists as empty today. Each block appears inside WHO only once
it has entries.

## Recommendation: what must be resolved before the external pilot

Must be accepted before PB-4: BL-001, BL-003, BL-004, BL-005, BL-008 (all
built) and BL-009 (after D1). BL-002 and BL-007 are built and low risk.
BL-006 is built but stays off for visitors until legal clearance. It does
not block a members-only pilot.
