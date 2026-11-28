/**
 * Control Center operations for the founder (20261211000000, 20261212000000):
 * registration and invitation links, operational switches and privacy
 * requests. Every change goes through a founder-only database function that
 * checks and records it; these panels only call them.
 */
import { useEffect, useState, type FormEvent } from 'react'
import { Check, Copy } from 'lucide-react'
import { Card, buttonClass } from '../components/ui'
import { Message, Spinner } from '../public/auth/AuthUi'
import { messageFor, type FounderMemberRequest, type FounderSwitches, type InvitationLink, type RegistrationSettings, type SwitchFeature, type WaitlistBridgeResult, type WaitlistOverview } from './api'
import { useAppApi } from './AppApiContext'

/** Sent by the video readiness panel (video.tsx) when a device test or the cap is saved. */
export const VIDEO_READINESS_EVENT = 'splitpost:video-readiness'

const input = 'mt-1 block min-h-11 w-full rounded-xl border border-ink-200 bg-white px-3 text-base text-ink-900'

function Panel({ title, children, testId }: { title: string; children: React.ReactNode; testId: string }) {
  return (
    <div data-testid={testId}>
      <Card className="p-5">
        <h2 className="font-display text-lg font-extrabold text-ink-900">{title}</h2>
        <div className="mt-3 space-y-3">{children}</div>
      </Card>
    </div>
  )
}

export function RegistrationPanel() {
  const api = useAppApi()
  const [s, setS] = useState<RegistrationSettings | null | undefined>(undefined)
  const [draft, setDraft] = useState<RegistrationSettings | null>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [saved, setSaved] = useState(false)
  const load = () =>
    api.founderRegistration().then(
      (x) => (setS(x), setDraft(x)),
      (e) => (setError(e), setS(null)),
    )
  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api])
  if (s === undefined) return <Spinner label="Loading registration…" />
  if (!s || !draft) return error ? <Message tone="error">{messageFor(error)}</Message> : null
  async function save(e: FormEvent) {
    e.preventDefault()
    if (!draft) return
    setBusy(true)
    setError(null)
    setSaved(false)
    try {
      await api.founderSetRegistration(draft, reason || 'Control Center')
      setSaved(true)
      setReason('')
      await load()
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }
  const num = (k: 'totalCap' | 'dailyCap' | 'perReferrerDailyCap') => (e: React.ChangeEvent<HTMLInputElement>) =>
    setDraft((d) => (d ? { ...d, [k]: Math.max(0, Number(e.target.value) || 0) } : d))
  return (
    <Panel title="Registration" testId="registration-panel">
      <p className="text-[14px] text-ink-700">
        {s.registeredTotal} registered, {s.registeredToday} today. Registration is <strong>{s.paused ? 'paused' : 'open'}</strong>; external access is{' '}
        <strong>{s.externalAccessApproved ? 'approved' : 'closed'}</strong>
        {s.externalAccessApproved ? '' : ' (only the release approval opens it)'}.
      </p>
      <form onSubmit={save} className="space-y-3">
        <label className="flex items-center gap-3 text-[15px] font-semibold text-ink-900">
          <input type="checkbox" checked={!draft.paused} onChange={(e) => setDraft({ ...draft, paused: !e.target.checked })} className="h-5 w-5" />
          Accept new registrations through invitation and personal links
        </label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="text-sm font-semibold text-ink-800">
            Total limit
            <input type="number" min={0} value={draft.totalCap} onChange={num('totalCap')} className={input} />
          </label>
          <label className="text-sm font-semibold text-ink-800">
            Per day
            <input type="number" min={0} value={draft.dailyCap} onChange={num('dailyCap')} className={input} />
          </label>
          <label className="text-sm font-semibold text-ink-800">
            Per member's link per day
            <input type="number" min={0} value={draft.perReferrerDailyCap} onChange={num('perReferrerDailyCap')} className={input} />
          </label>
        </div>
        <label className="block text-sm font-semibold text-ink-800">
          Reason (recorded)
          <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} className={input} />
        </label>
        {error !== null && <Message tone="error">{messageFor(error)}</Message>}
        {saved && <Message tone="success">Saved and recorded.</Message>}
        <button type="submit" disabled={busy} className={buttonClass('primary', 'sm')}>
          {busy ? 'Saving…' : 'Save registration settings'}
        </button>
      </form>
    </Panel>
  )
}

