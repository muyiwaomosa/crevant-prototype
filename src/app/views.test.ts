import { describe, expect, it } from 'vitest'
import { AppApiError } from './api'
import { BATCH, RETRY, createPlaybackCounter, createViewQueue, createVisibilityTimer, type Clock } from './views'

// A manual clock: timers only fire when the test advances time.
function fakeClock() {
  let now = 0
  let next = 1
  const timers = new Map<number, { at: number; fn: () => void }>()
  const clock: Clock = {
    setTimeout: (fn, ms) => {
      const id = next++
      timers.set(id, { at: now + ms, fn })
      return id as unknown as ReturnType<typeof setTimeout>
    },
    clearTimeout: (t) => {
      timers.delete(t as unknown as number)
    },
  }
  async function advance(ms: number) {
    const end = now + ms
    for (;;) {
      const due = [...timers.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0]
      if (!due) break
      timers.delete(due[0])
      now = due[1].at
      due[1].fn()
      await Promise.resolve()
      await Promise.resolve()
    }
    now = end
  }
  return { clock, advance, pending: () => timers.size }
}

const flushPromises = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve()
}

function memoryStorage() {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m }
}

describe('the viewing rules', () => {
  it('text and images count after 2 continuous seconds at least half visible', async () => {
    const { clock, advance } = fakeClock()
    let viewed = 0
    const t = createVisibilityTimer(() => viewed++, clock)
    t.update(0.49)
    await advance(5000)
    expect(viewed).toBe(0)
    t.update(0.5)
    await advance(1999)
    expect(viewed).toBe(0)
    await advance(1)
    expect(viewed).toBe(1)
    t.update(0.9)
    await advance(5000)
    expect(viewed).toBe(1) // once only
  })

  it('dropping below half resets the 2 seconds', async () => {
    const { clock, advance } = fakeClock()
    let viewed = 0
    const t = createVisibilityTimer(() => viewed++, clock)
    t.update(1)
    await advance(1500)
    t.update(0.3)
    t.update(0.8)
    await advance(1500)
    expect(viewed).toBe(0)
    await advance(500)
    expect(viewed).toBe(1)
  })

  it('video counts after 3 seconds of actual playback; pauses and seeking do not count', () => {
    let viewed = 0
    const v = createPlaybackCounter(() => viewed++)
    v.play(0)
    v.timeUpdate(1)
    v.timeUpdate(2)
    v.pause()
    v.timeUpdate(30) // paused: ignored
    v.seek(40)
    v.play(40)
    v.timeUpdate(40.5) // 2.5 s played so far
    expect(viewed).toBe(0)
    v.timeUpdate(50) // a jump (seek), not playback
    expect(viewed).toBe(0)
    v.timeUpdate(50.6)
    expect(viewed).toBe(1)
    v.timeUpdate(60)
    expect(viewed).toBe(1)
  })

  it('video counts on reaching the end, even if shorter than 3 seconds', () => {
    let viewed = 0
    const v = createPlaybackCounter(() => viewed++)
    v.play(0)
    v.timeUpdate(1.2)
    v.ended()
    expect(viewed).toBe(1)
    v.ended()
    expect(viewed).toBe(1)
  })
})

