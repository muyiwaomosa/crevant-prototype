import clsx from 'clsx'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { HOMEPAGE_COPY } from '../copy'

/**
 * Phones only: a slim Join the Waitlist bar once the hero has scrolled away,
 * hidden again as soon as the invitation section comes into view.
 */
export function MobileWaitlistBar() {
  const [show, setShow] = useState(false)
  useEffect(() => {
    let frame = 0
    const update = () => {
      frame = 0
      const hero = document.getElementById('hero')
      const invitation = document.getElementById('invitation')
      if (!hero || !invitation) return
      setShow(hero.getBoundingClientRect().bottom < 0 && invitation.getBoundingClientRect().top > window.innerHeight)
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [])
  return (
    <div
      data-testid="mobile-waitlist-bar"
      aria-hidden={!show}
      className={clsx(
        'fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-sp-primary/95 px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3 backdrop-blur-md transition-transform motion-reduce:transition-none md:hidden',
        show ? 'translate-y-0' : 'pointer-events-none translate-y-full',
      )}
    >
      <Link
        to="/join"
        tabIndex={show ? 0 : -1}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-sp-secondary text-base font-bold text-sp-ink focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-white"
      >
        {HOMEPAGE_COPY.hero.primaryCta} <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Link>
    </div>
  )
}
