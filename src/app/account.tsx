/**
 * Capabilities of the one member account (20261211000000, 20261212000000):
 *
 *   * AdvertisePage: any member can ask to advertise. The request goes to the
 *     Control Center for managed onboarding and approval; once approved the
 *     member sees their campaigns and aggregate reports. No self-serve
 *     campaign management (outside the MVP).
 *   * PrivacyPage: ask for a copy of your data, a correction, or deletion of
 *     your account, and see where each request stands.
 */
import { useEffect, useId, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Megaphone, ShieldCheck } from 'lucide-react'
import { Card, PageHeader, buttonClass } from '../components/ui'
import { Message, Spinner } from '../public/auth/AuthUi'
import {
  messageFor,
  type AdCategory,
  type AdObjective,
  type AdvertisingRequest,
  type CampaignReport,
  type MemberRequest,
  type MemberRequestKind,
  type MyAdvertising,
} from './api'
import { useAppApi } from './AppApiContext'
import { campaignStory } from './ads'
import { Steps, Tag } from './insights'

const OBJECTIVES: Array<{ value: AdObjective; label: string }> = [
  { value: 'awareness', label: 'More people know about us' },
  { value: 'traffic', label: 'Visits to our website' },
  { value: 'sign_ups', label: 'Sign ups' },
  { value: 'sales', label: 'Sales' },
]

const STATUS_TEXT: Record<string, string> = {
  pending: 'Waiting for review',
  approved: 'Approved',
  declined: 'Not approved',
}

function Back() {
  return (
    <Link to="/app/profile" className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-brand-700">
      <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Profile
    </Link>
  )
}

function Field({
  label,
  hint,
  value,
  onChange,
  max = 300,
  multiline,
  type = 'text',
}: {
  label: string
  hint?: string
  value: string
  onChange: (v: string) => void
  max?: number
  multiline?: boolean
  type?: string
}) {
  const id = useId()
  const cls =
    'mt-1.5 block w-full rounded-2xl border border-ink-200 bg-white px-4 py-3 text-base text-ink-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200'
  const described = hint ? `${id}-hint` : undefined
  return (
    <div>
      <label htmlFor={id} className="text-sm font-semibold text-ink-800">
        {label}
      </label>
      {hint && (
        <p id={`${id}-hint`} className="mt-0.5 text-sm text-ink-500">
          {hint}
        </p>
      )}
      {multiline ? (
        <textarea
          id={id}
          aria-describedby={described}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={max}
          rows={3}
          className={`${cls} resize-none`}
        />
      ) : (
        <input id={id} aria-describedby={described} type={type} value={value} onChange={(e) => onChange(e.target.value)} maxLength={max} className={cls} />
      )}
    </div>
  )
}

const EMPTY: AdvertisingRequest = {
  name: '',
  website: 'https://',
  offering: '',
  problemSolved: '',
  desiredOutcome: '',
  customerNeeds: '',
  objective: 'awareness',
  conversionAction: '',
  eligibilityNotes: '',
  categories: [],
}

