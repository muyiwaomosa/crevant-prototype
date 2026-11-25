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
import { messageFor, type FounderMemberRequest, type FounderSwitches, type InvitationLink, type RegistrationSettings, type SwitchFeature } from './api'
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
  video_posts: { title: 'Video posts', body: 'Turns on only once the iPhone and Android device tests have passed and the video storage cap is set (see Video posts below).' },
}

export function SwitchesPanel() {
  const api = useAppApi()
  const [s, setS] = useState<FounderSwitches | null | undefined>(undefined)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<unknown>(null)
  // Video posts (20261213000000): offered only once both phone device tests passed and the cap is set (the server checks again).
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
