import { describe, expect, it } from 'vitest'
import { assessComment } from './commentQuality'
import { newWatchProgress, qualifiesAsWatched, recordSeek, recordTime } from './watch'
import { squareCrop, validateAvatarFile, MAX_AVATAR_FILE_BYTES } from './avatar'

describe('comment quality', () => {
  it.each([
    ['Trying this recipe tonight, thank you!', null],
    ['Which section of the trail is this?', null],
    ['short', 'tooShort'],
    ['aaaaaaaaaaaa', 'repeatedChars'],
    ['abababababababab', 'repeatedChars'],
    ['Sooooooooo good recipe today', 'repeatedChars'],
    ['great great great great', 'repeatedWords'],
    ['nice post nice post nice post', 'repeatedWords'],
    ['love love love love love love it so', 'repeatedWords'],
    ['🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥', 'repeatedChars'],
    ['Check out my page for more art', 'spam'],
    ['Great stuff, see https://example.com', 'spam'],
    ['follow me and I will follow back', 'spam'],
  ])('%s -> %s', (text, expected) => {
    expect(assessComment(text)).toBe(expected)
  })

  it('treats case and punctuation changes as duplicates', () => {
    expect(assessComment('Love the colours here!!', ['love the colours here'])).toBe('duplicate')
  })

  it('allows a different comment from the same fan', () => {
    expect(assessComment('A totally different thought', ['Love the colours here'])).toBeNull()
  })
})

describe('video watch tracking', () => {
  const play = (from: number, to: number, step = 0.25, p = newWatchProgress()) => {
    let progress = recordTime(p, from)
    for (let t = from + step; t <= to + 1e-9; t += step) progress = recordTime(progress, t)
    return progress
  }

  it('full legitimate playback qualifies', () => {
    expect(qualifiesAsWatched(play(0, 8), 8)).toBe(true)
  })

  it('seeking straight to the last second does not qualify', () => {
    let p = recordTime(newWatchProgress(), 0)
    p = recordSeek(p, 7.95)
    p = recordTime(p, 8)
    expect(qualifiesAsWatched(p, 8)).toBe(false)
  })

  it('a jump between updates is ignored even without a seek event', () => {
    let p = play(0, 1)
    p = recordTime(p, 7.9)
    p = recordTime(p, 8)
    expect(p.played).toBeLessThan(1.5)
    expect(qualifiesAsWatched(p, 8)).toBe(false)
  })

  it('watching half then skipping the rest does not qualify', () => {
    let p = play(0, 4)
    p = recordSeek(p, 7.5)
    p = play(7.5, 8, 0.25, p)
    expect(qualifiesAsWatched(p, 8)).toBe(false)
  })

  it('rewatching the same part twice does not add coverage', () => {
    let p = play(0, 4)
    p = recordSeek(p, 0)
    p = play(0, 4, 0.25, p)
    expect(p.played).toBeGreaterThanOrEqual(8)
    expect(qualifiesAsWatched(p, 8)).toBe(false)
  })

  it('very fast playback speed does not count', () => {
    expect(qualifiesAsWatched(play(0, 8, 2), 8)).toBe(false)
  })

  it('boundary: 85% of 8s is 6.8s played', () => {
    expect(qualifiesAsWatched(play(0, 6.8, 0.2), 8)).toBe(true)
    expect(qualifiesAsWatched(play(0, 6.6, 0.2), 8)).toBe(false)
  })

  it('unknown duration never qualifies', () => {
    expect(qualifiesAsWatched(play(0, 8), NaN)).toBe(false)
  })
})

describe('avatar validation', () => {
  it('accepts common image types within the size limit', () => {
    expect(validateAvatarFile({ type: 'image/png', size: 1000 })).toBeNull()
    expect(validateAvatarFile({ type: 'image/jpeg', size: MAX_AVATAR_FILE_BYTES })).toBeNull()
  })
  it('rejects other types, empty files, and oversized files', () => {
    expect(validateAvatarFile({ type: 'application/pdf', size: 1000 })).toBe('type')
    expect(validateAvatarFile({ type: 'image/svg+xml', size: 1000 })).toBe('type')
    expect(validateAvatarFile({ type: 'image/png', size: 0 })).toBe('empty')
    expect(validateAvatarFile({ type: 'image/png', size: MAX_AVATAR_FILE_BYTES + 1 })).toBe('size')
  })
  it('centre crops to a square', () => {
    expect(squareCrop(400, 200)).toEqual({ sx: 100, sy: 0, side: 200 })
    expect(squareCrop(300, 500)).toEqual({ sx: 0, sy: 100, side: 300 })
  })
})
