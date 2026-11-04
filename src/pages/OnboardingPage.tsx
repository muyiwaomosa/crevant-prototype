import clsx from 'clsx'
import { useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowDownWideNarrow, Check, Gift, Plus, UserPlus } from 'lucide-react'
import { useStore } from '../state/store'
import { Wordmark } from '../components/Wordmark'
import { Button, CreatorAvatar, SparkIcon } from '../components/ui'
import { Toasts } from '../components/Toasts'

type Step = 0 | 1 | 2

const CONCEPTS = [
  { icon: UserPlus, title: 'Follow people', body: 'Choose whose posts you want to see. Nobody is added to your feed for you.' },
  { icon: ArrowDownWideNarrow, title: 'See posts in order', body: 'Your Home feed is newest first. No algorithm decides which followed posts you see.' },
  { icon: Gift, title: 'Get recognized', body: 'Earn Connection Points by engaging with someone, and unlock rewards they choose to offer.' },
]

/**
 * First run welcome. It explains the product in three ideas and lets people
 * choose who to follow. It never asks anyone to pick a "fan" or "creator" role.
 */
export function OnboardingPage() {
  const { state, creators, completeOnboarding } = useStore()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const replay = params.get('replay') === '1'
  const [step, setStep] = useState<Step>(0)
  const [picked, setPicked] = useState<string[]>([])
  const headingRef = useRef<HTMLHeadingElement>(null)
  const others = creators.filter((c) => !c.isSelf)

  // Move focus to the new heading each step so screen reader and keyboard users keep their place.
  useEffect(() => {
    headingRef.current?.focus()
  }, [step])

  // Someone who already finished onboarding is sent home unless they asked to replay it.
  if (state.onboarding.status !== 'pending' && !replay) return <Navigate to="/" replace />

  const finish = (choice: string[] | 'skip') => {
    // Closing a replay changes nothing; new picks during a replay are still followed.
    if (!(replay && (choice === 'skip' || choice.length === 0))) completeOnboarding(choice)
    navigate('/', { replace: true })
  }

  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))

  return (
    <div className="min-h-dvh bg-paper">
      <div className="mx-auto flex min-h-dvh w-full max-w-[560px] flex-col px-5 pb-8 pt-[max(env(safe-area-inset-top),20px)]">
        <header className="flex items-center justify-between gap-3 py-2">
          <Wordmark size="sm" />
          <button
            type="button"
            onClick={() => finish('skip')}
            className="rounded-full px-3 py-1.5 text-sm font-semibold text-ink-600 hover:bg-ink-100 hover:text-ink-900"
          >
            {replay ? 'Close' : 'Skip'}
          </button>
        </header>

        <p className="mt-4 text-[12px] font-semibold uppercase tracking-wider text-ink-600" aria-live="polite">
          Step {step + 1} of 3
        </p>
        <div className="mt-2 flex gap-1.5" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <span key={i} className={clsx('h-1.5 flex-1 rounded-full', i <= step ? 'bg-brand-600' : 'bg-ink-200')} />
          ))}
        </div>

        <main className="flex flex-1 flex-col pt-6">
          {step === 0 && (
            <>
              <h1 ref={headingRef} tabIndex={-1} className="font-display text-[2rem] font-extrabold leading-[1.1] tracking-[-0.02em] outline-none">
                Follow the people you love. See what they share. Get recognized for being part of their journey.
              </h1>
              <ul className="mt-6 space-y-3">
                {CONCEPTS.map((c, i) => (
                  <li key={c.title} className="flex gap-3 rounded-2xl bg-white p-4 ring-1 ring-ink-100">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700">
                      <c.icon className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="font-semibold text-ink-900">
                        {i + 1}. {c.title}
                      </p>
                      <p className="text-sm leading-snug text-ink-600">{c.body}</p>
                    </div>
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-[13px] leading-relaxed text-ink-600">
                This is a prototype. The people, posts, points, and rewards are simulated, and everything stays in this browser.
              </p>
              <div className="mt-auto pt-6">
                <Button size="lg" className="w-full" onClick={() => setStep(1)}>
                  Get started
                </Button>
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <h1 ref={headingRef} tabIndex={-1} className="font-display text-[1.75rem] font-extrabold leading-tight tracking-[-0.02em] outline-none">
                Who do you want to follow?
              </h1>
              <p className="mt-1 text-[15px] text-ink-600">Pick a few. Their posts will fill your Home feed, newest first. You can change this any time.</p>
              <ul className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2" aria-label="Accounts to follow">
                {others.map((c) => {
                  const already = state.following.includes(c.id)
                  const on = already || picked.includes(c.id)
                  return (
                    <li key={c.id} className="min-w-0">
                      <button
                        type="button"
                        aria-pressed={on}
                        disabled={already}
                        onClick={() => toggle(c.id)}
                        className={clsx(
                          'flex w-full items-center gap-3 rounded-2xl p-3 text-left ring-1 transition',
                          on ? 'bg-brand-50 ring-2 ring-brand-500' : 'bg-white ring-ink-100 hover:ring-ink-200',
                        )}
                      >
                        <CreatorAvatar creator={c} size={44} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-semibold text-ink-900">{c.name}</span>
                          <span className="block truncate text-[13px] text-ink-600">
                            {already ? 'Already following' : `${c.category} · ${c.bio}`}
                          </span>
                        </span>
                        <span
                          className={clsx(
                            'grid h-7 w-7 shrink-0 place-items-center rounded-full',
                            on ? 'bg-brand-600 text-white' : 'bg-ink-100 text-ink-600',
                          )}
                          aria-hidden="true"
                        >
                          {on ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
              <p className="mt-3 flex items-center gap-1.5 text-[13px] text-ink-600">
                <SparkIcon className="h-4 w-4" /> Following someone earns 10 demo CP with them, for as long as you follow.
              </p>
              <div className="mt-auto grid grid-cols-1 gap-2 pt-6 min-[360px]:grid-cols-[auto_1fr]">
                <Button variant="secondary" size="lg" onClick={() => setStep(0)}>
                  Back
                </Button>
                <Button size="lg" onClick={() => setStep(2)}>
                  {picked.length === 0 ? 'Continue' : `Follow ${picked.length} and continue`}
                </Button>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <h1 ref={headingRef} tabIndex={-1} className="font-display text-[1.75rem] font-extrabold leading-tight tracking-[-0.02em] outline-none">
                You're in
              </h1>
              <p className="mt-2 text-[15px] leading-relaxed text-ink-700">
                {picked.length > 0
                  ? `Your feed will show posts from the ${picked.length} ${picked.length === 1 ? 'person' : 'people'} you chose, newest first.`
                  : 'Your feed is empty for now. Find people to follow in Discover whenever you like.'}
              </p>
              <div className="mt-5 rounded-2xl bg-white p-4 ring-1 ring-ink-100">
                <p className="flex items-center gap-2 font-semibold text-ink-900">
                  <span className="grid h-8 w-8 place-items-center rounded-xl bg-brand-600 text-white">
                    <Plus className="h-5 w-5" />
                  </span>
                  Anyone can post
                </p>
                <p className="mt-2 text-sm leading-snug text-ink-600">
                  When you have something to share, tap Create. There's no special account to set up: the people who follow you will see it in their
                  feed. Rewards and audience tools are in Profile when you want them.
                </p>
              </div>
              <div className="mt-auto pt-6">
                <Button size="lg" className="w-full" onClick={() => finish(picked)}>
                  {replay ? 'Back to Crevant' : 'Go to my feed'}
                </Button>
              </div>
            </>
          )}
        </main>
      </div>
      <Toasts />
    </div>
  )
}
