# Splitpost requirements traceability: engine baselines to SP-SCOPE-001 Part IV

Source: the approved scope conversation export (private text extract) (line numbers refer to that file). Read-only analysis.

Sources used:
- Engine acceptance criteria tables: DIS 2611-2660, CON 3789-3835 (revised Home at 4039-4134, final list 4137-4173), CNT 4904-4951, RWD 6477-6531, ADV 8323-8368, INT 10470-10524, GOV 12960-13029.
- Engine approved decisions: DIS-D 2868-2884, CON-D 4013-4035, CNT-D 5153-5175, RWD-D 6745-6786, ADV-D 8592-8622, INT-D 10784-10825, GOV-D 13505-13558.
- Consolidated Part IV: FND 13960-13980, DSC 13999-14036, CON 14046-14072, CNT 14083-14109, RWD 14127-14186, ADV 14194-14249, INT-C 14256-14280, GOV-C 14294-14322, BRD 14334-14361; exclusions 14592-14610.
- SP-TA-001 assessment instruction per-WP lists: 16070-16400 (cited as "TA").

Coverage rules:
- **Full**: a Part IV ID states the capability. Detail that appears only in the engine acceptance criteria is noted but not counted against coverage, because the engine baselines say "All previously defined acceptance criteria remain applicable" (e.g. 5222, 6851) and Part IV says groupings "do not supersede the approved requirements or remove any approved capability" (13943-13944).
- **Partial**: a Part IV ID covers part of it, but a distinct rule, control or behaviour is missing.
- **Not represented**: no Part IV ID states it. It may be implied by a generic ID, or appear only in narrative text or in the TA.

Naming: consolidated IDs that collide with engine IDs are prefixed `P4:` (e.g. `P4:CON-06`). Engine IDs are unprefixed.

---

## 1. Crosswalk (104 engine requirements)

### Discovery Engine (DIS, 13)

| Engine ID | Short title | Part IV ID(s) | Coverage | Note |
|---|---|---|---|---|
| DIS-01 | Interest taxonomy | DSC-01 | Full | |
| DIS-02 | Consumer interest selection/management | DSC-02, DSC-03 | Full | Persistence across sessions is in the engine acceptance criteria only (2616). |
| DIS-03 | Creator profile categorization | DSC-04, FND-06 | Full | The value proposition sits under FND-06. |
| DIS-04 | Content categorization | DSC-05 | Partial | Part IV omits the eligibility rule "Content category: Mandatory for discovery eligibility" (2410). The same applies to creator primary categories (2406). Uncategorized posts and creators have no stated treatment. |
| DIS-05 | Personalized interest-based discovery | DSC-06 | Full | |
| DIS-06 | Basic search | DSC-07 | Full | |
| DIS-07 | Fair discovery and rotation | DSC-08 | Full | Rotation is named in TA 16108. |
| DIS-08 | Recommendation transparency | DSC-09 | Full | |
| DIS-09 | Discovery attribution | DSC-10 | Full | |
| DIS-10 | Discovery analytics | DSC-10, INT-C01, INT-C02 | Full | No discovery-specific metric set (impressions, profile visits) is named; it comes through the shared event framework. |
| DIS-11 | Safety and eligibility filtering | DSC-06 ("eligible"), GOV-C04/C05 | Partial | There is no DSC ID for excluding blocked, deleted or restricted content from discovery (2652). It is listed only in TA 16111. |
| DIS-12 | Separation of Home and Discover | (P4:CON-08 indirectly) | Not represented | No Part IV ID states that discovery must not replace or reorder the following feed (2655). It appears only in TA 16123-16124. |
| DIS-13 | Discovery empty states | none | Not represented | It is absent from Part IV and from the TA WP-02 list (16090-16111). |

### Connection Engine (CON, 13; final list 4141-4173, acceptance 3791-3835)

