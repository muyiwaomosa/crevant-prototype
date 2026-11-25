import clsx from 'clsx'
import { createContext, useCallback, useContext, useEffect, useId, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, Flag, ShieldCheck } from 'lucide-react'
import { Card, EmptyState, Modal, PageHeader, buttonClass } from '../components/ui'
import { Message, Spinner } from '../public/auth/AuthUi'
import {
  AppApiError,
  LIMITS,
  PRIORITY_REASONS,
  REPORT_REASONS,
  messageFor,
  reasonLabel,
  type EnforcementLevel,
  type MemberRecord,
  type ModAppeal,
  type ModQueueItem,
  type ModReport,
  type ModerationAccess,
  type ReportReason,
  type ReportTarget,
} from './api'
import { useAppApi } from './AppApiContext'
import { When } from './components'
import { StorageCleanupPanel } from './avatars'
import { PhotoStoragePanel, ReportPhoto } from './media'
import { useFeedbackAccess } from './feedback'

/**
 * Reporting and founder-only moderation (Build 5, Stage 5.2a).
 *
 * Any pilot member can report a post or a profile. A report never hides
 * anything by itself, and the person reported is never told who reported
 * them. Moderators (granted only by server code) see a queue, each report,
 * and three actions: Hide, Restore and Dismiss. The database enforces all of
 * it; this file only presents it.
 */

const NONE: ModerationAccess = { available: false, moderator: false }
const ModerationContext = createContext<ModerationAccess>(NONE)

export function useModeration(): ModerationAccess {
  return useContext(ModerationContext)
}

/** Loads whether reporting exists and whether the member moderates. Never blocks the app. */
export function ModerationProvider({ children }: { children: ReactNode }) {
  const api = useAppApi()
  const [access, setAccess] = useState<ModerationAccess>(NONE)
  useEffect(() => {
    let live = true
    api.moderationAccess().then(
      (a) => live && setAccess(a),
      () => live && setAccess(NONE),
    )
    return () => {
      live = false
    }
  }, [api])
  return <ModerationContext.Provider value={access}>{children}</ModerationContext.Provider>
}

/** Shown before every report: what reporting is, and what it isn't. */
export function SafetyNotice() {
  return (
    <div role="note" className="flex gap-3 rounded-2xl bg-[#fff6e6] px-4 py-3 text-sm leading-relaxed text-[#6b4300] ring-1 ring-[#f3d79c]">
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
      <div>
        <p className="font-semibold">Reporting isn't an emergency service.</p>
        <p>
          Reports are reviewed by the Splitpost team during the pilot, not around the clock. If you or someone else is in danger, call 911 or your local
          emergency number. If you're thinking about suicide or self-harm, you can call or text 988 (Canada and the US).
        </p>
      </div>
    </div>
  )
}

/** "Report" for a post or a profile. Hidden for your own content and on a database without reporting. */
export function ReportButton({ target, targetId, name, className }: { target: ReportTarget; targetId: string; name: string; className?: string }) {
  const { available } = useModeration()
  const [open, setOpen] = useState(false)
  if (!available) return null
  const label = target === 'post' ? `Report this post by ${name}` : target === 'comment' ? `Report this comment by ${name}` : `Report ${name}`
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={label}
        className={clsx('inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-ink-600 hover:bg-ink-100', className)}
      >
        <Flag className="h-4 w-4" aria-hidden="true" /> Report
      </button>
      {open && <ReportDialog target={target} targetId={targetId} name={name} onClose={() => setOpen(false)} />}
    </>
  )
}

