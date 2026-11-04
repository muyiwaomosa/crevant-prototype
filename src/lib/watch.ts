// Tracks how much of a video was genuinely played, so seeking to the end
// does not count as watching it.
//
// Only small forward steps between consecutive time updates count as playback.
// A jump larger than MAX_STEP (a seek, or a very high playback speed) is
// ignored, and the tracker simply continues from the new position.

export const MAX_STEP_SECONDS = 1.5
/** Share of the video that must actually be played and covered. */
export const REQUIRED_SHARE = 0.85

export interface WatchProgress {
  /** Media seconds actually played. */
  played: number
  /** Whole seconds of the timeline that were played at least once. */
  covered: number[]
  lastTime: number | null
}

export const newWatchProgress = (): WatchProgress => ({ played: 0, covered: [], lastTime: null })

/** Record a time update. Pass `seeking: true` while the user is scrubbing. */
export function recordTime(progress: WatchProgress, currentTime: number, opts: { seeking?: boolean } = {}): WatchProgress {
  const last = progress.lastTime
  if (opts.seeking || last === null) return { ...progress, lastTime: currentTime }
  const step = currentTime - last
  if (step <= 0 || step > MAX_STEP_SECONDS) return { ...progress, lastTime: currentTime }
  const covered = new Set(progress.covered)
  for (let s = Math.floor(last); s <= Math.floor(currentTime); s++) covered.add(s)
  return { played: progress.played + step, covered: [...covered], lastTime: currentTime }
}

/** Mark that the user seeked; the next update starts a new segment. */
export const recordSeek = (progress: WatchProgress, currentTime: number): WatchProgress => ({ ...progress, lastTime: currentTime })

export function qualifiesAsWatched(progress: WatchProgress, duration: number): boolean {
  if (!Number.isFinite(duration) || duration <= 0) return false
  const totalBuckets = Math.max(1, Math.ceil(duration))
  return progress.played >= duration * REQUIRED_SHARE && progress.covered.length >= Math.floor(totalBuckets * REQUIRED_SHARE)
}
