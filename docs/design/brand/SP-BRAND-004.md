# SP-BRAND-004: Section 2 wording, hero and value-flow illustrations, creator use-case layout

SP-BRAND-004 covers the founder's public website refinements of Nov 28. It
follows SP-BRAND-003, the Nov 27 landing refinement, which is accepted and
closed (PR #134). It is a website change only. It does not touch the member
app (PR #144), BL-009, the database or any workflow.

**Branch and PR:** `claude/sp-brand-website-refine`, draft PR #145.
Merging publishes the public site, so it needs the founder's visual approval
first.

| Item | What | Status |
|---|---|---|
| BR-001 | Section 2 in the founder's locked wording, verbatim, one paragraph each. "Everyone contributes. Not everyone gets a split." gets display type and the apricot rule. | Built |
| BR-002 | Hero illustration. The cut sits near the middle on the logo's geometry. Above it is the sample post; below it, followers engage with that post: comment bubbles, Like, Save, Share and Follow. No money or figures. | Built; kept as is for visual acceptance |
| Value flow | Section 2 illustration, replacing the "month at a glance" dashboard (founder decision, Nov 28, round 2). Creators and followers make value, platforms control how it is distributed, and not everyone benefits. | Built |
| BR-003 to BR-005 | Layout for pain points, use cases by launch category, and problem to solution (`src/public/landing/audience.ts`) | Layout ready; lists empty until the founder approves the copy |
| BR-006 | Disclosures and claim safeguards | In force, unchanged |

## The value-flow illustration

Its only words are the three approved statements, exactly:

1. "Everyone creates value." (a creator, then followers liking, commenting, saving and sharing, then a spark of value)
2. "Platforms control the split." (a platform standing between that value and the people who made it)
3. "Not everyone benefits." (three outgoing lines: one strong, one thin, one broken)

It has no percentages, earnings figures, currency amounts or money symbols.
The drawing is decorative (`aria-hidden`), and the statements are real text,
so screen readers get the same meaning in the same order. It works from 320
to 1280 px with no sideways scroll.

## The locked "billions" sentence

The sentence: "Together, you generate the attention that platforms turn into
billions in advertising revenue."

It is kept word for word. It is the single exception, by exact match, to
three homepage checks:

* the claims checker's "revenue sharing described as existing today" rule;
* "no statistics";
* "no advertising in WHY".

The exception is `FOUNDER_LOCKED_EXCEPTIONS` in `src/public/landing/copy.ts`.
Every other sentence still goes through every check, and the checker itself
is unchanged. "Billions" is substantiated by the published financial
statements below: each of the two largest platforms alone reported tens of
billions of dollars of advertising revenue in fiscal 2024.

## Sources

The figures below are as stated in each company's own filings with the SEC
(Form 10-K) and earnings releases.

| Company | Document | Fiscal year | Figure, as stated | Line item | URL | Accessed |
|---|---|---|---|---|---|---|
| Meta Platforms, Inc. | Form 10-K, fiscal year ended December 31, 2024 | FY2024 | $160,633 million (2023: $131,948 million) | Advertising (revenue) | https://www.sec.gov/Archives/edgar/data/1326801/000132680125000017/meta-20241231.htm | 2026-11-28 |
| Meta Platforms, Inc. | "Meta Reports Fourth Quarter and Full Year 2024 Results" (Exhibit 99.1) | FY2024 | $160,633 million | Advertising | https://www.sec.gov/Archives/edgar/data/1326801/000132680125000014/meta-12312024xexhibit991.htm | 2026-11-28 |
| Alphabet Inc. | Form 10-K, fiscal year ended December 31, 2024 | FY2024 | $36,147 million (2023: $31,510 million) | YouTube ads | https://www.sec.gov/Archives/edgar/data/1652044/000165204425000014/goog-20241231.htm | 2026-11-28 |
| Alphabet Inc. | "Alphabet Announces Fourth Quarter and Fiscal Year 2024 Results" (Exhibit 99.1) | Q4 2024 | $10,473 million (quarter) | YouTube ads | https://www.sec.gov/Archives/edgar/data/1652044/000165204425000010/googexhibit991q42024.htm | 2026-11-28 |
| Snap Inc. | Form 10-K, fiscal year ended December 31, 2024 | FY2024 | $5,361,398 thousand, total revenue; the filing says substantially all of it is advertising | Revenue | https://www.sec.gov/Archives/edgar/data/1564408/000156440825000019/snap-20241231.htm | 2026-11-28 |

**How these were checked.** The figures were found through web searches
limited to the SEC (sec.gov) and the companies' investor-relations sites.
Each search returned the primary document with the quoted line, and the
figures agree across each company's 10-K and earnings release.

This environment's network policy blocked opening sec.gov,
investor.atmeta.com and abc.xyz directly, so no one here read the filed pages
themselves. **Before publication, someone should open the two Meta and
Alphabet 10-K links above and confirm the lines** (Meta: Revenue, Advertising;
Alphabet: Revenues by type, YouTube ads). Counsel should also confirm that
citing these is sufficient support for "billions in advertising revenue"
without naming companies on the page.

## Filling BR-003 to BR-005

Add the approved entries to `src/public/landing/audience.ts` exactly as
approved, and the optional headings to `AUDIENCE_HEADINGS`. Then update
`src/public/landing/audience.test.tsx`, which pins the lists as empty today.
Each block appears inside WHO only once it has entries.
