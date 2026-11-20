import clsx from 'clsx'
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Inbox, MessageSquarePlus } from 'lucide-react'
import { Card, EmptyState, PageHeader, buttonClass } from '../components/ui'
import { Message, Spinner } from '../public/auth/AuthUi'
import {
  AppApiError,
  LIMITS,
  messageFor,
  type Cohort,
  type FeedbackAccess,
  type FeedbackCategory,
  type FeedbackEntry,
  type FeedbackFeature,
  type FeedbackFilters,
  type FeedbackItem,
  type FeedbackStatus,
} from './api'
import { useAppApi } from './AppApiContext'
import { When } from './components'

/**
 * Member feedback and the founder's inbox (Build 5, Stage 5.2c).
 *
 * Any pilot member can send feedback from the header (phones) or the sidebar
 * (larger screens). The form remembers only which part of the app it was
 * opened from, as one name from a fixed list (never the address, a post or a
 * person). The founder sees everything in a private inbox. The database
 * enforces all of it; this file only presents it.
 */

export const CATEGORIES: Array<{ value: FeedbackCategory; label: string; placeholder: string; short: string }> = [
  {
    value: 'problem',
    label: 'Report a problem',
    short: 'Problem',
    placeholder: "What happened, and what did you expect? For example: my post didn't appear on Home after I published it.",
  },
  {
    value: 'improvement',
    label: 'Suggest an improvement',
    short: 'Improvement',
    placeholder: 'What would make Splitpost better for you? For example: let me reorder the people in my Clique.',
  },
  {
    value: 'praise',
    label: 'Share something I like',
    short: 'Something they like',
    placeholder: "What's working well for you? For example: Catch up makes it easy to see what I missed.",
  },
]
export const STATUSES: Array<{ value: FeedbackStatus; label: string }> = [
  { value: 'new', label: 'New' },
  { value: 'reviewing', label: 'Reviewing' },
  { value: 'planned', label: 'Planned' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' },
]
export const COHORTS: Array<{ value: Cohort; label: string }> = [
  { value: 'founder', label: 'Founder' },
  { value: 'creator', label: 'Creator' },
  { value: 'fan', label: 'Fan' },
  { value: 'tester', label: 'Tester' },
]
export const FEATURE_LABELS: Record<FeedbackFeature, string> = {
  home: 'Home',
  discover: 'Discover',
  profile: 'Profile',
  clique: 'Clique',
  post: 'A post',
  create: 'Create post',
  catch_up: 'Catch up',
  other: 'Another page',
}
const categoryLabel = (c: FeedbackCategory) => CATEGORIES.find((x) => x.value === c)?.short ?? c
const statusLabel = (s: FeedbackStatus) => STATUSES.find((x) => x.value === s)?.label ?? s
const cohortLabel = (c: Cohort | null) => (c ? COHORTS.find((x) => x.value === c)?.label ?? c : 'Not recorded')

/**
 * Which part of the app a member address belongs to: one name from the fixed
 * list, never the address itself. null for the feedback pages themselves (the
 * form keeps the part it was opened from).
 */
export function featureFor(pathname: string): FeedbackFeature | null {
  const p = pathname.replace(/\/+$/, '') || '/'
  if (p === '/app') return 'home'
  if (/^\/app\/feedback(\/|$)/.test(p)) return null
  if (/^\/app\/discover(\/|$)/.test(p)) return 'discover'
  if (/^\/app\/(profile|u\/[^/]+)$/.test(p)) return 'profile'
  if (/^\/app\/clique$/.test(p)) return 'clique'
  if (/^\/app\/post\/[^/]+$/.test(p)) return 'post'
  if (/^\/app\/new$/.test(p)) return 'create'
  if (/^\/app\/catch-up\/[^/]+$/.test(p)) return 'catch_up'
  return 'other'
}
const FEATURES = new Set<string>(Object.keys(FEATURE_LABELS))
/** The feature passed by the link that opened the form, if it's one of the allowed names. */
function featureFromState(state: unknown): FeedbackFeature {
  const f = state && typeof state === 'object' ? (state as { feedbackFrom?: unknown }).feedbackFrom : undefined
  return typeof f === 'string' && FEATURES.has(f) ? (f as FeedbackFeature) : 'other'
}

// ---------------------------------------------------------------------------
// Access: whether feedback exists here, and whether the member is the founder.

type Access = FeedbackAccess & { ready: boolean }
const NONE: Access = { available: false, founder: false, ready: true }
const LOADING: Access = { available: false, founder: false, ready: false }
const FeedbackContext = createContext<Access>(NONE)
/** ready is false until the server has answered (never shows "not available" or "not founder" too early). */
export function useFeedbackAccess(): Access {
  return useContext(FeedbackContext)
}
/** Never blocks the app: on a database without feedback, the entry simply isn't shown. */
export function FeedbackProvider({ children }: { children: ReactNode }) {
  const api = useAppApi()
  const [access, setAccess] = useState<Access>(LOADING)
  useEffect(() => {
    let live = true
    api.feedbackAccess().then(
      (a) => live && setAccess({ ...a, ready: true }),
      () => live && setAccess(NONE),
    )
    return () => {
      live = false
    }
  }, [api])
  return <FeedbackContext.Provider value={access}>{children}</FeedbackContext.Provider>
}

/** "Send feedback": in the phone header ("compact") and the sidebar. Remembers the part of the app it's opened from. */
export function SendFeedbackLink({ variant }: { variant: 'header' | 'sidebar' }) {
  const { available } = useFeedbackAccess()
  const location = useLocation()
  if (!available) return null
  const here = featureFor(location.pathname)
  const state = { feedbackFrom: here ?? featureFromState(location.state) }
  if (variant === 'header') {
    return (
      <Link
        to="/app/feedback"
        state={state}
        aria-label="Send feedback"
        className="inline-flex min-h-11 items-center gap-1.5 text-[13px] font-semibold text-brand-700"
      >
        <MessageSquarePlus className="h-[18px] w-[18px]" aria-hidden="true" />
        Feedback
      </Link>
    )
  }
  return (
    <Link
      to="/app/feedback"
      state={state}
      title="Send feedback"
      aria-label="Send feedback"
      className={clsx(
        'flex h-12 items-center justify-center gap-3 rounded-2xl px-3 text-[15px] font-semibold transition lg:justify-start',
        here === null ? 'bg-white text-ink-900 shadow-sm ring-1 ring-ink-100' : 'text-ink-600 hover:bg-white/70 hover:text-ink-900',
      )}
    >
      <MessageSquarePlus className="h-[22px] w-[22px]" strokeWidth={2} aria-hidden="true" />
      <span className="hidden lg:inline">Send feedback</span>
    </Link>
  )
}

const newRequestId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => Math.floor(Math.random() * 16).toString(16))

