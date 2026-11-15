import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { Hero } from './landing/sections/Hero'
import { Why } from './landing/sections/Why'
import { Who } from './landing/sections/Who'
import { What } from './landing/sections/What'
import { How } from './landing/sections/How'
import { Invitation } from './landing/sections/Invitation'
import { MobileWaitlistBar } from './landing/sections/MobileWaitlistBar'

// The Splitpost homepage: one story, following one sample post.
//
//  HERO   SUCCESS SHOULD BE SPLIT.
//  WHY    You helped build it. Where's your split?
//  WHO    The creator who keeps posting. The fan who keeps sharing.
//  WHAT   What if every successful post created more winners?
//  HOW    POST. SUPPORT. SPLIT.
//  CLOSE  Be part of a better split.
//
// Every word comes from landing/copy.ts and landing/claims.ts. Rules (enforced by
// src/public/public-site.test.tsx): no promise of money, earnings, reach or
// rewards; Connection Points are never money; revenue sharing is only ever a
// labelled vision, shown apart from the pilot; every product screen is labelled
// concept and sample data; photos are stock images of models, said so on the
// page; no statistics; the waitlist never secures a place.

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
      <Why />
      <Who />
      <What />
      <How />
      <Invitation />
      <MobileWaitlistBar />
    </>
  )
}
