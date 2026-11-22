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
// with the founder's approval. Story order (founder decision, 2026-11-19):
// HOOK, WHY, WHO, WHERE, HOW, CTA.
//
//  #hero          HOOK   HERO                          Don't just post. Get your split.
//  #problem       WHY    THE PROBLEM                   Your content makes platforms money. But what about you?
//  #people        WHO    THE PEOPLE BEHIND THE POSTS   You built an audience. But can you build a future on it?
//  #future        WHERE  A BETTER FUTURE FOR CREATORS  What if your next post could help build your future?
//                        (ends with "What if the split worked differently?")
//  #how-it-works  HOW    HOW SPLITPOST WORKS           Post. Connect. Grow. Split.
//  #invitation    CTA    THE INVITATION                You've made enough posts for someone else's success.
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
      <People />
      <Seam />
      <Future />
      <Seam />
      <HowItWorks />
      <Seam />
      <Invitation />
      <MobileWaitlistBar />
    </>
  )
}
