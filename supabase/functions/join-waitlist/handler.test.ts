import { describe, expect, it, vi } from 'vitest'
import { cachedHealthCheck, clientIpFrom, handleJoin, parseTrustedHops, rateKeysFor, toPayload, verifyWithCloudflare, type JoinDeps } from './handler'
import { checkDatabaseTarget, databaseOptions, submitWithDatabase, type Sql } from './db'

const ORIGIN = 'https://crevant.example'
const SALT = 's'.repeat(32)
const KEYS = { emailKey: 'e'.repeat(64), clientKey: 'c'.repeat(64) }
const valid = {
  email: '  Maya@Example.com ',
  interests: ['reach_followers'],
  sharesContent: 'yes',
  platform: 'youtube',
  audienceBand: '1k_10k',
  source: 'instagram',
  ageConfirmed: true,
  waitlistConsent: true,
  noticeVersion: 'notice-2026-11',
  turnstileToken: 'tok',
  website: '',
}

function deps(over: Partial<JoinDeps> = {}): JoinDeps {
  return {
    enabled: true,
    allowedOrigins: [ORIGIN],
    allowedHostnames: ['crevant.example'],
    verifyTurnstile: vi.fn(async () => ({ success: true, hostname: 'crevant.example', action: 'join' })),
    rateKeys: vi.fn(async () => KEYS),
    submit: vi.fn(async () => 'ok' as const),
    databaseReachable: vi.fn(async () => true),
    ...over,
  }
}
const post = (body: unknown, extra: Partial<Parameters<typeof handleJoin>[0]> = {}) => ({
  method: 'POST',
  origin: ORIGIN,
  contentType: 'application/json',
  body: typeof body === 'string' ? body : JSON.stringify(body),
  ip: '203.0.113.7',
  ...extra,
})
const state = (o: { body: string }) => JSON.parse(o.body).status