| Engine ID | Short title | Part IV ID(s) | Coverage | Note |
|---|---|---|---|---|
| CON-01 | Following system | P4:CON-01 | Full | |
| CON-02 | Unified Home feed (revised) | P4:CON-04, P4:CON-06, P4:CON-08 | Full | Revised rules at 4114-4128 ("For me", My Clique, Following). |
| CON-03 | Clique membership | P4:CON-02 | Full | "Without duplicate memberships" (3797) is in the engine criteria only. |
| CON-04 | Clique prioritization and feed filters | P4:CON-05, P4:CON-07 | Full | The safeguard "Following filter must remain strictly chronological" and "ordinary followed creators [not] practically invisible" (4126-4128) is not stated in P4:CON-07. |
| CON-05 | Clique management from Home | P4:CON-02, note 14075 | Partial | The note at 14075 covers clique prioritization on Home. No ID covers "view and manage their creator connections" (3803) from Home. |
| CON-06 | Creator audience counts | (INT-C03 implied) | Not represented | "Follower and clique counts accurately reflect current relationships" (3806) has no ID. |
| CON-07 | Reach analytics | INT-C03, P4:CON-08 | Partial | Separating distribution coverage from actual impressions (3809; INT-D04) is not stated in Part IV, only in TA 16158. |
| CON-08 | Contribution attribution | P4:CON-09 | Full | |
| CON-09 | Consumer connection insights | P4:CON-10, INT-C04 | Full | Relationship duration and contribution summary detail is in the engine criteria (3815). |
| CON-10 | Creator connection insights | P4:CON-10, INT-C03 | Full | |
| CON-11 | Relationship controls | P4:CON-01, GOV-C03 | Partial | Muting is not represented anywhere in Part IV. Unfollow and block are covered. |
| CON-12 | Retention measurement | INT-C09 | Partial | INT-C09 measures whether participants return. Engine CON-12 asks for relationship-level cohort retention (3831), and CON-D11 adds churn (3912). |
| CON-13 | Relationship integrity | (FND-10, RWD-12 implied) | Not represented | "Users cannot manipulate membership counts through duplicate actions or unauthorized requests" (3834). P4:RWD-12 covers contributions only. |

### Content Engine (CNT, 13; acceptance 4906-4951)

| Engine ID | Short title | Part IV ID(s) | Coverage | Note |
|---|---|---|---|---|
| CNT-01 | Unified post composer | P4:CNT-01 | Full | |
| CNT-02 | Media handling and playback | P4:CNT-03, P4:CNT-04 | Full | "Understandable failure states" (4910) is in the engine criteria only. |
| CNT-03 | Content management | P4:CNT-12 | Partial | P4:CNT-12 says "manage and delete". Post **editing** (4912, 4845) and the ownership rule "cannot modify another creator's content" are not explicit. |
| CNT-04 | Reusable content card | P4:CNT-05 | Full | |
| CNT-05 | Engagement capabilities | P4:CNT-06, P4:CNT-07, P4:CNT-08 | Full | The engine says "like" (4926). Part IV says "Reactions"; see section 3. |
| CNT-06 | Internal reposting | P4:CNT-09 | Full | |
| CNT-07 | Trackable external sharing | P4:CNT-10 | Full | |
| CNT-08 | Public content previews | P4:CNT-11, BRD-06 | Full | |
| CNT-09 | Distribution attribution | P4:CNT-09, P4:CNT-10, P4:CNT-13 | Partial | The three-way distinction "original creator, distributor and acquisition source" (4938) is not stated. |
| CNT-10 | Consumption tracking | P4:CNT-13 | Full | Separate valid impressions, views and completions (4941) are in the engine criteria. |
| CNT-11 | Monetization attribution | P4:CNT-14, P4:ADV-06 | Full | |
| CNT-12 | Content performance insights | INT-C03 | Full | |
| CNT-13 | Content integrity controls | P4:CNT-11 ("eligible"), GOV-C04/C05 | Partial | No ID states that deleted, blocked or restricted content is excluded from feeds, reposts and public previews (4950). |

### Rewards Engine (RWD, 15; acceptance 6479-6531)

