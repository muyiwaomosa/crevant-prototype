import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { Hero } from './landing/sections/Hero'
import { Why } from './landing/sections/Why'
import { Who } from './landing/sections/Who'
import { What } from './landing/sections/What'
import { How } from './landing/sections/How'
import { OneAccount } from './landing/sections/OneAccount'
import { PilotDetails } from './landing/sections/PilotDetails'
import { Invitation } from './landing/sections/Invitation'
import { MobileWaitlistBar } from './landing/sections/MobileWaitlistBar'
import { Seam } from './landing/ui/Story'

// The Splitpost homepage (SP-BRAND-002, with the positioning amendment):
// eight sections, one story, for creators and supporters. The destination
// before the journey.
//
//  HOOK         Don't just post. Get your split.
//  WHY          You do the work. Who gets the reward?
//  WHO          Built for people like you. (creators, supporters)
//  WHAT         Imagine a better kind of social media.
//  HOW          A better split starts with a better connection. (the app, step by step)
//  ONE ACCOUNT  You don't have to choose a side.
//  PILOT        Help shape the future of Splitpost. (the one disclosure band)
//  INVITATION   Let's build a better kind of social media.
//
// Every call to action goes to the same place (JOIN_PATH): one account and
// one sign up for everyone. Every word comes from landing/copy.ts and
// landing/claims.ts. Rules (enforced by src/public/public-site.test.tsx): no
// promise of money, earnings or reach; Connection Points are never money;
// every amount is labelled simulated; app screens are labelled as sample
// data; no statistics; the waitlist never secures a place.

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
      <Why />
      <Seam />
      <Who />
      <Seam />
      <What />
      <Seam />
      <How />
      <Seam />
      <OneAccount />
      <Seam />
      <PilotDetails />
      <Seam />
      <Invitation />
      <MobileWaitlistBar />
    </>
  )
}