describe('join-waitlist handler', () => {
  it('accepts a valid submission and passes normalised values and salted keys to the database', async () => {
    const d = deps()
    const out = await handleJoin(post(valid), d)
    expect([out.status, state(out)]).toEqual([200, 'ok'])
    expect(out.headers['Access-Control-Allow-Origin']).toBe(ORIGIN)
    expect(d.rateKeys).toHaveBeenCalledWith('maya@example.com', '203.0.113.7')
    expect(d.submit).toHaveBeenCalledWith({
      email: 'maya@example.com',
      interests: ['reach_followers'],
      sharesContent: 'yes',
      platform: 'youtube',
      audienceBand: '1k_10k',
      source: 'instagram',
      ageConfirmed: true,
      waitlistConsent: true,
      noticeVersion: 'notice-2026-11',
      ...KEYS,
    })
  })

  it('is closed when the function switch is off, before any check or call', async () => {
    const d = deps({ enabled: false })
    const out = await handleJoin(post(valid), d)
    expect([out.status, state(out)]).toEqual([503, 'closed'])
    expect(d.verifyTurnstile).not.toHaveBeenCalled()
    expect(d.submit).not.toHaveBeenCalled()
  })

  it('refuses other origins, other methods, non JSON and oversized bodies', async () => {
    const d = deps()
    expect((await handleJoin(post(valid, { origin: 'https://evil.example' }), d)).status).toBe(403)
    expect((await handleJoin(post(valid, { origin: null }), d)).status).toBe(403)
    expect((await handleJoin({ ...post(valid), method: 'OPTIONS', origin: 'https://evil.example' }, d)).status).toBe(403)
    expect((await handleJoin({ ...post(valid), method: 'PUT' }, d)).status).toBe(405)
    expect((await handleJoin(post(valid, { contentType: 'text/plain' }), d)).status).toBe(415)
    expect((await handleJoin(post({ ...valid, padding: 'x'.repeat(5000) }), d)).status).toBe(413)
    expect(d.submit).not.toHaveBeenCalled()
    const ok = await handleJoin({ ...post(valid), method: 'OPTIONS' }, d)
    expect(ok.status).toBe(204)
    expect(ok.headers['Access-Control-Allow-Headers']).toBe('content-type')
  })

  it('requires Turnstile success, an allowed hostname and the join action', async () => {
    for (const verdict of [
      { success: false, hostname: 'crevant.example', action: 'join' },
      { success: true, hostname: 'evil.example', action: 'join' },
      { success: true, action: 'join' },
      { success: true, hostname: 'crevant.example', action: 'login' },
      { success: true, hostname: 'crevant.example' },
    ]) {
      const d = deps({ verifyTurnstile: vi.fn(async () => verdict) })
      expect(state(await handleJoin(post(valid), d)), JSON.stringify(verdict)).toBe('verification_failed')
      expect(d.submit).not.toHaveBeenCalled()
    }
    const d = deps()
    expect(state(await handleJoin(post({ ...valid, turnstileToken: '' }), d))).toBe('verification_failed')
    expect(d.verifyTurnstile).not.toHaveBeenCalled()
  })

  it('answers a GET health check with ok or error only, without touching submissions', async () => {
    const d = deps({ enabled: false })
    const ok = await handleJoin({ method: 'GET', origin: null, contentType: null, body: '', ip: null }, d)
    expect([ok.status, ok.body]).toEqual([200, '{"status":"ok"}'])
    expect(ok.headers['Access-Control-Allow-Origin']).toBeUndefined()
    expect(d.submit).not.toHaveBeenCalled()
    expect(d.verifyTurnstile).not.toHaveBeenCalled()
    for (const reachable of [vi.fn(async () => false), vi.fn(async () => Promise.reject(new Error('password authentication failed for user waitlist_writer')))]) {
      const bad = await handleJoin({ method: 'GET', origin: null, contentType: null, body: '', ip: null }, deps({ databaseReachable: reachable }))
      expect([bad.status, bad.body]).toEqual([503, '{"status":"error"}'])
    }
  })

  it('treats a filled honeypot as success but stores nothing and calls nothing', async () => {
    const d = deps()
    expect(state(await handleJoin(post({ ...valid, website: 'https://spam.example' }), d))).toBe('ok')
    expect(d.verifyTurnstile).not.toHaveBeenCalled()
    expect(d.submit).not.toHaveBeenCalled()
  })

  it('rejects wrong shapes before reaching the database', async () => {
    for (const bad of [{ ...valid, email: 42 }, { ...valid, email: '' }, { ...valid, interests: 'all' }, { ...valid, ageConfirmed: 'yes' }, { ...valid, noticeVersion: '' }]) {
      const d = deps()
      expect(state(await handleJoin(post(bad), d))).toBe('invalid')
      expect(d.submit).not.toHaveBeenCalled()
    }
  })

  it('never forwards fields that are no longer collected (link, campaign, marketing consent)', async () => {
    const d = deps()
    await handleJoin(post({ ...valid, publicLink: 'https://youtube.com/@maya', campaign: 'launch', marketingConsent: true }), d)
    const payload = (d.submit as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<string, unknown>
    expect(Object.keys(payload).filter((k) => /link|campaign|marketing/i.test(k))).toEqual([])
  })

  it('maps database results to statuses, and hides errors', async () => {
    const cases: Array<[Awaited<ReturnType<JoinDeps['submit']>>, number, string]> = [
      ['closed', 503, 'closed'],
      ['invalid', 400, 'invalid'],
      ['rate_limited', 429, 'rate_limited'],
      ['notice_changed', 409, 'notice_changed'],
    ]
    for (const [result, status, s] of cases) {
      const out = await handleJoin(post(valid), deps({ submit: vi.fn(async () => result) }))
      expect([out.status, state(out)]).toEqual([status, s])
    }
    const out = await handleJoin(post(valid), deps({ submit: vi.fn(async () => Promise.reject(new Error('boom maya@example.com'))) }))
    expect([out.status, out.body]).toEqual([500, '{"status":"error"}'])
  })

  it('fails safely when the salted keys cannot be made', async () => {
    const d = deps({ rateKeys: vi.fn(async () => Promise.reject(new Error('WAITLIST_RATE_SALT is missing'))) })
    expect(state(await handleJoin(post(valid), d))).toBe('error')
    expect(d.submit).not.toHaveBeenCalled()
  })

  it('never gives Cloudflare an IPv6 network as the client address', async () => {
    const d = deps()
    await handleJoin(post(valid, { ip: '2001:db8:1:2::/64' }), d)
    expect(d.verifyTurnstile).toHaveBeenCalledWith('tok', null)
  })

  it('never puts the email address in any response', async () => {
    for (const d of [deps(), deps({ enabled: false }), deps({ submit: vi.fn(async () => 'invalid' as const) })]) {
      const out = await handleJoin(post(valid), d)
      expect(JSON.stringify(out)).not.toMatch(/maya/i)
    }
  })
})

describe('salted rate limit keys', () => {
  it('are HMACs of the email and the client address with the secret salt', async () => {
    const a = await rateKeysFor('Maya@Example.com ', '203.0.113.7', SALT)
    expect(a.emailKey).toMatch(/^[0-9a-f]{64}$/)
    expect(a.clientKey).toMatch(/^[0-9a-f]{64}$/)
    expect(a.emailKey).not.toBe(a.clientKey)
    // The same address however it is typed; different with another salt.
    expect((await rateKeysFor('maya@example.com', '203.0.113.7', SALT)).emailKey).toBe(a.emailKey)
    expect((await rateKeysFor('maya@example.com', '203.0.113.7', 't'.repeat(32))).emailKey).not.toBe(a.emailKey)
    // Not a plain (unsalted) hash anyone could recompute for a known address.
    const plain = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('maya@example.com')))]
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
    expect(a.emailKey).not.toBe(plain)
  })

  it('share one bucket without an address, and refuse a missing or short salt', async () => {
    expect((await rateKeysFor('a@example.com', null, SALT)).clientKey).toBe((await rateKeysFor('b@example.com', null, SALT)).clientKey)
    await expect(rateKeysFor('a@example.com', '203.0.113.7', '')).rejects.toThrow()
    await expect(rateKeysFor('a@example.com', '203.0.113.7', 'short')).rejects.toThrow()
  })
})

