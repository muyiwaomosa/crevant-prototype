import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { Hero } from './landing/sections/Hero'
import { Problem } from './landing/sections/Problem'
import { Solution } from './landing/sections/Solution'
import { Experience } from './landing/sections/Experience'
import { Invitation } from './landing/sections/Invitation'
import { MobileWaitlistBar } from './landing/sections/MobileWaitlistBar'

// The Splitpost homepage: five sections, in the approved order.
//
//  1. Hero: SUCCESS SHOULD BE SPLIT.
//  2. The problem: You helped build it. Where's your split?
//  3. The solution: POST. SUPPORT. SPLIT. (pilot recognition apart from the vision)
//  4. The experience: Built for creators. Powered by fans.
//  5. The invitation: Be part of a better split. (the one waitlist, with pilot details)
//
// Every word comes from landing/copy.ts and landing/claims.ts. Rules (enforced by
// src/public/public-site.test.tsx): no promise of money, earnings, reach or
// rewards; Connection Points are never money; revenue sharing is only ever a
// labelled vision; every product screen is labelled concept and sample data; the
// placeholder visual is labelled as placeholder; the waitlist never secures a place.

export function LandingPage() {
  // Links such as /#invitation from other pages: scroll to the section once rendered.
  const { hash } = useLocation()
  useEffect(() => {
    if (!hash) return
    const el = document.getElementById(decodeURIComponent(hash.slice(1)))
    if (el) el.scrollIntoView()
  }, [hash])

  return (
    <>
      <Hero />
      <Problem />
      <Solution />
      <Experience />
      <Invitation />
      <MobileWaitlistBar />
    </>
  )
}