function RequestForm({ categories, onSent }: { categories: AdCategory[]; onSent: () => void }) {
  const api = useAppApi()
  const [r, setR] = useState<AdvertisingRequest>(EMPTY)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const set = (patch: Partial<AdvertisingRequest>) => setR((x) => ({ ...x, ...patch }))
  async function submit(e: FormEvent) {
    e.preventDefault()
    const missing = [r.name, r.offering, r.problemSolved, r.desiredOutcome, r.customerNeeds, r.conversionAction].some((v) => !v.trim())
    if (missing) return setProblem('Please answer every question. They help us match your ads to people who want them.')
    if (!/^https:\/\/\S{3,}$/.test(r.website.trim())) return setProblem('Your website starts with https://')
    if (r.categories.length === 0) return setProblem('Choose at least one category for what you sell.')
    setProblem(null)
    setError(null)
    setBusy(true)
    try {
      await api.requestAdvertising(r)
      setR(EMPTY)
      onSent()
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }
  return (
    <form onSubmit={submit} className="space-y-4" noValidate aria-labelledby="ad-request-title">
      <h2 id="ad-request-title" className="font-display text-lg font-extrabold text-ink-900">
        Tell us about your business
      </h2>
      <p className="text-[14px] leading-relaxed text-ink-600">
        The Splitpost team reviews every request and sets up campaigns with you. Ads are shown only to members who chose your category or next to related posts,
        and always marked Sponsored.
      </p>
      <Field label="Business name" value={r.name} onChange={(name) => set({ name })} max={80} />
      <Field label="Website" type="url" value={r.website} onChange={(website) => set({ website })} max={200} />
      <Field label="What do you offer?" value={r.offering} onChange={(offering) => set({ offering })} multiline />
      <Field label="What problem does it solve?" value={r.problemSolved} onChange={(problemSolved) => set({ problemSolved })} multiline />
      <Field label="What do your customers need?" value={r.customerNeeds} onChange={(customerNeeds) => set({ customerNeeds })} multiline />
      <Field label="What outcome do you want for them?" value={r.desiredOutcome} onChange={(desiredOutcome) => set({ desiredOutcome })} multiline />
      <label className="block">
        <span className="text-sm font-semibold text-ink-800">Your main goal</span>
        <select
          value={r.objective}
          onChange={(e) => set({ objective: e.target.value as AdObjective })}
          className="mt-1.5 block min-h-12 w-full rounded-2xl border border-ink-200 bg-white px-4 text-base text-ink-900"
        >
          {OBJECTIVES.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <Field
        label="What should people do after seeing your ad?"
        hint="For example: book a call, start a free trial."
        value={r.conversionAction}
        onChange={(conversionAction) => set({ conversionAction })}
        max={120}
      />
      <fieldset>
        <legend className="text-sm font-semibold text-ink-800">What you sell</legend>
        <p className="mt-0.5 text-sm text-ink-500">Choose the categories that fit. Sensitive categories are never offered.</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {categories.map((c) => {
            const on = r.categories.includes(c.slug)
            return (
              <button
                key={c.slug}
                type="button"
                aria-pressed={on}
                onClick={() => set({ categories: on ? r.categories.filter((x) => x !== c.slug) : [...r.categories, c.slug] })}
                className={
                  on
                    ? 'min-h-11 rounded-full border border-brand-700 bg-brand-700 px-4 text-sm font-semibold text-white'
                    : 'min-h-11 rounded-full border border-ink-200 bg-white px-4 text-sm font-semibold text-ink-800'
                }
              >
                {c.label}
              </button>
            )
          })}
        </div>
      </fieldset>
      <Field
        label="Anything we should know? (optional)"
        hint="For example, who your product is not for."
        value={r.eligibilityNotes ?? ''}
        onChange={(eligibilityNotes) => set({ eligibilityNotes })}
        multiline
      />
      {problem && <Message tone="error">{problem}</Message>}
      {error !== null && <Message tone="error">{messageFor(error)}</Message>}
      <button type="submit" disabled={busy} className={`${buttonClass('primary')} w-full`}>
        {busy ? 'Sending…' : 'Send my request'}
      </button>
    </form>
  )
}

function Row({ label, value, kind }: { label: string; value: string | number; kind?: 'Actual' | 'Simulated' }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-ink-100 py-2 last:border-0">
      <dt className="text-[14px] text-ink-700">
        {label} {kind && <Tag kind={kind} />}
      </dt>
      <dd className="font-semibold tabular-nums text-ink-900">{value}</dd>
    </div>
  )
}

const few = (n: number | null) => (n === null ? 'fewer than 10' : n)

function MyReport({ campaignId }: { campaignId: string }) {
  const api = useAppApi()
  const [r, setR] = useState<CampaignReport | null | undefined>(undefined)
  const [error, setError] = useState<unknown>(null)
  useEffect(() => {
    let live = true
    api.myCampaignReport(campaignId).then(
      (x) => live && setR(x),
      (e) => live && (setError(e), setR(null)),
    )
    return () => {
      live = false
    }
  }, [api, campaignId])
  if (error !== null) return <Message tone="error">{messageFor(error)}</Message>
  if (!r) return <Spinner label="Loading the report…" />
  const w = r.feedbackWithheld
  const hidden = new Set(r.withheld ?? [])
  const n = (key: string, value: number) => (hidden.has(key) ? 'fewer than 10' : value)
  return (
    <div className="mt-3 space-y-3" data-testid="my-campaign-report">
      <Steps
        story={
          hidden.has('impressions')
            ? {
                happened: 'Your ad has started showing, to fewer than 10 people so far.',
                means: 'Figures stay hidden until at least 10 people have seen it, to protect their privacy.',
                next: 'Check back once more members have seen it.',
              }
            : campaignStory(r)
        }
      />
      <dl>
        <Row label="Members who chose your category" value={few(r.eligibleAudience)} kind="Actual" />
        <Row label="People reached" value={few(r.reach)} kind="Actual" />
        <Row label="Valid impressions" value={n('impressions', r.impressions)} kind="Actual" />
        <Row label="Clicks to your site" value={n('clicks', r.clicks)} kind="Actual" />
        <Row label="Click-through" value={r.ctr === null ? 'not yet (needs 10 impressions)' : `${(r.ctr * 100).toFixed(1)}%`} kind="Actual" />
        <Row label="Shown because members chose your category" value={n('by_match.preference.impressions', r.byMatch.preference.impressions)} />
        <Row label="Shown next to related posts" value={n('by_match.context.impressions', r.byMatch.context.impressions)} />
        <Row label="Not personalized" value={n('by_match.general.impressions', r.byMatch.general.impressions)} />
        <Row label="Found it relevant" value={w && r.relevant === 0 ? 'fewer than 10' : r.relevant} />
        <Row
          label="Not relevant, hidden or reported"
          value={w && r.notRelevant + r.hidden + r.reported === 0 ? 'fewer than 10' : r.notRelevant + r.hidden + r.reported}
        />
        <Row label="Verified conversions" value={r.verifiedConversions} kind="Actual" />
        {r.selfReportedConversions !== null && <Row label="Conversions you reported (not verified)" value={r.selfReportedConversions} />}
      </dl>
      <p className="text-[13px] text-ink-500">Totals only. Groups under 10 people are never shown, and nothing identifies a member.</p>
    </div>
  )
}

export function AdvertisePage() {
  const api = useAppApi()
  const [data, setData] = useState<MyAdvertising | null | undefined>(undefined)
  const [categories, setCategories] = useState<AdCategory[] | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [sent, setSent] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  const load = () =>
    api.myAdvertising().then(
      (d) => setData(d),
      (e) => (setError(e), setData(null)),
    )
  useEffect(() => {
    void load()
    api.adCategories().then(
      (c) => setCategories(c),
      () => setCategories([]),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api])
  const pending = data?.requests.some((r) => r.status === 'pending')
  return (
    <>
      <Back />
      <PageHeader title="Advertise with Splitpost" subtitle="Reach members who chose to hear about what you offer. Same account, nothing new to sign up for." />
      {error !== null && <Message tone="error">{messageFor(error)}</Message>}
      {data === undefined && <Spinner label="Loading…" />}
      {data === null && error === null && <Message tone="info">Advertising requests aren't available yet.</Message>}
      {data && (
        <div className="space-y-4">
          {sent && (
            <Message tone="success">
              Thanks. Your request is with the Splitpost team. We'll review it and contact you to set up your first campaign. Nothing is charged during the
              pilot.
            </Message>
          )}
          {data.requests.length > 0 && (
            <Card className="p-5">
              <h2 className="font-display text-lg font-extrabold text-ink-900">Your requests</h2>
              <ul className="mt-3 space-y-3">
                {data.requests.map((r) => (
                  <li key={r.id} className="rounded-2xl bg-paper px-4 py-3">
                    <p className="font-semibold text-ink-900">{r.name}</p>
                    <p className="text-[14px] text-ink-700">{STATUS_TEXT[r.status] ?? r.status}</p>
                    {r.reviewNote && <p className="mt-1 text-[14px] text-ink-600">{r.reviewNote}</p>}
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {data.campaigns.length > 0 && (
            <Card className="p-5">
              <h2 className="font-display text-lg font-extrabold text-ink-900">Your campaigns</h2>
              <ul className="mt-3 space-y-3">
                {data.campaigns.map((c) => (
                  <li key={c.id} className="rounded-2xl border border-ink-100 px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-semibold text-ink-900">{c.name}</p>
                        <p className="text-[13px] text-ink-600">
                          {c.status} · {c.startsOn} to {c.endsOn}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setOpen(open === c.id ? null : c.id)}
                        aria-expanded={open === c.id}
                        className={buttonClass('secondary', 'sm')}
                      >
                        {open === c.id ? 'Hide report' : 'See report'}
                      </button>
                    </div>
                    {open === c.id && <MyReport campaignId={c.id} />}
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {!pending && categories && (
            <Card className="p-5">
              <RequestForm categories={categories} onSent={() => (setSent(true), void load())} />
            </Card>
          )}
          {!pending && !categories && <Spinner label="Loading categories…" />}
          <p className="flex items-start gap-2 text-[13px] text-ink-500">
            <Megaphone className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> Advertising follows the Splitpost Advertising Policy. Members never see your
            ads because of their posts, searches or anything sensitive about them.
          </p>
        </div>
      )}
    </>
  )
}

const KIND_TEXT: Record<MemberRequestKind, { title: string; body: string }> = {
  access: { title: 'A copy of my data', body: "We'll send you what Splitpost holds about you." },
  correction: { title: 'Correct something', body: 'Tell us what is wrong and we will fix it.' },
  deletion: {
    title: 'Delete my account',
    body: 'Your profile, posts, comments and follows are removed. Simulated points are forfeited. This cannot be undone.',
  },
}
const REQUEST_STATUS: Record<MemberRequest['status'], string> = { open: 'Open', completed: 'Done', declined: 'Declined', withdrawn: 'Withdrawn' }

export function PrivacyPage() {
  const api = useAppApi()
  const [requests, setRequests] = useState<MemberRequest[] | null | undefined>(undefined)
  const [kind, setKind] = useState<MemberRequestKind | null>(null)
  const [details, setDetails] = useState('')
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [done, setDone] = useState<string | null>(null)
  const load = () =>
    api.myMemberRequests().then(
      (r) => setRequests(r),
      (e) => (setError(e), setRequests(null)),
    )
  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api])
  async function send(e: FormEvent) {
    e.preventDefault()
    if (!kind) return
    if (kind === 'deletion' && !confirm) return
    setBusy(true)
    setError(null)
    try {
      await api.submitMemberRequest(kind, details)
      setDone(
        kind === 'deletion'
          ? "We've received your request to delete your account. The Splitpost team will confirm with you before anything is removed."
          : "We've received your request.",
      )
      setKind(null)
      setDetails('')
      setConfirm(false)
      await load()
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }
  async function withdraw(id: number) {
    setError(null)
    try {
      await api.withdrawMemberRequest(id)
      await load()
    } catch (err) {
      setError(err)
    }
  }
  return (
    <>
      <Back />
      <PageHeader title="Your data and privacy" subtitle="Ask for a copy of your data, a correction, or to delete your account." />
      {requests === undefined && <Spinner label="Loading…" />}
      {requests === null && error === null && <Message tone="info">Privacy requests aren't available yet.</Message>}
      {error !== null && <Message tone="error">{messageFor(error)}</Message>}
      {done && <Message tone="success">{done}</Message>}
      {requests && (
        <div className="space-y-4">
          <Card className="p-5">
            <form onSubmit={send} className="space-y-4" aria-labelledby="privacy-request-title">
              <h2 id="privacy-request-title" className="flex items-center gap-2 font-display text-lg font-extrabold text-ink-900">
                <ShieldCheck className="h-5 w-5 text-brand-700" aria-hidden="true" /> Make a request
              </h2>
              <fieldset className="space-y-2">
                <legend className="sr-only">What would you like?</legend>
                {(Object.keys(KIND_TEXT) as MemberRequestKind[]).map((k) => (
                  <label
                    key={k}
                    className="flex cursor-pointer gap-3 rounded-2xl border border-ink-200 px-4 py-3 has-[:checked]:border-brand-700 has-[:checked]:bg-brand-50"
                  >
                    <input type="radio" name="kind" value={k} checked={kind === k} onChange={() => (setKind(k), setConfirm(false))} className="mt-1" />
                    <span>
                      <span className="block font-semibold text-ink-900">{KIND_TEXT[k].title}</span>
                      <span className="block text-sm text-ink-600">{KIND_TEXT[k].body}</span>
                    </span>
                  </label>
                ))}
              </fieldset>
              {kind && (
                <Field
                  label={kind === 'correction' ? 'What should we correct?' : 'Anything we should know? (optional)'}
                  value={details}
                  onChange={setDetails}
                  max={1000}
                  multiline
                />
              )}
              {kind === 'deletion' && (
                <label className="flex gap-3 text-[14px] text-ink-800">
                  <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} className="mt-1" />I understand my account and
                  everything I posted will be deleted, and my simulated points forfeited.
                </label>
              )}
              <button
                type="submit"
                disabled={!kind || busy || (kind === 'deletion' && !confirm)}
                className={buttonClass(kind === 'deletion' ? 'danger' : 'primary')}
              >
                {busy ? 'Sending…' : 'Send request'}
              </button>
            </form>
          </Card>
          {requests.length > 0 && (
            <Card className="p-5">
              <h2 className="font-display text-lg font-extrabold text-ink-900">Your requests</h2>
              <ul className="mt-3 space-y-2">
                {requests.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-paper px-4 py-3">
                    <span>
                      <span className="block font-semibold text-ink-900">{KIND_TEXT[r.kind].title}</span>
                      <span className="block text-[13px] text-ink-600">
                        {REQUEST_STATUS[r.status]} · {new Date(r.createdAt).toLocaleDateString()}
                      </span>
                    </span>
                    {r.status === 'open' && (
                      <button type="button" onClick={() => void withdraw(r.id)} className={buttonClass('secondary', 'sm')}>
                        Withdraw
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}
    </>
  )
}
