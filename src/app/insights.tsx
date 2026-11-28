import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Download, Lightbulb } from 'lucide-react'
import { Card, PageHeader, buttonClass } from '../components/ui'
import { Message, Spinner } from '../public/auth/AuthUi'
import { messageFor, type Audience, type ContributionInsights, type CreatorInsights, type FounderOverview, type SupportChoice } from './api'
import { SUPPORT_LABEL, audienceStory } from './relationships'
import { useAppApi } from './AppApiContext'
import { InvitationLinksPanel, PrivacyRequestsPanel, RegistrationPanel, SwitchesPanel, WaitlistPanel } from './control'
import { ActivationPanel, GoalsPanel } from './progression'
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
// Your Insights (unified, Nov 28): one page, reached from Profile, for every
// member, with no creator or consumer identity to pick. It explains
// performance and what to try next; rewards and progression stay in My Split.
// Every core section is always shown: where there is nothing to count yet it
// says so plainly ("not yet measured") and how to start. Only the existing
// intelligence functions are read; nothing is estimated on the device.

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

function useValue<T>(load: () => Promise<T>, deps: unknown[]) {
  const [v, setV] = useState<T | null | undefined>(undefined)
  useEffect(() => {
    let live = true
    load().then(
      (x) => live && setV(x),
      () => live && setV(null),
    )
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return v
}

function Period({ days, setDays }: { days: number; setDays: (d: number) => void }) {
  return (
    <div role="group" aria-label="Period" className="mb-2 flex gap-2">
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

function Section({ title, kind, testId, children }: { title: string; kind: 'Actual' | 'Non-binding'; testId: string; children: ReactNode }) {
  const id = `insights-${testId}`
  return (
    <section aria-labelledby={id} data-testid={testId} className="mt-5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 id={id} className="font-display text-lg font-bold text-ink-900">
          {title}
        </h2>
        <Tag kind={kind} />
      </div>
      <Card className="space-y-3 p-4 sm:p-5">{children}</Card>
    </section>
  )
}

function Stats({ rows }: { rows: Array<[string, ReactNode]> }) {
  return (
    <dl className={`grid gap-3 ${rows.length === 4 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3'}`}>
      {rows.map(([label, value]) => (
        <div key={label}>
          <dd className="font-display text-2xl font-extrabold tabular-nums text-ink-900">{value}</dd>
          <dt className="text-[13px] leading-snug text-ink-600">{label}</dt>
        </div>
      ))}
    </dl>
  )
}

/** What to do next: the insight's third step, or how to start where nothing is measured yet. */
function Next({ children }: { children: ReactNode }) {
  return (
    <div className="flex gap-3 rounded-2xl border border-[#f3c9a6] bg-spark-50 px-3 py-2.5 text-[14px] text-ink-900" data-testid="insight-next">
      <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-[#7a3d12]" aria-hidden="true" />
      <div>
        <p className="text-[11px] font-bold uppercase tracking-wide text-[#8a4a14]">What to do next</p>
        <div>{children}</div>
      </div>
    </div>
  )
}

/** The three approved questions (IP-8), compact: What happened, What it means, What to do next. */
function MiniSteps({ story }: { story: Story }) {
  return (
    <div className="space-y-2.5" data-testid="insight-steps">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-wide text-ink-600">What happened</p>
        <div className="text-[14px] text-ink-900">{story.happened}</div>
      </div>
      <div>
        <p className="text-[11px] font-bold uppercase tracking-wide text-ink-600">What it means</p>
        <p className="text-[14px] text-ink-800">{story.means}</p>
      </div>
      <Next>{story.next}</Next>
    </div>
  )
}

const UNAVAILABLE = 'This isn’t available yet in the pilot.'

function NotYet({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-2xl bg-paper px-3 py-2 text-[13.5px] text-ink-700" data-testid="not-yet-measured">
      <span className="font-semibold text-ink-900">Not yet measured. </span>
      {children}
    </p>
  )
}

export function InsightsPage() {
  const api = useAppApi()
  const [days, setDays] = useState(7)
  const { data, error } = useCreatorInsights(days)
  const audience = useValue(() => api.audience(), [api])
  const contribution = useValue(() => api.myContributionInsights(), [api])
  return (
    <>
      <Link to="/app/profile" className="mb-3 inline-flex items-center gap-1 text-[14px] font-semibold text-brand-700" data-testid="insights-back">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Your profile
      </Link>
      <PageHeader title="Your Insights" subtitle="How your posts and your support are doing, and what to try next. Only you see this." />
      <Period days={days} setDays={setDays} />
      {data === undefined ? (
        <Spinner label="Loading your insights…" />
      ) : (
        <>
          {data === null && error !== null && <Message tone="error">{messageFor(error)}</Message>}
          <ReachSection i={data} />
          <ContentSection i={data} />
          <AudienceSection i={data} a={audience} />
          <ConnectionSection i={data} />
          <SupportSection c={contribution} />
          <MonetizationSection i={data} />
        </>
      )}
      <p className="mt-5 text-[13px] text-ink-600">
        Your simulated rewards, Connection Points and goals are in{' '}
        <Link to="/app/split" className="font-semibold text-brand-700 underline">
          My Split
        </Link>
        .
      </p>
    </>
  )
}

function ReachSection({ i }: { i: CreatorInsights | null }) {
  if (!i)
    return (
      <Section title="Reach" kind="Actual" testId="attention-face">
        <NotYet>{UNAVAILABLE}</NotYet>
      </Section>
    )
  const a = i.attention
  const story = attentionStory(i)
  return (
    <Section title="Reach" kind="Actual" testId="attention-face">
      <Stats
        rows={[
          ['Posts', a.posts],
          ['Followers', a.followers],
          ['Saw a post', a.reached],
        ]}
      />
      {/* Distribution coverage and actual reach are different things, and are shown apart. */}
      <dl className="space-y-2 rounded-2xl bg-paper px-3 py-2.5 text-[13.5px]" data-testid="coverage-vs-reach">
        <div>
          <dt className="inline font-semibold text-ink-900">Available: </dt>
          <dd className="inline text-ink-700">
            {a.followers === 0 ? 'your posts will be in the Home feed of everyone who follows you.' : `100%. Your posts were in all ${a.followers} followers’ Home feeds.`} Being
            available doesn’t mean being seen.
          </dd>
        </div>
        <div>
          <dt className="inline font-semibold text-ink-900">Reached: </dt>
          <dd className="inline text-ink-700">
            {a.followers === 0 ? 'not yet measured. Reach starts with your first followers.' : `${pct(a.reached, a.followers)}%. ${a.reached} of ${a.followers} actually viewed a post.`}
          </dd>
        </div>
      </dl>
      {a.posts === 0 ? (
        <Next>
          Reach starts with your first post.{' '}
          <Link to="/app/new" className="font-semibold text-brand-700 underline">
            Create a post
          </Link>
        </Next>
      ) : (
        <MiniSteps story={story} />
      )}
    </Section>
  )
}

function ContentSection({ i }: { i: CreatorInsights | null }) {
  if (!i)
    return (
      <Section title="Content" kind="Actual" testId="content-insights">
        <NotYet>{UNAVAILABLE}</NotYet>
      </Section>
    )
  const top = i.attention.top_posts
  return (
    <Section title="Content" kind="Actual" testId="content-insights">
      {top.length === 0 ? (
        <>
          <NotYet>Your posts that travel furthest will be listed here, with their views, comments, saves, reposts and shares.</NotYet>
          <Next>
            Give each post a topic so people who care about it can find it in Discover.{' '}
            <Link to="/app/new" className="font-semibold text-brand-700 underline">
              Create a post
            </Link>
          </Next>
        </>
      ) : (
        <>
          <h3 className="font-semibold text-ink-900">Your posts that travelled furthest</h3>
          <ul className="space-y-2 text-[14px]">
            {top.map((p) => (
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
          <p className="text-[12.5px] text-ink-600">Views count opened posts. Reading time in the feed isn’t measured yet.</p>
        </>
      )}
    </Section>
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

function AudienceSection({ i, a }: { i: CreatorInsights | null; a: Audience | null | undefined }) {
  const story = a ? audienceStory(a) : null
  const support = a ? Object.entries(a.supportByChoice).filter(([, n]) => (n ?? 0) > 0) : []
  const att = i?.attention
  if (!i && !a)
    return (
      <Section title="Audience" kind="Actual" testId="audience-insight">
        <NotYet>{a === undefined ? 'Loading…' : UNAVAILABLE}</NotYet>
      </Section>
    )
  return (
    <Section title="Audience" kind="Actual" testId="audience-insight">
      <Stats
        rows={[
          // Followers and new followers for the chosen period, from the same read as Reach; the audience read adds the rest.
          ['Followers', att ? att.followers : (a?.followerCount ?? 0)],
          [att ? 'New this period' : 'New in 7 days', att ? att.new_followers : (a?.newFollowers7d ?? 0)],
          ['In your Clique', a ? a.cliqueCount : (i?.retention.clique ?? 0)],
          ['Active Supporters', a ? a.activeSupporterCount : (i?.retention.active_supporters ?? 0)],
        ]}
      />
      {att && att.new_followers > 0 ? (
        <div>
          <h3 className="mb-2 font-semibold text-ink-900">
            Where your {att.new_followers === 1 ? 'new follower' : `${att.new_followers} new followers`} came from
          </h3>
          <Bars
            rows={Object.entries(att.sources)
              .sort((x, y) => y[1] - x[1])
              .map(([k, n]) => [SOURCE_LABEL[k] ?? k, n])}
          />
        </div>
      ) : (
        <NotYet>Where new followers find you (Discover, search, a post, your profile) appears here once someone follows you.</NotYet>
      )}
      {a && a.supportIntentCount > 0 && (
        <p className="rounded-2xl border border-dashed border-[#a8d9cf] px-3 py-2 text-[13px] text-ink-800">
          <span className="mr-1.5 rounded-full bg-[#e7f4f1] px-2 py-0.5 text-[11px] font-bold text-[#1f5e52]">Non-binding</span>
          {a.supportIntentCount} {a.supportIntentCount === 1 ? 'person says they' : 'people say they'} would support your work
          {support.length > 0 && `: ${support.map(([c, n]) => `${n} at ${SUPPORT_LABEL[c as SupportChoice] ?? c}`).join(', ')}`}. Nothing is charged.
        </p>
      )}
      {story ? <MiniSteps story={story} /> : <Next>Post with a topic and share your profile link: followers come from Discover, search and shared posts.</Next>}
    </Section>
  )
}

function ConnectionSection({ i }: { i: CreatorInsights | null }) {
  if (!i)
    return (
      <Section title="Connection" kind="Actual" testId="retention-face">
        <NotYet>{UNAVAILABLE}</NotYet>
      </Section>
    )
  const r = i.retention
  const story = retentionStory(i)
  return (
    <Section title="Connection" kind="Actual" testId="retention-face">
      <Stats
        rows={[
          ['Connections this week', r.connections_this_week],
          ['Last week', r.connections_last_week],
          ['Active Supporters', r.active_supporters],
          ['Came back on 2+ days', r.returning],
        ]}
      />
      <p className="text-[12.5px] text-ink-600">
        A connection is a follower who commented, saved, reposted, shared or opened one of your posts. Reading time in the feed isn’t measured yet, so this can
        only be an undercount.
      </p>
      {r.followers === 0 ? (
        <Next>Connections start with your first followers. Post with a topic so Discover can show your work to people who care about it.</Next>
      ) : (
        <MiniSteps story={story} />
      )}
    </Section>
  )
}

function SupportSection({ c }: { c: ContributionInsights | null | undefined }) {
  return (
    <Section title="Your support" kind="Actual" testId="contribution-insight">
      {c === undefined && <p className="text-sm text-ink-600">Loading…</p>}
      {c === null && <NotYet>{UNAVAILABLE}</NotYet>}
      {c && (
        <>
          <Stats
            rows={[
              ['Creators you connected with this week', c.connections_this_week],
              ['Last week', c.connections_last_week],
              ['Joined through your link', c.referrals.joined],
            ]}
          />
          {c.referrals.joined > 0 && (
            <p className="text-[13px] text-ink-700">
              Referrals: {c.referrals.joined} joined · {c.referrals.waiting_review} waiting for review · {c.referrals.approved} qualified
              {c.referrals.not_approved > 0 ? ` · ${c.referrals.not_approved} not approved` : ''}
            </p>
          )}
          {c.connections_this_week === 0 && c.connections_last_week === 0 && (
            <NotYet>Each creator you comment on, save, repost or share counts here.</NotYet>
          )}
          <MiniSteps story={contributionStory(c)} />
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
        </>
      )}
    </Section>
  )
}

function MonetizationSection({ i }: { i: CreatorInsights | null }) {
  if (!i)
    return (
      <Section title="Monetization" kind="Actual" testId="money-face">
        <NotYet>{UNAVAILABLE}</NotYet>
      </Section>
    )
  const m = i.money
  return (
    <Section title="Monetization" kind="Actual" testId="money-face">
      {m.ads_with_your_posts.length === 0 ? (
        <NotYet>No ads have been shown with your posts yet. Ads are matched to post topics, never to anything personal.</NotYet>
      ) : (
        <div>
          <h3 className="mb-2 font-semibold text-ink-900">Ads shown with your posts</h3>
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
        </div>
      )}
      <p className="text-[14px]">
        Actual income <span className="font-semibold">{simulatedDollars(m.actual_income_cents)}</span>{' '}
        <span className="text-[13px] text-ink-600">Nothing is paid during the pilot.</span>
      </p>
      <p className="text-[13px] text-ink-600">
        Ads placed with your posts are shared between you, the fan rewards pool and Splitpost. Your simulated share is in{' '}
        <Link to="/app/split" className="font-semibold text-brand-700 underline">
          My Split
        </Link>
        , with your goals.
      </p>
    </Section>
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
        <WaitlistPanel />
        <SwitchesPanel />
        <GoalsPanel />
        <ActivationPanel />
        <VideoReadinessPanel />
        <PrivacyRequestsPanel />
      </section>
    </div>
  )
}