export function InvitationLinksPanel() {
  const api = useAppApi()
  const [links, setLinks] = useState<InvitationLink[] | undefined>(undefined)
  const [creator, setCreator] = useState('')
  const [maxUses, setMaxUses] = useState('25')
  const [days, setDays] = useState('14')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const load = () =>
    api.founderInvitationLinks().then(
      (l) => setLinks(l),
      (e) => (setError(e), setLinks([])),
    )
  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api])
  const url = (code: string) => `${window.location.origin}/register/${code}`
  async function create(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api.founderCreateInvitationLink(maxUses.trim() ? Number(maxUses) : null, Number(days), creator)
      setCreator('')
      await load()
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }
  async function revoke(code: string) {
    setError(null)
    try {
      await api.founderRevokeInvitationLink(code)
      await load()
    } catch (err) {
      setError(err)
    }
  }
  async function copy(code: string) {
    try {
      await navigator.clipboard.writeText(url(code))
      setCopied(code)
      window.setTimeout(() => setCopied(null), 2500)
    } catch {
      setCopied(null)
    }
  }
  return (
    <Panel title="Invitation links" testId="invitation-links-panel">
      <p className="text-[14px] text-ink-700">
        Everyone joins the same way. A link can name a creator, so the people they bring see who invited them and can follow them. Members also have their own
        personal link in My Split.
      </p>
      <form onSubmit={create} className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <label className="text-sm font-semibold text-ink-800 sm:col-span-2">
          Creator's username (optional)
          <input value={creator} onChange={(e) => setCreator(e.target.value)} placeholder="cara" className={input} />
        </label>
        <label className="text-sm font-semibold text-ink-800">
          People who can join
          <input type="number" min={1} value={maxUses} onChange={(e) => setMaxUses(e.target.value)} className={input} />
        </label>
        <label className="text-sm font-semibold text-ink-800">
          Days it lasts
          <input type="number" min={1} max={366} value={days} onChange={(e) => setDays(e.target.value)} className={input} />
        </label>
        <button type="submit" disabled={busy} className={`${buttonClass('primary', 'sm')} sm:col-span-4 sm:justify-self-start`}>
          {busy ? 'Creating…' : 'Create link'}
        </button>
      </form>
      {error !== null && <Message tone="error">{messageFor(error)}</Message>}
      {links === undefined && <Spinner label="Loading links…" />}
      {links && links.length === 0 && <p className="text-[14px] text-ink-600">No invitation links yet.</p>}
      {links && links.length > 0 && (
        <ul className="space-y-2">
          {links.map((l) => {
            const ended = !!l.revokedAt || (l.expiresAt !== null && Date.parse(l.expiresAt) < Date.now()) || (l.maxUses !== null && l.uses >= l.maxUses)
            return (
              <li key={l.code} className="rounded-2xl bg-paper px-4 py-3">
                <p className="font-semibold text-ink-900">
                  {l.creatorUsername ? `For @${l.creatorUsername}` : 'General invitation'}
                  {ended && <span className="ml-2 text-[13px] font-semibold text-ink-500">{l.revokedAt ? 'Stopped' : 'Ended'}</span>}
                </p>
                <p className="text-[13px] text-ink-600">
                  {l.registered} joined · {l.uses}
                  {l.maxUses !== null ? ` of ${l.maxUses}` : ''} used{l.expiresAt ? ` · until ${new Date(l.expiresAt).toLocaleDateString()}` : ''}
                </p>
                {!ended && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button type="button" onClick={() => void copy(l.code)} className={buttonClass('secondary', 'sm')}>
                      {copied === l.code ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}{' '}
                      {copied === l.code ? 'Copied' : 'Copy link'}
                    </button>
                    <button type="button" onClick={() => void revoke(l.code)} className={buttonClass('ghost', 'sm')}>
                      Stop this link
                    </button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </Panel>
  )
}

const SWITCH_TEXT: Record<SwitchFeature, { title: string; body: string }> = {
  ads: { title: 'Advertising', body: 'Sponsored posts in Home and under posts.' },
  sharing: { title: 'Sharing', body: 'Copy link and the share sheet on posts.' },
  video_posts: { title: 'New video uploads', body: 'New video posts. Turns on only once the video storage cap is set (see Video posts below).' },
  video_playback: { title: 'Video playback', body: 'Playing videos already published. Separate from uploads, so pausing uploads never hides existing videos.' },
  progression: { title: 'Progression', body: 'Goals and simulated locked earnings in My Split. Nobody qualifies while it is off or until you set every goal value.' },
}

export function SwitchesPanel() {
  const api = useAppApi()
  const [s, setS] = useState<FounderSwitches | null | undefined>(undefined)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<unknown>(null)
  // Video posts: offered once the storage cap is set (20261220000000, the founder's release decision; the server checks again).
  const [videoReady, setVideoReady] = useState(false)
  const load = () => {
    api.founderVideoStatus().then(
      (v) => setVideoReady(v?.ready === true),
      () => setVideoReady(false),
    )
    return api.founderSwitches().then(
      (x) => setS(x),
      (e) => (setError(e), setS(null)),
    )
  }
  useEffect(() => {
    void load()
    // The video readiness panel records device tests and the cap: look again when it does.
    const again = () => void load()
    window.addEventListener(VIDEO_READINESS_EVENT, again)
    return () => window.removeEventListener(VIDEO_READINESS_EVENT, again)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api])
  if (s === undefined) return <Spinner label="Loading switches…" />
  if (!s) return error ? <Message tone="error">{messageFor(error)}</Message> : null
  async function flip(feature: SwitchFeature, enabled: boolean) {
    setError(null)
    try {
      await api.founderSetSwitch(feature, enabled, reason)
      setReason('')
      await load()
    } catch (err) {
      setError(err)
    }
  }
  return (
    <Panel title="Operational switches" testId="switches-panel">
      <p className="text-[14px] text-ink-700">Takes effect at once for everyone. Each change needs a reason and is recorded.</p>
      <label className="block text-sm font-semibold text-ink-800">
        Reason
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={300}
          placeholder="For example: pausing ads to review a complaint"
          className={input}
        />
      </label>
      <ul className="space-y-2">
        {s.switches.map((x) => (
          <li key={x.feature} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-paper px-4 py-3">
            <span>
              <span className="block font-semibold text-ink-900">
                {SWITCH_TEXT[x.feature]?.title ?? x.feature}: {x.enabled ? 'On' : 'Off'}
              </span>
              <span className="block text-[13px] text-ink-600">{SWITCH_TEXT[x.feature]?.body}</span>
            </span>
            <button
              type="button"
              onClick={() => void flip(x.feature, !x.enabled)}
              disabled={x.feature === 'video_posts' && !x.enabled && !videoReady}
              className={buttonClass(x.enabled ? 'secondary' : 'primary', 'sm')}
            >
              {x.enabled
                ? `Turn ${SWITCH_TEXT[x.feature]?.title.toLowerCase() ?? x.feature} off`
                : `Turn ${SWITCH_TEXT[x.feature]?.title.toLowerCase() ?? x.feature} on`}
            </button>
          </li>
        ))}
      </ul>
      <p className="text-[13px] text-ink-600">
        Also: registration {s.registrationPaused ? 'paused' : 'open'}, rewards {s.rewardsPaused ? 'paused' : 'on'}, photo posts {s.photosEnabled ? 'on' : 'off'}
        , external access {s.externalAccessApproved ? 'open' : 'closed'}.
      </p>
      {error !== null && <Message tone="error">{messageFor(error)}</Message>}
      {s.recent.length > 0 && (
        <details>
          <summary className="cursor-pointer text-sm font-semibold text-brand-700">Recent changes</summary>
          <ul className="mt-2 space-y-1 text-[13px] text-ink-700">
            {s.recent.map((r, i) => (
              <li key={i}>
                {new Date(r.changedAt).toLocaleString()}: {r.feature} {r.enabled ? 'on' : 'off'}. {r.reason}
              </li>
            ))}
          </ul>
        </details>
      )}
    </Panel>
  )
}

const REQUEST_KIND: Record<string, string> = { access: 'Copy of data', correction: 'Correction', deletion: 'Delete account' }

function RequestItem({ r, onChanged }: { r: FounderMemberRequest; onChanged: () => void }) {
  const api = useAppApi()
  const [note, setNote] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [result, setResult] = useState<string | null>(null)
  async function run(f: () => Promise<unknown>, done: string) {
    setBusy(true)
    setError(null)
    try {
      await f()
      if (done) setResult(done)
      onChanged()
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }
  return (
    <li className="rounded-2xl bg-paper px-4 py-3">
      <p className="font-semibold text-ink-900">
        {REQUEST_KIND[r.kind]} · {r.username ? `@${r.username}` : 'account deleted'}
      </p>
      <p className="text-[13px] text-ink-600">
        {r.status} · {new Date(r.createdAt).toLocaleDateString()}
      </p>
      {r.details && <p className="mt-1 whitespace-pre-wrap text-[14px] text-ink-800">{r.details}</p>}
      {r.status === 'open' && (
        <div className="mt-2 space-y-2">
          {r.kind !== 'deletion' ? (
            <>
              <label className="block text-sm font-semibold text-ink-800">
                Note (recorded)
                <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} className={input} />
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void run(() => api.founderResolveMemberRequest(r.id, true, note), 'Marked done.')}
                  className={buttonClass('primary', 'sm')}
                >
                  Mark done
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void run(() => api.founderResolveMemberRequest(r.id, false, note), 'Declined.')}
                  className={buttonClass('secondary', 'sm')}
                >
                  Decline
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-[14px] text-ink-700">
                Deleting removes the account, profile, posts, comments and follows, queues their files for removal and forfeits unsettled simulated points. The
                ledger keeps anonymous rows so every month still reconciles. This cannot be undone.
              </p>
              <label className="block text-sm font-semibold text-ink-800">
                Type the username to confirm
                <input value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" className={input} />
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy || !confirm.trim()}
                  onClick={() =>
                    void run(async () => {
                      const x = await api.founderDeleteMember(r.id, confirm)
                      setResult(`Deleted. ${x.postsRemoved} posts removed, ${x.awardsForfeited} simulated awards forfeited.`)
                    }, '')
                  }
                  className={buttonClass('danger', 'sm')}
                >
                  Delete this account
                </button>
                <label className="sr-only" htmlFor={`decline-${r.id}`}>
                  Reason for declining
                </label>
                <input
                  id={`decline-${r.id}`}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Reason to decline"
                  className={`${input} sm:w-56`}
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void run(() => api.founderResolveMemberRequest(r.id, false, note), 'Declined.')}
                  className={buttonClass('secondary', 'sm')}
                >
                  Decline
                </button>
              </div>
            </>
          )}
        </div>
      )}
      {result && (
        <p role="status" className="mt-2 text-sm font-semibold text-brand-800">
          {result}
        </p>
      )}
      {error !== null && (
        <div className="mt-2">
          <Message tone="error">{messageFor(error)}</Message>
        </div>
      )}
    </li>
  )
}

export function PrivacyRequestsPanel() {
  const api = useAppApi()
  const [rows, setRows] = useState<FounderMemberRequest[] | undefined>(undefined)
  const [error, setError] = useState<unknown>(null)
  const load = () =>
    api.founderMemberRequests().then(
      (r) => setRows(r),
      (e) => (setError(e), setRows([])),
    )
  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api])
  const open = rows?.filter((r) => r.status === 'open').length ?? 0
  return (
    <Panel title={`Privacy requests${open ? ` (${open} open)` : ''}`} testId="privacy-requests-panel">
      {error !== null && <Message tone="error">{messageFor(error)}</Message>}
      {rows === undefined && <Spinner label="Loading requests…" />}
      {rows && rows.length === 0 && <p className="text-[14px] text-ink-600">No requests.</p>}
      {rows && rows.length > 0 && (
        <ul className="space-y-2">
          {rows.map((r) => (
            <RequestItem key={r.id} r={r} onChanged={() => void load()} />
          ))}
        </ul>
      )}
    </Panel>
  )
}

