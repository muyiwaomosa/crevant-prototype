import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { Hero } from './landing/sections/Hero'
import { Problem } from './landing/sections/Problem'
import { Building } from './landing/sections/Building'
import { Creators } from './landing/sections/Creators'
import { BetterSplit } from './landing/sections/BetterSplit'
import { Vision } from './landing/sections/Vision'
import { Invitation } from './landing/sections/Invitation'
import { MobileWaitlistBar } from './landing/sections/MobileWaitlistBar'
import { Seam } from './landing/ui/Story'

// The Splitpost homepage: seven sections, one story (founder-approved copy).
//
//  HERO        You Create The Post. You Deserve a Split.
//  PROBLEM     You Do the Work. Who Gets the Reward?
//  BUILDING    A Better Split Starts With a Better Connection.
//  CREATORS    Different Creators. The Same Problem.
//  SPLIT       More Connection. More Ways to Earn.
//  VISION      What If Creating Content Could Be a Real Career?
//  INVITATION  Help Us Build a Better Split.
//
// A small split-post "seam" sits on each boundary, so the sections read as
// one continuous story. Every word comes from landing/copy.ts and
// landing/claims.ts. Rules (enforced by src/public/public-site.test.tsx): no
// promise of money, earnings, reach or rewards; Connection Points are never
// money; revenue sharing is only ever a labelled future idea; every product
// screen is labelled concept and sample data; no statistics; the waitlist
// never secures a place.

export function LandingPage() {
  // Links such as /#building: scroll to the section once rendered, and again
  // on every click, even when the address already ends in that #section
  // (each click is a new navigation with its own key, though the hash is the
  // same). Without the key, a second "Discover Splitpost" did nothing.
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
      <Building />
      <Seam />
      <Creators />
      <Seam />
      <BetterSplit />
      <Seam />
      <Vision />
      <Seam />
      <Invitation />
      <MobileWaitlistBar />
    </>
  )
}
