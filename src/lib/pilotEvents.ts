// The pilot's acquisition and engagement measurements, in one place.
//
// Rules for every event:
//   - No email address, name, handle, account id, IP address or free text.
//     Properties are booleans, small counts or values from fixed lists.
//   - Attribution, following, Connection Points and money are separate. No
//     event here grants, implies or records Connection Points, rewards or
//     any monetary eligibility.
//   - Counted in aggregate. Nothing here is used to make decisions about an
//     individual person.
//
// `recordedBy` says where each event is captured today:
//   database  ops.acquisition_events (migration 20261116), already wired in
//   app       needs the real-account app (follows, feed, Discover), which
//             doesn't exist outside the tour yet: defined now, recorded later
//   derived   computed from other events or tables, never stored separately

export type PropType = 'boolean' | 'count' | 'topic_list' | 'source_label' | 'link_ref'

export interface PilotEventSpec {
  /** The question this answers. */
  measures: string
  recordedBy: 'database' | 'app' | 'derived'
  props: Record<string, PropType>
}

export const PILOT_EVENTS = {
  waitlist_signup: {
    measures: 'Waitlist signup source; self-reported creator referral; verified creator invitation',
    recordedBy: 'database',
    props: { source: 'source_label', self_reported_referral: 'boolean', creator_link: 'link_ref' },
  },
  creator_link_visit: {
    // Counted by waitlist_api.invite_preview when a usable link is opened:
    // once per salted client key, link and UTC day, an ESTIMATE of visitors
    // (shared networks undercount, changing networks overcount). The event
    // stores no visitor detail. A visit is never a signup and never a follow.
    measures: 'Invitation-to-signup conversion, estimated (visits through a link, before signup)',
    recordedBy: 'database',
    props: { creator_link: 'link_ref' },
  },
  invitation_accepted: {
    measures: 'Verified invitations that became accounts',
    recordedBy: 'database',
    props: { creator_link: 'link_ref' },
  },
  // Not recorded anywhere yet: the decision stays pending in the database
  // until real-account follows exist (ops.creator_link_redemptions). The tour
  // demonstrates the experience with sample data only.
  invite_follow_confirmed: {
    measures: 'Invitation-to-follow conversion (once real-account follows exist)',
    recordedBy: 'app',
    props: { creator_link: 'link_ref' },
  },
  invite_follow_declined: {
    measures: 'Invitation-to-follow conversion, the other answer (once real-account follows exist)',
    recordedBy: 'app',
    props: { creator_link: 'link_ref' },
  },
  interests_selected: {
    measures: 'Interest selection during onboarding',
    recordedBy: 'app',
    props: { topics: 'topic_list', topic_count: 'count', plans_to_create: 'boolean' },
  },
  discover_suggestion_shown: {
    measures: 'Discovery-to-follow conversion (denominator)',
    recordedBy: 'app',
    props: { matched_interest: 'boolean' },
  },
  discover_follow: {
    measures: 'Discovery-to-follow conversion (numerator)',
    recordedBy: 'app',
    props: { matched_interest: 'boolean' },
  },
  fan_returned: {
    measures: 'Returning fan engagement: an account that engaged with someone it follows in a later week',
    recordedBy: 'derived',
    props: { weeks_since_join: 'count' },
  },
} as const satisfies Record<string, PilotEventSpec>

export type PilotEventName = keyof typeof PILOT_EVENTS

const TOPICS = new Set(['food', 'money', 'travel', 'tech', 'music', 'art', 'fitness', 'books', 'wellness'])

/**
 * Checks a proposed event before it is recorded: only its declared
 * properties, each of its declared kind. Returns the cleaned properties, or
 * null if anything doesn't fit (so nothing unexpected is ever stored).
 */
export function cleanEventProps(name: string, props: Record<string, unknown>): Record<string, unknown> | null {
  const spec = (PILOT_EVENTS as Record<string, PilotEventSpec>)[name]
  if (!spec) return null
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(props)) {
    const type = spec.props[key]
    if (!type) return null
    if (value === null || value === undefined) continue
    const ok =
      (type === 'boolean' && typeof value === 'boolean') ||
      (type === 'count' && Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 10_000) ||
      (type === 'topic_list' && Array.isArray(value) && value.length <= 9 && value.every((t) => typeof t === 'string' && TOPICS.has(t))) ||
      (type === 'source_label' && typeof value === 'string' && /^[a-z0-9_-]{1,40}$/.test(value)) ||
      (type === 'link_ref' && typeof value === 'string' && /^[0-9a-f-]{36}$/.test(value))
    if (!ok) return null
    out[key] = value
  }
  return out
}
