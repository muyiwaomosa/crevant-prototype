import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Download, Lightbulb } from 'lucide-react'
import { Card, PageHeader, buttonClass } from '../components/ui'
import { Message, Spinner } from '../public/auth/AuthUi'
import { messageFor, type Audience, type ContributionInsights, type CreatorInsights, type FounderOverview } from './api'
import { useAppApi } from './AppApiContext'
import { InvitationLinksPanel, PrivacyRequestsPanel, RegistrationPanel, SwitchesPanel } from './control'
import { GoalsPanel } from './progression'
import { VideoReadinessPanel } from './video'
import { useFeedbackAccess } from './feedback'
import { simulatedDollars } from './split'

/**
 * Intelligence (IP-8, 20261210000000). Every insight answers three questions:
 * What happened, What it means, What to do next. Figures are labelled as
 * actual, simulated, non-binding or test; simulated outcomes are never
 * presented as evidence of commercial success.
 */

export type Story = { happened: ReactNode; means: string; next: string }

const SOURCE_LABEL: Record<string, string> = {
  discover: 'Discover',
  search: 'Search',
  post: 'A post',
  profile: 'Your profile',
  comment: 'A comment',
  catch_up: 'Catch up',
  other: 'Other',
}

/** The three labelled steps, as in the approved designs. */
export function Steps({ story }: { story: Story }) {
  return (
    <ol className="space-y-3" data-testid="insight-steps">
      <li>
        <StepLabel n={1} text="What happened" />
        <div className="mt-1 text-ink-900">{story.happened}</div>
      </li>
      <li>
        <StepLabel n={2} text="What it means" />
        <Card className="mt-1 p-4 text-[15px] text-ink-800">{story.means}</Card>
      </li>
      <li>
        <StepLabel n={3} text="What to do next" />
        <div className="mt-1 flex gap-3 rounded-3xl border border-[#f3c9a6] bg-spark-50 p-4 text-[15px] text-ink-900">
          <Lightbulb className="mt-0.5 h-5 w-5 shrink-0 text-[#7a3d12]" aria-hidden="true" />
          <p>{story.next}</p>
        </div>
      </li>
    </ol>
  )
}