// ---------------------------------------------------------------------------
// The form.

export function FeedbackPage() {
  const api = useAppApi()
  const { available, founder, ready } = useFeedbackAccess()
  const location = useLocation()
  // Fixed when the form opens, so it can't change while sending.
  const [feature] = useState<FeedbackFeature>(() => featureFromState(location.state))
  const [category, setCategory] = useState<FeedbackCategory | null>(null)
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  // One id per message: a retry after a lost reply is the same message.
  const requestId = useRef(newRequestId())
  const sending = useRef(false)
  const legendId = useId()
  const bodyId = useId()
  const hintId = useId()
  const countId = useId()
  const problemId = useId()
  const successRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (sent) successRef.current?.focus()
  }, [sent])

  const length = [...body.trim()].length
  const chosen = CATEGORIES.find((c) => c.value === category)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (sending.current) return
    setProblem(null)
    if (!category) {
      setProblem(messageFor(new AppApiError('invalid_category')))
      return
    }
    if (length < LIMITS.feedbackMin) {
      setProblem(messageFor(new AppApiError('feedback_too_short')))
      return
    }
    if (length > LIMITS.feedbackMax) {
      setProblem(`Please keep it to ${LIMITS.feedbackMax.toLocaleString()} characters.`)
      return
    }
    sending.current = true
    setBusy(true)
    try {
      await api.sendFeedback({ category, feature, body: body.trim() }, requestId.current)
      requestId.current = newRequestId()
      setSent(true)
      setBody('')
      setCategory(null)
    } catch (err) {
      setProblem(messageFor(err))
    } finally {
      sending.current = false
      setBusy(false)
    }
  }

  return (
    <>
      <PageHeader title="Help us improve Splitpost" subtitle="Your feedback helps us build a better experience for creators and fans." />
      {founder && (
        <p className="-mt-2 mb-4">
          <Link to="/app/feedback/inbox" className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 underline underline-offset-2">
            <Inbox className="h-4 w-4" aria-hidden="true" /> Open the feedback inbox
          </Link>
        </p>
      )}
      {!ready ? (
        <Spinner label="Loading…" />
      ) : !available ? (
        <Message tone="info">{messageFor(new AppApiError('not_available'))}</Message>
      ) : sent ? (
        <Card className="p-5">
          <div ref={successRef} tabIndex={-1} className="outline-none">
            <Message tone="success">Thanks for sharing! Your feedback has been received.</Message>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={() => setSent(false)} className={buttonClass('secondary')}>
              Send more feedback
            </button>
            <Link to="/app" className={buttonClass('ghost')}>
              Back to Home
            </Link>
          </div>
        </Card>
      ) : (
        <Card className="p-5">
          <form onSubmit={submit} noValidate className="space-y-5" aria-describedby={problem ? problemId : undefined}>
            <fieldset aria-labelledby={legendId}>
              <legend id={legendId} className="text-sm font-semibold text-ink-800">
                What would you like to do?
              </legend>
              <div className="mt-2 grid gap-2">
                {CATEGORIES.map((c) => (
                  <label
                    key={c.value}
                    className={clsx(
                      'flex min-h-12 cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 text-[15px] font-semibold',
                      category === c.value ? 'border-brand-600 bg-brand-50 text-ink-900' : 'border-ink-200 bg-white text-ink-800',
                    )}
                  >
                    <input
                      type="radio"
                      name="feedback-category"
                      value={c.value}
                      checked={category === c.value}
                      onChange={() => setCategory(c.value)}
                      className="h-5 w-5 accent-brand-600"
                    />
                    {c.label}
                  </label>
                ))}
              </div>
            </fieldset>
            <div>
              <label htmlFor={bodyId} className="block text-sm font-semibold text-ink-800">
                Tell us more
              </label>
              <p id={hintId} className="mt-0.5 text-sm text-ink-500">
                Required, {LIMITS.feedbackMin} to {LIMITS.feedbackMax.toLocaleString()} characters. Please don't include passwords or other private information.
              </p>
              <textarea
                id={bodyId}
                value={body}
                rows={6}
                required
                aria-required="true"
                aria-invalid={problem !== null && length < LIMITS.feedbackMin ? true : undefined}
                aria-describedby={`${hintId} ${countId}`}
                placeholder={chosen?.placeholder ?? 'Choose an option above, then tell us more.'}
                onChange={(e) => setBody(e.target.value)}
                className="mt-1.5 block w-full resize-y rounded-2xl border border-ink-200 bg-white px-4 py-3 text-base text-ink-900 outline-none placeholder:text-ink-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
              />
              <p id={countId} className={clsx('mt-1 text-right text-[13px] tabular-nums', length > LIMITS.feedbackMax ? 'font-semibold text-[#b42318]' : 'text-ink-500')}>
                {length.toLocaleString()} / {LIMITS.feedbackMax.toLocaleString()}
              </p>
            </div>
            <p className="text-[13px] text-ink-500">
              Sent from: <span className="font-semibold text-ink-700">{FEATURE_LABELS[feature]}</span>. We record which part of Splitpost you were using, along with
              your name and pilot role, to help us understand your feedback.
            </p>
            {problem && (
              <div id={problemId}>
                <Message tone="error">{problem}</Message>
              </div>
            )}
            <button type="submit" disabled={busy} className={buttonClass('primary')}>
              {busy ? 'Sending…' : 'Submit feedback'}
            </button>
          </form>
        </Card>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// The founder's inbox.

function NotFounder() {
  return (
    <EmptyState
      icon={<Inbox className="h-7 w-7" />}
      title="This page isn't available"
      body="It may have been moved, or the link may be wrong."
      action={
        <Link to="/app" className={buttonClass('primary')}>
          Back to your feed
        </Link>
      }
    />
  )
}

function FilterSelect<T extends string>({ label, value, options, onChange }: { label: string; value: T | ''; options: Array<{ value: T; label: string }>; onChange: (v: T | '') => void }) {
  const id = useId()
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="block text-[13px] font-semibold text-ink-700">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value as T | '')}
        className="mt-1 block min-h-11 w-full rounded-xl border border-ink-200 bg-white px-3 text-[15px] text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
      >
        <option value="">All</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  )
}

