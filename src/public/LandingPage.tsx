import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { Hero } from './landing/sections/Hero'
import { Problem } from './landing/sections/Problem'
import { Building } from './landing/sections/Building'
import { Paths } from './landing/sections/Paths'
import { Creators } from './landing/sections/Creators'
import { BetterSplit } from './landing/sections/BetterSplit'
import { Vision } from './landing/sections/Vision'
import { PilotDetails } from './landing/sections/PilotDetails'
import { Invitation } from './landing/sections/Invitation'
import { MobileWaitlistBar } from './landing/sections/MobileWaitlistBar'
import { Seam } from './landing/ui/Story'

// The Splitpost homepage: nine sections, one story (founder-approved copy,
// with the landing page evolution in docs/design/SP-DESIGN-002.md section 5).
//
//  HERO        You Create The Post. You Deserve a Split.
//              Don't just post. Get your split.
//  PROBLEM     You Do the Work. Who Gets the Reward?
//  BUILDING    A Better Split Starts With a Better Connection.
//  PATHS       One Account. Every Way to Take Part. (creators, members, advertisers)
//  CREATORS    Different Creators. The Same Problem.
//  SPLIT       More Connection. More Ways to Earn.
//  VISION      What If Creating Content Could Be a Real Career?
//  PILOT       What the Pilot Is, Plainly. (the one disclosure band)
//  INVITATION  Help Us Build a Better Split.
//
// Every call to action goes to the same place (JOIN_PATH): one account and
// one sign up for everyone.
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
      <Paths />
      <Seam />
      <Creators />
      <Seam />
      <BetterSplit />
      <Seam />
      <Vision />
      <Seam />
      <PilotDetails />
      <Seam />
      <Invitation />
      <MobileWaitlistBar />
    </>
  )
}
