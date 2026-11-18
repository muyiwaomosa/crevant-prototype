import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { Hero } from './landing/sections/Hero'
import { Problem } from './landing/sections/Problem'
import { HowItWorks } from './landing/sections/HowItWorks'
import { People } from './landing/sections/People'
import { Future } from './landing/sections/Future'
import { Invitation } from './landing/sections/Invitation'
import { MobileWaitlistBar } from './landing/sections/MobileWaitlistBar'
import { Seam } from './landing/ui/Story'

// The Splitpost homepage: six sections, one story, in the original site's
// design (restored 2026-11-18) with the approved new copy
// (docs/website-brief.md). The Vision is merged into How Splitpost Works,
// with the founder's approval.
//
//  #hero          HERO                          Don't just post. Get your split.
//  #problem       THE PROBLEM                   You make the posts. Who gets the split?
//  #how-it-works  HOW SPLITPOST WORKS           Post. Connect. Grow. Split.
//  #people        THE PEOPLE BEHIND THE POSTS   You keep posting. They keep earning. But what about you?
//  #future        A BETTER FUTURE FOR CREATORS  What if your next post could help build your future?
//  #invitation    THE INVITATION                You've made enough posts for someone else's success.
//
// Every word comes from landing/copy.ts, which matches the brief word for
// word (landing/copy.test.ts). The pilot disclosures are the founder's
// approved wording. Rules (src/public/public-site.test.tsx): no misleading
// money claims, the pilot allocation is never published, fan rewards are
// described as simulated during the pilot, and the waitlist never secures a
// place.

export function LandingPage() {
  // Links such as /#how-it-works: scroll to the section once rendered, and
  // again on every click, even when the address already ends in that #section
  // (each click is a new navigation with its own key, though the hash is the
  // same).
  const { hash, key } = useLocation()
  useEffect(() => {
    if (!hash) return
    const el = document.getElementById(decodeURIComponent(hash.slice(1)))
    if (el) el.scrollIntoView()
  }, [hash, key])

  return (
    <>
      <Hero />
      <Seam />
      <Problem />
      <Seam />
      <HowItWorks />
      <Seam />
      <People />
      <Seam />
      <Future />
      <Seam />
      <Invitation />
      <MobileWaitlistBar />
    </>
  )
}