| Engine ID | Short title | Part IV ID(s) | Coverage | Note |
|---|---|---|---|---|
| RWD-01 | Auditable Connection Points ledger | P4:RWD-01, P4:RWD-05 | Full | |
| RWD-02 | Creator-specific attribution | P4:CON-09 | Full | There is no RWD-side ID. Attribution lives in WP-03. |
| RWD-03 | Configurable reward rules | P4:RWD-02, P4:RWD-06 | Full | |
| RWD-04 | Point eligibility distinction | P4:RWD-04, P4:RWD-10 | Partial | "Total points and redemption-eligible points are accurately distinguished" (6488) is not an ID. It appears in TA 16239. |
| RWD-05 | Qualified referral verification | P4:RWD-03, P4:RWD-04 | Full | P4:RWD-04 omits the creator-follow step (5600-5602); see section 3. |
| RWD-06 | Point issuance controls | P4:RWD-06, P4:RWD-12 | Full | |
| RWD-07 | Platform-wide fan pool | P4:RWD-07 | Full | |
| RWD-08 | Dynamic point valuation | P4:RWD-08 | Full | |
| RWD-09 | Simulated monthly settlement | P4:RWD-09, GOV-C08 | Full | "Without exceeding available funds or paying points twice" (6512) is in the engine criteria. |
| RWD-10 | Consumer My Split dashboard | P4:RWD-10, INT-C04 | Full | |
| RWD-11 | Creator earnings dashboard | P4:RWD-11 | Full | "Supporter contributions" (6518) is not in the P4 text. |
| RWD-12 | Non-binding Support Intent | P4:ADV-13 (moved to WP-06) | Partial | P4:ADV-13 drops "create, modify or cancel ... monthly support commitments" (6521). |
| RWD-13 | Rewards administration | GOV-C07, GOV-C08, P4:RWD-05 | Partial | "Review and reverse invalid unsettled transactions with audit records" (6524) has no ID. Reversal is implied only by "adjustment" in P4:RWD-05. |
| RWD-14 | Rewards analytics | INT-C04, INT-C12 | Partial | No ID requires contribution and referral metrics to be reportable independently of simulated financials (6527). RWD-D17 has no ID. |
| RWD-15 | Financial disclosures | BRD-10, GOV-C14 | Partial | BRD-10 covers the public website. No in-product rule says simulated balances "cannot be mistaken for actual withdrawable earnings" (6530) on My Split or the creator dashboard. |

### Advertising Engine (ADV, 15; acceptance 8325-8368)

| Engine ID | Short title | Part IV ID(s) | Coverage | Note |
|---|---|---|---|---|
| ADV-01 | Consumer commercial preferences | P4:ADV-01, P4:ADV-02 | Full | |
| ADV-02 | Managed campaign administration | P4:ADV-03, GOV-C09 | Full | The lifecycle states create, activate, pause and complete (8328) are in the engine criteria only. |
| ADV-03 | Rules-based matching | P4:ADV-05 | Full | |
| ADV-04 | Content-associated placement | P4:ADV-06 | Full | |
| ADV-05 | General feed placement | P4:ADV-07 | Partial | The rule "without removing or reordering eligible organic posts" (8337) is not stated. P4:CON-08 protects access only. |
| ADV-06 | Image and video creatives | P4:ADV-04 | Full | |
| ADV-07 | Delivery controls | P4:ADV-08 | Full | Eligibility limits are named in the engine text (8343). |
| ADV-08 | Transparency and consumer controls | P4:ADV-09, GOV-C02 | Partial | Labeling and reporting are covered. Consumers' ability to **hide** ads (8346) is missing. |
| ADV-09 | Advertising event tracking | P4:ADV-10 | Full | P4:ADV-10 omits **skips** (8349). |
| ADV-10 | Campaign traffic attribution | P4:ADV-10 (clicks) | Full | Outbound traffic to the campaign is implied by click recording. |
| ADV-11 | Manual conversion reconciliation | P4:ADV-11 | Full | "Verification status" (8356) is in the engine criteria. |
| ADV-12 | Advertising revenue attribution | P4:ADV-06, P4:ADV-07, P4:ADV-14, economic model 14165-14184 | Partial | No ID requires content-associated and general feed revenue to be classified correctly (8358). Only the narrative model shows the split. |
| ADV-13 | Campaign performance intelligence | P4:ADV-12, INT-C05 | Full | |
| ADV-14 | Actual vs simulated financial separation | P4:ADV-14, INT-C12 | Full | |
| ADV-15 | Advertising integrity controls | GOV-C09, GOV-C10 | Partial | Prohibited targeting and duplicate economic event prevention or detection (8367) have no ID. |

### Intelligence Engine (INT, 15; acceptance 10472-10524)

