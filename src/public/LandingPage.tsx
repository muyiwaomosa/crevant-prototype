import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { Hero } from './landing/sections/Hero'
import { Problem } from './landing/sections/Problem'
import { Alternative } from './landing/sections/Alternative'
import { Connection } from './landing/sections/Connection'
import { Vision } from './landing/sections/Vision'
import { Invitation } from './landing/sections/Invitation'
import { MobileWaitlistBar } from './landing/sections/MobileWaitlistBar'

// The Splitpost homepage: one story, led by the creator's experience.
//
//  HERO         SOCIAL MEDIA NEEDS A BETTER SPLIT.
//  PROBLEM      You create the value. The algorithm decides who sees it.
//  ALTERNATIVE  A social platform built around connection, not just attention.
//  CONNECTION   When your community helps you grow, they're recognized too.
//  VISION       Content creation deserves to be a respected profession.
//  CLOSE        Be part of a better split.
//
// Every word comes from landing/copy.ts and landing/claims.ts. Rules (enforced by
// src/public/public-site.test.tsx): no promise of money, earnings, reach or
// rewards; Connection Points are never money; revenue sharing is only ever a
// labelled vision, shown apart from the pilot; every product screen is labelled
// concept and sample data; no statistics; the waitlist never secures a place.

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
      <Alternative />
      <Connection />
      <Vision />
      <Invitation />
      <MobileWaitlistBar />
    </>
  )
}
