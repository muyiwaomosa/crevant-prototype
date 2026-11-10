import clsx from 'clsx'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { buttonClass } from '../../components/ui'
import { readAcquisition, type WaitlistConfig } from './config'
import { mountTurnstile, type MountTurnstile, type TurnstileWidget } from './turnstile'

// The unified waitlist form. Rendered only when readWaitlistConfig() returns a
// configuration, which needs the approved privacy notice (docs/WAITLIST.md).
// Required: email, 18+ and waitlist consent. Everything else is optional.
// There is no marketing consent option until email addresses can be verified
// (docs/WAITLIST.md); the server refuses to store one either way.

export const INTERESTS: Array<[string, string]> = [
  ['reach_followers', 'Reaching the people who follow me'],
  ['closer_community', 'Building a closer community'],
  ['support_creators', 'Supporting creators I care about'],
  ['discover_creators', 'Discovering new creators'],
  ['sustainable_income', 'Earning more sustainably from my work'],
  ['shape_platform', 'Helping shape a new social network'],
]
export const PLATFORMS: Array<[string, string]> = [
  ['youtube', 'YouTube'],
  ['tiktok', 'TikTok'],
  ['instagram', 'Instagram'],
  ['twitch', 'Twitch'],
  ['x', 'X'],
  ['facebook', 'Facebook'],
  ['podcast', 'Podcast'],
  ['newsletter', 'Newsletter or blog'],
  ['other', 'Other'],
]
export const AUDIENCE: Array<[string, string]> = [
  ['under_1k', 'Under 1,000'],
  ['1k_10k', '1,000 to 10,000'],
  ['10k_100k', '10,000 to 100,000'],
  ['over_100k', 'Over 100,000'],
]

type Outcome = 'idle' | 'sending' | 'ok' | 'closed' | 'rate_limited' | 'verification_failed' | 'notice_changed' | 'invalid' | 'error'

const MESSAGES: Partial<Record<Outcome, string>> = {
  closed: "The waitlist isn't open right now. Please try again later.",
  rate_limited: 'Too many attempts. Please try again later.',
  verification_failed: 'Please complete the check above and try again.',
  notice_changed: 'Our privacy notice has been updated. Please reload the page and try again.',
  invalid: 'Some details look wrong. Please check them and try again.',
  error: 'Something went wrong. Please try again.',
}

type Errors = Partial<Record<'email' | 'age' | 'consent' | 'check', string>>

