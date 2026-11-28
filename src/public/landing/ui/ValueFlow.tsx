import clsx from 'clsx'
import { ArrowDown, Bookmark, Building2, Heart, MessageCircle, PenLine, Share2, Sparkles, User } from 'lucide-react'
import { HOMEPAGE_COPY } from '../copy'

/**
 * Section 2's value-flow illustration (SP-BRAND-004, founder decision of
 * Nov 28, round 2). It replaces the earlier "month at a glance" dashboard and
 * draws the relationship the section describes:
 *   1. a creator creates content, and followers engage with it and pass it on;
 *      together they generate value ("Everyone creates value.");
 *   2. a platform stands between that value and the people who made it
 *      ("Platforms control the split.");
 *   3. what comes out is uneven: one strong line, one thin, one broken
 *      ("Not everyone benefits.").
 * The three statements are its only words, exactly as approved. No
 * percentages, earnings figures, currency amounts or money symbols. The
 * drawing is decorative; the statements are real text, so screen readers get
 * the same meaning in the same order.
 */

const statements = HOMEPAGE_COPY.why.flow

function Node({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={clsx('grid h-10 w-10 shrink-0 place-items-center rounded-full ring-2 ring-white min-[400px]:h-11 min-[400px]:w-11', className)}>{children}</span>
}

function Down() {
  return (
    <div aria-hidden="true" className="flex justify-center py-1.5">
      <ArrowDown className="h-5 w-5 text-sp-link" strokeWidth={2.5} />
    </div>
  )
}

export function ValueFlow() {
  return (
    <div data-testid="value-flow" className="relative -mt-14 ml-auto mr-2 w-[94%] rounded-[22px] bg-white p-3.5 min-[400px]:mr-3 min-[400px]:w-[88%] min-[400px]:p-4 shadow-[0_24px_50px_-30px_rgb(18_48_45/0.55)] ring-1 ring-sp-ink/8 sm:mr-6 sm:p-5">
      {/* 1. Creators create; followers engage and share; together they make value. */}
      <div className="rounded-2xl bg-sp-secondary-tint p-3">
        <div aria-hidden="true" className="flex min-w-0 items-center justify-between gap-1">
          <Node className="bg-sp-primary text-sp-bg">
            <PenLine className="h-5 w-5" />
          </Node>
          <span className="h-0.5 min-w-1 flex-1 rounded-full bg-sp-primary/40" />
          <span className="flex -space-x-2">
            <Node className="h-8 w-8 bg-sp-secondary text-sp-ink min-[400px]:h-9 min-[400px]:w-9">
              <Heart className="h-4 w-4" />
            </Node>
            <Node className="h-8 w-8 bg-sp-secondary text-sp-ink min-[400px]:h-9 min-[400px]:w-9">
              <MessageCircle className="h-4 w-4" />
            </Node>
            <Node className="h-8 w-8 bg-sp-secondary text-sp-ink min-[400px]:h-9 min-[400px]:w-9">
              <Bookmark className="h-4 w-4" />
            </Node>
            <Node className="h-8 w-8 bg-sp-secondary text-sp-ink min-[400px]:h-9 min-[400px]:w-9">
              <Share2 className="h-4 w-4" />
            </Node>
          </span>
          <span className="h-0.5 min-w-1 flex-1 rounded-full bg-sp-primary/40" />
          <Node className="bg-sp-accent text-sp-ink">
            <Sparkles className="h-5 w-5" />
          </Node>
        </div>
        <p className="mt-2.5 text-center font-sp-display text-[15px] font-extrabold">{statements[0]}</p>
      </div>
      <Down />
      {/* 2. The platform in the middle decides where that value goes. */}
      <div className="rounded-2xl bg-sp-primary p-3 text-sp-bg">
        <div aria-hidden="true" className="flex items-center justify-center gap-3">
          <span className="h-0.5 w-10 rounded-full bg-sp-accent" />
          <Node className="h-12 w-12 bg-sp-bg text-sp-primary ring-sp-accent">
            <Building2 className="h-6 w-6" />
          </Node>
          <span className="h-0.5 w-10 rounded-full bg-sp-bg/60" />
        </div>
        <p className="mt-2.5 text-center font-sp-display text-[15px] font-extrabold">{statements[1]}</p>
      </div>
      <Down />
      {/* 3. What comes out is uneven: one strong line, one thin, one broken. */}
      <div className="rounded-2xl bg-sp-bg p-3">
        <svg aria-hidden="true" viewBox="0 0 240 44" className="block h-11 w-full" preserveAspectRatio="xMidYMid meet">
          <path d="M120 2 C120 20 40 18 40 36" fill="none" stroke="var(--color-sp-primary)" strokeWidth="6" strokeLinecap="round" />
          <path d="M120 2 C120 20 120 18 120 36" fill="none" stroke="var(--color-sp-primary)" strokeOpacity="0.45" strokeWidth="2.5" strokeLinecap="round" />
          <path d="M120 2 C120 20 200 18 200 36" fill="none" stroke="var(--color-sp-ink)" strokeOpacity="0.3" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="4 6" />
        </svg>
        <div aria-hidden="true" className="-mt-1 grid grid-cols-3 justify-items-center">
          <Node className="h-9 w-9 bg-sp-primary text-sp-bg">
            <User className="h-4 w-4" />
          </Node>
          <Node className="h-9 w-9 bg-sp-primary/45 text-sp-bg">
            <User className="h-4 w-4" />
          </Node>
          <Node className="h-9 w-9 bg-sp-ink/15 text-sp-ink/50">
            <User className="h-4 w-4" />
          </Node>
        </div>
        <p className="mt-2.5 text-center font-sp-display text-[15px] font-extrabold">{statements[2]}</p>
      </div>
    </div>
  )
}
