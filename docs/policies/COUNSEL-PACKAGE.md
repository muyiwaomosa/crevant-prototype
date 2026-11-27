> **For qualified Canadian legal counsel. Drafts only: not legally reviewed, not approved, not in force.**

# Splitpost pilot: legal review package

Package version: 1 (Nov 27, 2026). Checklist item L1 in `docs/ACCEPTANCE-CHECKLIST.md`.

## 1. What we are asking for

Splitpost is a connection-driven social media platform operated from
Ontario. We plan to open a small, invitation-only, adult-only (18+
attestation) pilot, targeted for **December 23, 2026**. The size and
composition of the first cohort are pending the founder's approval through
go-to-market planning (currently proposed: 10 to 20 members).
Every earning, pool and payout figure in the pilot is simulated: no money is
collected from members, held, paid or redeemed.

We ask counsel to:

1. Answer the **20 blocking questions** (section 4) in writing. They come
   in two sets: 18 gate external member participation, and 2 gate only
   external advertiser activation. Nobody outside the founding team will be
   invited until set A is answered and any required changes are made.
2. Review the **four member documents** (section 3, items 1 to 4) for an
   invitation-only, adult, simulated-earnings pilot, and confirm or mark up
   each one. The Constitution (item 5) is welcome but does not gate the
   pilot.
3. Say which documents members must accept by clickwrap and which may simply
   be published (question 48).
4. Answer the non-blocking questions where convenient. They gate a wider
   launch or a later feature, not this pilot.

To keep the date, we need written answers to set A and
sign-off (or markups) on documents 1 to 4 by **December 18, 2026**.

## 2. Facts counsel can rely on (as built, Nov 27)

* **Who:** adults only, by self-attestation (no date of birth or ID check).
  Registration is closed. Entry is by personal invitation only, and the
  public waitlist is closed.
* **What members can do:** post text, photos and videos (videos up to 5
  minutes); comment, like, save, repost and share externally; follow creators
  and keep a Clique; report content and appeal moderation decisions; send
  feedback; delete their account.
* **Simulated economics:** Connection Points (recognition points have no
  value; only qualified referrals earn redemption-eligible points, 100 each).
  The **approved internal model** splits eligible content-associated
  advertising revenue 40% creator, 20% fan pool, 40% Splitpost. **What pilot
  members see** is different: simulated amounts only (a creator's simulated
  earnings, an estimated value for eligible points from the simulated fan
  pool), labelled "Simulated", and never the percentages. Whether and how
  the percentages are disclosed is for counsel's advice (Rewards Rules,
  section 10).
* **Progression:** one-time goals for creators and supporters. Completing
  them makes a member eligible for qualification review, not Qualified.
  Qualification is granted only after a successful integrity review and the
  founder's approval, with a recorded reason. Until then the member's
  simulated value shows as Locked; after approval it shows as Unlocked.
  Nothing is ever paid (Rewards Rules, Part G).
* **Advertising:** built, but no external advertiser is active. Regulated
  financial products cannot be advertised or targeted. Targeting never uses
  sensitive information.
* **Data:** stored with Supabase (database and files) and served by Vercel,
  possibly outside Canada. Photos and videos are private and shown only
  through short-lived links. During the pilot there is no separate backup
  copy of photos and videos. Deletions are recorded in a deletion register so
  they survive a database restore.
* **Governance:** during the pilot the founder is the only moderator and the
  only appeal reviewer, and this is disclosed to members.

Where a draft and the product disagree, the product is what happens today.
Please flag any wording that promises more than this.

## 3. Documents in this package (read in this order)

| # | Document | File | Member facing | Version |
|---|---|---|---|---|
| 1 | Terms of Use, Pilot Participation Terms, Content Ownership and IP | `TERMS-OF-USE-DRAFT.md` | Yes | 0.1 |
| 2 | Member Privacy Notice, Data Retention and Deletion | `PRIVACY-NOTICE-MEMBER-DRAFT.md` | Yes | 0.1 |
| 3 | Community Standards, Moderation, Enforcement and Appeals | `COMMUNITY-STANDARDS-DRAFT.md` | Yes | 0.1 |
| 4 | Connection Points and Simulated Rewards Rules, including Referral Integrity, Creator Monetization, Support Intent and (new) Part G: goals, qualification and locked value | `REWARDS-RULES-DRAFT.md` | Yes | 0.1, Part G added Nov 27 |
| 5 | Splitpost Constitution, Stakeholder Rights and Responsibilities | `CONSTITUTION-DRAFT.md` | Yes, published for information | 0.1. Does not gate the pilot |
| 6 | Advertising Policy | `ADVERTISING-POLICY-DRAFT.md` | Advertisers | 0.1. Needed before any external advertiser, not for the members-only pilot |
| 7 | Questions for counsel (49 questions, 20 blocking) | `LEGAL-REVIEW-QUESTIONS.md` | Internal | 0.1, question 49 added Nov 27 |

Background only (wording already folded into document 2; no separate review
needed): `docs/PRIVACY-NOTICE-PILOT-FEEDBACK-DRAFT.md` and
`docs/PRIVACY-NOTICE-PILOT-PHOTOS-DRAFT.md`. The creator acquisition notice
(`docs/PRIVACY-NOTICE-ACQUISITION-DRAFT.md`) covers creator invitation links
on the waitlist. It is included for questions 1, 9 and 23 and is reviewed
before creator links are issued to anyone outside the team.

## 4. The 20 blocking questions, in two separate sets

Full wording, with the non-blocking questions, is in document 7. We ask
counsel to say if any question belongs in the other set.

**Set A: blocks external member participation (18 questions).** No one
outside the founding team is invited, and no invitation or referral link is
sent, until these are answered.

| Area | Questions |
|---|---|
| Privacy: consent, Ontario law, cross-border processing, 18+ attestation, retention after deletion | 1, 2, 3, 4, 5 |
| Consumer protection: simulated values, value of points, contests, lottery, locked value | 12, 13, 14, 15, 49 |
| CASL: invitation emails and referral messages | 23 |
| Intellectual property: the member content licence, public previews | 26, 27 |
| Securities and payments characterization of points and the pool | 31, 32 |
| Pyramid selling and multi-level marketing (referrals) | 35, 36 |
| No statements of compliance or commitments we cannot meet (blocks publishing any document) | 46 |

**Set B: blocks external advertiser activation only (2 questions).** These
gate any campaign with a real external advertiser. Subject to counsel's
advice, they do not hold up the members-only pilot, which has no external
advertiser.

| Area | Questions |
|---|---|
| Advertising: pilot settlement when allocations are simulated; deceptive marketing and sector rules | 20, 21 |

## 5. Placeholders the founder supplies privately (not in this repository)

`[Legal entity name]`, `[Registered address]`, `[Privacy contact email]`,
`[Support contact email]`, `[Effective date]`, `[Processing locations]`.
Counsel is asked to propose values for every `[Retention period: name]`
(question 5). The founder sets every `[parameter: name]` before publication.

## 6. What happens with the answers

Each answer is recorded against its question number. Claude updates the
drafts to match, and the founder approves the business content. The final
text is versioned, published and linked from registration before any
invitation is sent (checklist O7). Passing review does not oblige us to open
the pilot.