export function WaitlistForm({
  config,
  mount = mountTurnstile,
  fetchImpl = (...a: Parameters<typeof fetch>) => fetch(...a),
  search = typeof window !== 'undefined' ? window.location.search : '',
}: {
  config: WaitlistConfig
  mount?: MountTurnstile
  fetchImpl?: typeof fetch
  search?: string
}) {
  const [email, setEmail] = useState('')
  const [interests, setInterests] = useState<string[]>([])
  const [shares, setShares] = useState<'' | 'yes' | 'not_yet'>('')
  const [platform, setPlatform] = useState('')
  const [audience, setAudience] = useState('')
  const [website, setWebsite] = useState('')
  const [age, setAge] = useState(false)
  const [consent, setConsent] = useState(false)
  const [token, setToken] = useState<string | null>(null)
  const [errors, setErrors] = useState<Errors>({})
  const [outcome, setOutcome] = useState<Outcome>('idle')
  const box = useRef<HTMLDivElement>(null)
  const widget = useRef<TurnstileWidget | null>(null)

  useEffect(() => {
    let cancelled = false
    if (!box.current) return
    mount(box.current, config.turnstileSiteKey, setToken)
      .then((w) => {
        if (cancelled) w.remove()
        else widget.current = w
      })
      .catch(() => setErrors((e) => ({ ...e, check: 'The security check could not load. Please refresh the page.' })))
    return () => {
      cancelled = true
      widget.current?.remove()
    }
  }, [mount, config.turnstileSiteKey])

  function validate(): Errors {
    const e: Errors = {}
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) e.email = 'Please enter a valid email address.'
    if (!age) e.age = "Please confirm you're 18 or older."
    if (!consent) e.consent = 'Please agree so we can contact you about the pilot.'
    if (!token) e.check = 'Please complete the check below.'
    return e
  }

  async function submit(ev: FormEvent) {
    ev.preventDefault()
    const e = validate()
    setErrors(e)
    if (Object.keys(e).length) return
    setOutcome('sending')
    const { source } = readAcquisition(search)
    const yes = shares === 'yes'
    const body = {
      email: email.trim(),
      interests,
      sharesContent: shares || null,
      platform: yes && platform ? platform : null,
      audienceBand: yes && audience ? audience : null,
      source,
      ageConfirmed: age,
      waitlistConsent: consent,
      noticeVersion: config.noticeVersion,
      turnstileToken: token,
      website,
    }
    let next: Outcome = 'error'
    try {
      const res = await fetchImpl(config.endpoint, {
        method: 'POST',
        // JSON only: no key or token. The server function checks the origin,
        // Turnstile and its own switches.
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = (await res.json().catch(() => ({}))) as { status?: string }
      const s = data.status
      next = s === 'ok' || s === 'closed' || s === 'rate_limited' || s === 'verification_failed' || s === 'notice_changed' || s === 'invalid' ? s : 'error'
    } catch {
      next = 'error'
    }
    setOutcome(next)
    if (next !== 'ok') {
      // A Turnstile token works once: get a fresh one for the next try.
      setToken(null)
      widget.current?.reset()
    }
  }

  if (outcome === 'ok') {
    return (
      <div data-testid="waitlist-success" role="status" className="mt-8 rounded-3xl bg-brand-50 p-6 ring-1 ring-brand-100">
        <p className="font-display text-xl font-bold text-ink-900">Thanks, you're on the waitlist.</p>
        <p className="mt-2 leading-relaxed text-ink-600">
          We're inviting people in small groups as we build and test the platform. If there's a place for you, we'll email you an invitation.
        </p>
      </div>
    )
  }

  const field = 'mt-1.5 block w-full rounded-2xl border border-ink-200 bg-white px-4 py-3 text-base text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200'
  const err = (id: keyof Errors) =>
    errors[id] ? (
      <p id={`wl-${id}-error`} className="mt-1.5 text-sm font-medium text-red-700">
        {errors[id]}
      </p>
    ) : null

  return (
    <form data-testid="waitlist-form" noValidate onSubmit={submit} className="mt-8 space-y-6 rounded-3xl bg-white p-5 ring-1 ring-ink-100 sm:p-7">
      <div>
        <label htmlFor="wl-email" className="font-semibold text-ink-900">
          Email address
        </label>
        <input
          id="wl-email"
          type="email"
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={!!errors.email}
          aria-describedby={errors.email ? 'wl-email-error' : 'wl-email-help'}
          className={field}
        />
        <p id="wl-email-help" className="mt-1.5 text-sm text-ink-500">
          We'll use this to contact you about the pilot.
        </p>
        {err('email')}
      </div>

      <fieldset>
        <legend className="font-semibold text-ink-900">
          What interests you most about Crevant? <span className="font-normal text-ink-500">Optional, choose any</span>
        </legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {INTERESTS.map(([value, label]) => {
            const on = interests.includes(value)
            return (
              <label key={value} className={clsx('cursor-pointer rounded-full px-3.5 py-2 text-sm ring-1', on ? 'bg-brand-600 text-white ring-brand-600' : 'bg-paper text-ink-700 ring-ink-200')}>
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={on}
                  onChange={() => setInterests((xs) => (on ? xs.filter((x) => x !== value) : [...xs, value]))}
                />
                {label}
              </label>
            )
          })}
        </div>
      </fieldset>

      <fieldset>
        <legend className="font-semibold text-ink-900">
          Do you share your own content anywhere today? <span className="font-normal text-ink-500">Optional</span>
        </legend>
        <div className="mt-2 flex gap-2">
          {(
            [
              ['yes', 'Yes'],
              ['not_yet', 'Not yet'],
            ] as const
          ).map(([value, label]) => (
            <label key={value} className={clsx('cursor-pointer rounded-full px-4 py-2 text-sm ring-1', shares === value ? 'bg-brand-600 text-white ring-brand-600' : 'bg-paper text-ink-700 ring-ink-200')}>
              <input type="radio" name="wl-shares" className="sr-only" checked={shares === value} onChange={() => setShares(value)} />
              {label}
            </label>
          ))}
        </div>
        {shares === 'yes' && (
          <div data-testid="waitlist-sharing-details" className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="wl-platform" className="text-sm font-semibold text-ink-800">
                Where? <span className="font-normal text-ink-500">Optional</span>
              </label>
              <select id="wl-platform" value={platform} onChange={(e) => setPlatform(e.target.value)} className={field}>
                <option value="">Choose one</option>
                {PLATFORMS.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="wl-audience" className="text-sm font-semibold text-ink-800">
                Roughly how many followers? <span className="font-normal text-ink-500">Optional</span>
              </label>
              <select id="wl-audience" value={audience} onChange={(e) => setAudience(e.target.value)} className={field}>
                <option value="">Choose one</option>
                {AUDIENCE.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </fieldset>

      {/* Honeypot: hidden from people and screen readers; bots fill it in. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor="wl-website">Leave this field empty</label>
        <input id="wl-website" name="website" type="text" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
      </div>

      <div className="space-y-3">
        <label className="flex gap-3 text-ink-700">
          <input type="checkbox" checked={age} onChange={(e) => setAge(e.target.checked)} aria-invalid={!!errors.age} className="mt-1 h-5 w-5 shrink-0 accent-brand-600" />
          <span>I'm 18 or older.</span>
        </label>
        {err('age')}
        <label className="flex gap-3 text-ink-700">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} aria-invalid={!!errors.consent} className="mt-1 h-5 w-5 shrink-0 accent-brand-600" />
          <span>
            I agree that Crevant can store these details and email me about the pilot, as described in the{' '}
            <a href={config.noticeUrl} className="font-semibold text-brand-700 underline underline-offset-2">
              privacy notice
            </a>
            .
          </span>
        </label>
        {err('consent')}
      </div>

      <div>
        <div ref={box} data-testid="turnstile" />
        {err('check')}
      </div>

      <div aria-live="polite">
        {MESSAGES[outcome] && (
          <p data-testid="waitlist-message" role="alert" className="rounded-2xl bg-spark-50 px-4 py-3 text-sm font-medium text-ink-800 ring-1 ring-spark-200">
            {MESSAGES[outcome]}
          </p>
        )}
      </div>

      <div>
        <button type="submit" disabled={outcome === 'sending'} className={clsx(buttonClass('primary', 'lg'), 'w-full sm:w-auto')}>
          {outcome === 'sending' ? 'Joining…' : 'Join the Waitlist'}
        </button>
        <p className="mt-3 text-sm leading-relaxed text-ink-500">
          Joining the waitlist doesn't create an account or secure a place in the pilot. You can ask us to delete your details at any time.
        </p>
      </div>
    </form>
  )
}