describe('reporting views', () => {
  function setup(send: (ids: string[]) => Promise<unknown> = async () => 1, storage = memoryStorage()) {
    const { clock, advance, pending } = fakeClock()
    const calls: string[][] = []
    const sent: string[][] = []
    const q = createViewQueue({
      send: (ids) => {
        calls.push(ids)
        return send(ids)
      },
      onSent: (ids) => sent.push(ids),
      storage,
      storageKey: 'views:me',
      clock,
    })
    return { q, calls, sent, advance, pending, storage }
  }

  it('sends one batch when 10 are waiting, or 5 seconds after the first', async () => {
    const { q, calls, advance } = setup()
    for (let i = 0; i < 9; i++) q.report(`p${i}`)
    expect(calls).toHaveLength(0)
    q.report('p9')
    await flushPromises()
    expect(calls).toEqual([[...Array(10)].map((_, i) => `p${i}`)])
    q.report('p10')
    await advance(BATCH.waitMs - 1)
    expect(calls).toHaveLength(1)
    await advance(1)
    expect(calls[1]).toEqual(['p10'])
  })

  it('never sends the same post twice in a session', async () => {
    const { q, calls, advance } = setup()
    q.report('a')
    q.report('a')
    await advance(BATCH.waitMs)
    q.report('a')
    await advance(BATCH.waitMs * 2)
    expect(calls).toEqual([['a']])
  })

  it('keeps one request in flight; what arrives meanwhile goes in the next batch', async () => {
    let release!: () => void
    const { q, calls, advance } = setup(() => new Promise<void>((r) => (release = r)))
    for (let i = 0; i < 10; i++) q.report(`a${i}`)
    await flushPromises()
    for (let i = 0; i < 10; i++) q.report(`b${i}`)
    await flushPromises()
    expect(calls).toHaveLength(1)
    release()
    await flushPromises()
    expect(calls).toHaveLength(2)
    expect(calls[1]).toHaveLength(10)
    release()
    await advance(BATCH.waitMs)
  })

  it('flush sends what is waiting straight away (page hidden or left)', async () => {
    const { q, calls } = setup()
    q.report('x')
    q.flush()
    await flushPromises()
    expect(calls).toEqual([['x']])
  })

  it('retries a failed batch with backoff, at most three times, then drops it', async () => {
    const { q, calls, advance, storage } = setup(async () => {
      throw new AppApiError('network')
    })
    q.report('r1')
    q.flush()
    await flushPromises()
    expect(calls).toHaveLength(1)
    expect(JSON.parse(storage.getItem('views:me')!)).toEqual([{ ids: ['r1'], basis: 'visible' }])
    await advance(RETRY.delaysMs[0])
    expect(calls).toHaveLength(2)
    await advance(RETRY.delaysMs[1])
    expect(calls).toHaveLength(3)
    await advance(RETRY.delaysMs[2])
    expect(calls).toHaveLength(4)
    await advance(10 * 60_000)
    expect(calls).toHaveLength(4) // dropped after three retries
    expect(q.state().retrying).toBe(0)
    expect(storage.getItem('views:me')).toBeNull()
  })

  it('drops batches the server will never accept, without retrying', async () => {
    const { q, calls, advance } = setup(async () => {
      throw new AppApiError('too_many')
    })
    q.report('t1')
    q.flush()
    await advance(10 * 60_000)
    expect(calls).toHaveLength(1)
  })

  it('keeps at most 300 ids waiting to retry, dropping the oldest', async () => {
    const { q } = setup(async () => {
      throw new AppApiError('network')
    })
    for (let b = 0; b < 8; b++) {
      for (let i = 0; i < 50; i++) q.report(`b${b}-${i}`)
      q.flush()
      await flushPromises()
    }
    expect(q.state().retrying).toBe(RETRY.maxQueued)
  })

  it('keeps failed views for the next visit and sends them when retried', async () => {
    const storage = memoryStorage()
    const first = setup(async () => {
      throw new AppApiError('network')
    }, storage)
    first.q.report('k1')
    first.q.report('k2')
    first.q.flush()
    await flushPromises()
    first.q.dispose()
    // Next visit: a fresh queue picks them up and won't report them twice.
    const second = setup(async () => 2, storage)
    second.q.report('k1')
    second.q.retryNow()
    await flushPromises()
    expect(second.calls).toEqual([['k1', 'k2']])
    expect(second.sent).toEqual([['k1', 'k2']])
    expect(storage.getItem('views:me')).toBeNull()
  })

  it('tells listeners which ids the server accepted', async () => {
    const { q, sent, advance } = setup()
    q.report('s1')
    await advance(BATCH.waitMs)
    expect(sent).toEqual([['s1']])
  })
})
