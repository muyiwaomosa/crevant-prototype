import { Link } from 'react-router-dom'
import { ArrowLeft, BarChart3, Gift, Inbox, Users } from 'lucide-react'
import { Card, PageHeader } from '../../components/ui'
import { AudienceOverview } from './AudienceOverview'
import { RewardManager } from './RewardManager'

/**
 * Profile → Creator tools. Optional tools for anyone who has followers or
 * offers rewards. There is no special account type: every participant can open
 * this page. Supporter insights and a redemption inbox are placeholders until
 * Crevant has real, shared accounts.
 */
export function CreatorToolsPage() {
  return (
    <div>
      <Link to="/profile" className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-ink-600 hover:text-ink-900">
        <ArrowLeft className="h-4 w-4" /> Profile
      </Link>
      <PageHeader
        title="Creator tools"
        subtitle="Optional tools for when people follow you. Anyone on Crevant can use them, whenever they're ready."
      />

      <nav aria-label="Creator tools sections" className="no-scrollbar -mx-4 mb-6 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        {[
          ['#rewards', 'Rewards you offer', Gift],
          ['#audience', 'Audience', BarChart3],
          ['#supporters', 'Supporters', Users],
        ].map(([href, label, Icon]) => {
          const I = Icon as typeof Gift
          return (
            <a
              key={href as string}
              href={href as string}
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-white px-3.5 text-sm font-semibold text-ink-700 ring-1 ring-ink-100 hover:ring-ink-200"
            >
              <I className="h-4 w-4" /> {label as string}
            </a>
          )
        })}
      </nav>

      <section id="rewards" aria-labelledby="rewards-title" className="mb-10 scroll-mt-20">
        <h2 id="rewards-title" className="mb-1 font-display text-xl font-bold">
          Rewards you offer
        </h2>
        <p className="mb-4 text-[13px] text-ink-600">Thank people who engage with your posts. They unlock these with CP earned with you.</p>
        <RewardManager />
      </section>

      <section id="audience" aria-labelledby="audience-title" className="mb-10 scroll-mt-20">
        <h2 id="audience-title" className="mb-3 font-display text-xl font-bold">
          Audience overview
        </h2>
        <AudienceOverview />
      </section>

      <section id="supporters" aria-labelledby="supporters-title" className="scroll-mt-20">
        <h2 id="supporters-title" className="mb-3 font-display text-xl font-bold">
          Supporters and redemptions
        </h2>
        <Card className="p-5">
          <div className="flex gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-ink-100 text-ink-600">
              <Inbox className="h-5 w-5" />
            </span>
            <div className="text-sm leading-relaxed text-ink-700">
              <p className="font-semibold text-ink-900">Not in this prototype yet</p>
              <p className="mt-1">
                This is where you'll see who has earned the most CP with you and the rewards they've redeemed, so you can thank them and mark rewards as
                fulfilled.
              </p>
              <p className="mt-2 text-ink-600">
                Right now Crevant runs only in your browser, so nobody else can engage with your posts or earn CP with you. Rather than show made up
                supporters, this section stays empty until Crevant has real, shared accounts.
              </p>
            </div>
          </div>
        </Card>
      </section>
    </div>
  )
}
