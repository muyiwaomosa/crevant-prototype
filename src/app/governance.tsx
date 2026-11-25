import clsx from 'clsx'
import { useCallback, useEffect, useId, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Ban, Bell, ShieldAlert } from 'lucide-react'
import { Card, EmptyState, Modal, PageHeader, buttonClass } from '../components/ui'
import { Message, Spinner } from '../public/auth/AuthUi'
import { messageFor, reasonLabel, type BlockedMember, type MemberNotice, type Standing } from './api'
import { useAppApi } from './AppApiContext'
import { When } from './components'

/**
 * Governance for members (IP-3, 20261206000000): blocking, the member's own
 * standing, moderation notices and appeals. The database enforces all of it;
 * this file only presents it. Notices never say who reported anything.
 */

export const APPEAL_MAX = 1000

const dateText = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

/** "Block" on someone's profile, with a plain explanation first. */
export function BlockButton({ memberId, name, onBlocked }: { memberId: string; name: string; onBlocked: () => void }) {
  const api = useAppApi()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  async function confirm() {
    setBusy(true)
    setError(null)
    try {
      await api.block(memberId)
      setOpen(false)
      onBlocked()
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Block ${name}`}
        className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-ink-600 hover:bg-ink-100"
      >
        <Ban className="h-4 w-4" aria-hidden="true" /> Block
      </button>
      {open && (
        <Modal open onClose={() => setOpen(false)} title={`Block ${name}?`}>
          <div className="space-y-4">
            <ul className="list-disc space-y-1.5 pl-5 text-[15px] text-ink-800">
              <li>You won't see each other's profiles, posts or comments, and neither of you can follow or comment on the other.</li>
              <li>Any follows between you end, and they leave your Clique (and you leave theirs).</li>
              <li>{name} isn't told. You can unblock from your profile at any time; follows don't come back on their own.</li>
            </ul>
            <p className="text-sm text-ink-600">If they broke the rules, you can still report them after blocking.</p>
            {error !== null && <Message tone="error">{messageFor(error)}</Message>}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setOpen(false)} className={buttonClass('secondary')}>
                Cancel
              </button>
              <button type="button" disabled={busy} onClick={confirm} className={buttonClass('danger')}>
                {busy ? 'Blocking…' : 'Block'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}

/** On a profile you can't see: if it's because you blocked them, say so and offer Unblock. */
export function BlockedProfilePanel({ username, fallback, onUnblocked }: { username: string; fallback: ReactNode; onUnblocked: () => void }) {
  const api = useAppApi()
  const [blocked, setBlocked] = useState<BlockedMember | null | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  useEffect(() => {
    let live = true
    api.myBlocks().then(
      (list) => live && setBlocked(list?.find((b) => b.username === username.toLowerCase()) ?? null),
      () => live && setBlocked(null),
    )
    return () => {
      live = false
    }
  }, [api, username])
  if (blocked === undefined) return <Spinner label="Loading profile…" />
  if (blocked === null) return <>{fallback}</>
  async function unblock() {
    setBusy(true)
    setError(null)
    try {
      await api.unblock(blocked!.id)
      onUnblocked()
    } catch (e) {
      setError(e)
      setBusy(false)
    }
  }
  return (
    <div data-testid="blocked-profile">
      <Card className="p-5">
        <h1 className="font-display text-xl font-bold text-ink-900">You blocked {blocked.displayName}</h1>
        <p className="mt-1 text-[15px] text-ink-700">
          You won't see each other on Splitpost while the block is in place. Unblocking doesn't bring back follows.
        </p>
        {error !== null && (
          <div className="mt-3">
            <Message tone="error">{messageFor(error)}</Message>
          </div>
        )}
        <button type="button" disabled={busy} onClick={unblock} className={`${buttonClass('secondary', 'sm')} mt-4`}>
          {busy ? 'Unblocking…' : `Unblock @${blocked.username}`}
        </button>
      </Card>
    </div>
  )
}

/** Your blocked members, on your profile. Hidden when you haven't blocked anyone. */
export function BlockedMembers() {
  const api = useAppApi()
  const [list, setList] = useState<BlockedMember[] | null | undefined>(undefined)
  const [error, setError] = useState<unknown>(null)
  const load = useCallback(async () => {
    try {
      setList(await api.myBlocks())
    } catch (e) {
      setError(e)
    }
  }, [api])
  useEffect(() => {
    void load()
  }, [load])
  if (!list || list.length === 0) return error !== null ? <Message tone="error">{messageFor(error)}</Message> : null
  return (
    <div data-testid="blocked-members">
      <Card className="mt-4 p-5">
        <h2 className="font-display text-lg font-bold text-ink-900">Blocked members</h2>
        <p className="mt-1 text-sm text-ink-600">They can't see you and you can't see them. They aren't told.</p>
        {error !== null && <Message tone="error">{messageFor(error)}</Message>}
        <ul className="mt-3 divide-y divide-ink-100">
          {list.map((b) => (
            <li key={b.id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate font-semibold text-ink-900">{b.displayName}</p>
                <p className="text-[13px] text-ink-500">
                  @{b.username} · blocked <When iso={b.blockedAt} />
                </p>
              </div>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await api.unblock(b.id)
                    await load()
                  } catch (e) {
                    setError(e)
                  }
                }}
                className={buttonClass('secondary', 'sm')}
              >
                Unblock
              </button>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}

function standingText(s: Standing) {
  const until = s.endsAt ? ` until ${dateText(s.endsAt)}` : ''
  return s.standing === 'suspended'
    ? `Your account is suspended${until || ' until a moderator lifts it'}. Other members can't see you, and you can't post or interact. You can still read your notices and appeal.`
    : `Your account is restricted${until}. You can read, follow and save, but you can't post, comment or repost.`
}

/** On Home: your restriction or suspension, and any unread notices. Nothing when all is well. */
export function GovernanceBanner() {
  const api = useAppApi()
  const [standing, setStanding] = useState<Standing | null>(null)
  const [unread, setUnread] = useState(0)
  useEffect(() => {
    let live = true
    api.myStanding().then(
      (s) => live && setStanding(s),
      () => undefined,
    )
    api.myNotices().then(
      (n) => live && setUnread((n ?? []).filter((x) => !x.read).length),
      () => undefined,
    )
    return () => {
      live = false
    }
  }, [api])
  if (!standing && unread === 0) return null
  return (
    <div
      role="status"
      data-testid="governance-banner"
      className={clsx(
        'mb-4 flex items-start gap-3 rounded-2xl px-4 py-3 text-sm ring-1',
        standing ? 'bg-[#fff6e6] text-[#6b4300] ring-[#f3d79c]' : 'bg-brand-50 text-brand-800 ring-brand-100',
      )}
    >
      {standing ? <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" /> : <Bell className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />}
      <div>
        {standing && <p className="font-semibold">{standingText(standing)}</p>}
        {unread > 0 && (
          <p className={standing ? 'mt-1' : 'font-semibold'}>You have {unread === 1 ? 'a new notice' : `${unread} new notices`} from the Splitpost team.</p>
        )}
        <Link to="/app/notices" className="mt-1 inline-block font-semibold underline underline-offset-2">
          See your notices
        </Link>
      </div>
    </div>
  )
}

const TARGET_TEXT: Record<string, string> = {
  post: 'post',
  comment: 'comment',
  profile: 'profile details',
}

function noticeText(n: MemberNotice): { title: string; body: string } {
  const what = TARGET_TEXT[n.targetType ?? ''] ?? 'content'
  const why = n.reason ? reasonLabel(n.reason).toLowerCase() : null
  switch (n.kind) {
    case 'content_hidden':
      return {
        title: `We hid your ${what}`,
        body: `A moderator found it broke our community guidelines${why ? ` (${why})` : ''}. Other members can no longer see it.`,
      }
    case 'content_restored':
      return {
        title: `Your ${what} is visible again`,
        body: 'A moderator restored it.',
      }
    case 'warning':
      return {
        title: 'A warning about your account',
        body: `${why ? `About ${why}. ` : ''}There are no limits on your account. If it happens again, your account may be restricted.`,
      }
    case 'restriction':
      return {
        title: 'Your account is restricted',
        body: `${why ? `About ${why}. ` : ''}${n.endsAt ? `Until ${dateText(n.endsAt)}, you` : 'You'} can read, follow and save, but can't post, comment or repost.`,
      }
    case 'suspension':
      return {
        title: 'Your account is suspended',
        body: `${why ? `About ${why}. ` : ''}${n.endsAt ? `Until ${dateText(n.endsAt)}, other` : 'Until a moderator lifts it, other'} members can't see you and you can't post or interact. You can still read notices and appeal.`,
      }
    case 'enforcement_lifted':
      return {
        title: 'A limit on your account has ended',
        body: 'A moderator ended it early.',
      }
    case 'appeal_reversed':
      return {
        title: 'Your appeal was successful',
        body: 'We reviewed it and reversed the decision.',
      }
    case 'appeal_upheld':
      return {
        title: 'Your appeal was reviewed',
        body: 'We kept the original decision.',
      }
  }
}

function AppealForm({ notice, onDone }: { notice: MemberNotice; onDone: () => Promise<void> }) {
  const api = useAppApi()
  const id = useId()
  const [open, setOpen] = useState(false)
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const used = [...body.trim()].length
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={`${buttonClass('secondary', 'sm')} mt-3`}>
        Appeal
      </button>
    )
  }
  async function submit(e: FormEvent) {
    e.preventDefault()
    if (used === 0 || used > APPEAL_MAX) return
    setBusy(true)
    setError(null)
    try {
      await api.appeal(notice.id, body)
      await onDone()
    } catch (err) {
      setError(err)
      setBusy(false)
    }
  }
  return (
    <form onSubmit={submit} className="mt-3 space-y-2" noValidate>
      <label htmlFor={id} className="block text-sm font-semibold text-ink-800">
        Why should we look again?
      </label>
      <textarea
        id={id}
        value={body}
        rows={3}
        onChange={(e) => setBody(e.target.value)}
        aria-describedby={`${id}-help`}
        className="block w-full resize-none rounded-2xl border border-ink-200 bg-white px-4 py-3 text-base text-ink-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
      />
      <p id={`${id}-help`} className={clsx('text-sm', used > APPEAL_MAX ? 'font-semibold text-[#8a2018]' : 'text-ink-500')}>
        {used}/{APPEAL_MAX}. A different moderator reviews it whenever one is available. You can appeal once.
      </p>
      {error !== null && <Message tone="error">{messageFor(error)}</Message>}
      <div className="flex gap-2">
        <button type="submit" disabled={busy || used === 0 || used > APPEAL_MAX} className={buttonClass('primary', 'sm')}>
          {busy ? 'Sending…' : 'Send appeal'}
        </button>
        <button type="button" onClick={() => setOpen(false)} className={buttonClass('secondary', 'sm')}>
          Cancel
        </button>
      </div>
    </form>
  )
}

const APPEAL_TEXT: Record<string, string> = {
  open: "Appeal sent. We'll let you know the decision.",
  upheld: 'Appeal reviewed: decision kept.',
  reversed: 'Appeal successful: decision reversed.',
}

export function NoticesPage() {
  const api = useAppApi()
  const [notices, setNotices] = useState<MemberNotice[] | null | undefined>(undefined)
  const [error, setError] = useState<unknown>(null)
  const load = useCallback(async () => {
    try {
      setNotices(await api.myNotices())
      setError(null)
    } catch (e) {
      setError(e)
    }
  }, [api])
  useEffect(() => {
    void load().then(() => api.markNoticesRead().catch(() => undefined))
  }, [load, api])
  return (
    <>
      <PageHeader title="Notices" subtitle="Messages from the Splitpost team about your content or account. They never say who reported anything." />
      {error !== null && <Message tone="error">{messageFor(error)}</Message>}
      {notices === undefined && error === null && <Spinner label="Loading notices…" />}
      {notices && notices.length === 0 && (
        <EmptyState icon={<Bell className="h-7 w-7" />} title="No notices" body="If a moderator acts on your content or account, you'll find it here." />
      )}
      {notices === null && <EmptyState icon={<Bell className="h-7 w-7" />} title="No notices" body="Notices aren't available yet." />}
      {notices && notices.length > 0 && (
        <ul className="space-y-3" aria-label="Your notices">
          {notices.map((n) => {
            const t = noticeText(n)
            return (
              <li key={n.id}>
                <div data-testid="notice">
                  <Card className="p-4">
                    <p className="flex flex-wrap items-center gap-2 font-semibold text-ink-900">
                      {t.title}
                      {!n.read && <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[11px] font-bold text-brand-800">New</span>}
                    </p>
                    <p className="mt-1 text-[15px] text-ink-700">{t.body}</p>
                    {n.excerpt && <blockquote className="mt-2 border-l-4 border-ink-200 pl-3 text-[14px] text-ink-600">{n.excerpt}</blockquote>}
                    <p className="mt-2 text-[13px] text-ink-500">
                      <When iso={n.createdAt} />
                    </p>
                    {n.appealStatus && <p className="mt-2 text-sm font-semibold text-ink-800">{APPEAL_TEXT[n.appealStatus]}</p>}
                  {n.sameModerator && (
                    <p className="mt-2 text-sm text-ink-700" data-testid="same-moderator">
                      No other moderator was available, so the moderator who made the original decision reviewed your appeal. Their reasons are on record.
                    </p>
                  )}
                    {n.canAppeal && <AppealForm notice={n} onDone={load} />}
                  </Card>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}