| Engine ID | Short title | Part IV ID(s) | Coverage | Note |
|---|---|---|---|---|
| INT-01 | Unified event framework | INT-C01 | Full | |
| INT-02 | Metrics Dictionary | INT-C02 | Full | |
| INT-03 | Shared aggregation logic | INT-C02 | Partial | "Identical metrics produce consistent results across authorized reports" (10478) is not stated. TA 16339 gives the principle only. |
| INT-04 | Creator intelligence | INT-C03 | Full | |
| INT-05 | Consumer intelligence | INT-C04 | Full | |
| INT-06 | Advertiser intelligence | INT-C05, P4:ADV-12 | Full | |
| INT-07 | Founder dashboard | INT-C06 | Full | |
| INT-08 | Cohort reporting | INT-C09 | Full | |
| INT-09 | North Star Metric | INT-C07 | Full | "Without duplication" (10505) and the WACC definition (10883-10885) are not restated. |
| INT-10 | Ecosystem health reporting | INT-C06, GOV-C08 | Partial | The required monitoring of distribution coverage, reward integrity and economic allocation (10508) is not named. |
| INT-11 | Rules-based actionable insights | INT-C10 | Full | |
| INT-12 | Investor performance reporting | INT-C11 | Full | |
| INT-13 | Data classification | INT-C12, FND-11 | Full | INT-C12 omits "staging". FND-11 covers it. |
| INT-14 | Privacy and access controls | FND-10, GOV-C11 | Partial | There is no WP-07 ID for stakeholder-scoped data access ("cannot access unauthorized individual or commercial data", 10520). It is listed in TA 16332 only. |
| INT-15 | Data quality validation | INT-C13 | Full | "Defined test cases" (10523) is in the engine criteria. |

### Governance Engine (GOV, 20; acceptance 12962-13029)

| Engine ID | Short title | Part IV ID(s) | Coverage | Note |
|---|---|---|---|---|
| GOV-01 | Splitpost Constitution | none | Not represented | It is listed in TA 16351 only. |
| GOV-02 | Stakeholder charter | none | Not represented | It is listed in TA 16351 only. |
| GOV-03 | Distribution governance | P4:CON-08, GOV-C14 | Partial | Operational coverage is in P4:CON-08. No governance ID protects the distribution promise or its change rules (GOV-D03). |
| GOV-04 | Economic governance | GOV-C08, GOV-C14 | Full | |
| GOV-05 | Contribution integrity | GOV-C07, P4:RWD-12 | Full | |
| GOV-06 | Community standards | GOV-C14 (implied) | Not represented | No ID requires participation and content policies to be "documented and accessible" (12977). |
| GOV-07 | Reporting and blocking | GOV-C02, GOV-C03 | Full | |
| GOV-08 | Moderation and enforcement | GOV-C04, GOV-C05 | Full | |
| GOV-09 | Appeals and complaints | GOV-C06 | Full | |
| GOV-10 | Advertising governance | GOV-C09, P4:ADV-09 | Partial | Targeting restrictions (12998) have no ID. |
| GOV-11 | Privacy governance | GOV-C11, GOV-C12 | Full | |
| GOV-12 | Security and authorization | FND-10, WP-10 | Full | |
| GOV-13 | Administrative audit | GOV-C10 | Full | |
| GOV-14 | Control Center | GOV-C01 | Full | |
| GOV-15 | Operational governance | GOV-C13 | Partial | GOV-C13 covers identification only. "Investigated and appropriately contained" (13013) is missing. |
| GOV-16 | Change governance | GOV-C14 | Partial | Rules are versioned. Change **classification** (13016; risk classes at 12302) is missing. |
| GOV-17 | Stakeholder feedback | GOV-C06 | Partial | GOV-C06 folds feedback into complaints and appeals. "Submitted, categorized and reviewed" (13019) is not stated. |
| GOV-18 | Pilot policies and disclosures | BRD-10, GOV-C14, FND-07 | Partial | Disclosures are covered. Pilot policies and legal readiness (GOV-D21) have no ID. |
| GOV-19 | Governance intelligence | INT-C06 | Partial | "Required integrity and operational metrics" (13025) and GOV-D23 are not named. |
| GOV-20 | Investor readiness records | GOV-C15 | Full | |

---

## 2. Gaps: engine requirements and approved decisions not fully represented in Part IV

