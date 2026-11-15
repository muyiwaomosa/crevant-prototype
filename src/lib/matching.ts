import type { Category, Creator } from '../types'

// Discover's first matching rule: people's own selected interests against
// each creator's topics. Deliberately simple, explainable and deterministic:
// no engagement signals, no hidden ranking, no AI model.
//
// Following and Discover stay separate. Matching only decides the ORDER of
// suggestions in Discover; it never follows anyone and never changes the
// Following feed, which is always newest first from people someone chose.

export interface DiscoverEntry {
  creator: Creator
  /** True when the creator's topic is one of the person's interests. */
  matches: boolean
}

/**
 * Creators to suggest, matches first, then everyone else, each group A to Z.
 * Leaves out the person themselves. People already followed stay in the list
 * (Discover is also where you find them again) but sort after new matches.
 */
export function rankForDiscover(creators: readonly Creator[], interests: readonly Category[], following: readonly string[]): DiscoverEntry[] {
  const wanted = new Set(interests)
  const followed = new Set(following)
  return creators
    .filter((c) => !c.isSelf)
    .map((creator) => ({ creator, matches: wanted.has(creator.category) }))
    .sort((a, b) => {
      const score = (e: DiscoverEntry) => (e.matches ? 0 : 2) + (followed.has(e.creator.id) ? 1 : 0)
      return score(a) - score(b) || a.creator.name.localeCompare(b.creator.name)
    })
}

/** Suggestions for onboarding: matching creators not yet followed, excluding one id (the inviting creator, shown on its own). */
export function suggestedForOnboarding(
  creators: readonly Creator[],
  interests: readonly Category[],
  following: readonly string[],
  exclude: string | null,
): DiscoverEntry[] {
  return rankForDiscover(creators, interests, following).filter((e) => e.creator.id !== exclude)
}