export function ReportDialog({ target, targetId, name, onClose }: { target: ReportTarget; targetId: string; name: string; onClose: () => void }) {
  const api = useAppApi()
  const groupId = useId()
  const detailsId = useId()
  const [reason, setReason] = useState<ReportReason | null>(null)
  const [details, setDetails] = useState('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [sent, setSent] = useState<'new' | 'already' | null>(null)
  const used = [...details.trim()].length

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!reason) {
      setProblem('Choose a reason.')
      return
    }
    if (used > LIMITS.reportDetails) {
      setProblem(`Keep the details to ${LIMITS.reportDetails} characters.`)
      return
    }
    setBusy(true)
    setProblem(null)
    try {
      await api.report(target, targetId, reason, details)
      setSent('new')
    } catch (err) {
      if (err instanceof AppApiError && err.code === 'already_reported') setSent('already')
      else setProblem(messageFor(err))
    } finally {
      setBusy(false)
    }
  }

  const title = target === 'post' ? 'Report this post' : target === 'comment' ? 'Report this comment' : `Report ${name}`
  return (
    <Modal open onClose={onClose} title={title}>
      {sent ? (
        <div className="space-y-4" data-testid="report-sent">
          <Message tone="success">
            {sent === 'new' ? "Thanks for letting us know. We'll review this." : "You've already reported this. We'll review it."}
          </Message>
          <p className="text-sm text-ink-600">
            {name} isn't told who reported them. Content isn't removed just because it was reported: a person reviews it first.
          </p>
          {reason && PRIORITY_REASONS.includes(reason) && (
            <p className="text-sm font-semibold text-ink-800">
              Reports about threats or self-harm are reviewed first, but not around the clock. If someone is in danger now, call 911 or your local
              emergency number.
            </p>
          )}
          <button type="button" onClick={onClose} className={`${buttonClass('primary')} w-full`}>
            Done
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          <SafetyNotice />
          <fieldset>
            <legend id={groupId} className="text-sm font-semibold text-ink-800">
              Why are you reporting this?
            </legend>
            <div className="mt-2 grid gap-1.5">
              {REPORT_REASONS.map((r) => (
                <label
                  key={r.value}
                  className={clsx(
                    'flex min-h-11 cursor-pointer items-center gap-3 rounded-2xl border px-4 py-2 text-[15px] focus-within:ring-2 focus-within:ring-brand-300',
                    reason === r.value ? 'border-brand-500 bg-brand-50' : 'border-ink-200 bg-white',
                  )}
                >
                  <input type="radio" name={groupId} value={r.value} checked={reason === r.value} onChange={() => setReason(r.value)} className="h-4 w-4 accent-brand-600" />
                  <span className="text-ink-900">{r.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <div>
            <label htmlFor={detailsId} className="block text-sm font-semibold text-ink-800">
              Anything else we should know? (optional)
            </label>
            <textarea
              id={detailsId}
              value={details}
              rows={3}
              onChange={(e) => setDetails(e.target.value)}
              aria-describedby={`${detailsId}-count`}
              className="mt-1.5 block w-full resize-none rounded-2xl border border-ink-200 bg-white px-4 py-3 text-base text-ink-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
            />
            <p id={`${detailsId}-count`} className={clsx('mt-1 text-right text-sm tabular-nums', used > LIMITS.reportDetails ? 'font-semibold text-[#8a2018]' : 'text-ink-500')}>
              {used}/{LIMITS.reportDetails}
            </p>
          </div>
          <p className="text-sm text-ink-600">The person you report isn't told who reported them.</p>
          {problem && <Message tone="error">{problem}</Message>}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={onClose} className={buttonClass('secondary')}>
              Cancel
            </button>
            <button type="submit" disabled={busy} className={buttonClass('primary')}>
              {busy ? 'Sending…' : 'Send report'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Moderators only.

function NotModerator() {
  return (
    <EmptyState
      icon={<ShieldCheck className="h-7 w-7" />}
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

const STATUS_TEXT: Record<string, string> = { open: 'Open', hidden: 'Hidden', dismissed: 'Dismissed', restored: 'Restored' }
const TARGET_LABEL: Record<ReportTarget, string> = { post: 'Post', comment: 'Comment', profile: 'Profile' }

function PriorityBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[#fde8ea] px-2.5 py-0.5 text-[13px] font-semibold text-[#8a2018]">
      <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" /> Priority: safety
    </span>
  )
}

export function ModerationQueuePage() {
  const api = useAppApi()
  const { moderator } = useModeration()
  const { founder } = useFeedbackAccess()
  const [tab, setTab] = useState<'open' | 'resolved'>('open')
  const [items, setItems] = useState<ModQueueItem[] | undefined>(undefined)
  const [error, setError] = useState<unknown>(null)
  const load = useCallback(async () => {
    try {
      setItems(await api.modQueue(tab))
      setError(null)
    } catch (e) {
      setError(e)
    }
  }, [api, tab])
  useEffect(() => {
    if (moderator) void load()
  }, [load, moderator])

  if (!moderator) return <NotModerator />
  return (
    <>
      <PageHeader title="Moderation" subtitle="Reports from members, safety reports first. Nothing is hidden until you decide." />
      <Link to="/app/moderation/appeals" className={`${buttonClass('secondary', 'sm')} mb-4`}>
        Appeals
      </Link>
      <div role="group" aria-label="Which reports" className="mb-4 flex gap-2">
        {(['open', 'resolved'] as const).map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={tab === t}
            onClick={() => setTab(t)}
            className={clsx(
              'min-h-11 rounded-full border px-4 text-sm font-semibold',
              tab === t ? 'border-brand-700 bg-brand-700 text-white' : 'border-ink-200 bg-white text-ink-800',
            )}
          >
            {t === 'open' ? 'Open' : 'Resolved'}
          </button>
        ))}
      </div>
      {error !== null && <Message tone="error">{messageFor(error)}</Message>}
      {items === undefined && error === null && <Spinner label="Loading reports…" />}
      {items && items.length === 0 && (
        <EmptyState icon={<ShieldCheck className="h-7 w-7" />} title={tab === 'open' ? 'No open reports' : 'No resolved reports'} body="Reports appear here as members send them." />
      )}
      {items && items.length > 0 && (
        <ul className="space-y-3" aria-label={tab === 'open' ? 'Open reports' : 'Resolved reports'}>
          {items.map((r) => (
            <li key={r.id}>
              <Link to={`/app/moderation/${r.id}`} className="block rounded-[22px] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300">
                <Card className="p-4 hover:ring-ink-200">
                  <div className="flex flex-wrap items-center gap-2">
                    {r.priority && <PriorityBadge />}
                    <span className="font-semibold text-ink-900">{reasonLabel(r.reason)}</span>
                    <span className="text-[13px] text-ink-500">
                      {TARGET_LABEL[r.targetType]}
                      {r.targetUsername ? ` by @${r.targetUsername}` : ''} · <When iso={r.createdAt} />
                    </span>
                  </div>
                  {r.excerpt && <p className="mt-2 line-clamp-2 text-[15px] text-ink-800">{r.excerpt}</p>}
                  <p className="mt-2 text-[13px] text-ink-500">
                    {tab === 'open'
                      ? `${r.openReportsForTarget} open ${r.openReportsForTarget === 1 ? 'report' : 'reports'} on this ${r.targetType}`
                      : STATUS_TEXT[r.status]}
                    {r.hasDetails ? ' · has details' : ''}
                  </p>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-8 space-y-4">
        <StorageCleanupPanel />
        <PhotoStoragePanel founder={founder} />
      </div>
    </>
  )
}

export function ModerationReportPage() {
  const api = useAppApi()
  const navigate = useNavigate()
  const { moderator } = useModeration()
  const { id = '' } = useParams()
  const noteId = useId()
  const [report, setReport] = useState<ModReport | null | undefined>(undefined)
  const [error, setError] = useState<unknown>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  const load = useCallback(async () => {
    try {
      setReport(await api.modReport(id))
      setError(null)
    } catch (e) {
      setError(e)
    }
  }, [api, id])
  useEffect(() => {
    if (moderator) void load()
  }, [load, moderator])

  if (!moderator) return <NotModerator />
  if (error !== null && report === undefined) return <Message tone="error">{messageFor(error)}</Message>
  if (report === undefined) return <Spinner label="Loading report…" />
  if (report === null) return <NotModerator />
  const r = report

  async function act(kind: 'hide' | 'restore' | 'dismiss') {
    if ([...note.trim()].length > LIMITS.moderationNote) {
      setError(new AppApiError('too_long'))
      return
    }
    setBusy(true)
    setError(null)
    try {
      if (kind === 'hide') await api.modHide(r.id, note)
      else if (kind === 'restore') await api.modRestore(r.id, note)
      else await api.modDismiss(r.id, note)
      setDone(kind === 'hide' ? 'Hidden. Members can no longer see it.' : kind === 'restore' ? 'Restored. Members can see it again.' : 'Dismissed. Nothing was changed.')
      setNote('')
      await load()
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }

  const snap = r.snapshot ?? {}
  const stateText: Record<ModReport['targetState'], string> = {
    live: 'Visible to members',
    hidden: 'Hidden by a moderator',
    deleted_by_author: 'Deleted by its author',
    gone: 'No longer exists',
  }
  const canHide = r.targetState === 'live'
  const canRestore = r.targetState === 'hidden'
  const canDismiss = r.status === 'open'
  return (
    <>
      <button type="button" onClick={() => navigate('/app/moderation')} className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to reports
      </button>
      <PageHeader title={`${reasonLabel(r.reason)}: ${TARGET_LABEL[r.targetType].toLowerCase()}`} subtitle={`Reported ${new Date(r.createdAt).toLocaleString()}. Status: ${STATUS_TEXT[r.status]}.`} />
      <Card className="space-y-4 p-5">
        {r.priority && <PriorityBadge />}
        <dl className="grid gap-3 text-sm">
          <div>
            <dt className="text-ink-500">Now</dt>
            <dd className="font-semibold text-ink-900">{stateText[r.targetState]}</dd>
          </div>
          <div>
            <dt className="text-ink-500">Open reports on this {r.targetType}</dt>
            <dd className="font-semibold tabular-nums text-ink-900">{r.openReportsForTarget}</dd>
          </div>
          <div>
            <dt className="text-ink-500">Reporter's details</dt>
            <dd className="whitespace-pre-wrap text-ink-900">{r.dataPurged ? 'Erased after 90 days.' : r.details ?? 'None given.'}</dd>
          </div>
        </dl>
        <section aria-labelledby={`${noteId}-snap`} className="rounded-2xl bg-ink-100/60 p-4">
          <h2 id={`${noteId}-snap`} className="text-sm font-semibold text-ink-700">
            What was reported
          </h2>
          {r.dataPurged ? (
            <p className="mt-1 text-sm text-ink-600">The copy was erased 90 days after the report was resolved.</p>
          ) : r.targetType !== 'profile' ? (
            <>
              <p className="mt-1 text-[13px] text-ink-500">
                By {snap.author_display_name} (@{snap.author_username})
              </p>
              {snap.body && <p className="mt-1 whitespace-pre-wrap break-words text-[15px] text-ink-900">{snap.body}</p>}
              {snap.media_full_path && <ReportPhoto reportId={r.id} />}
            </>
          ) : (
            <dl className="mt-1 grid gap-1 text-[15px] text-ink-900">
              <div>
                <dt className="sr-only">Name</dt>
                <dd>
                  {snap.display_name} (@{snap.username})
                </dd>
              </div>
              {snap.bio && (
                <div>
                  <dt className="text-[13px] text-ink-500">Bio</dt>
                  <dd>{snap.bio}</dd>
                </div>
              )}
              {snap.follow_reason && (
                <div>
                  <dt className="text-[13px] text-ink-500">Why follow</dt>
                  <dd>{snap.follow_reason}</dd>
                </div>
              )}
            </dl>
          )}
        </section>
        {r.targetType === 'post' && r.currentBody !== null && r.currentBody !== snap.body && (
          <p className="text-sm text-ink-600">The post has changed since it was reported.</p>
        )}
        {r.targetType === 'comment' && snap.post_id && (
          <Link to={`/app/post/${snap.post_id}`} className="text-sm font-semibold text-brand-700 underline underline-offset-2">
            Open the post it was on
          </Link>
        )}
        <div>
          <label htmlFor={noteId} className="block text-sm font-semibold text-ink-800">
            Note for the record (optional)
          </label>
          <textarea
            id={noteId}
            value={note}
            rows={2}
            onChange={(e) => setNote(e.target.value)}
            className="mt-1.5 block w-full resize-none rounded-2xl border border-ink-200 bg-white px-4 py-3 text-base text-ink-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
          />
          <p className="mt-1 text-sm text-ink-500">Saved in the moderation log with your action. Never shown to members.</p>
        </div>
        {done && <Message tone="success">{done}</Message>}
        {error !== null && <Message tone="error">{messageFor(error)}</Message>}
        <div className="flex flex-wrap gap-2">
          {canHide && (
            <button type="button" disabled={busy} onClick={() => act('hide')} className={buttonClass('danger')}>
              Hide
            </button>
          )}
          {canRestore && (
            <button type="button" disabled={busy} onClick={() => act('restore')} className={buttonClass('secondary')}>
              Restore
            </button>
          )}
          {canDismiss && (
            <button type="button" disabled={busy} onClick={() => act('dismiss')} className={buttonClass('secondary')}>
              Dismiss
            </button>
          )}
        </div>
        <p className="text-[13px] text-ink-500">
          Hide removes it for every member until restored. Dismiss closes the reports and changes nothing. Every action is recorded.
        </p>
      </Card>
      {r.targetOwnerId && <MemberActionsPanel memberId={r.targetOwnerId} reportId={r.id} defaultReason={r.reason} />}
    </>
  )
}

const LEVEL_TEXT: Record<EnforcementLevel, string> = { warning: 'Warning', restriction: 'Restriction', suspension: 'Suspension' }

/**
 * The account behind a report: its record and the enforcement ladder
 * (warning, then restriction, then suspension; the database refuses a skipped
 * step except for threats, self-harm and hate). The member is notified.
 */
export function MemberActionsPanel({ memberId, reportId, defaultReason }: { memberId: string; reportId: string | null; defaultReason: ReportReason }) {
  const api = useAppApi()
  const ids = useId()
  const [record, setRecord] = useState<MemberRecord | null | undefined>(undefined)
  const [level, setLevel] = useState<EnforcementLevel>('warning')
  const [reason, setReason] = useState<ReportReason>(defaultReason)
  const [days, setDays] = useState('7')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [done, setDone] = useState<string | null>(null)
  const load = useCallback(async () => {
    try {
      setRecord(await api.modMemberRecord(memberId))
    } catch (e) {
      setError(e)
      setRecord(null)
    }
  }, [api, memberId])
  useEffect(() => {
    void load()
  }, [load])
  if (record === undefined) return <Spinner label="Loading the member's record…" />
  if (record === null) return error !== null ? <Message tone="error">{messageFor(error)}</Message> : null

  const dayCount = days.trim() === '' ? null : Number(days)
  async function apply() {
    setBusy(true)
    setError(null)
    setDone(null)
    try {
      await api.modEnforce(memberId, level, reason, reportId, level === 'warning' ? null : dayCount, note)
      setDone(`${LEVEL_TEXT[level]} recorded. @${record!.username} has been notified.`)
      setNote('')
      await load()
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }
  async function lift(id: number) {
    setBusy(true)
    setError(null)
    try {
      await api.modLift(id, note)
      setDone('Ended early. The member has been notified.')
      await load()
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Card className="mt-4 space-y-4 p-5">
      <div data-testid="member-record">
        <h2 className="font-display text-lg font-bold text-ink-900">
          The account: {record.displayName} (@{record.username})
        </h2>
        <p className="mt-1 text-sm text-ink-700">
          {record.standing === 'suspended' ? 'Suspended now.' : record.standing === 'restricted' ? 'Restricted now.' : 'No limits now.'} Hidden by moderators so far:{' '}
          {record.hiddenContent}.
        </p>
      </div>
      {record.enforcements.length > 0 && (
        <ul className="divide-y divide-ink-100 text-sm" aria-label="Enforcement history">
          {record.enforcements.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="text-ink-800">
                <span className="font-semibold">{LEVEL_TEXT[e.level]}</span> · {reasonLabel(e.reason)} · <When iso={e.startsAt} />
                {e.endsAt ? ` · until ${new Date(e.endsAt).toLocaleDateString()}` : e.level === 'suspension' ? ' · until lifted' : ''}
                {e.liftedAt ? ` · ended early${e.liftedVia === 'appeal' ? ' on appeal' : ''}` : ''}
              </span>
              {e.active && (
                <button type="button" disabled={busy} onClick={() => lift(e.id)} className={buttonClass('secondary', 'sm')}>
                  End early
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <fieldset>
        <legend className="text-sm font-semibold text-ink-800">Next step</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {(['warning', 'restriction', 'suspension'] as const).map((l) => (
            <button
              key={l}
              type="button"
              aria-pressed={level === l}
              onClick={() => {
                setLevel(l)
                setDays(l === 'restriction' ? '7' : '')
              }}
              className={clsx(
                'min-h-11 rounded-full border px-4 text-sm font-semibold',
                level === l ? 'border-brand-700 bg-brand-700 text-white' : 'border-ink-200 bg-white text-ink-800',
              )}
            >
              {LEVEL_TEXT[l]}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[13px] text-ink-500">
          One step at a time: a warning before a restriction, a restriction before a suspension. Threats, self-harm and hate can go straight to any step.
        </p>
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm font-semibold text-ink-800">
          Reason
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value as ReportReason)}
            className="mt-1.5 block h-11 w-full rounded-2xl border border-ink-200 bg-white px-3 text-base text-ink-900"
          >
            {REPORT_REASONS.map((x) => (
              <option key={x.value} value={x.value}>
                {x.label}
              </option>
            ))}
          </select>
        </label>
        {level !== 'warning' && (
          <label htmlFor={`${ids}-days`} className="block text-sm font-semibold text-ink-800">
            {level === 'restriction' ? 'Days (1 to 30)' : 'Days (1 to 90, or empty until lifted)'}
            <input
              id={`${ids}-days`}
              inputMode="numeric"
              value={days}
              onChange={(e) => setDays(e.target.value.replace(/[^0-9]/g, ''))}
              className="mt-1.5 block h-11 w-full rounded-2xl border border-ink-200 bg-white px-3 text-base text-ink-900"
            />
          </label>
        )}
      </div>
      <label htmlFor={`${ids}-note`} className="block text-sm font-semibold text-ink-800">
        Note for the record (optional, never shown to the member)
        <textarea
          id={`${ids}-note`}
          value={note}
          rows={2}
          onChange={(e) => setNote(e.target.value)}
          className="mt-1.5 block w-full resize-none rounded-2xl border border-ink-200 bg-white px-4 py-3 text-base font-normal text-ink-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
        />
      </label>
      {done && <Message tone="success">{done}</Message>}
      {error !== null && <Message tone="error">{messageFor(error)}</Message>}
      <button type="button" disabled={busy} onClick={apply} className={buttonClass(level === 'warning' ? 'secondary' : 'danger')}>
        {busy ? 'Saving…' : `Give a ${LEVEL_TEXT[level].toLowerCase()}`}
      </button>
    </Card>
  )
}

const APPEAL_KIND: Record<string, string> = {
  content_hidden: 'Hidden content',
  warning: 'Warning',
  restriction: 'Restriction',
  suspension: 'Suspension',
}

/** Appeals: oldest first. A different moderator decides appeals on your own actions whenever one exists. */
export function ModerationAppealsPage() {
  const api = useAppApi()
  const { moderator } = useModeration()
  const [tab, setTab] = useState<'open' | 'decided'>('open')
  const [items, setItems] = useState<ModAppeal[] | null | undefined>(undefined)
  const [error, setError] = useState<unknown>(null)
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const load = useCallback(async () => {
    try {
      setItems(await api.modAppeals(tab))
      setError(null)
    } catch (e) {
      setError(e)
    }
  }, [api, tab])
  useEffect(() => {
    if (moderator) void load()
  }, [load, moderator])
  if (!moderator) return <NotModerator />

  async function decide(a: ModAppeal, reverse: boolean) {
    setBusy(a.id)
    setError(null)
    try {
      await api.modDecideAppeal(a.id, reverse, notes[a.id])
      await load()
    } catch (e) {
      setError(e)
    } finally {
      setBusy(null)
    }
  }
  return (
    <>
      <Link to="/app/moderation" className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to reports
      </Link>
      <PageHeader title="Appeals" subtitle="Members asking us to look again. Reversing restores the content or ends the limit, and the member is told." />
      <div role="group" aria-label="Which appeals" className="mb-4 flex gap-2">
        {(['open', 'decided'] as const).map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={tab === t}
            onClick={() => setTab(t)}
            className={clsx(
              'min-h-11 rounded-full border px-4 text-sm font-semibold',
              tab === t ? 'border-brand-700 bg-brand-700 text-white' : 'border-ink-200 bg-white text-ink-800',
            )}
          >
            {t === 'open' ? 'Open' : 'Decided'}
          </button>
        ))}
      </div>
      {error !== null && <Message tone="error">{messageFor(error)}</Message>}
      {items === undefined && error === null && <Spinner label="Loading appeals…" />}
      {(items === null || (items && items.length === 0)) && (
        <EmptyState icon={<ShieldCheck className="h-7 w-7" />} title={tab === 'open' ? 'No open appeals' : 'No decided appeals'} body="Appeals appear here as members send them." />
      )}
      {items && items.length > 0 && (
        <ul className="space-y-3" aria-label={tab === 'open' ? 'Open appeals' : 'Decided appeals'}>
          {items.map((a) => (
            <li key={a.id}>
              <Card className="space-y-2 p-4">
                <p className="flex flex-wrap items-center gap-2 text-[13px] text-ink-500">
                  <span className="font-semibold text-ink-900">{APPEAL_KIND[a.kind] ?? a.kind}</span>
                  {a.reason && <span>{reasonLabel(a.reason)}</span>}
                  <span>
                    @{a.memberUsername ?? 'deleted account'} · <When iso={a.createdAt} />
                  </span>
                </p>
                {a.excerpt && <blockquote className="border-l-4 border-ink-200 pl-3 text-[14px] text-ink-600">{a.excerpt}</blockquote>}
                <p className="whitespace-pre-wrap text-[15px] text-ink-900">{a.body}</p>
                {a.status === 'open' ? (
                  <>
                    {a.decidedOriginal && <p className="text-sm font-semibold text-[#6b4300]">You took the original action. Another moderator should decide this one.</p>}
                    <textarea
                      aria-label="Decision note (optional, never shown to the member)"
                      placeholder="Decision note (optional, never shown to the member)"
                      value={notes[a.id] ?? ''}
                      rows={2}
                      onChange={(e) => setNotes((n) => ({ ...n, [a.id]: e.target.value }))}
                      className="block w-full resize-none rounded-2xl border border-ink-200 bg-white px-4 py-3 text-base text-ink-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
                    />
                    <div className="flex flex-wrap gap-2">
                      <button type="button" disabled={busy === a.id} onClick={() => decide(a, true)} className={buttonClass('primary', 'sm')}>
                        Reverse
                      </button>
                      <button type="button" disabled={busy === a.id} onClick={() => decide(a, false)} className={buttonClass('secondary', 'sm')}>
                        Keep the decision
                      </button>
                    </div>
                  </>
                ) : (
                  <p className="text-sm font-semibold text-ink-800">{a.status === 'reversed' ? 'Reversed' : 'Decision kept'}</p>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