Format: item, then quoted text (line), then the proposed attachment.

### 2.1 Discovery (WP-02)
- **DIS-04 / eligibility of uncategorized content (Partial).** "Content category ... Mandatory for discovery eligibility" (2410). Also "Creator primary categories ... Mandatory for discovery eligibility" (2406). Proposal: amend DSC-05 and DSC-04 to say uncategorized posts and creators are excluded from interest-matched discovery but stay searchable and visible in Home.
- **DIS-11 safety filtering (Partial).** "Blocked, deleted, restricted and otherwise ineligible content does not appear in discovery" (2652). Proposal: add DSC-11 "Discovery eligibility filtering", linked to GOV-C04/C05.
- **DIS-12 / DIS-D01 separation of Home and Discover (Not represented).** "Discovery recommendations do not replace or reorder content in the chronological following feed" (2655). Proposal: add DSC-12, or extend P4:CON-08 with "Discovery never alters Home ordering or eligibility".
- **DIS-13 empty states (Not represented).** "Users without selected interests or matching content receive a useful exploration experience without misleading recommendations" (2658). Proposal: add DSC-13 "Discovery empty states" in WP-02.
- **DIS-D03 three interest data categories (Partial).** "Maintain declared, demonstrated and commercial interest data as distinct categories" (2872). Demonstrated interests have no ID. Proposal: add a note to DSC-02/DSC-06 and an INT-C01 event, per TA 16113-16117.
- **DIS-D09 concentrated launch (Not represented).** "Concentrate initial recruitment around three interest communities" (2884; Faith & Spirituality, Personal Development, Business & Entrepreneurship, 2719-2723). Proposal: attach to BRD-03, BRD-04 and BRD-07 (WP-09) and to DSC-01 taxonomy seeding.

### 2.2 Relationships and Home (WP-03)
- **CON-D01 relationship stages (Partial / conflict).** "Three stages of relationships: following, connection and contribution" (4013). The stages are Follower, Clique connection and "Active supporter ... demonstrate my commitment through meaningful activities" (3078-3084). P4:CON-03 instead lists "Discovery, following and clique" (14050). Proposal: restate P4:CON-03 as Following, Clique Connection and Active Supporter. Derive the Active Supporter state from P4:CON-09 attribution, with no score (CON-D09).
- **CON-05 clique management from Home (Partial).** "Users can view and manage their creator connections" (3803). Clique management is "accessed directly from Home" (4130-4132). Proposal: add a clause to P4:CON-02 or P4:CON-04.
- **CON-06 creator audience counts (Not represented).** "Follower and clique counts accurately reflect current relationships" (3806). Proposal: P4:CON-10, or a new P4:CON-11 "Audience counts", backed by INT-C13.
- **CON-07 / INT-D04 reach vs coverage (Partial).** "Distribution coverage and actual follower impressions are measured separately" (3809). Proposal: INT-C03 and the Metrics Dictionary entry INT-C02.
- **CON-11 muting (Partial).** "Muting, blocking and unfollowing correctly affect feed eligibility and interactions" (3828). Proposal: add muting to P4:CON-07 or GOV-C03.
- **CON-12 retention measurement (Partial).** "Relationship events support cohort-based retention reporting" (3831), plus CON-D11 "connection conversion, relationship activity, churn and retention" (3912). Proposal: extend INT-C09 to relationship-level retention and churn.
- **CON-13 relationship integrity (Not represented).** "Users cannot manipulate membership counts through duplicate actions or unauthorized requests" (3834). Proposal: add P4:CON-11 "Relationship integrity" in WP-03, enforced via FND-10.
- **CON-D03 no fixed clique limit (Partial).** "No fixed clique membership limit" (4017). It appears only in TA 16133. Proposal: a constraint note on P4:CON-02.
- **CON-D09 no weighted connection score (Partial).** "No weighted connection score in the MVP" (4029). It appears only in TA 16160. Proposal: a constraint note in WP-03 and the exclusions table (14592).
- **CON-D10 separate connection from financial eligibility (Partial).** "Separate connection from financial eligibility" (4031); "Do not award redeemable points merely for joining" (3846). Proposal: a constraint on P4:CON-02 and P4:RWD-02.
- **CON-04 safeguard (Partial detail).** "The Following filter must remain strictly chronological" (4127-4128). Proposal: P4:CON-06 and P4:CON-07.