const GROUP_LABEL: Record<string, string> = { active_creator: 'Creator', aspiring_creator: 'Aspiring creator', supporter: 'Supporter' }
const RESULT_LABEL: Record<string, string> = {
  imported: 'copied for review', skipped: 'already here or a member', withdrawn: 'withdrawals carried', invitations_removed: 'open invitations removed',
  deleted: 'deletion requests carried', declined: 'declines recorded', sent: 'invitations sent', failed: 'emails failed (retried next time)',
  retried: 'earlier failures resent', not_confirmed: 'no longer eligible (dropped)', already_invited: 'already invited',
}

/**
 * BL-009: the waitlist to member journey, all from Control Center. The
 * waitlist stays the authoritative record; Import copies only verified,
 * consenting applicants (the minimum for review) for 30 days at most. You
 * approve applicants into a cohort or decline them; Send rechecks each one
 * with the waitlist and emails a personal, single-use invitation. While
 * external access is closed, the database refuses to create any invitation.
 */
export function WaitlistPanel() {
  const api = useAppApi()
  const [o, setO] = useState<WaitlistOverview | null | undefined>(undefined)
  const [picked, setPicked] = useState<string[]>([])
  const [cohort, setCohort] = useState<'fan' | 'creator' | 'tester'>('fan')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [result, setResult] = useState<WaitlistBridgeResult | null>(null)
  const [confirmSend, setConfirmSend] = useState(false)
  const [forgetting, setForgetting] = useState<string | null>(null)
  const [forgetEmail, setForgetEmail] = useState('')
  const load = () =>
    api.founderWaitlist().then(
      (x) => setO(x),
      (e) => (setError(e), setO(null)),
    )
  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api])
  async function act(name: string, fn: () => Promise<unknown>) {
    setBusy(name)
    setError(null)
    try {
      const out = await fn()
      if (out && typeof out === 'object') setResult(out as WaitlistBridgeResult)
      setPicked([])
      await load()
    } catch (err) {
      setError(err)
    } finally {
      setBusy(null)
      setConfirmSend(false)
      setForgetting(null)
    }
  }
  if (o === undefined) return <Spinner label="Loading the waitlist…" />
  if (o === null) return error ? <Message tone="error">{messageFor(error)}</Message> : null
  const inv = o.invitations
  const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : 'none yet')
  const approved = o.applicants.filter((a) => a.decision === 'approved').length
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))
  return (
    <Panel title="Waitlist and invitations" testId="waitlist-panel">
      <p className="text-[14px] text-ink-700">
        The waitlist stays the record of who applied. Import copies verified applicants who agreed to be contacted, for up to 30 days. Approve them into a cohort,
        then send: each one is checked with the waitlist again and gets a personal link that works once and lasts 14 days.
      </p>
      <p className="text-[14px] font-semibold" data-testid="waitlist-may-send">
        {o.maySend ? 'Invitations can be sent.' : 'Invitations are closed: external access is not approved, or registration is paused. Nothing can be sent.'}
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy !== null} onClick={() => void act('import', () => api.founderWaitlistImport())} className={buttonClass('secondary', 'sm')}>
          {busy === 'import' ? 'Importing…' : 'Import verified applicants'}
        </button>
        {!confirmSend ? (
          <button type="button" disabled={busy !== null || !o.maySend || approved === 0} onClick={() => setConfirmSend(true)} className={buttonClass('primary', 'sm')}>
            Send approved invitations ({approved})
          </button>
        ) : (
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-[14px]">Send {approved} personal invitation{approved === 1 ? '' : 's'} now?</span>
            <button type="button" disabled={busy !== null} onClick={() => void act('send', () => api.founderWaitlistSend())} className={buttonClass('primary', 'sm')}>
              {busy === 'send' ? 'Sending…' : 'Yes, send'}
            </button>
            <button type="button" onClick={() => setConfirmSend(false)} className={buttonClass('ghost', 'sm')}>
              Cancel
            </button>
          </span>
        )}
      </div>
      <p className="text-[13px] text-ink-600">
        Last import: {o.lastImportAt ? new Date(o.lastImportAt).toLocaleString() : 'never'}
        {o.pendingDeletions > 0 ? ` · ${o.pendingDeletions} deletion request(s) waiting to reach the waitlist (carried on the next import or send)` : ''}
      </p>
      {result && (
        <p className="rounded-xl bg-paper px-3 py-2 text-[14px]" data-testid="waitlist-result">
          {String(result.status) === 'deleted'
            ? Number(result.waitlist_deleted ?? 0) + Number(result.removed_here ?? 0) > 0 ? 'Deleted from the waitlist and from review.' : 'No one with that address was found.'
            : String(result.status) === 'closed'
            ? 'Nothing was sent: invitations are closed.'
            : String(result.status) === 'email_not_configured'
              ? 'Nothing was sent: the email key is not set up for this project.'
              : Object.entries(RESULT_LABEL)
                  .filter(([k]) => Number(result[k] ?? 0) > 0)
                  .map(([k, label]) => `${result[k]} ${label}`)
                  .join(' · ') || 'Nothing new.'}
        </p>
      )}
      {error !== null && <Message tone="error">{messageFor(error)}</Message>}

      <h3 className="pt-2 font-semibold text-ink-900">Applicants under review ({o.applicants.length})</h3>
      {o.applicants.length === 0 ? (
        <p className="text-[14px] text-ink-600">No applicants to review. Import to copy newly verified ones.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-sm font-semibold text-ink-800">
              Cohort
              <select value={cohort} onChange={(e) => setCohort(e.target.value as typeof cohort)} className={input}>
                <option value="fan">Member</option>
                <option value="creator">Creator</option>
                <option value="tester">Tester</option>
              </select>
            </label>
            <button type="button" disabled={busy !== null || picked.length === 0} onClick={() => void act('approve', () => api.founderWaitlistDecide(picked, 'approved', cohort))} className={buttonClass('secondary', 'sm')}>
              Approve selected ({picked.length})
            </button>
            <button type="button" disabled={busy !== null || picked.length === 0} onClick={() => void act('decline', () => api.founderWaitlistDecide(picked, 'declined'))} className={buttonClass('ghost', 'sm')}>
              Decline selected
            </button>
            <button type="button" disabled={busy !== null || picked.length === 0} onClick={() => void act('reset', () => api.founderWaitlistDecide(picked, 'pending'))} className={buttonClass('ghost', 'sm')}>
              Back to undecided
            </button>
          </div>
          <ul className="space-y-2" data-testid="waitlist-applicants">
            {o.applicants.map((a) => (
              <li key={a.waitlistId} className="flex items-start gap-3 rounded-2xl bg-paper px-4 py-3">
                <input type="checkbox" className="mt-1 h-5 w-5" aria-label={`Select ${a.email}`} checked={picked.includes(a.waitlistId)} onChange={() => toggle(a.waitlistId)} />
                <div className="min-w-0 flex-1">
                  <p className="break-all font-semibold text-ink-900">{a.email}</p>
                  <p className="text-[13px] text-ink-600">
                    {[a.groups.map((g) => GROUP_LABEL[g] ?? g).join(', ') || 'No group answers', a.intent && `wants to ${a.intent === 'both' ? 'create and discover' : a.intent}`,
                      a.platform && `${a.platform}${a.audienceBand ? ` (${a.audienceBand.replace('_', ' ')})` : ''}`, a.fromCreatorLink && 'from a creator link',
                      a.introducedByCreator && 'says a creator introduced them', `joined ${new Date(a.joinedAt).toLocaleDateString()}`]
                      .filter(Boolean).join(' · ')}
                  </p>
                  <p className="text-[13px] font-semibold text-ink-700">
                    {a.decision === 'approved' ? `Approved: ${a.cohort === 'fan' ? 'member' : a.cohort}` : a.decision === 'declined' ? 'Declined (recorded on the next import or send)' : 'Undecided'}
                    {` · copy removed ${new Date(a.expiresAt).toLocaleDateString()}`}
                  </p>
                  {forgetting === a.waitlistId ? (
                    <span className="mt-1 flex flex-wrap items-center gap-2 text-[13px]">
                      Delete this applicant here and on the waitlist?
                      <button type="button" onClick={() => void act('forget', () => api.founderWaitlistForget(a.waitlistId))} className={buttonClass('secondary', 'sm')}>
                        Yes, delete
                      </button>
                      <button type="button" onClick={() => setForgetting(null)} className={buttonClass('ghost', 'sm')}>
                        Cancel
                      </button>
                    </span>
                  ) : (
                    <button type="button" onClick={() => setForgetting(a.waitlistId)} className="mt-1 text-[13px] underline">
                      Delete on request
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (forgetEmail.trim()) void act('forget-email', () => api.founderWaitlistForgetEmail(forgetEmail)).then(() => setForgetEmail(''))
        }}
      >
        <label className="text-sm font-semibold text-ink-800">
          Delete a waitlist applicant by email
          <input type="email" value={forgetEmail} onChange={(e) => setForgetEmail(e.target.value)} placeholder="name@example.com" className={input} />
        </label>
        <button type="submit" disabled={busy !== null || !forgetEmail.trim()} className={buttonClass('secondary', 'sm')}>
          {busy === 'forget-email' ? 'Deleting…' : 'Delete everywhere'}
        </button>
      </form>

      <h3 className="pt-2 font-semibold text-ink-900">Invitations from the waitlist</h3>
      <dl className="grid grid-cols-2 gap-2 text-[14px] sm:grid-cols-4" data-testid="waitlist-counts">
        {[
          ['Sent', inv.sent],
          ['Failed', inv.failed],
          ['Accepted', inv.accepted],
          ['Onboarded', inv.onboarded],
          ['Open', inv.open],
          ['Expired', inv.expired],
          ['Accepted of sent', pct(inv.accepted, inv.sent + inv.failed)],
          ['Onboarded of accepted', pct(inv.onboarded, inv.accepted)],
        ].map(([k, v]) => (
          <div key={String(k)} className="rounded-xl bg-paper px-3 py-2">
            <dt className="text-[12px] text-ink-600">{k}</dt>
            <dd className="font-semibold text-ink-900">{v}</dd>
          </div>
        ))}
      </dl>
      {inv.fromCreatorLinks > 0 && <p className="text-[13px] text-ink-600">{inv.fromCreatorLinks} came through a creator's link.</p>}
      {o.recent.length > 0 && (
        <ul className="space-y-1 text-[13px]" data-testid="waitlist-recent">
          {o.recent.map((r, i) => (
            <li key={i} className="break-all">
              {r.email} · {r.status}
              {r.error ? ` (${r.error.replace(/_/g, ' ')})` : ''} · {new Date(r.createdAt).toLocaleDateString()}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}
