import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { cleanEventProps, PILOT_EVENTS } from './pilotEvents'

const MIGRATION = readFileSync(join(__dirname, '../../supabase/migrations/20261116000000_creator_acquisition.sql'), 'utf8')

describe('pilot measurement events', () => {
  it('covers every measurement the pilot needs', () => {
    const measures = Object.values(PILOT_EVENTS).map((e) => e.measures).join(' | ')
    for (const m of [
      'Waitlist signup source',
      'self-reported creator referral',
      'verified creator invitation',
      'Invitation-to-signup conversion',
      'Invitation-to-follow conversion',
      'Interest selection',
      'Discovery-to-follow conversion',
      'Returning fan engagement',
    ]) {
      expect(measures, m).toContain(m)
    }
  })

  it('never has a property that could identify a person or imply money or points', () => {
    for (const [name, spec] of Object.entries(PILOT_EVENTS)) {
      for (const prop of Object.keys(spec.props)) {
        expect(prop, `${name}.${prop}`).not.toMatch(/email|name|handle|user|account|ip|address|phone|text|point|cp|reward|cash|money|revenue|payout|earn/i)
      }
    }
  })

  it('records in the database exactly the events the migration allows', () => {
    const allowed = [...MIGRATION.matchAll(/^\s+'([a-z_]+)',?\s+--/gm)].map((m) => m[1]).sort()
    const database = Object.entries(PILOT_EVENTS).filter(([, s]) => s.recordedBy === 'database').map(([n]) => n).sort()
    expect(allowed).toEqual(database)
  })

  it('keeps only declared properties of the declared kind, and refuses anything else', () => {
    expect(cleanEventProps('interests_selected', { topics: ['fitness', 'books'], topic_count: 2, plans_to_create: false })).toEqual({
      topics: ['fitness', 'books'],
      topic_count: 2,
      plans_to_create: false,
    })
    expect(cleanEventProps('interests_selected', { topics: ['astrology'] })).toBeNull()
    expect(cleanEventProps('interests_selected', { topics: ['fitness'], email: 'a@example.com' })).toBeNull()
    expect(cleanEventProps('waitlist_signup', { source: 'Instagram Bio!' })).toBeNull()
    expect(cleanEventProps('discover_follow', { matched_interest: 'yes' })).toBeNull()
    expect(cleanEventProps('made_up_event', {})).toBeNull()
  })
})
