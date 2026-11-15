// Research figures the homepage may show. Each one is cited, dated and
// verified before it appears, and is shown with its context beside it.
//
// The claims checker (claims.ts) normally rejects any currency amount. A
// figure listed here may carry one, but only in its exact statement, only if
// it is verified and has a source, date and link, and nowhere else on the
// page. Tests in research.test.ts enforce all of that.

export interface ResearchFigure {
  id: string
  /** The large number shown on the card. */
  figure: string
  /** The one sentence shown under it, word for word. */
  statement: string
  /** What the number does and doesn't mean, shown beside it. */
  context: string
  source: {
    publisher: string
    title: string
    /** As shown on the page. */
    date: string
    year: number
    url: string
    /** Who was measured, or how a term in the statement is defined. */
    note: string
  }
  /** True only once the original source has been checked against the statement. */
  verified: boolean
}

export const RESEARCH: readonly ResearchFigure[] = [
  {
    id: 'goldman-professional-creators',
    figure: 'About 4%',
    statement:
      "of the world's estimated 50 million creators were professionals in 2023, which Goldman Sachs defined as creators earning more than $100,000 a year.",
    context: 'Most creators keep posting with far less to show for it.',
    source: {
      publisher: 'Goldman Sachs Research',
      title: 'The creator economy could approach half a trillion dollars by 2027',
      date: 'April 2023',
      year: 2023,
      url: 'https://www.goldmansachs.com/insights/articles/the-creator-economy-could-approach-half-a-trillion-dollars-by-2027',
      note: 'Historical estimates, not current figures.',
    },
    verified: true,
  },
  {
    id: 'nielsen-recommendations',
    figure: '88%',
    statement: 'of people trust recommendations from people they know more than any other source.',
    context: "Recommendations from fans are how good work finds its audience. That's why Leo's matters.",
    source: {
      publisher: 'Nielsen',
      title: 'Trust in Advertising Study',
      date: '2021',
      year: 2021,
      url: 'https://www.nielsen.com/insights/2021/beyond-martech-building-trust-with-consumers-and-engaging-where-sentiment-is-high/',
      note: '40,000 respondents in 51 countries.',
    },
    verified: true,
  },
]

/** The exact sentences allowed to carry a cited figure past the claims checker. */
export function citedStatements(figures: readonly ResearchFigure[] = RESEARCH): string[] {
  return figures.filter((f) => f.verified && f.source.url.startsWith('https://') && f.source.date && f.source.publisher).map((f) => f.statement)
}