### 2.3 Publishing and engagement (WP-04)
- **CNT-03 post editing and ownership (Partial).** "Creators can edit and delete their own posts but cannot modify another creator's content" (4912). Post editing is in scope (4845). Proposal: reword P4:CNT-12 as "edit and delete own posts; no cross-creator modification". Also clarify that the "Advanced editing" exclusion (14112, 14600) refers to media editing only.
- **CNT-09 distribution attribution (Partial).** "Distinguish original creator, distributor and acquisition source" (4938). Proposal: P4:CNT-09 and P4:CNT-10, plus an INT-C01 event field.
- **CNT-13 / CNT-D12 content integrity (Partial).** "Deleted, blocked or restricted content is excluded from applicable feeds, reposts and public previews" (4950). Proposal: add P4:CNT-15 "Content eligibility enforcement", linked to GOV-C04/C05.
- **CNT-D10 separate content activity from reward eligibility (Partial).** "Separate content activity from reward eligibility" (5171). It appears only in TA 16191. Proposal: a constraint on P4:CNT-13 and P4:RWD-02.

### 2.4 Contributions and rewards (WP-05)
- **RWD-04 point eligibility distinction (Partial).** "Total points and redemption-eligible points are accurately distinguished" (6488). Proposal: add a clause to P4:RWD-01 or P4:RWD-10.
- **RWD-12 / RWD-D14 Support Intent (Partial; moved to P4:ADV-13).** "Consumers can create, modify or cancel non-binding monthly support commitments" (6521). Proposal: restore the full criteria on P4:ADV-13 and cross-reference WP-05.
- **RWD-13 rewards administration (Partial).** "Authorized administrators can review and reverse invalid unsettled transactions with audit records" (6524). Proposal: GOV-C07 and GOV-C08 (review and reversal), plus GOV-C10 (audit).
- **RWD-14 / RWD-D17 rewards analytics (Partial).** "Genuine contribution and referral metrics can be reported independently of simulated financial data" (6527). Proposal: INT-C04, INT-C06 and INT-C12.
- **RWD-15 financial disclosures (Partial).** "Simulated balances and estimated values cannot be mistaken for actual withdrawable earnings" (6530). Proposal: in-product labels on P4:RWD-10 and P4:RWD-11, alongside BRD-10 and GOV-C14.
- **GOV-D04 eligible net revenue definition (Partial).** "Transparent eligible net revenue definition" (13511). The economic model (14168) uses "net eligible" but defines nothing. TA 16229 covers costs, refunds and adjustments. Proposal: a GOV-C14 policy artifact referenced by P4:RWD-07.

### 2.5 Advertising (WP-06)
- **ADV-05 non-displacement (Partial).** "Independent advertisements appear without removing or reordering eligible organic posts" (8337). Proposal: P4:ADV-07.
- **ADV-08 hide ads (Partial).** "Paid placements are clearly labeled and consumers can hide or report them" (8346). Proposal: P4:ADV-09 (hide) and GOV-C02.
- **ADV-12 revenue classification (Partial).** "Content-associated and general feed revenue are correctly classified" (8358). Proposal: P4:ADV-14 or P4:RWD-07.
- **ADV-15 / ADV-D15 advertising integrity (Partial).** "Unauthorized changes, prohibited targeting and duplicate economic events are prevented or detected" (8367). Proposal: GOV-C09 and GOV-C10, plus P4:ADV-05 (targeting restrictions) and INT-C13 (dedup).
- **ADV-D02 commercial vs content interest separation (Partial).** "Separate commercial interests from content interests" (8594). Sensitive interests are "not ... used for personalized advertising targeting" (2020-2021). Proposal: P4:ADV-01 or P4:ADV-05, with GOV-C11.
- **ADV-D10 fixed-price managed campaigns (Not represented in Part IV).** "Fixed-price managed campaign model" (8610). It appears only in TA 16270. Proposal: P4:ADV-03.

