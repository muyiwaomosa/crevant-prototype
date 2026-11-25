> **DRAFT v0.1, prepared for review by qualified Canadian legal counsel. Not legally reviewed. Not approved. Not in force.**

# Splitpost policy drafts

This folder holds the first drafts of the documents that will govern the Splitpost pilot: a controlled, adult-only (18+) pilot of a connection-driven social media platform, operated from Ontario, Canada.

Nothing in this folder is published, agreed to by any member, or presented as legal compliance. Each document is a starting point for founder review and for review by qualified Canadian legal counsel.

## 1. Documents

| # | File | What it covers |
|---|---|---|
| 1 | [TERMS-OF-USE-DRAFT.md](TERMS-OF-USE-DRAFT.md) | Member Terms of Use, Pilot Participation Terms, Content Ownership and Intellectual Property |
| 2 | [PRIVACY-NOTICE-MEMBER-DRAFT.md](PRIVACY-NOTICE-MEMBER-DRAFT.md) | Member Privacy Notice, Data Retention and Deletion Procedures |
| 3 | [COMMUNITY-STANDARDS-DRAFT.md](COMMUNITY-STANDARDS-DRAFT.md) | Community Standards, Moderation, Enforcement and Appeals |
| 4 | [CONSTITUTION-DRAFT.md](CONSTITUTION-DRAFT.md) | Splitpost Constitution, Stakeholder Rights and Responsibilities, governance and feedback |
| 5 | [REWARDS-RULES-DRAFT.md](REWARDS-RULES-DRAFT.md) | Connection Points, simulated rewards, referral integrity, creator monetization disclosures, Support Intent |
| 6 | [ADVERTISING-POLICY-DRAFT.md](ADVERTISING-POLICY-DRAFT.md) | Advertising eligibility, prohibited and restricted categories, creative, targeting, reporting, pilot settlement |
| 7 | [LEGAL-REVIEW-QUESTIONS.md](LEGAL-REVIEW-QUESTIONS.md) | Numbered questions for qualified Canadian counsel, with blocking items marked |

## 2. Status

Status columns mean:

* **Drafted:** a written draft exists in this folder.
* **Founder approved:** the founder has approved the business content (not the legal wording).
* **Legally reviewed:** qualified Canadian legal counsel has reviewed the document and its comments have been resolved.
* **Published:** the document is live, versioned and shown to the people it applies to.

| Document | Drafted | Founder approved | Legally reviewed | Published |
|---|---|---|---|---|
| Terms of Use (incl. Pilot Participation, Content and IP) | Yes (v0.1) | No | No | No |
| Member Privacy Notice (incl. Retention and Deletion) | Yes (v0.1) | No | No | No |
| Community Standards (incl. Moderation, Enforcement, Appeals) | Yes (v0.1) | No | No | No |
| Constitution (incl. Stakeholder Rights) | Yes (v0.1) | No | No | No |
| Rewards Rules (incl. Referral, Creator Monetization, Support Intent) | Yes (v0.1) | No | No | No |
| Advertising Policy | Yes (v0.1) | No | No | No |
| Legal Review Questions | Yes (v0.1) | Not applicable | Not applicable | Not applicable (internal) |

Update this table in the same change that moves a document forward. Record the date and the version in the document itself.

## 3. The gating rule

**External participants stay closed until the applicable items are legally reviewed.**

In practice:

1. No person outside the founding team is invited to the pilot, and no referral link is issued to anyone outside it, until every document marked as applying to members (Terms of Use, Member Privacy Notice, Community Standards, Rewards Rules) is **Legally reviewed** and **Published**.
2. No advertiser campaign is activated with a real external advertiser until the Advertising Policy is **Legally reviewed** and the pilot settlement terms placeholder is replaced with reviewed terms.
3. Every question marked **BLOCKING** in [LEGAL-REVIEW-QUESTIONS.md](LEGAL-REVIEW-QUESTIONS.md) has a recorded answer from counsel, and any changes it requires are made, before the activity it blocks begins.
4. The founder can keep registration paused at any time. Passing review does not oblige anyone to open the pilot.

Internal testing by the founding team with test data may continue while documents are in draft, as long as test data stays classified as test data (see the Member Privacy Notice, section on data classification).

## 4. Placeholders used

These placeholders are deliberate. They must be filled in privately before publishing, and must not be filled in with real values in this public repository unless the founder decides they belong in published text.

| Placeholder | Meaning |
|---|---|
| [Legal entity name] | The legal operator of Splitpost |
| [Registered address] | The operator's registered address |
| [Privacy contact email] | Address for privacy requests |
| [Support contact email] | Address for support, appeals and IP complaints |
| [Effective date] | Date a document comes into force |
| [Processing locations] | Countries and regions where service providers store or process data |
| [parameter: name] | A configurable rules value not yet approved by the founder |
| [Retention period: name] | A retention period not yet approved |

## 5. Writing rules for these drafts

* Plain English, short sections, numbered headings.
* No em dashes or en dashes; use commas, colons or parentheses.
* No personal names, email addresses, phone numbers, registration numbers or infrastructure identifiers.
* Do not describe anything as compliant with a law. Describe what Splitpost does, and leave legal characterization to counsel.
* Do not invent economic numbers. Only the founder-approved values listed in the Rewards Rules appear; everything else is a [parameter: name].
* Where these drafts and the code disagree, the code describes what actually happens today. Fix the draft or the code before publishing, never publish a draft that promises something the code does not do.

## 6. Related material elsewhere in the repository

* `src/public/privacy/NoticeBody.tsx`: the published waitlist privacy notice (v1.0). The member notice here reuses its tone and covers the pilot app, not the waitlist.
* `docs/PRIVACY-NOTICE-PILOT-FEEDBACK-DRAFT.md` and `docs/PRIVACY-NOTICE-PILOT-PHOTOS-DRAFT.md`: approved wording that the member notice incorporates.
* `docs/MODERATION.md`, `docs/FEEDBACK.md`, `docs/AVATARS.md`, `docs/PHOTOS.md`, `docs/SOCIAL-CORE.md`: how the pilot actually behaves today.