describe('client address', () => {
  it('comes only from the trusted proxy hop, so forged entries are ignored', () => {
    expect(clientIpFrom('1.2.3.4, 9.9.9.9, 203.0.113.7', 1)).toBe('203.0.113.7')
    expect(clientIpFrom('1.2.3.4, 203.0.113.7, 10.0.0.1', 2)).toBe('203.0.113.7')
    expect(clientIpFrom('5.5.5.5, 203.0.113.7', 1)).toBe(clientIpFrom('6.6.6.6, 203.0.113.7', 1))
    // Many forged entries, and junk among them, change nothing.
    const forged = Array.from({ length: 40 }, (_, i) => `198.18.${i}.1`).join(', ')
    expect(clientIpFrom(`${forged}, <script>, , unknown, 999.1.1.1, 203.0.113.7`, 1)).toBe('203.0.113.7')
    // Two header lines arrive joined with ", "; the trusted entry is still the last.
    expect(clientIpFrom(['8.8.8.8, 1.1.1.1', '203.0.113.7'].join(', '), 1)).toBe('203.0.113.7')
  })

  it('fails safe into the shared bucket when the address cannot be trusted', () => {
    for (const bad of [null, '', 'not-an-ip', '999.1.1.1', '1.2.3.4, <script>', '1.2.3.4,', ' , ', '1.2.3.4 5.6.7.8']) {
      expect(clientIpFrom(bad, 1), String(bad)).toBeNull()
    }
    // Fewer entries than trusted hops: the only entries are the visitor's own.
    expect(clientIpFrom('203.0.113.7', 2)).toBeNull()
    // No confirmed hop count: nothing is trusted.
    for (const hops of [null, 0, 6, 1.5, -1, Number.NaN]) expect(clientIpFrom('203.0.113.7', hops), String(hops)).toBeNull()
    // An oversized header is not parsed at all.
    expect(clientIpFrom(`${'1.1.1.1, '.repeat(600)}203.0.113.7`, 1)).toBeNull()
  })

  it('treats a private or internal address in the trusted position as untrusted', () => {
    for (const internal of [
      '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '127.0.0.1', '169.254.1.1', '100.64.0.1', '100.127.255.255', '0.0.0.0',
      '::1', '::', 'fc00::1', 'fd12:3456:789a:1::1', 'fe80::1',
    ]) {
      expect(clientIpFrom(`203.0.113.7, ${internal}`, 1), internal).toBeNull()
    }
    for (const external of ['172.15.0.1', '172.32.0.1', '100.63.0.1', '100.128.0.1', '11.0.0.1', '192.169.0.1']) {
      expect(clientIpFrom(external, 1), external).toBe(external)
    }
    expect(clientIpFrom('2001:db8:1:2::1', 1)).toBe('2001:db8:1:2::/64')
  })

  it('groups IPv6 addresses by /64', () => {
    expect(clientIpFrom('2001:db8:1:2::1', 1)).toBe('2001:db8:1:2::/64')
    expect(clientIpFrom('2001:0db8:0001:0002:ffff:eeee:dddd:cccc', 1)).toBe('2001:db8:1:2::/64')
    expect(clientIpFrom('2001:DB8:1:2::abcd', 1)).toBe('2001:db8:1:2::/64')
    expect(clientIpFrom('2001:db8:1:3::1', 1)).not.toBe(clientIpFrom('2001:db8:1:2::1', 1))
    for (const bad of ['2001:db8::1::2', '2001:db8:1:2:3:4:5:6:7', 'g::1', ':::', '::ffff:203.0.113.7', '[2001:db8::1]']) {
      expect(clientIpFrom(bad, 1), bad).toBeNull()
    }
  })

  it('needs a confirmed hop count: 1 to 5, no default', () => {
    expect(parseTrustedHops('1')).toBe(1)
    expect(parseTrustedHops(' 2 ')).toBe(2)
    expect(parseTrustedHops('5')).toBe(5)
    for (const bad of [undefined, null, '', '0', '6', '1.0', '01', 'one', '-1', '1,2']) expect(parseTrustedHops(bad), String(bad)).toBeNull()
  })
})