### 2.6 Intelligence (WP-07)
- **INT-03 shared aggregation (Partial).** "Identical metrics produce consistent results across authorized reports" (10478). Proposal: INT-C02 and INT-C13.
- **INT-10 ecosystem health (Partial).** "Distribution coverage, reward integrity and economic allocation can be monitored" (10508). Proposal: INT-C06.
- **INT-14 / INT-D16 privacy and access controls (Partial).** "Stakeholders cannot access unauthorized individual or commercial data" (10520). Proposal: add INT-C14 "Intelligence access controls", built on FND-10.
- **INT-D18 sustainable creator income (Not represented).** "Track monetization access and income consistency while formally defining the long-term 25% objective later" (10632). Part IV states the objective (13823) but no measurement ID. Proposal: add INT-C03/INT-C06 metrics plus an INT-C02 dictionary entry ("formal definition" is open per 10914).
- **INT-D17 (Full via consolidated decision 14, 15614).** No action is needed.

### 2.7 Governance (WP-08)
- **GOV-01 / GOV-D01 Constitution (Not represented).** "Foundational operating principles are documented and approved" (12962). Proposal: add GOV-C16 "Constitution and stakeholder charter", or include it in GOV-C14 or GOV-C15.
- **GOV-02 / GOV-D02 stakeholder charter (Not represented).** "Rights, responsibilities and platform commitments are documented" (12965). Proposal: same as GOV-01.
- **GOV-03 / GOV-D03 distribution governance (Partial).** "Eligible content availability follows approved distribution rules" (12968). Proposal: GOV-C14 (versioned distribution rules) linked to P4:CON-08.
- **GOV-06 / GOV-D08 community standards (Not represented).** "Applicable participation and content policies are documented and accessible" (12977). Proposal: add GOV-C17, or a GOV-C14 artifact surfaced in FND-08.
- **GOV-10 targeting restrictions (Partial).** "Campaign approval, disclosure and targeting restrictions are enforced" (12998). Proposal: GOV-C09.
- **GOV-12 (Full).** It is covered by FND-10 and WP-10 security verification.
- **GOV-15 operational governance (Partial).** "Critical failures can be identified, investigated and appropriately contained" (13013). Proposal: extend GOV-C13 with incident response.
- **GOV-16 / GOV-D17 change governance (Partial).** "Material platform rule changes are classified, documented and versioned" (13016). Proposal: add classification to GOV-C14, using the risk classes at 12302.
- **GOV-D18 prospective economic changes (Partial).** "Prospective economic changes and stakeholder communication" (13539). There is a 30-day notice proposal (12399). Proposal: GOV-C14.
- **GOV-17 / GOV-D19 stakeholder feedback (Partial).** "Feedback can be submitted, categorized and reviewed" (13019). Proposal: split feedback from GOV-C06, or add categorization to it.
- **GOV-18 / GOV-D21 pilot policies and legal readiness (Partial).** "Pilot policies and legal readiness before real financial activation" (13554). Proposal: GOV-C14 and WP-10 release gate, plus BRD-10.
- **GOV-19 / GOV-D23 governance intelligence (Partial).** "Required integrity and operational metrics can be reported" (13025). Proposal: INT-C06, with governance metrics in INT-C02.
- **GOV-D07 no recruitment-driven model (Partial).** "No recruitment-driven financial model" (13517). The exclusion covers only multi-level referrals (14602). Proposal: a constraint on P4:RWD-04 and GOV-C14.
- **GOV-D12 purpose-driven data governance (Partial).** "Purpose-driven data governance and privacy controls" (13527). Purpose limitation is not stated in GOV-C11. Proposal: GOV-C11.
- **GOV-D20 financial sustainability (Not represented).** "Financial sustainability as a governance obligation" (13552). Proposal: INT-C06 (founder unit economics) and GOV-C15.

---

## 3. Interpretation conflicts between engine baselines and Part IV

1. **Relationship stages.** CON-D01 (4013) and the narrative (3078-3084) define the stages as Following, Clique connection and Active supporter/contribution. P4:CON-03 (14050) and TA 16130 define them as "discovery, following and clique". Part IV drops the contribution stage and adds discovery, which is not a relationship in the engine model.
2. **ID reuse with different meanings.** Part IV reuses the engine prefixes CON, CNT, RWD and ADV with different numbering. Only INT-C and GOV-C avoid the collision. Examples:
   - Engine CON-06 is audience counts; P4:CON-06 is chronological ordering.
   - Engine CNT-03 is content management; P4:CNT-03 is image posts.
   - Engine RWD-12 is Support Intent; P4:RWD-12 is reward integrity.
   - Engine ADV-05 is general feed placement; P4:ADV-05 is matching.

   This invites mis-traceability. Recommend prefixes such as `CON-W03-xx`, or always qualifying by document.