const CATEGORY_OPTIONS = CATEGORIES.map((c) => ({ value: c.value, label: c.short }))

export function FeedbackInboxPage() {
  const api = useAppApi()
  const { founder, ready } = useFeedbackAccess()
  const [filters, setFilters] = useState<FeedbackFilters>({})
  const [items, setItems] = useState<FeedbackItem[] | undefined>(undefined)
  const [more, setMore] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const load = useCallback(async () => {
    try {
      const rows = await api.feedbackInbox(filters)
      setItems(rows)
      setMore(rows.length === 50)
      setError(null)
    } catch (e) {
      setError(e)
    }
  }, [api, filters])
  useEffect(() => {
    if (founder) void load()
  }, [load, founder])

  if (!ready) return <Spinner label="Loading…" />
  if (!founder) return <NotFounder />
  async function older() {
    const last = items?.[items.length - 1]
    if (!last) return
    setLoadingOlder(true)
    try {
      const rows = await api.feedbackInbox(filters, { createdAt: last.createdAt, id: last.id })
      setItems((x) => [...(x ?? []), ...rows])
      setMore(rows.length === 50)
    } catch (e) {
      setError(e)
    } finally {
      setLoadingOlder(false)
    }
  }
  const filtered = Boolean(filters.category || filters.status || filters.cohort)
  return (
    <>
      <PageHeader title="Feedback inbox" subtitle="What pilot members have sent, newest first. Only you can see this." />
      <div role="group" aria-label="Filter feedback" className="mb-4 grid grid-cols-1 gap-3 min-[400px]:grid-cols-3">
        <FilterSelect label="Category" value={filters.category ?? ''} options={CATEGORY_OPTIONS} onChange={(v) => setFilters((f) => ({ ...f, category: v || undefined }))} />
        <FilterSelect label="Status" value={filters.status ?? ''} options={STATUSES} onChange={(v) => setFilters((f) => ({ ...f, status: v || undefined }))} />
        <FilterSelect label="Role" value={filters.cohort ?? ''} options={COHORTS} onChange={(v) => setFilters((f) => ({ ...f, cohort: v || undefined }))} />
      </div>
      {error !== null && <Message tone="error">{messageFor(error)}</Message>}
      {items === undefined && error === null && <Spinner label="Loading feedback…" />}
      {items && items.length === 0 && (
        <EmptyState
          icon={<Inbox className="h-7 w-7" />}
          title={filtered ? 'Nothing matches these filters' : 'No feedback yet'}
          body={filtered ? 'Try another category, status or role.' : 'Feedback appears here as members send it.'}
        />
      )}
      {items && items.length > 0 && (
        <ul className="space-y-3" aria-label="Feedback, newest first">
          {items.map((f) => (
            <li key={f.id}>
              <Link to={`/app/feedback/inbox/${f.id}`} className="block rounded-[22px] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300">
                <Card className="p-4 hover:ring-ink-200">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-ink-900">{categoryLabel(f.category)}</span>
                    <StatusBadge status={f.status} />
                    <span className="text-[13px] text-ink-500">
                      <When iso={f.createdAt} />
                    </span>
                  </div>
                  <p className="mt-2 line-clamp-3 whitespace-pre-wrap break-words text-[15px] text-ink-800">{f.body}</p>
                  <p className="mt-2 text-[13px] text-ink-500">
                    {f.submitterName ?? 'Deleted account'}
                    {f.submitterUsername ? ` (@${f.submitterUsername})` : ''} · {cohortLabel(f.cohort)} · {FEATURE_LABELS[f.feature]}
                    {f.noteCount > 0 ? ` · ${f.noteCount} ${f.noteCount === 1 ? 'note' : 'notes'}` : ''}
                  </p>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {more && (
        <div className="mt-4">
          <button type="button" onClick={older} disabled={loadingOlder} className={buttonClass('secondary')}>
            {loadingOlder ? 'Loading…' : 'Show older feedback'}
          </button>
        </div>
      )}
    </>
  )
}

function StatusBadge({ status }: { status: FeedbackStatus }) {
  return (
    <span
      className={clsx(
        'rounded-full px-2 py-0.5 text-[12px] font-semibold',
        status === 'new' ? 'bg-brand-50 text-brand-700' : status === 'resolved' || status === 'closed' ? 'bg-ink-100 text-ink-700' : 'bg-[#fff6e6] text-[#6b4300]',
      )}
    >
      {statusLabel(status)}
    </span>
  )
}

export function FeedbackEntryPage() {
  const api = useAppApi()
  const navigate = useNavigate()
  const { founder, ready } = useFeedbackAccess()
  const { id = '' } = useParams()
  const statusId = useId()
  const noteId = useId()
  const [entry, setEntry] = useState<FeedbackEntry | null | undefined>(undefined)
  const [error, setError] = useState<unknown>(null)
  const [status, setStatus] = useState<FeedbackStatus | ''>('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState<'status' | 'note' | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const load = useCallback(async () => {
    try {
      const e = await api.feedbackEntry(id)
      setEntry(e)
      if (e) setStatus(e.status)
      setError(null)
    } catch (e) {
      setError(e)
    }
  }, [api, id])
  useEffect(() => {
    if (founder) void load()
  }, [load, founder])

  if (!ready) return <Spinner label="Loading…" />
  if (!founder) return <NotFounder />
  if (error !== null && entry === undefined) return <Message tone="error">{messageFor(error)}</Message>
  if (entry === undefined) return <Spinner label="Loading feedback…" />
  if (entry === null) return <NotFounder />
  const e = entry

  async function saveStatus() {
    if (!status || status === e.status) return
    setBusy('status')
    setError(null)
    setDone(null)
    try {
      await api.setFeedbackStatus(e.id, status)
      setDone(`Status changed to ${statusLabel(status)}.`)
      await load()
    } catch (err) {
      setError(err)
    } finally {
      setBusy(null)
    }
  }
  async function addNote(ev: FormEvent) {
    ev.preventDefault()
    const t = note.trim()
    setError(null)
    setDone(null)
    if (!t) {
      setError(new AppApiError('note_required'))
      return
    }
    if ([...t].length > LIMITS.feedbackNote) {
      setError(new AppApiError('too_long'))
      return
    }
    setBusy('note')
    try {
      await api.addFeedbackNote(e.id, t)
      setNote('')
      setDone('Note added.')
      await load()
    } catch (err) {
      setError(err)
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <button type="button" onClick={() => navigate('/app/feedback/inbox')} className="mb-3 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-brand-700">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to the inbox
      </button>
      <PageHeader title={categoryLabel(e.category)} subtitle={`Sent ${new Date(e.createdAt).toLocaleString()}. Status: ${statusLabel(e.status)}.`} />
      <Card className="space-y-5 p-5">
        <p className="whitespace-pre-wrap break-words text-[16px] leading-relaxed text-ink-900">{e.body}</p>
        <dl className="grid grid-cols-1 gap-3 text-sm min-[400px]:grid-cols-2">
          <div>
            <dt className="text-ink-500">From</dt>
            <dd className="font-semibold text-ink-900">
              {e.submitterName ?? 'Deleted account'}
              {e.submitterUsername ? ` (@${e.submitterUsername})` : ''}
            </dd>
          </div>
          <div>
            <dt className="text-ink-500">Role when sent</dt>
            <dd className="font-semibold text-ink-900">{cohortLabel(e.cohort)}</dd>
          </div>
          <div>
            <dt className="text-ink-500">Sent from</dt>
            <dd className="font-semibold text-ink-900">{FEATURE_LABELS[e.feature]}</dd>
          </div>
          <div>
            <dt className="text-ink-500">Last updated</dt>
            <dd className="font-semibold text-ink-900">
              <When iso={e.updatedAt} />
            </dd>
          </div>
        </dl>

        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[180px] flex-1">
            <label htmlFor={statusId} className="block text-sm font-semibold text-ink-800">
              Status
            </label>
            <select
              id={statusId}
              value={status}
              onChange={(ev) => setStatus(ev.target.value as FeedbackStatus)}
              className="mt-1.5 block min-h-11 w-full rounded-xl border border-ink-200 bg-white px-3 text-[15px] text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
            >
              {STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <button type="button" onClick={saveStatus} disabled={busy !== null || status === e.status} className={buttonClass('primary')}>
            {busy === 'status' ? 'Saving…' : 'Save status'}
          </button>
        </div>

        <section aria-labelledby={`${noteId}-notes`}>
          <h2 id={`${noteId}-notes`} className="text-sm font-semibold text-ink-800">
            Private notes
          </h2>
          {e.notes.length === 0 ? (
            <p className="mt-1 text-sm text-ink-500">No notes yet.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {e.notes.map((n, i) => (
                <li key={i} className="rounded-2xl bg-ink-100/60 px-4 py-3">
                  <p className="whitespace-pre-wrap break-words text-[15px] text-ink-900">{n.body}</p>
                  <p className="mt-1 text-[12px] text-ink-500">
                    {n.author} · <When iso={n.createdAt} />
                  </p>
                </li>
              ))}
            </ul>
          )}
          <form onSubmit={addNote} noValidate className="mt-3">
            <label htmlFor={noteId} className="block text-sm font-semibold text-ink-800">
              Add a note
            </label>
            <textarea
              id={noteId}
              value={note}
              rows={3}
              onChange={(ev) => setNote(ev.target.value)}
              className="mt-1.5 block w-full resize-y rounded-2xl border border-ink-200 bg-white px-4 py-3 text-base text-ink-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
            />
            <p className="mt-1 text-sm text-ink-500">Only you can see notes. Never shown to the member.</p>
            <button type="submit" disabled={busy !== null} className={clsx(buttonClass('secondary'), 'mt-2')}>
              {busy === 'note' ? 'Adding…' : 'Add note'}
            </button>
          </form>
        </section>

        {done && <Message tone="success">{done}</Message>}
        {error !== null && <Message tone="error">{messageFor(error)}</Message>}

        {e.history.length > 0 && (
          <section aria-labelledby={`${noteId}-history`}>
            <h2 id={`${noteId}-history`} className="text-sm font-semibold text-ink-800">
              History
            </h2>
            <ul className="mt-2 space-y-1 text-[13px] text-ink-600">
              {e.history.map((h, i) => (
                <li key={i}>
                  {h.action === 'status_changed' ? `Status ${h.from ? statusLabel(h.from) : ''} to ${h.to ? statusLabel(h.to) : ''}` : 'Note added'} by {h.by} ·{' '}
                  <When iso={h.at} />
                </li>
              ))}
            </ul>
          </section>
        )}
      </Card>
    </>
  )
}
