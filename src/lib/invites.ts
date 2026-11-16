// Creator invitation links in the sample tour. Same rules as the real ones
// (supabase/migrations/20261116000000_creator_acquisition.sql):
//
//   - Only creators accepted into the pilot hold active links.
//   - A code is random and says nothing about the creator.
//   - Anything unusable (unknown, malformed, expired, revoked, or a creator
//     who is no longer accepted) resolves to a status with no creator, so it
//     fails safely: the visitor carries on without an invitation.
//   - Resolving a link never follows anyone. Following the inviting creator
//     is the visitor's own explicit choice, and an invitation by itself earns
//     nothing for anyone: no Connection Points, rewards or entitlement.
//
// Every code below is fictional sample data for the tour.

export type InviteStatus = 'valid' | 'unknown' | 'expired' | 'revoked' | 'creator_inactive'

export interface DemoInviteLink {
  code: string
  creatorId: string
  state: 'active' | 'expired' | 'revoked'
}

/** Sample creators accepted into the pilot. */
export const DEMO_ACCEPTED_CREATORS = new Set(['amara', 'jordan', 'kofi', 'hana'])

export const DEMO_INVITE_LINKS: readonly DemoInviteLink[] = [
  { code: '7c1e94a2b05d3f68e1a9', creatorId: 'jordan', state: 'active' },
  { code: 'a3f0c6d8e2b7194c5d60', creatorId: 'amara', state: 'active' },
  { code: '5b8d2e7a1c94f063b2e1', creatorId: 'kofi', state: 'revoked' },
  { code: 'e9a4c1b7d3f5082a6c4b', creatorId: 'hana', state: 'expired' },
  // A link that predates its creator leaving the pilot.
  { code: '0d6b3f9e2a8c51e7b4d2', creatorId: 'theo', state: 'active' },
]

export const INVITE_CODE = /^[0-9a-f]{20}$/

export function resolveDemoInvite(raw: string | null | undefined): { status: InviteStatus; creatorId: string | null } {
  const code = (raw ?? '').trim().toLowerCase()
  const link = INVITE_CODE.test(code) ? DEMO_INVITE_LINKS.find((l) => l.code === code) : undefined
  if (!link) return { status: 'unknown', creatorId: null }
  if (link.state === 'revoked') return { status: 'revoked', creatorId: null }
  if (link.state === 'expired') return { status: 'expired', creatorId: null }
  if (!DEMO_ACCEPTED_CREATORS.has(link.creatorId)) return { status: 'creator_inactive', creatorId: null }
  return { status: 'valid', creatorId: link.creatorId }
}