3. **Support Intent ownership.** It was approved in the Rewards Engine (RWD-12, RWD-D14) and moved to WP-06 as P4:ADV-13. The wording also weakened from "create, modify or cancel non-binding monthly support commitments" (6521) to "express non-binding willingness to support" (14239).
4. **Post editing.** The engine puts post editing in scope (4845, 4912), and only "Built-in video editing" is deferred (4884). Part IV says "manage and delete" (14105) and excludes "Advanced editing" (14112, 14600). That exclusion could be misread as excluding text and post editing.
5. **Likes vs Reactions.** Engine CNT-05 specifies "like, comment and save" (4926). P4:CNT-06 "Reactions" (14093) could be read as several reaction types, which would expand scope.
6. **Qualified referral definition.** The engine model requires that "the new consumer intentionally follows the original creator" (5602), and TA 16234 says "required creator relationship". P4:RWD-04 says only "eligible, verified new-user referrals" (14136).
7. **Ad event set.** Engine ADV-09 lists "impressions, clicks, skips and completions" (8349). P4:ADV-10 lists "Impressions, clicks and applicable completion events" (14221); skips are dropped.
8. **Feedback vs complaints.** Engine GOV-17 is separate from GOV-09. GOV-C06 merges them ("disputes and feedback", 14304), and GOV-C06 is not specified to categorize feedback.
9. **Retention unit.** Engine CON-12 means relationship-level cohort retention. INT-C09 means participant return (14272).
10. **Data classification scope.** INT-13 covers "Actual, simulated, test and staging" (10517). INT-C12 omits staging (14278); FND-11 partly compensates.
11. **Illustrative inconsistencies (non-binding but conflicting).**
    - The early charter mock-up shows "Verified repost outcomes 1,500 CP" as a redeemable points source (1115). This contradicts RWD-D06, under which qualified referrals are the only initial redeemable activity.
    - The mock-up's referral value of "3,000 CP" (1112) differs from "+100 CP" (5994).
    - "One ad after every 8 posts" (7574) is an illustrative parameter, not an approved limit (7589).
    - The "30 days' advance notice" (12399) is a proposed parameter, not approved (12404).

    Part IV fixes none of these values. They should stay configurable.
12. **Creator categorization mandatory vs optional.** The engine makes creator and content categories mandatory for discovery eligibility (2406, 2410). Part IV DSC-04 and DSC-05 do not say whether they are mandatory, while DSC-02 makes consumer interests optional, which is consistent with 2404.

---

## 4. Totals

| Engine | Count | Full | Partial | Not represented |
|---|---|---|---|---|
| Discovery (DIS) | 13 | 9 | 2 | 2 |
| Connection (CON) | 13 | 7 | 4 | 2 |
| Content (CNT) | 13 | 10 | 3 | 0 |
| Rewards (RWD) | 15 | 10 | 5 | 0 |
| Advertising (ADV) | 15 | 11 | 4 | 0 |
| Intelligence (INT) | 15 | 12 | 3 | 0 |
| Governance (GOV) | 20 | 10 | 7 | 3 |
| **Total** | **104** | **69** | **28** | **7** |

The seven requirements not represented are DIS-12, DIS-13, CON-06, CON-13, GOV-01, GOV-02 and GOV-06.

Approved decisions not represented in any Part IV ID: DIS-D09, ADV-D10, INT-D18 and GOV-D20. GOV-D01 and GOV-D02 go with GOV-01 and GOV-02.

Decisions partly represented (they appear only in the TA or in narrative text): DIS-D03, CON-D01 (conflict), CON-D03, CON-D09, CON-D10, CNT-D10, RWD-D17, ADV-D02, ADV-D15, INT-D04, INT-D16, GOV-D03, GOV-D04, GOV-D07, GOV-D08, GOV-D12, GOV-D17, GOV-D18, GOV-D19, GOV-D21 and GOV-D23. All other decisions map to Part IV IDs or Part IV narrative.
