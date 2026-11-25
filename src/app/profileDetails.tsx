import clsx from 'clsx'
import { useEffect, useId, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Check } from 'lucide-react'
import { Card, buttonClass } from '../components/ui'
import { Message, Spinner } from '../public/auth/AuthUi'
import {
  IDENTITIES,
  LIMITS,
  messageFor,
  shortTextProblem,
  type DiscoverMember,
  type Identity,
  type MyDetails,
  type ProfileDetails,
  type Topic,
  type FollowSource,
} from './api'
import { useAppApi } from './AppApiContext'
import { MemberAvatar, MemberLink, RelationshipButtons } from './components'
import { ProfilePictureField } from './avatars'
import { InviterCard, MySplitIntro } from './onboarding'

/**
 * Profile details (Build 5, Stage 5.1): identity preference, interests, bio
 * and "Why should people follow you?". Used by first-time setup, the profile
 * editor, profile pages and Discover.
 *
 * The identity preference only describes the member. It never changes what
 * they can do: the database decides access from pilot membership alone.
 */

export const IDENTITY_TEXT: Record<Identity, { label: string; body: string; badge: string }> = {
  creator: { label: 'Share my own work', body: "I'd like to post and grow an audience.", badge: 'Creator' },
  fan: { label: "Find creators I'll love", body: "I'm mostly here to discover, follow and support.", badge: 'Fan' },
  both: { label: 'A bit of both', body: 'I want to post and to follow other creators.', badge: 'Creator and fan' },
}

/** Step N of M, as text and a progress bar. */
export function SetupProgress({ step, total, label }: { step: number; total: number; label: string }) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-brand-700">
        Step {step} of {total}: {label}
      </p>
      <div
        role="progressbar"
        aria-label="Profile setup"
        aria-valuemin={1}
        aria-valuemax={total}
        aria-valuenow={step}
        aria-valuetext={`Step ${step} of ${total}: ${label}`}
        className="h-2 overflow-hidden rounded-full bg-ink-100"
      >
        <div className="h-full rounded-full bg-brand-600 transition-[width]" style={{ width: `${(step / total) * 100}%` }} />
      </div>
    </div>
  )
}