describe('Turnstile verification', () => {
  it('sends the secret, token and client address, and returns hostname and action', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ success: true, hostname: 'crevant.example', action: 'join' }), { status: 200 }))
    expect(await verifyWithCloudflare('tok', '203.0.113.7', 'sec', f as unknown as typeof fetch)).toEqual({ success: true, hostname: 'crevant.example', action: 'join' })
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify')
    const form = init.body as URLSearchParams
    expect([form.get('secret'), form.get('response'), form.get('remoteip')]).toEqual(['sec', 'tok', '203.0.113.7'])
    expect(await verifyWithCloudflare('tok', null, '', f as unknown as typeof fetch)).toEqual({ success: false })
  })
})

describe('database connection', () => {
  const REF = 'kpudeppgokpjhvaqrprn'
  const OTHER = 'abcdefghijabcdefghij'
  const SUPABASE_URL = `https://${REF}.supabase.co`
  const POOL = 'aws-0-us-west-2.pooler.supabase.com'
  const URL_OK = `postgresql://waitlist_writer.${REF}:pw@${POOL}:6543/postgres`
  const DIRECT_OK = `postgresql://waitlist_writer:pw@db.${REF}.supabase.co:5432/postgres`
  const PEM = '-----BEGIN CERTIFICATE-----\nTUlJQ2FrZQ==\n-----END CERTIFICATE-----'

  it('accepts only the restricted waitlist_writer login', () => {
    expect(databaseOptions(URL_OK).url).toBe(URL_OK)
    for (const bad of [
      `postgresql://postgres.${REF}:pw@${POOL}:6543/postgres`,
      `postgresql://postgres:pw@db.${REF}.supabase.co:5432/postgres`,
      'postgresql://service_role:pw@host:5432/postgres',
      'postgresql://waitlist_admin:pw@host:5432/postgres',
      'postgresql://waitlist_writer_evil:pw@host:5432/postgres',
      'postgresql://waitlist_writer@host:5432/postgres',
      'https://waitlist_writer:pw@host/postgres',
      'not a url',
    ]) {
      expect(() => databaseOptions(bad), bad).toThrow()
    }
  })

  it('always verifies the certificate and hostname, without prepared statements', () => {
    const o = databaseOptions(URL_OK, { caCert: PEM }).options
    expect(o.ssl).toEqual({ rejectUnauthorized: true, servername: POOL, ca: PEM })
    expect(o.prepare).toBe(false)
    expect(o.max).toBe(1)
    expect(databaseOptions(URL_OK).options.ssl).toEqual({ rejectUnauthorized: true, servername: POOL })
    // A local database is verified too, unless the caller has established a local run.
    expect(databaseOptions('postgres://waitlist_writer:pw@127.0.0.1:54322/postgres').options.ssl).toEqual({ rejectUnauthorized: true, servername: '127.0.0.1' })
    expect(databaseOptions('postgres://waitlist_writer:pw@127.0.0.1:54322/postgres', { localPlaintext: true }).options.ssl).toBe(false)
    // The local exception never applies to a database elsewhere.
    expect(databaseOptions(URL_OK, { localPlaintext: true }).options.ssl).toEqual({ rejectUnauthorized: true, servername: POOL })
    expect(databaseOptions('postgres://waitlist_writer:pw@db.tls.test:5432/postgres', { localPlaintext: true }).options.ssl).toMatchObject({ rejectUnauthorized: true })
  })

  it('refuses any connection setting in the URL, so TLS cannot be weakened there', () => {
    for (const q of ['?sslmode=disable', '?sslmode=prefer', '?sslmode=require', '?ssl=false', '?ssl=0', '?options=-c%20role%3Dpostgres', '?sslrootcert=x', '?', '#x']) {
      expect(() => databaseOptions(`${URL_OK}${q}`), q).toThrow(/connection settings/)
      expect(() => checkDatabaseTarget(`${URL_OK}${q}`, SUPABASE_URL), q).toThrow(/connection settings/)
    }
  })

  it('accepts only PEM certificates as the CA, never a key or junk', () => {
    expect(databaseOptions(URL_OK, { caCert: `${PEM}\n${PEM}\n` }).options.ssl).toMatchObject({ ca: `${PEM}\n${PEM}` })
    for (const bad of ['x', 'true', '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----', `${PEM}\n-----BEGIN RSA PRIVATE KEY-----\nabc\n-----END RSA PRIVATE KEY-----`, '-----BEGIN CERTIFICATE-----\n!!\n-----END CERTIFICATE-----']) {
      expect(() => databaseOptions(URL_OK, { caCert: bad }), bad).toThrow(/PEM/)
    }
  })

  it("only accepts the database of the function's own project, from SUPABASE_URL", () => {
    expect(checkDatabaseTarget(URL_OK, SUPABASE_URL)).toEqual({ ref: REF, local: false })
    expect(checkDatabaseTarget(DIRECT_OK, SUPABASE_URL)).toEqual({ ref: REF, local: false })
    expect(checkDatabaseTarget(`postgresql://waitlist_writer.${REF}:pw@aws-1-ca-central-1.pooler.supabase.com:6543/postgres`, SUPABASE_URL).ref).toBe(REF)
    const refused: Array<[string, string]> = [
      [`postgresql://waitlist_writer.${OTHER}:pw@${POOL}:6543/postgres`, 'another project on the pooler'],
      [`postgresql://waitlist_writer:pw@db.${OTHER}.supabase.co:5432/postgres`, 'another project, direct'],
      [`postgresql://waitlist_writer.${REF}:pw@${POOL}:5432/postgres`, 'the session pooler port'],
      [`postgresql://waitlist_writer.${REF}:pw@${POOL}/postgres`, 'the pooler without its port'],
      [`postgresql://waitlist_writer:pw@db.${REF}.supabase.co:6543/postgres`, 'direct host on the pooler port'],
      [`postgresql://waitlist_writer.${REF}:pw@db.${REF}.supabase.co:5432/postgres`, 'pooler login on the direct host'],
      [`postgresql://waitlist_writer:pw@${POOL}:6543/postgres`, 'pooler without the project in the login'],
      [`postgresql://waitlist_writer.${REF}:pw@${POOL}.evil.example:6543/postgres`, 'a lookalike pooler host'],
      [`postgresql://waitlist_writer.${REF}:pw@evil-pooler.supabase.com.example.net:6543/postgres`, 'another lookalike'],
      [`postgresql://waitlist_writer:pw@db.${REF}.supabase.co.evil.example:5432/postgres`, 'a lookalike direct host'],
      ['postgresql://waitlist_writer:pw@127.0.0.1:54322/postgres', 'a local database from a hosted function'],
      [`postgresql://postgres.${REF}:pw@${POOL}:6543/postgres`, 'the broad login'],
    ]
    for (const [url, why] of refused) expect(() => checkDatabaseTarget(url, SUPABASE_URL), why).toThrow()
  })

  it('fails closed when SUPABASE_URL is missing or unrecognised', () => {
    for (const bad of ['', 'https://kpudeppgokpjhvaqrprn.supabase.co/', 'http://kpudeppgokpjhvaqrprn.supabase.co', 'https://kpudeppgokpjhvaqrprn.supabase.co.evil.example',
      'https://evil.example', 'https://KPUDEPPGOKPJHVAQRPRN.supabase.co', 'https://short.supabase.co', 'https://kpudeppgokpjhvaqrprn.supabase.com', 'http://kong:8001', 'http://10.0.0.1:8000']) {
      expect(() => checkDatabaseTarget(URL_OK, bad), bad).toThrow(/SUPABASE_URL/)
    }
  })

  it('treats a local Supabase as local only with a database on this machine', () => {
    for (const local of ['http://kong:8000', 'http://127.0.0.1:54321', 'http://localhost:54321']) {
      expect(checkDatabaseTarget('postgresql://waitlist_writer:pw@127.0.0.1:54322/postgres', local)).toEqual({ ref: null, local: true })
      expect(() => checkDatabaseTarget(URL_OK, local), local).toThrow(/local database/)
      expect(() => checkDatabaseTarget('postgresql://postgres:pw@127.0.0.1:54322/postgres', local), local).toThrow(/waitlist_writer/)
    }
  })

  it('calls only waitlist_api.submit, with bound parameters', async () => {
    const calls: Array<{ text: string; values: unknown[] }> = []
    const sql = (async (strings: TemplateStringsArray, ...values: unknown[]) => {
      calls.push({ text: strings.join('$'), values })
      return [{ result: 'ok' }]
    }) as Sql
    const payload = toPayload(valid, KEYS)
    expect(await submitWithDatabase(sql, payload)).toBe('ok')
    expect(calls[0].text).toMatch(/^select waitlist_api\.submit\(/)
    expect(calls[0].text).not.toMatch(/maya/i)
    expect(calls[0].values).toEqual(['maya@example.com', ['reach_followers'], 'yes', 'youtube', '1k_10k', 'instagram', true, true, 'notice-2026-11', KEYS.emailKey, KEYS.clientKey])
    const odd = (async () => [{ result: 'something else' }]) as unknown as Sql
    await expect(submitWithDatabase(odd, payload)).rejects.toThrow()
  })
})

describe('health check load limit', () => {
  it('reuses a result for 30 seconds and shares simultaneous checks', async () => {
    let t = 0
    let release: (ok: boolean) => void = () => {}
    const check = vi.fn(() => new Promise<boolean>((r) => (release = r)))
    const health = cachedHealthCheck(check, 30_000, () => t)
    const many = Promise.all(Array.from({ length: 50 }, () => health()))
    release(true)
    expect(await many).toEqual(Array(50).fill(true))
    expect(check).toHaveBeenCalledTimes(1)
    t = 29_999
    expect(await health()).toBe(true)
    expect(check).toHaveBeenCalledTimes(1)
    t = 30_000
    const again = health()
    release(true)
    await again
    expect(check).toHaveBeenCalledTimes(2)
  })

  it('caches failures for a shorter time, and treats a thrown error as a failure', async () => {
    let t = 0
    const check = vi.fn(async () => {
      throw new Error('connection refused to waitlist_writer@db')
    })
    const health = cachedHealthCheck(check, 30_000, () => t)
    expect(await health()).toBe(false)
    t = 9_999
    expect(await health()).toBe(false)
    expect(check).toHaveBeenCalledTimes(1)
    t = 10_000
    expect(await health()).toBe(false)
    expect(check).toHaveBeenCalledTimes(2)
  })
})

describe('health check reveals nothing', () => {
  it('answers with a bare status, no CORS, no configuration and no error detail, whatever is asked', async () => {
    const leaky = vi.fn(async () => Promise.reject(new Error('password authentication failed for user "waitlist_writer.kpudeppgokpjhvaqrprn" at aws-0-us-west-2.pooler.supabase.com')))
    for (const reachable of [vi.fn(async () => true), leaky]) {
      for (const req of [
        { method: 'GET', origin: null, contentType: null, body: '', ip: null },
        { method: 'GET', origin: 'https://evil.example', contentType: 'application/json', body: '{"email":"x@y.z"}', ip: '203.0.113.7' },
      ]) {
        const out = await handleJoin(req, deps({ databaseReachable: reachable }))
        expect(out.body === '{"status":"ok"}' || out.body === '{"status":"error"}').toBe(true)
        expect(Object.keys(out.headers).sort()).toEqual(['Cache-Control', 'Content-Type'])
        expect(JSON.stringify(out)).not.toMatch(/waitlist_writer|pooler|kpudeppgokpjhvaqrprn|password|203\.0|x@y/)
      }
    }
  })
})
