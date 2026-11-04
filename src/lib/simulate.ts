// Simulated audience activity for posts the visitor publishes in creator mode.
// Numbers grow smoothly with the post's age so the creator overview feels alive.
// Everything here is clearly labelled as simulated in the UI.

import type { Post } from '../types'
import { hash } from './format'

export function simulatedEngagement(post: Post, now: number, followers: number) {
  const ageMinutes = Math.max(0, (now - post.createdAt) / 60_000)
  const jitter = 0.7 + (hash(post.id) % 60) / 100
  const ceiling = followers * 0.11 * jitter
  const progress = 1 - Math.exp(-ageMinutes / 40)
  const likes = Math.round(ceiling * progress)
  return {
    likes,
    saves: Math.round(likes * 0.17),
  }
}