export function IdentityPicker({ value, onChange, hideLegend }: { value: Identity | null; onChange: (v: Identity | null) => void; hideLegend?: boolean }) {
  const name = useId()
  return (
    <fieldset>
      {/* In setup the page heading asks the same question, so the legend is for screen readers only there. */}
      <legend className={hideLegend ? 'sr-only' : 'text-sm font-semibold text-ink-800'}>What brings you to Splitpost?</legend>
      <p id={`${name}-note`} className="mt-1 text-sm text-ink-500">
        Optional. It only helps us suggest where to start. Every account can post, follow, build a Clique and advertise, whatever you choose, and you can change
        it later.
      </p>
      <div className="mt-3 grid gap-2" aria-describedby={`${name}-note`}>
        {IDENTITIES.map((id) => {
          const checked = value === id
          return (
            <label
              key={id}
              className={clsx(
                'flex min-h-14 cursor-pointer items-start gap-3 rounded-2xl border px-4 py-3 transition focus-within:ring-2 focus-within:ring-brand-300',
                checked ? 'border-brand-500 bg-brand-50' : 'border-ink-200 bg-white hover:border-ink-300',
              )}
            >
              <input type="radio" name={name} value={id} checked={checked} onChange={() => onChange(id)} className="mt-1 h-4 w-4 accent-brand-600" />
              <span>
                <span className="block font-semibold text-ink-900">{IDENTITY_TEXT[id].label}</span>
                <span className="block text-sm text-ink-600">{IDENTITY_TEXT[id].body}</span>
              </span>
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}

/** We suggest at least this many interests (never required): fewer give thinner suggestions. */
export const SUGGESTED_TOPICS = 3

/** How many interests are chosen, nudging toward 3 without requiring any. */
export function topicProgress(n: number): string {
  if (n === 0) return 'Nothing chosen yet.'
  if (n < SUGGESTED_TOPICS) {
    const more = SUGGESTED_TOPICS - n
    return `${n} chosen. Pick ${more} more for better suggestions.`
  }
  if (n >= LIMITS.topics) return `${n} of ${LIMITS.topics} chosen, the most you can pick.`
  return `${n} of ${LIMITS.topics} chosen. That's enough to find your people.`
}

export function TopicPicker({
  topics,
  value,
  onChange,
  hideLegend,
  max = LIMITS.topics,
  legend = 'Your interests',
  hint,
}: {
  topics: Topic[]
  value: string[]
  onChange: (v: string[]) => void
  hideLegend?: boolean
  /** Creator posting topics use 3 (20261211000000); interests use 5. */
  max?: number
  legend?: string
  hint?: string
}) {
  const id = useId()
  const full = value.length >= max
  const enough = value.length >= SUGGESTED_TOPICS
  const interests = max === LIMITS.topics
  return (
    <fieldset>
      <legend className={hideLegend ? 'sr-only' : 'text-sm font-semibold text-ink-800'}>{legend}</legend>
      <p id={`${id}-hint`} className="mt-1 text-sm text-ink-500">
        {hint ?? `We suggest at least ${SUGGESTED_TOPICS}. You can choose up to ${LIMITS.topics}, and change them any time.`}
      </p>
      <p
        id={`${id}-count`}
        aria-live="polite"
        data-testid={interests ? 'topic-progress' : 'posting-topic-progress'}
        className={clsx('mt-1 text-sm font-semibold', (interests ? enough : value.length > 0) ? 'text-brand-800' : 'text-ink-700')}
      >
        {interests ? topicProgress(value.length) : `${value.length} of ${max} chosen`}
      </p>
      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-describedby={`${id}-hint ${id}-count`}>
        {topics.map((t) => {
          const on = value.includes(t.slug)
          const disabled = !on && full
          return (
            <button
              key={t.slug}
              type="button"
              aria-pressed={on}
              disabled={disabled}
              onClick={() => onChange(on ? value.filter((s) => s !== t.slug) : [...value, t.slug])}
              className={clsx(
                'inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300',
                on ? 'border-brand-700 bg-brand-700 text-white' : 'border-ink-200 bg-white text-ink-800 hover:border-ink-300',
                disabled && 'cursor-not-allowed opacity-50',
              )}
            >
              {on && <Check className="h-4 w-4" aria-hidden="true" />}
              {t.label}
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}

/** A one-paragraph text box with a live character count. */
export function ShortText({
  label,
  hint,
  value,
  onChange,
  max,
  placeholder,
}: {
  label: string
  hint: string
  value: string
  onChange: (v: string) => void
  max: number
  placeholder?: string
}) {
  const id = useId()
  const used = [...value.trim()].length
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-semibold text-ink-800">
        {label}
      </label>
      <textarea
        id={id}
        value={value}
        rows={2}
        placeholder={placeholder}
        // One paragraph: line breaks become spaces as they're typed or pasted.
        onChange={(e) => onChange(e.target.value.replace(/[\r\n]+/g, ' '))}
        aria-describedby={`${id}-hint ${id}-count`}
        className="mt-1.5 block w-full resize-none rounded-2xl border border-ink-200 bg-white px-4 py-3 text-base text-ink-900 outline-none transition placeholder:text-ink-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
      />
      <div className="mt-1.5 flex justify-between gap-3 text-sm">
        <p id={`${id}-hint`} className="text-ink-500">
          {hint}
        </p>
        <p id={`${id}-count`} className={clsx('shrink-0 tabular-nums', used > max ? 'font-semibold text-[#8a2018]' : 'text-ink-500')}>
          {used}/{max}
        </p>
      </div>
    </div>
  )
}

export function detailsProblem(d: ProfileDetails): string | null {
  return (
    shortTextProblem(d.bio ?? '', LIMITS.bio, 'your bio') ??
    shortTextProblem(d.followReason ?? '', LIMITS.followReason, 'this') ??
    (d.topics.length > LIMITS.topics ? `Choose up to ${LIMITS.topics} interests.` : null)
  )
}

/** Only the four saved fields (never anything else the page holds). */
const fields = (d: ProfileDetails): ProfileDetails => ({ identity: d.identity, bio: d.bio, followReason: d.followReason, topics: d.topics })

/** The topic list, or null while loading or when the database has none. */
export function useTopics() {
  const api = useAppApi()
  const [topics, setTopics] = useState<Topic[] | null | undefined>(undefined)
  const [error, setError] = useState<unknown>(null)
  useEffect(() => {
    let live = true
    api.topics().then(
      (t) => live && setTopics(t),
      (e) => live && (setError(e), setTopics(null)),
    )
    return () => {
      live = false
    }
  }, [api])
  return { topics, error }
}

// ---------------------------------------------------------------------------
// First-time setup, after the name step: identity, interests, bio and follow
// statement, then people to follow. Every step can be skipped; nothing here is
// required to use Splitpost.

export const SETUP_STEPS = ['Your name', 'What brings you here', 'Your interests', 'About you', 'People to follow', 'How My Split works'] as const

export function DetailsSetup({ initial, onDone }: { initial: MyDetails; onDone: () => void }) {
  const api = useAppApi()
  const { topics } = useTopics()
  const [step, setStep] = useState(2)
  const [draft, setDraft] = useState<ProfileDetails>(fields(initial))
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const set = (patch: Partial<ProfileDetails>) => setDraft((d) => ({ ...d, ...patch }))
  const headingId = useId()

  // Bring the new step into view and move focus to its heading, for keyboards and screen readers.
  useEffect(() => {
    document.getElementById(headingId)?.focus()
  }, [step, headingId])

  async function saveAndContinue(e?: FormEvent) {
    e?.preventDefault()
    const p = detailsProblem(draft)
    if (p) {
      setProblem(p)
      return
    }
    setBusy(true)
    setProblem(null)
    try {
      await api.saveDetails(fields(draft))
      setStep(5)
    } catch (err) {
      setProblem(messageFor(err))
    } finally {
      setBusy(false)
    }
  }

  const label = SETUP_STEPS[step - 1]
  const skip = (next: () => void, what: string) => (
    <button type="button" onClick={next} className="text-sm font-semibold text-ink-600 underline underline-offset-2" aria-label={`Skip for now: ${what}`}>
      Skip for now
    </button>
  )

  let body: ReactNode
  if (step === 2) {
    body = (
      <>
        <IdentityPicker value={draft.identity} onChange={(identity) => set({ identity })} hideLegend />
        <div className="flex items-center justify-between gap-3">
          {skip(() => (set({ identity: null }), setStep(3)), 'what brings you here')}
          <button type="button" onClick={() => setStep(3)} className={buttonClass('primary')}>
            Continue
          </button>
        </div>
      </>
    )
  } else if (step === 3) {
    body = (
      <>
        {topics === undefined && <Spinner label="Loading interests…" />}
        {topics === null && <Message tone="info">Interests aren't available right now. You can add them later from your profile.</Message>}
        <p className="text-[15px] leading-relaxed text-ink-700">Choose what you love so we can help you find your people.</p>
        {topics && <TopicPicker topics={topics} value={draft.topics} onChange={(t) => set({ topics: t })} hideLegend />}
        <div className="flex items-center justify-between gap-3">
          <button type="button" onClick={() => setStep(2)} className={buttonClass('secondary')}>
            Back
          </button>
          <div className="flex items-center gap-4">
            {skip(() => (set({ topics: [] }), setStep(4)), 'your interests')}
            <button type="button" onClick={() => setStep(4)} className={buttonClass('primary')}>
              Continue
            </button>
          </div>
        </div>
      </>
    )
  } else if (step === 4) {
    body = (
      <form onSubmit={saveAndContinue} className="space-y-4" noValidate>
        <ProfilePictureField optionalNote />
        <ShortText
          label="Short bio"
          hint="Optional. One line about you."
          value={draft.bio ?? ''}
          onChange={(bio) => set({ bio })}
          max={LIMITS.bio}
          placeholder="Home cook sharing budget recipes from Toronto."
        />
        <ShortText
          label="Why should people follow you?"
          hint="Optional. Shown on your profile and in Discover."
          value={draft.followReason ?? ''}
          onChange={(followReason) => set({ followReason })}
          max={LIMITS.followReason}
          placeholder="A new 20-minute recipe every week."
        />
        {problem && <Message tone="error">{problem}</Message>}
        <div className="flex items-center justify-between gap-3">
          <button type="button" onClick={() => setStep(3)} className={buttonClass('secondary')}>
            Back
          </button>
          <button type="submit" disabled={busy} className={buttonClass('primary')}>
            {busy ? 'Saving…' : 'Save and continue'}
          </button>
        </div>
      </form>
    )
  } else if (step === 5) {
    body = (
      <>
        <Message tone="success">Your profile is saved. You can change it any time from Profile.</Message>
        <InviterCard />
        <SuggestedPeople heading={null} emptyText="No suggestions yet. As more members join, people who share your interests will appear here." />
        <button type="button" onClick={() => setStep(6)} className={`${buttonClass('primary')} w-full`}>
          Continue
        </button>
      </>
    )
  } else {
    const creating = draft.identity === 'creator' || draft.identity === 'both'
    body = (
      <>
        <MySplitIntro heading={null} />
        {creating && (
          <p className="rounded-2xl bg-brand-50 px-4 py-3 text-[14px] leading-relaxed text-ink-800 ring-1 ring-brand-100">
            Ready to share your own work? Your Profile has a short creator setup: what you post about, your first post and your invitation link.
          </p>
        )}
        <div className="flex flex-col gap-2 sm:flex-row">
          {creating && (
            <Link to="/app/profile" onClick={onDone} className={`${buttonClass('secondary')} w-full sm:w-auto`}>
              Set up my creator profile
            </Link>
          )}
          <button type="button" onClick={onDone} className={`${buttonClass('primary')} w-full sm:flex-1`}>
            Go to my feed
          </button>
        </div>
      </>
    )
  }

  return (
    <main id="main" className="px-4 py-8 sm:py-14">
      <div className="mx-auto max-w-md space-y-5">
        <SetupProgress step={step} total={SETUP_STEPS.length} label={label} />
        <Card className="space-y-5 p-5 sm:p-6">
          <h1 id={headingId} tabIndex={-1} className="font-display text-2xl font-extrabold text-ink-900 outline-none">
            {step === 2 && 'What brings you to Splitpost?'}
            {step === 3 && 'What are you into?'}
            {step === 4 && 'Tell people about you'}
            {step === 5 && 'People you might like'}
            {step === 6 && 'How My Split works'}
          </h1>
          {body}
        </Card>
        {step < 5 && (
          <p className="text-center text-sm text-ink-500">
            Everything here is optional.{' '}
            <button type="button" onClick={() => void saveAndContinue()} disabled={busy} className="font-semibold text-brand-700 underline underline-offset-2">
              Skip the rest
            </button>
          </p>
        )}
      </div>
    </main>
  )
}

// ---------------------------------------------------------------------------
// Editing details later, from Profile.

export function DetailsEditor() {
  const api = useAppApi()
  const { topics } = useTopics()
  const [draft, setDraft] = useState<ProfileDetails | null | undefined>(undefined)
  const [loadError, setLoadError] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  useEffect(() => {
    let live = true
    api.myDetails().then(
      (d) => live && setDraft(d),
      (e) => live && setLoadError(e),
    )
    return () => {
      live = false
    }
  }, [api])

  if (loadError !== null) return <Message tone="error">{messageFor(loadError)}</Message>
  if (draft === undefined) return <Spinner label="Loading your details…" />
  // A database without profile details: nothing to edit yet.
  if (draft === null) return null
  const set = (patch: Partial<ProfileDetails>) => {
    setSaved(false)
    setDraft((d) => (d ? { ...d, ...patch } : d))
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!draft) return
    const p = detailsProblem(draft)
    if (p) {
      setProblem(p)
      return
    }
    setBusy(true)
    setProblem(null)
    try {
      await api.saveDetails(fields(draft))
      setSaved(true)
    } catch (err) {
      setProblem(messageFor(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate aria-labelledby="about-you-title">
      <h2 id="about-you-title" className="font-display text-lg font-bold text-ink-900">
        About you
      </h2>
      <IdentityPicker value={draft.identity} onChange={(identity) => set({ identity })} />
      {topics && <TopicPicker topics={topics} value={draft.topics} onChange={(t) => set({ topics: t })} />}
      <ShortText label="Short bio" hint="Optional. One line about you." value={draft.bio ?? ''} onChange={(bio) => set({ bio })} max={LIMITS.bio} />
      <ShortText
        label="Why should people follow you?"
        hint="Optional. Shown on your profile and in Discover."
        value={draft.followReason ?? ''}
        onChange={(followReason) => set({ followReason })}
        max={LIMITS.followReason}
      />
      {problem && <Message tone="error">{problem}</Message>}
      {saved && !problem && <Message tone="success">Saved.</Message>}
      <button type="submit" disabled={busy} className={`${buttonClass('primary')} w-full`}>
        {busy ? 'Saving…' : 'Save details'}
      </button>
    </form>
  )
}

// ---------------------------------------------------------------------------
// Showing details.

export function TopicTags({ slugs, topics, highlight }: { slugs: string[]; topics: Topic[] | null | undefined; highlight?: string[] }) {
  if (slugs.length === 0) return null
  const label = (s: string) => topics?.find((t) => t.slug === s)?.label ?? s
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Interests">
      {slugs.map((s) => (
        <li
          key={s}
          className={clsx(
            'rounded-full px-2.5 py-0.5 text-[13px] font-semibold',
            highlight?.includes(s) ? 'bg-brand-50 text-brand-800 ring-1 ring-brand-100' : 'bg-ink-100/70 text-ink-700',
          )}
        >
          {label(s)}
        </li>
      ))}
    </ul>
  )
}

/** Bio, identity, follow statement and interests, for a profile page. Shows nothing when empty. */
export function MemberAbout({ details, topics }: { details: ProfileDetails | null | undefined; topics: Topic[] | null | undefined }) {
  if (!details) return null
  // The goal question is private personalization (unified account): never shown as a public label.
  const { bio, followReason } = details
  if (!bio && !followReason && details.topics.length === 0) return null
  return (
    <div className="mt-4 space-y-3" data-testid="member-about">
      {bio && <p className="text-[15px] leading-relaxed text-ink-800">{bio}</p>}
      {followReason && (
        <div className="rounded-2xl bg-brand-50 px-4 py-3 ring-1 ring-brand-100">
          <p className="text-[13px] font-semibold text-brand-800">Why follow</p>
          <p className="text-[15px] leading-relaxed text-ink-900">{followReason}</p>
        </div>
      )}
      <TopicTags slugs={details.topics} topics={topics} />
    </div>
  )
}

/** A Discover or suggestion card: who they are, why to follow, shared interests, and the follow buttons. */
export function PersonSummary({
  member,
  topics,
  onChange,
  myTopics,
  source = 'discover',
}: {
  member: DiscoverMember
  topics: Topic[] | null | undefined
  onChange: (next: { followedByMe: boolean; inMyClique: boolean }) => void | Promise<void>
  myTopics?: string[]
  /** Where a follow from this card starts (20261204000000 adds 'search'). */
  source?: FollowSource
}) {
  const profile = `/app/u/${member.username}`
  const d = member.details
  return (
    <Card className="p-4">
      <div className="flex min-w-0 items-center gap-3">
        <Link to={profile} aria-hidden="true" tabIndex={-1} className="shrink-0">
          <MemberAvatar member={member} size={44} />
        </Link>
        <div className="min-w-0 flex-1 leading-tight">
          <MemberLink member={member} className="block truncate" />
          <p className="truncate text-[13px] text-ink-500">
            @{member.username}
            {' · '}
            {member.postCount} {member.postCount === 1 ? 'post' : 'posts'} · {member.followerCount} {member.followerCount === 1 ? 'follower' : 'followers'}
          </p>
        </div>
      </div>
      {d?.bio && <p className="mt-3 text-[15px] leading-relaxed text-ink-800">{d.bio}</p>}
      {d?.followReason && (
        <p className="mt-2 text-[15px] leading-relaxed text-ink-800">
          <span className="font-semibold text-brand-800">Why follow: </span>
          {d.followReason}
        </p>
      )}
      {d && d.topics.length > 0 && (
        <div className="mt-3">
          <TopicTags slugs={d.topics} topics={topics} highlight={myTopics} />
          {member.sharedTopics ? <p className="mt-1.5 text-[13px] text-ink-500">Shares {member.sharedTopics} of your interests</p> : null}
        </div>
      )}
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <RelationshipButtons member={member} onChange={onChange} source={source} postsHref={member.postCount > 0 ? `${profile}#posts` : undefined} />
        {member.postCount > 0 && (
          <Link to={`${profile}#posts`} aria-label={`See posts by ${member.displayName}`} className="text-sm font-semibold text-brand-700 underline sm:mt-1.5">
            See posts
          </Link>
        )}
      </div>
    </Card>
  )
}

/**
 * People the member doesn't follow yet, shared interests first. Shows
 * nothing on a database without profile details (the list is empty).
 */
export function SuggestedPeople({ heading = 'Suggested for you', emptyText, limit = 5 }: { heading?: string | null; emptyText?: string; limit?: number }) {
  const api = useAppApi()
  const { topics } = useTopics()
  const [people, setPeople] = useState<DiscoverMember[] | undefined>(undefined)
  const [mine, setMine] = useState<string[]>([])
  const [error, setError] = useState<unknown>(null)
  useEffect(() => {
    let live = true
    Promise.all([api.suggested(), api.myDetails().catch(() => null)]).then(
      ([s, d]) => {
        if (!live) return
        setPeople(s.slice(0, limit))
        setMine(d?.topics ?? [])
      },
      (e) => live && setError(e),
    )
    return () => {
      live = false
    }
  }, [api, limit])

  if (error !== null) return <Message tone="error">{messageFor(error)}</Message>
  if (people === undefined) return <Spinner label="Finding people for you…" />
  if (people.length === 0) return emptyText ? <Message tone="info">{emptyText}</Message> : null
  return (
    <section aria-labelledby={heading ? 'suggested-title' : undefined} aria-label={heading ? undefined : 'Suggested people'} data-testid="suggested-people">
      {heading && (
        <h2 id="suggested-title" className="mb-2 font-display text-lg font-bold text-ink-900">
          {heading}
        </h2>
      )}
      <ul className="space-y-3">
        {people.map((m) => (
          <li key={m.id}>
            <PersonSummary
              member={m}
              topics={topics}
              myTopics={mine}
              // Keep the new state locally: suggestions leave out people you follow,
              // so refetching would drop the person (and lose "In your Clique").
              onChange={(next) => setPeople((list) => list?.map((p) => (p.id === m.id ? { ...p, ...next } : p)))}
            />
          </li>
        ))}
      </ul>
    </section>
  )
}