function StepLabel({ n, text }: { n: number; text: string }) {
  return (
    <p className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-wide text-[#8a4a14]">
      <span className="grid h-6 w-6 place-items-center rounded-full border border-[#f3c9a6] bg-spark-50 text-[12px]" aria-hidden="true">
        {n}
      </span>
      {text}
    </p>
  )
}

export function Tag({ kind }: { kind: 'Actual' | 'Simulated' | 'Non-binding' | 'Test data' | 'Hypothesis' }) {
  const tone =
    kind === 'Actual'
      ? 'bg-brand-50 text-brand-800'
      : kind === 'Simulated'
        ? 'bg-[#e7f4f1] text-[#1f5e52]'
        : kind === 'Hypothesis'
          ? 'bg-[#fff6e6] text-[#6b4300]'
          : 'bg-ink-100 text-ink-700'
  return <span className={`ml-1.5 rounded-full px-2 py-0.5 text-[11px] font-bold ${tone}`}>{kind}</span>
}

const pct = (n: number, d: number) => (d > 0 ? Math.round((100 * n) / d) : 0)

// ---------------------------------------------------------------------------
// The rules behind each insight (pure, tested).

export function attentionStory(i: CreatorInsights): Story {
  const a = i.attention
  const reachPct = pct(a.reached, a.followers)
  const sources = Object.entries(a.sources).sort((x, y) => y[1] - x[1])
  const top = sources[0]
  const happened =
    a.followers === 0
      ? 'You have no followers yet. Everything you post will be in every future follower’s Home.'
      : a.followers === 1
        ? `Every post was available to your follower. ${a.reached === 1 ? 'They saw at least one.' : "They haven't seen one yet."}`
        : `Every post was available to all ${a.followers} followers. ${a.reached} of them saw at least one.`
  let means: string
  const nf = `${a.new_followers} new ${a.new_followers === 1 ? 'follower' : 'followers'}`
  if (a.new_followers > a.new_followers_before) means = `You're growing: ${nf}, up from ${a.new_followers_before} the period before.`
  else if (a.new_followers > 0)
    means = `${nf}, ${a.new_followers_before > a.new_followers ? `down from ${a.new_followers_before}` : 'about the same as before'}.`
  else means = 'No new followers this period.'
  if (top) means += ` Most came from ${SOURCE_LABEL[top[0]] ?? top[0]}.`
  if (a.followers > 0) means += ` ${reachPct}% of followers saw something.`
  let next: string
  if (a.posts === 0) next = 'Post something this week: followers can only see what you share.'
  else if ((a.sources.search ?? 0) === 0 && (a.sources.discover ?? 0) === 0) next = 'Give every post a topic so Discover and search can show it to new people.'
  else if (a.followers > 0 && reachPct < 50) next = 'Post when your followers are around, and ask a question to bring them back.'
  else next = 'Share your best post outside Splitpost: shared links bring new followers.'
  return { happened, means, next }
}

export function retentionStory(i: CreatorInsights): Story {
  const r = i.retention
  const change = r.connections_this_week - r.connections_last_week
  const happened = `${r.connections_this_week} ${r.connections_this_week === 1 ? 'follower' : 'followers'} connected with your posts this week (commented, saved, reposted, shared or opened one), ${change >= 0 ? `up ${change}` : `down ${-change}`} on last week.`
  const means =
    r.followers === 0
      ? 'Connections start with your first followers.'
      : `${r.active_supporters} Active ${r.active_supporters === 1 ? 'Supporter' : 'Supporters'}, ${r.clique} in your Clique, and ${r.returning} returned on more than one day.`
  const next =
    r.active_supporters === 0
      ? 'Reply to the first thoughtful comment you get: replies turn followers into supporters.'
      : r.clique < r.active_supporters
        ? 'Thank your Active Supporters by name; they are the people most likely to join your Clique.'
        : 'End your next post with a question for your Clique.'
  return { happened, means, next }
}

export function moneyStory(i: CreatorInsights, a: Audience | null): Story {
  const m = i.money
  const latest = m.simulated_by_month[0]
  const happened = latest
    ? `Ads shown with your posts would earn you ${simulatedDollars(latest.creator_cents)} for ${monthName(latest.month)}.`
    : 'No ads have been shown with your posts yet.'
  const intents = a?.supportIntentCount ?? 0
  const top = m.ads_with_your_posts[0]
  let means = top
    ? `${top.campaign} (${top.advertiser}) carried most of it: ${top.impressions} impressions.`
    : 'Ad earnings follow valid ad impressions on your posts, not general views.'
  if (intents > 0) means += ` ${intents} ${intents === 1 ? 'person says they' : 'people say they'} would support you (non-binding).`
  const next =
    intents > 0
      ? `Thank your ${intents} ${intents === 1 ? 'supporter' : 'supporters'} in your next post.`
      : 'Keep posting with a topic: ads are matched to topics, never to anything personal.'
  return { happened, means, next }
}

function monthName(iso: string) {
  return new Date(iso + 'T00:00:00Z').toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

export function contributionStory(c: ContributionInsights): Story {
  const happened =
    c.connections_this_week === 0
      ? 'No connections with creators yet this week.'
      : `You connected with ${c.connections_this_week} ${c.connections_this_week === 1 ? 'creator' : 'creators'} this week (last week: ${c.connections_last_week}).`
  const r = c.referrals
  const means =
    r.joined === 0
      ? 'Thoughtful comments, saves, reposts and shares are what creators feel most.'
      : `${r.joined} ${r.joined === 1 ? 'person' : 'people'} joined through your link: ${r.approved} qualified, ${r.waiting_review} waiting for review.`
  const o = c.opportunities[0]
  const next = o ? `Share ${o.creator}'s new post with someone who'd value it.` : 'Find a creator in Discover and leave a thoughtful comment.'
  return { happened, means, next }
}

export function founderStory(o: FounderOverview): Story {
  const w = o.north_star.weeks
  const now = w[w.length - 1]
  const before = w[w.length - 2]
  const change = before && before.connections > 0 ? Math.round((100 * (now.connections - before.connections)) / before.connections) : null
  const dependent = pct(now.founder_dependent, now.connections)
  const happened = `${now.connections} creator-consumer connections this week${change === null ? '' : `, ${change >= 0 ? 'up' : 'down'} ${Math.abs(change)}% on last week`}; ${now.founder_dependent} involve you.`
  const means =
    now.connections === 0
      ? 'No independent connections yet: the pilot still depends on seeding activity.'
      : dependent >= 30
        ? `Growth still leans on you: ${dependent}% of connections involve your account.`
        : `${100 - dependent}% of connections happen without you, a sign of independent engagement.`
  const waiting = Number(o.rewards.referrals_waiting ?? 0)
  const reports = Number(o.governance.open_reports ?? 0)
  const next =
    reports > 0
      ? `Review ${reports} open ${reports === 1 ? 'report' : 'reports'} first.`
      : waiting > 0
        ? `Review ${waiting} qualified ${waiting === 1 ? 'referral' : 'referrals'}.`
        : dependent >= 30
          ? 'Invite a few waitlisted creators to post this week, so connections stop depending on you.'
          : 'Ask your most active creators what would help them post more.'
  return { happened, means, next }
}

// ---------------------------------------------------------------------------
// Creator faces (owner only, on the Profile).

function useCreatorInsights(days: number) {
  const api = useAppApi()
  const [data, setData] = useState<CreatorInsights | null | undefined>(undefined)
  const [error, setError] = useState<unknown>(null)
  useEffect(() => {
    let live = true
    setData(undefined)
    api.creatorInsights(days).then(
      (d) => live && setData(d),
      (e) => live && (setError(e), setData(null)),
    )
    return () => {
      live = false
    }
  }, [api, days])
  return { data, error }
}

function Period({ days, setDays }: { days: number; setDays: (d: number) => void }) {
  return (
    <div role="group" aria-label="Period" className="mb-4 flex gap-2">
      {[7, 28].map((d) => (
        <button
          key={d}
          type="button"
          aria-pressed={days === d}
          onClick={() => setDays(d)}
          className={`min-h-9 rounded-full px-3 text-[13px] font-semibold ${days === d ? 'bg-brand-50 text-brand-800 ring-1 ring-brand-200' : 'bg-white text-ink-700 ring-1 ring-ink-200'}`}
        >
          Last {d} days
        </button>
      ))}
    </div>
  )
}

function FaceShell({
  children,
  days,
  setDays,
  data,
  error,
}: {
  children: (d: CreatorInsights) => ReactNode
  days: number
  setDays: (d: number) => void
  data: CreatorInsights | null | undefined
  error: unknown
}) {
  if (data === undefined) return <Spinner label="Loading your insights…" />
  if (data === null) return error !== null ? <Message tone="error">{messageFor(error)}</Message> : <Message tone="info">Insights aren't available yet.</Message>
  return (
    <div className="space-y-4">
      <Period days={days} setDays={setDays} />
      {children(data)}
    </div>
  )
}

function Ring({ value }: { value: number }) {
  const r = 34
  const c = 2 * Math.PI * r
  return (
    <svg viewBox="0 0 100 100" className="h-28 w-28 shrink-0" role="img" aria-label={`${value}% reached`}>
      <circle cx="50" cy="50" r="44" fill="none" stroke="#a8d9cf" strokeWidth="9" />
      <circle cx="50" cy="50" r={r} fill="none" stroke="#e6ecf8" strokeWidth="9" />
      <circle
        cx="50"
        cy="50"
        r={r}
        fill="none"
        stroke="#2a46a6"
        strokeWidth="9"
        strokeLinecap="round"
        strokeDasharray={`${(c * value) / 100} ${c}`}
        transform="rotate(-90 50 50)"
      />
      <text x="50" y="55" textAnchor="middle" className="fill-ink-900 font-display text-[16px] font-extrabold">
        {value}%
      </text>
    </svg>
  )
}

function Bars({ rows }: { rows: Array<[string, number]> }) {
  const max = Math.max(1, ...rows.map(([, n]) => n))
  return (
    <ul className="space-y-2">
      {rows.map(([label, n]) => (
        <li key={label} className="grid grid-cols-[7rem_1fr_2rem] items-center gap-2 text-[14px]">
          <span className="text-ink-800">{label}</span>
          <span className="h-2.5 rounded-full bg-ink-100" aria-hidden="true">
            <span className="block h-2.5 rounded-full bg-brand-600" style={{ width: `${(100 * n) / max}%` }} />
          </span>
          <span className="text-right font-semibold tabular-nums text-ink-900">{n}</span>
        </li>
      ))}
    </ul>
  )
}

export function AttentionFace() {
  const [days, setDays] = useState(7)
  const { data, error } = useCreatorInsights(days)
  return (
    <FaceShell days={days} setDays={setDays} data={data} error={error}>
      {(i) => {
        const a = i.attention
        const story = attentionStory(i)
        return (
          <div data-testid="attention-face" className="space-y-4">
            <Steps
              story={{
                ...story,
                happened: (
                  <div className="space-y-3">
                    <p className="font-display text-[22px] font-extrabold leading-tight">{story.happened}</p>
                    <Card className="flex items-center gap-4 p-4">
                      <Ring value={pct(a.reached, a.followers)} />
                      <dl className="space-y-2 text-[14px]">
                        <div>
                          <dt className="font-display text-lg font-extrabold">100%</dt>
                          <dd className="text-ink-700">Available. Your posts were in every follower's Home.</dd>
                        </div>
                        <div>
                          <dt className="font-display text-lg font-extrabold">{pct(a.reached, a.followers)}%</dt>
                          <dd className="text-ink-700">Reached. Followers who actually viewed a post.</dd>
                        </div>
                      </dl>
                    </Card>
                    <Card className="p-4">
                      <h3 className="mb-2 font-semibold text-ink-900">
                        Where your {a.new_followers === 1 ? 'new follower' : `${a.new_followers} new followers`} came from
                      </h3>
                      {a.new_followers === 0 ? (
                        <p className="text-[14px] text-ink-600">No new followers in this period.</p>
                      ) : (
                        <Bars
                          rows={Object.entries(a.sources)
                            .sort((x, y) => y[1] - x[1])
                            .map(([k, n]) => [SOURCE_LABEL[k] ?? k, n])}
                        />
                      )}
                    </Card>
                    {a.top_posts.length > 0 && (
                      <Card className="p-4">
                        <h3 className="mb-2 font-semibold text-ink-900">Your posts that travelled furthest</h3>
                        <ul className="space-y-2 text-[14px]">
                          {a.top_posts.map((p) => (
                            <li key={p.id}>
                              <Link to={`/app/post/${p.id}`} className="font-semibold text-ink-900 underline-offset-2 hover:underline">
                                {p.excerpt}
                              </Link>
                              <p className="text-[13px] text-ink-600">
                                {(
                                  [
                                    [p.views, 'view'],
                                    [p.comments, 'comment'],
                                    [p.saves, 'save'],
                                    [p.reposts, 'repost'],
                                    [p.shares, 'share'],
                                  ] as Array<[number, string]>
                                )
                                  .map(([n, w]) => `${n} ${w}${n === 1 ? '' : 's'}`)
                                  .join(' · ')}
                              </p>
                            </li>
                          ))}
                        </ul>
                      </Card>
                    )}
                  </div>
                ),
              }}
            />
          </div>
        )
      }}
    </FaceShell>
  )
}

export function RetentionFace() {
  const [days, setDays] = useState(7)
  const { data, error } = useCreatorInsights(days)
  return (
    <FaceShell days={days} setDays={setDays} data={data} error={error}>
      {(i) => {
        const r = i.retention
        const story = retentionStory(i)
        return (
          <div data-testid="retention-face">
            <Steps
              story={{
                ...story,
                happened: (
                  <div className="space-y-3">
                    <p className="font-display text-[22px] font-extrabold leading-tight">{story.happened}</p>
                    <Card className="p-4">
                      <dl className="grid grid-cols-2 gap-3 text-[14px] sm:grid-cols-4">
                        {[
                          ['Connections this week', r.connections_this_week],
                          ['Active Supporters', r.active_supporters],
                          ['Clique', r.clique],
                          ['Came back on 2+ days', r.returning],
                        ].map(([k, v]) => (
                          <div key={k as string}>
                            <dd className="font-display text-2xl font-extrabold tabular-nums">{v}</dd>
                            <dt className="text-ink-600">{k}</dt>
                          </div>
                        ))}
                      </dl>
                      <p className="mt-3 text-[13px] text-ink-600">
                        Coverage stays 100%: every post is in every follower's Home. Reach is who chose to look. Opening a post counts as a connection; in-feed
                        reading time isn't measured yet, so this can only be an undercount.
                      </p>
                    </Card>
                  </div>
                ),
              }}
            />
          </div>
        )
      }}
    </FaceShell>
  )
}

export function MoneyFace() {
  const api = useAppApi()
  const [days, setDays] = useState(28)
  const { data, error } = useCreatorInsights(days)
  const [aud, setAud] = useState<Audience | null>(null)
  useEffect(() => {
    let live = true
    api.audience().then(
      (x) => live && setAud(x),
      () => undefined,
    )
    return () => {
      live = false
    }
  }, [api])
  return (
    <FaceShell days={days} setDays={setDays} data={data} error={error}>
      {(i) => {
        const m = i.money
        const story = moneyStory(i, aud)
        const latest = m.simulated_by_month[0]
        return (
          <div data-testid="money-face">
            <Steps
              story={{
                ...story,
                happened: (
                  <div className="space-y-3">
                    <p className="font-display text-[22px] font-extrabold leading-tight">{story.happened}</p>
                    <p>
                      <Tag kind="Simulated" /> <span className="text-[13px] text-ink-600">Not paid during the pilot.</span>
                    </p>
                    {latest && (
                      <div data-testid="simulated-earnings">
                        <Card className="p-4">
                          <h3 className="font-semibold text-ink-900">
                            Your simulated share by month <Tag kind="Simulated" />
                          </h3>
                          {/* Equal segments on purpose: the shares themselves aren't shown until the Rewards Rules are legally reviewed. */}
                          <div className="mt-2 grid h-9 grid-cols-3 overflow-hidden rounded-xl text-[13px] font-semibold" aria-label="Shared between you, the fan rewards pool and Splitpost">
                            <span className="grid place-items-center bg-brand-700 text-white">You</span>
                            <span className="grid place-items-center bg-[#a8d9cf] text-ink-900">Fans</span>
                            <span className="grid place-items-center bg-ink-100 text-ink-800">Splitpost</span>
                          </div>
                          <p className="mt-2 text-[13px] text-ink-600">
                            Ads placed with your posts are shared between you, the fan rewards pool and Splitpost. Ads elsewhere in the app aren't part of creator
                            shares.
                          </p>
                          <ul className="mt-3 space-y-1 text-[14px]">
                            {m.simulated_by_month.map((e) => (
                              <li key={e.month} className="flex justify-between">
                                <span>{monthName(e.month)}</span>
                                <span className="font-semibold tabular-nums">{simulatedDollars(e.creator_cents)}</span>
                              </li>
                            ))}
                          </ul>
                          <p className="mt-2 text-[13px] text-ink-700">Nothing is paid during the pilot.</p>
                        </Card>
                      </div>
                    )}
                    {m.ads_with_your_posts.length > 0 && (
                      <Card className="p-4">
                        <h3 className="mb-2 font-semibold text-ink-900">
                          Ads shown with your posts <Tag kind="Actual" />
                        </h3>
                        <ul className="space-y-2 text-[14px]">
                          {m.ads_with_your_posts.map((x) => (
                            <li key={x.campaign + x.advertiser}>
                              <p className="font-semibold">
                                {x.campaign} · {x.advertiser}
                              </p>
                              <p className="text-[13px] text-ink-600">
                                {x.posts} {x.posts === 1 ? 'post' : 'posts'} · {x.impressions} impressions · {x.clicks} clicks
                              </p>
                            </li>
                          ))}
                        </ul>
                      </Card>
                    )}
                    <Card className="p-4 text-[14px]">
                      <p>
                        Actual income <Tag kind="Actual" /> <span className="font-semibold">{simulatedDollars(m.actual_income_cents)}</span>
                      </p>
                      {aud && aud.supportIntentCount > 0 && (
                        <p className="mt-2">
                          Support Intent <Tag kind="Non-binding" /> {aud.supportIntentCount}{' '}
                          {aud.supportIntentCount === 1 ? 'person says they' : 'people say they'} would support you. Nothing is charged.
                        </p>
                      )}
                    </Card>
                  </div>
                ),
              }}
            />
          </div>
        )
      }}
    </FaceShell>
  )
}

// ---------------------------------------------------------------------------
// Consumer: on My Split.

export function ContributionInsight() {
  const api = useAppApi()
  const [c, setC] = useState<ContributionInsights | null>(null)
  useEffect(() => {
    let live = true
    api.myContributionInsights().then(
      (x) => live && setC(x),
      () => undefined,
    )
    return () => {
      live = false
    }
  }, [api])
  if (!c) return null
  const story = contributionStory(c)
  return (
    <div data-testid="contribution-insight">
      <Card className="space-y-3 p-5">
        <h2 className="font-display text-lg font-extrabold text-ink-900">Your week</h2>
        <Steps story={story} />
        {c.referrals.joined > 0 && (
          <p className="text-[13px] text-ink-700">
            Referrals: {c.referrals.joined} joined · {c.referrals.waiting_review} waiting for review · {c.referrals.approved} qualified
            {c.referrals.not_approved > 0 ? ` · ${c.referrals.not_approved} not approved` : ''}
          </p>
        )}
        {c.opportunities.length > 0 && (
          <ul className="space-y-1 text-[14px]">
            {c.opportunities.map((o) => (
              <li key={o.post_id}>
                <Link to={`/app/post/${o.post_id}`} className="font-semibold text-brand-700 underline underline-offset-2">
                  {o.creator}: {o.excerpt}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Founder: the Control Center.

const HYPOTHESES = [
  {
    text: 'Members who choose commercial preferences click relevant ads more often than members shown non-personalized ads.',
    evidence: 'Compare click-through by preference and non-personalized delivery in campaign reports once each has at least 100 impressions.',
  },
  {
    text: 'Creators with a Clique keep more Active Supporters week to week.',
    evidence: 'Track connections and Active Supporters by creator over at least four weeks.',
  },
  {
    text: 'Qualified referrals bring members who make their own connections within 7 days.',
    evidence: 'Activation of referred members versus invited ones, once both have at least 20 members.',
  },
]

function download(name: string, type: string, body: string) {
  const url = URL.createObjectURL(new Blob([body], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function overviewCsv(o: FounderOverview) {
  const lines = ['section,metric,value,kind']
  for (const w of o.north_star.weeks) {
    const d = w.week_start.slice(0, 10)
    lines.push(`north_star,connections ${d},${w.connections},actual`)
    lines.push(`north_star,founder_dependent ${d},${w.founder_dependent},actual`)
    lines.push(`north_star,test ${d},${w.test},test`)
  }
  for (const section of ['members', 'discovery', 'content', 'rewards', 'advertising', 'governance', 'operations'] as const) {
    const s = o[section] as Record<string, unknown>
    for (const [k, v] of Object.entries(s)) if (k !== 'kind') lines.push(`${section},${k},${v ?? ''},${k === 'test_members' ? 'test' : s.kind}`)
  }
  for (const h of HYPOTHESES) lines.push(`hypothesis,"${h.text.replace(/"/g, '""')}",,hypothesis`)
  return lines.join('\n')
}

function Spark({ values }: { values: number[] }) {
  const max = Math.max(1, ...values)
  const pts = values.map((v, i) => `${(i / Math.max(1, values.length - 1)) * 100},${40 - (v / max) * 36}`).join(' ')
  return (
    <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="mt-3 h-12 w-full" aria-hidden="true">
      <polyline points={pts} fill="none" stroke="#a8d9cf" strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

function Stat({ label, value, kind, detail }: { label: string; value: ReactNode; kind: 'Actual' | 'Simulated' | 'Test data'; detail?: string }) {
  return (
    <Card className="p-4">
      <p className="text-[13px] font-semibold text-ink-700">
        {label} <Tag kind={kind} />
      </p>
      <p className="mt-1 font-display text-2xl font-extrabold tabular-nums text-ink-900">{value}</p>
      {detail && <p className="text-[13px] text-ink-600">{detail}</p>}
    </Card>
  )
}

function EcosystemHealth() {
  const api = useAppApi()
  const { founder } = useFeedbackAccess()
  const [o, setO] = useState<FounderOverview | null | undefined>(undefined)
  const [error, setError] = useState<unknown>(null)
  const load = useCallback(async () => {
    try {
      setO(await api.founderOverview())
    } catch (e) {
      setError(e)
    }
  }, [api])
  useEffect(() => {
    if (founder) void load()
  }, [founder, load])
  if (!founder) return <Message tone="info">Only the founder can see this.</Message>
  if (error !== null) return <Message tone="error">{messageFor(error)}</Message>
  if (o === undefined) return <Spinner label="Loading the Control Center…" />
  if (o === null) return <Message tone="info">Intelligence isn't available on this database yet.</Message>
  const weeks = o.north_star.weeks
  const now = weeks[weeks.length - 1]
  const m = o.members as Record<string, number>
  const activation = pct(Number(m.activated ?? 0), Number(m.activation_eligible ?? 0))
  return (
    <>
      <PageHeader
        title="Ecosystem health"
        subtitle={`Week of ${new Date(o.week_start).toLocaleDateString()}. Actual figures; simulated money shown separately; test data excluded.`}
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <button type="button" onClick={() => download('splitpost-overview.csv', 'text/csv', overviewCsv(o))} className={buttonClass('secondary', 'sm')}>
          <Download className="h-4 w-4" aria-hidden="true" /> Export CSV
        </button>
        <button
          type="button"
          onClick={() => download('splitpost-overview.json', 'application/json', JSON.stringify(o, null, 2))}
          className={buttonClass('secondary', 'sm')}
        >
          <Download className="h-4 w-4" aria-hidden="true" /> Export JSON
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2" data-testid="control-center">
        <div className="rounded-3xl bg-brand-700 p-5 text-white sm:col-span-2">
          <p className="text-[13px] font-semibold">
            Weekly Active Creator-Consumer Connections{' '}
            <span className="ml-1 rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-bold">North Star · Actual</span>
          </p>
          <p className="mt-1 font-display text-4xl font-extrabold tabular-nums" data-testid="north-star">
            {now.connections}
          </p>
          <p className="text-[13px] text-[#d3def3]">
            {now.founder_dependent} from founder-dependent activity · {now.test} test-data connections excluded
          </p>
          <Spark values={weeks.map((w) => w.connections)} />
        </div>
        <Stat label="Activation (7 days)" kind="Actual" value={`${activation}%`} detail={`${m.activated ?? 0} of ${m.activation_eligible ?? 0} new members`} />
        <Stat
          label="Registrations"
          kind="Actual"
          value={`${m.registrations_this_week ?? 0} this week`}
          detail={`Cap ${m.registration_cap ?? '?'} · ${m.registration_paused ? 'paused' : 'open'}`}
        />
        <Stat label="Retained this week" kind="Actual" value={m.retained ?? 0} detail="Members connecting this week and last" />
        <Stat label="Test accounts" kind="Test data" value={m.test_members ?? 0} detail="Excluded from every actual figure" />
        <Stat
          label="Search to follow (7 days)"
          kind="Actual"
          value={`${o.discovery.follows_from_search_7d} of ${o.discovery.searches_7d}`}
          detail={`${o.discovery.follows_from_discover_7d} follows from Discover`}
        />
        <Stat
          label="Posts (7 days)"
          kind="Actual"
          value={o.content.posts_7d}
          detail={`${o.content.creators_posting_7d} creators · ${o.content.meaningful_comments_7d} thoughtful comments`}
        />
        <Stat
          label="Fan pool"
          kind="Simulated"
          value={simulatedDollars(Number(o.rewards.open_pool_cents ?? 0))}
          detail={`${o.rewards.referrals_waiting} referrals waiting · reconciled to the cent`}
        />
        <Stat
          label="Ads (7 days)"
          kind="Actual"
          value={`${o.advertising.impressions_7d} impressions`}
          detail={`${o.advertising.clicks_7d} clicks · ${o.advertising.hidden_or_reported_7d} hidden or reported`}
        />
        <Stat
          label="Safety"
          kind="Actual"
          value={`${o.governance.open_reports} reports · ${o.governance.open_appeals} appeals`}
          detail={`${o.governance.active_limits} active limits · ${o.governance.blocks_7d} blocks this week`}
        />
        <Stat label="Operations" kind="Actual" value={o.operations.external_access_approved ? 'External access open' : 'External access closed'} />
      </div>
      <Card className="mt-4 p-5">
        <h2 className="mb-3 font-display text-lg font-bold text-ink-900">
          Founder insight · this week <Tag kind="Actual" />
        </h2>
        <Steps story={founderStory(o)} />
      </Card>
      <Card className="mt-4 p-5">
        <h2 className="font-display text-lg font-bold text-ink-900">
          Business hypotheses <Tag kind="Hypothesis" />
        </h2>
        <p className="text-[13px] text-ink-600">Not validated. Simulated money is never evidence of commercial success.</p>
        <ul className="mt-3 space-y-3 text-[14px]">
          {HYPOTHESES.map((h) => (
            <li key={h.text}>
              <p className="font-semibold text-ink-900">{h.text}</p>
              <p className="text-ink-600">How we'd know: {h.evidence}</p>
            </li>
          ))}
        </ul>
      </Card>
      <p className="mt-4 text-[12px] text-ink-600">{o.north_star.definition}</p>
    </>
  )
}

/** The founder's Control Center: ecosystem health, then the operational tools (20261211000000, 20261212000000). */
export function ControlCenterPage() {
  const { founder } = useFeedbackAccess()
  if (!founder) return <Message tone="info">Only the founder can see this.</Message>
  return (
    <div className="space-y-6">
      <nav aria-label="Control Center sections" className="flex flex-wrap gap-2 text-sm font-semibold">
        <a href="#health" className="rounded-full bg-brand-50 px-3 py-1.5 text-brand-800">
          Health
        </a>
        <a href="#operations" className="rounded-full bg-brand-50 px-3 py-1.5 text-brand-800">
          Registration and links
        </a>
        <Link to="/app/ads" className="rounded-full bg-brand-50 px-3 py-1.5 text-brand-800">
          Advertisers and campaigns
        </Link>
        <Link to="/app/split" className="rounded-full bg-brand-50 px-3 py-1.5 text-brand-800">
          Rewards and reconciliation
        </Link>
        <Link to="/app/moderation" className="rounded-full bg-brand-50 px-3 py-1.5 text-brand-800">
          Moderation
        </Link>
      </nav>
      <section id="health" aria-label="Ecosystem health">
        <EcosystemHealth />
      </section>
      <section id="operations" aria-labelledby="operations-title" className="space-y-4">
        <h2 id="operations-title" className="font-display text-xl font-extrabold text-ink-900">
          Operations
        </h2>
        <RegistrationPanel />
        <InvitationLinksPanel />
        <SwitchesPanel />
        <GoalsPanel />
        <VideoReadinessPanel />
        <PrivacyRequestsPanel />
      </section>
    </div>
  )
}
