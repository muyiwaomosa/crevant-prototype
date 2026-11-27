import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { ExternalLink, Megaphone } from 'lucide-react'
import { Card, PageHeader, buttonClass } from '../components/ui'
import { Message, Spinner } from '../public/auth/AuthUi'
import {
  AppApiError,
  messageFor,
  type Ad,
  type AdCategory,
  type AdExclusion,
  type AdSurface,
  type AdsAdmin,
  type Advertiser,
  type Campaign,
  type CampaignReport,
} from './api'
import { useAppApi } from './AppApiContext'
import { useFeedbackAccess } from './feedback'
import { simulatedDollars } from './split'
import { Steps, type Story } from './insights'

/**
 * Advertising (IP-7, 20261208000000). Ads are matched by simple rules the
 * member can see: a commercial category they chose, the non-sensitive topic
 * of the post being read, or nothing personal at all. Content interests,
 * follows and searches are never used. Every ad is labelled Sponsored, says
 * why it is shown, and can be hidden, marked relevant or not, or reported.
 */

function whyText(ad: Ad) {
  if (ad.match === 'preference') return `You chose "${ad.matched}" in your ad preferences.`
  if (ad.match === 'context') return `Shown with ${ad.matched} posts. Not based on anything about you.`
  return 'Not personalized: shown to members generally.'
}

/** One ad slot. Renders nothing when there is no suitable ad. */
export function AdSlot({ surface, postId }: { surface: AdSurface; postId?: string }) {
  const api = useAppApi()
  const ref = useRef<HTMLDivElement | null>(null)
  const [ad, setAd] = useState<Ad | null>(null)
  const [gone, setGone] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [why, setWhy] = useState(false)
  const viewed = useRef(false)
  const whyId = useId()

  useEffect(() => {
    let live = true
    api.adFor(surface, postId).then(
      (a) => live && setAd(a),
      () => live && setAd(null),
    )
    return () => {
      live = false
    }
  }, [api, surface, postId])

  const markViewed = useCallback(() => {
    if (!ad || viewed.current) return Promise.resolve()
    viewed.current = true
    return api.adEvent(ad.impressionId, 'view').catch(() => undefined)
  }, [api, ad])

  // A valid impression: at least half the ad visible for a second, on a page
  // the person is looking at (a hidden tab or a locked phone stops the clock).
  useEffect(() => {
    if (!ad || !ref.current) return
    if (typeof IntersectionObserver === 'undefined') {
      void markViewed()
      return
    }
    let timer: ReturnType<typeof setTimeout> | null = null
    let inView = false
    // Once this effect is cleaned up, its observer is finished: a late callback
    // from it must never start a timer that nothing would clear.
    let disposed = false
    const stop = () => {
      if (timer) clearTimeout(timer)
      timer = null
    }
    const start = () => {
      stop()
      if (!disposed && inView && document.visibilityState === 'visible') timer = setTimeout(() => void markViewed(), 1000)
    }
    const io = new IntersectionObserver(
      ([e]) => {
        if (disposed) return
        inView = e.isIntersecting && e.intersectionRatio >= 0.5
        start()
      },
      { threshold: [0.5] },
    )
    io.observe(ref.current)
    document.addEventListener('visibilitychange', start)
    return () => {
      disposed = true
      io.disconnect()
      document.removeEventListener('visibilitychange', start)
      stop()
    }
  }, [ad, markViewed])

  if (!ad || gone) return null

  async function send(kind: 'relevant' | 'not_relevant' | 'hidden' | 'hidden_advertiser' | 'reported') {
    if (!ad) return
    await markViewed()
    await api.adEvent(ad.impressionId, kind).catch(() => undefined)
    if (kind === 'hidden' || kind === 'hidden_advertiser' || kind === 'reported') setGone(true)
    else setFeedback('Thanks. This helps keep ads relevant.')
  }

  return (
    <div ref={ref} data-testid="ad" className="my-3">
      <Card className="border border-dashed border-ink-200 p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wide text-ink-600">
            <Megaphone className="h-3.5 w-3.5" aria-hidden="true" /> Sponsored · {ad.shownWith ? `shown with ${ad.shownWith}'s post` : ad.advertiser}
          </p>
          <button
            type="button"
            aria-expanded={why}
            aria-controls={whyId}
            onClick={() => setWhy((w) => !w)}
            className="text-[13px] font-semibold text-brand-700 underline underline-offset-2"
          >
            Why this ad
          </button>
        </div>
        {why && (
          <div id={whyId} className="mt-2 rounded-xl bg-paper px-3 py-2 text-[13px] text-ink-700" data-testid="why-this-ad">
            <p>{whyText(ad)}</p>
            <p className="mt-1">
              Ads never use your content interests, follows, searches or anything sensitive. Change what you see in your ad preferences (Profile).
            </p>
            <button type="button" onClick={() => void send('hidden_advertiser')} className="mt-2 font-semibold text-brand-700 underline underline-offset-2">
              Don't show ads from {ad.advertiser}
            </button>
          </div>
        )}
        {ad.creativeKind === 'image' && ad.mediaUrl && (
          <img src={ad.mediaUrl} alt={ad.mediaAlt ?? ''} loading="lazy" className="mt-3 max-h-80 w-full rounded-2xl bg-ink-100 object-cover" />
        )}
        {ad.creativeKind === 'video' && ad.mediaUrl && (
          <AdVideo
            url={ad.mediaUrl}
            label={ad.mediaAlt ?? ''}
            onPlayed={() => void markViewed().then(() => api.adEvent(ad.impressionId, 'play').catch(() => undefined))}
            onEnded={() => void api.adEvent(ad.impressionId, 'complete').catch(() => undefined)}
          />
        )}
        <p className="mt-2 font-display text-[17px] font-bold text-ink-900">{ad.headline}</p>
        <p className="mt-1 text-[15px] text-ink-700">{ad.body}</p>
        <a
          href={ad.landingUrl}
          target="_blank"
          rel="noopener noreferrer sponsored"
          onClick={() => {
            void markViewed().then(() => api.adEvent(ad.impressionId, 'click').catch(() => undefined))
          }}
          className={`${buttonClass('secondary', 'sm')} mt-3`}
        >
          {ad.ctaLabel} <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="sr-only"> (opens {ad.advertiser}'s site)</span>
        </a>
        {feedback ? (
          <p className="mt-3 text-[13px] text-ink-600" role="status">
            {feedback}
          </p>
        ) : (
          <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[13px] font-semibold text-ink-600">
            <button type="button" onClick={() => void send('relevant')} className="inline-flex min-h-6 items-center underline-offset-2 hover:underline">
              Relevant
            </button>
            <button type="button" onClick={() => void send('not_relevant')} className="inline-flex min-h-6 items-center underline-offset-2 hover:underline">
              Not relevant
            </button>
            <button type="button" onClick={() => void send('hidden')} className="inline-flex min-h-6 items-center underline-offset-2 hover:underline">
              Hide this ad
            </button>
            <button type="button" onClick={() => void send('reported')} className="inline-flex min-h-6 items-center underline-offset-2 hover:underline">
              Report ad
            </button>
          </div>
        )}
      </Card>
    </div>
  )
}

/**
 * A simple video ad: never autoplays, starts muted, with controls. Loaded into
 * a local blob link (the security headers allow media only from the app and
 * blob links), so it plays without a Production header change. A play counts
 * after 3 seconds of playback; the end counts once.
 */
function AdVideo({ url, label, onPlayed, onEnded }: { url: string; label: string; onPlayed: () => void; onEnded: () => void }) {
  const [src, setSrc] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const played = useRef(false)
  const ended = useRef(false)
  useEffect(() => {
    let live = true
    let made: string | null = null
    fetch(url)
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error('not ok'))))
      .then((b) => {
        if (!live) return
        made = URL.createObjectURL(b)
        setSrc(made)
      })
      .catch(() => live && setFailed(true))
    return () => {
      live = false
      if (made) URL.revokeObjectURL(made)
    }
  }, [url])
  if (failed) return null
  if (!src) return <div className="mt-3 aspect-video w-full rounded-2xl bg-ink-100" aria-hidden="true" />
  return (
    <video
      src={src}
      controls
      muted
      playsInline
      preload="metadata"
      aria-label={label}
      className="mt-3 aspect-video w-full rounded-2xl bg-ink-900"
      onTimeUpdate={(e) => {
        if (!played.current && e.currentTarget.currentTime >= 3) {
          played.current = true
          onPlayed()
        }
      }}
      onEnded={() => {
        if (!played.current) {
          played.current = true
          onPlayed()
        }
        if (!ended.current) {
          ended.current = true
          onEnded()
        }
      }}
    />
  )
}

/** Profile: optional commercial preferences, separate from content interests. */
export function AdPreferences() {
  const api = useAppApi()
  const [cats, setCats] = useState<AdCategory[] | null | undefined>(undefined)
  const [hidden, setHidden] = useState<AdExclusion[]>([])
  const [error, setError] = useState<unknown>(null)
  const load = useCallback(async () => {
    try {
      const c = await api.adCategories()
      setCats(c)
      if (c) setHidden(await api.myAdExclusions())
    } catch (e) {
      setError(e)
    }
  }, [api])
  useEffect(() => {
    void load()
  }, [load])
  if (cats === null || cats === undefined) return null
  async function set(slug: string, state: 'chosen' | 'excluded' | 'none') {
    setCats((cs) => cs?.map((c) => (c.slug === slug ? { ...c, chosen: state === 'chosen', excluded: state === 'excluded' } : c)))
    try {
      await api.setAdPreference(slug, state)
    } catch (e) {
      setError(e)
      await load()
    }
  }
  return (
    <div id="ads" data-testid="ad-preferences">
      <Card className="mt-4 p-5">
        <h2 className="font-display text-lg font-bold text-ink-900">Ads and your preferences</h2>
        <p className="mt-1 text-sm text-ink-700">
          Optional. Tell us what you'd like to see offers for, or never see. Without choices, ads are not personalized. Your content interests, follows and
          searches are never used for ads, and you keep full access whatever you choose.
        </p>
        {error !== null && <Message tone="error">{messageFor(error)}</Message>}
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {cats.map((c) => (
            <li key={c.slug}>
              <label className="flex items-center justify-between gap-2 rounded-2xl bg-paper px-3 py-2 text-[14px] text-ink-900">
                {c.label}
                <select
                  aria-label={c.label}
                  value={c.chosen ? 'chosen' : c.excluded ? 'excluded' : 'none'}
                  onChange={(e) => void set(c.slug, e.target.value as 'chosen' | 'excluded' | 'none')}
                  className="h-9 rounded-xl border border-ink-200 bg-white px-2 text-[14px]"
                >
                  <option value="none">No preference</option>
                  <option value="chosen">Interested</option>
                  <option value="excluded">Don't show</option>
                </select>
              </label>
            </li>
          ))}
        </ul>
        {hidden.length > 0 && (
          <div className="mt-4">
            <h3 className="text-sm font-semibold text-ink-800">Ads you hid</h3>
            <ul className="mt-1 divide-y divide-ink-100 text-[14px]">
              {hidden.map((h) => (
                <li key={h.kind + h.target} className="flex items-center justify-between gap-2 py-2">
                  <span className="min-w-0 truncate">{h.label ?? 'An ad'}</span>
                  <button
                    type="button"
                    onClick={async () => {
                      await api.removeAdExclusion(h.kind, h.target).catch(setError)
                      await load()
                    }}
                    className={buttonClass('secondary', 'sm')}
                  >
                    Show again
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        <button
          type="button"
          onClick={async () => {
            await api.clearAdPreferences().catch(setError)
            await load()
          }}
          className={`${buttonClass('secondary', 'sm')} mt-4`}
        >
          Remove all ad preferences
        </button>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Founder: managed advertising.

const field = 'mt-1 block w-full rounded-2xl border border-ink-200 bg-white px-3 py-2 text-base text-ink-900'
const OBJECTIVES = [
  ['awareness', 'Awareness'],
  ['traffic', 'Website visits'],
  ['sign_ups', 'Sign-ups'],
  ['sales', 'Sales'],
] as const

function Text({ label, value, onChange, area }: { label: string; value: string; onChange: (v: string) => void; area?: boolean }) {
  return (
    <label className="block text-sm font-semibold text-ink-800">
      {label}
      {area ? (
        <textarea rows={2} value={value} onChange={(e) => onChange(e.target.value)} className={`${field} resize-none`} />
      ) : (
        <input value={value} onChange={(e) => onChange(e.target.value)} className={field} />
      )}
    </label>
  )
}

function Picks({
  legend,
  options,
  value,
  onChange,
}: {
  legend: string
  options: Array<{ slug: string; label: string }>
  value: string[]
  onChange: (v: string[]) => void
}) {
  return (
    <fieldset>
      <legend className="text-sm font-semibold text-ink-800">{legend}</legend>
      <div className="mt-1 flex flex-wrap gap-2">
        {options.map((o) => (
          <label key={o.slug} className="flex items-center gap-1.5 rounded-full bg-paper px-3 py-1 text-[13px]">
            <input
              type="checkbox"
              checked={value.includes(o.slug)}
              onChange={(e) => onChange(e.target.checked ? [...value, o.slug] : value.filter((x) => x !== o.slug))}
              className="h-4 w-4 accent-brand-600"
            />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  )
}

function AdvertiserForm({ admin, onSaved }: { admin: AdsAdmin; onSaved: () => Promise<void> }) {
  const api = useAppApi()
  const empty = {
    name: '',
    website: 'https://',
    offering: '',
    problem_solved: '',
    desired_outcome: '',
    customer_needs: '',
    objective: 'traffic',
    conversion_action: '',
    eligibility_notes: '',
    categories: [] as string[],
  }
  const [a, setA] = useState(empty)
  const [error, setError] = useState<unknown>(null)
  const up = (k: keyof typeof empty) => (v: string) => setA((x) => ({ ...x, [k]: v }))
  async function save() {
    setError(null)
    try {
      await api.founderSaveAdvertiser(a as Partial<Advertiser>)
      setA(empty)
      await onSaved()
    } catch (e) {
      setError(e)
    }
  }
  return (
    <Card className="space-y-3 p-5">
      <h3 className="font-display text-base font-bold text-ink-900">Onboard an advertiser</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <Text label="Advertiser name" value={a.name} onChange={up('name')} />
        <Text label="Website" value={a.website} onChange={up('website')} />
        <Text label="What they sell" value={a.offering} onChange={up('offering')} area />
        <Text label="Problem it solves" value={a.problem_solved} onChange={up('problem_solved')} area />
        <Text label="Desired customer outcome" value={a.desired_outcome} onChange={up('desired_outcome')} area />
        <Text label="Customer needs it meets" value={a.customer_needs} onChange={up('customer_needs')} area />
        <label className="block text-sm font-semibold text-ink-800">
          Campaign objective
          <select aria-label="Campaign objective" value={a.objective} onChange={(e) => up('objective')(e.target.value)} className={field}>
            {OBJECTIVES.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <Text label="Conversion action" value={a.conversion_action} onChange={up('conversion_action')} />
        <Text label="Eligibility limits (optional)" value={a.eligibility_notes} onChange={up('eligibility_notes')} />
      </div>
      <Picks legend="Commercial categories" options={admin.categories} value={a.categories} onChange={(v) => setA((x) => ({ ...x, categories: v }))} />
      {error !== null && <Message tone="error">{messageFor(error)}</Message>}
      <button type="button" onClick={save} className={buttonClass('primary', 'sm')}>
        Save advertiser
      </button>
    </Card>
  )
}

function CampaignForm({ admin, onSaved }: { admin: AdsAdmin; onSaved: () => Promise<void> }) {
  const api = useAppApi()
  const today = new Date().toISOString().slice(0, 10)
  const later = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)
  const approved = admin.advertisers.filter((x) => x.status === 'approved')
  const empty = {
    advertiser_id: approved[0]?.id ?? '',
    name: '',
    placement: 'both',
    categories: [] as string[],
    context_topics: [] as string[],
    allow_general: false,
    starts_on: today,
    ends_on: later,
    daily_cap: '3',
    price: '',
    headline: '',
    body: '',
    cta_label: 'Learn more',
    landing_url: 'https://',
    creative_kind: 'text',
    media_path: '',
    media_alt: '',
  }
  const [c, setC] = useState(empty)
  const [error, setError] = useState<unknown>(null)
  const up = (k: keyof typeof empty) => (v: string) => setC((x) => ({ ...x, [k]: v }))
  async function save() {
    setError(null)
    try {
      if (!c.advertiser_id) throw new AppApiError('advertiser_not_approved')
      const { price, daily_cap, ...rest } = c
      await api.founderSaveCampaign({ ...rest, daily_cap: Number(daily_cap) || 3, price_cents: Math.round(Number(price || 0) * 100) } as Partial<Campaign>)
      setC(empty)
      await onSaved()
    } catch (e) {
      setError(e)
    }
  }
  return (
    <Card className="space-y-3 p-5">
      <h3 className="font-display text-base font-bold text-ink-900">New campaign</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm font-semibold text-ink-800">
          Advertiser (approved)
          <select aria-label="Advertiser (approved)" value={c.advertiser_id} onChange={(e) => up('advertiser_id')(e.target.value)} className={field}>
            {approved.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </label>
        <Text label="Campaign name" value={c.name} onChange={up('name')} />
        <label className="block text-sm font-semibold text-ink-800">
          Placement
          <select aria-label="Placement" value={c.placement} onChange={(e) => up('placement')(e.target.value)} className={field}>
            <option value="both">With creators' posts and in the feed</option>
            <option value="content">With creators' posts (shared revenue)</option>
            <option value="feed">In the feed (Splitpost revenue)</option>
          </select>
        </label>
        <Text label="Starts (YYYY-MM-DD)" value={c.starts_on} onChange={up('starts_on')} />
        <Text label="Ends (YYYY-MM-DD)" value={c.ends_on} onChange={up('ends_on')} />
        <Text label="Daily cap per member (1 to 3)" value={c.daily_cap} onChange={up('daily_cap')} />
        <Text label="Simulated price ($)" value={c.price} onChange={up('price')} />
        <Text label="Headline" value={c.headline} onChange={up('headline')} />
        <Text label="Text" value={c.body} onChange={up('body')} area />
        <Text label="Button label" value={c.cta_label} onChange={up('cta_label')} />
        <Text label="Landing page" value={c.landing_url} onChange={up('landing_url')} />
        <label className="block text-sm font-semibold text-ink-800">
          Creative
          <select aria-label="Creative" value={c.creative_kind} onChange={(e) => up('creative_kind')(e.target.value)} className={field}>
            <option value="text">Text only</option>
            <option value="image">Image</option>
            <option value="video">Simple video (MP4)</option>
          </select>
        </label>
        {c.creative_kind !== 'text' && (
          <>
            <label className="block text-sm font-semibold text-ink-800">
              File (uploaded to the ad-creatives bucket)
              <select
                aria-label="File (uploaded to the ad-creatives bucket)"
                value={c.media_path}
                onChange={(e) => up('media_path')(e.target.value)}
                className={field}
              >
                <option value="">Choose a file</option>
                {(admin.creatives ?? [])
                  .filter((f) => (c.creative_kind === 'video' ? f.type === 'video/mp4' : (f.type ?? '').startsWith('image/')))
                  .map((f) => (
                    <option key={f.path} value={f.path}>
                      {f.path}
                    </option>
                  ))}
              </select>
            </label>
            <Text label="Text alternative (what the image or video shows)" value={c.media_alt} onChange={up('media_alt')} />
          </>
        )}
      </div>
      {c.creative_kind !== 'text' && (
        <p className="text-[13px] text-ink-600">
          Upload the file in Supabase, Storage, ad-creatives (JPEG, PNG or WebP, or MP4 up to 8 MB), then choose it here. A campaign can't be activated until
          its file is there.
        </p>
      )}
      <Picks
        legend="Commercial categories (from onboarding)"
        options={admin.categories}
        value={c.categories}
        onChange={(v) => setC((x) => ({ ...x, categories: v }))}
      />
      <Picks
        legend="Content topics for contextual ads (never faith or health)"
        options={admin.topics}
        value={c.context_topics}
        onChange={(v) => setC((x) => ({ ...x, context_topics: v }))}
      />
      <label className="flex items-center gap-2 text-sm text-ink-800">
        <input
          type="checkbox"
          checked={c.allow_general}
          onChange={(e) => setC((x) => ({ ...x, allow_general: e.target.checked }))}
          className="h-4 w-4 accent-brand-600"
        />
        Allow a non-personalized fallback when nothing matches
      </label>
      {error !== null && <Message tone="error">{messageFor(error)}</Message>}
      <button type="button" onClick={save} className={buttonClass('primary', 'sm')}>
        Save campaign (as draft)
      </button>
    </Card>
  )
}

const few = (n: number | null) => (n === null ? 'fewer than 10' : String(n))

/** Advertiser intelligence: what happened, what it means, what to do next (aggregate only). */
export function campaignStory(r: CampaignReport): Story {
  const ctr = (n: { impressions: number; clicks: number }) => (n.impressions > 0 ? n.clicks / n.impressions : null)
  const happened =
    r.impressions === 0
      ? 'No valid impressions yet.'
      : `${r.impressions} valid impressions and ${r.clicks} outbound clicks${r.ctr === null ? '' : ` (${(r.ctr * 100).toFixed(1)}% click-through)`}; ${r.verifiedConversions} verified conversions.`
  const pref = ctr(r.byMatch.preference)
  const gen = ctr(r.byMatch.general)
  const negative = r.notRelevant + r.hidden + r.reported
  let means: string
  if (r.byMatch.preference.impressions < 100 || (r.byMatch.general.impressions < 100 && r.byMatch.context.impressions < 100))
    means = 'Too few impressions yet to compare preference-based and other delivery; treat differences as noise.'
  else if (pref !== null && gen !== null)
    means = `Preference-based delivery clicked at ${(pref * 100).toFixed(1)}% against ${(gen * 100).toFixed(1)}% when not personalized.`
  else means = 'Delivery is mostly one kind so far.'
  if (r.impressions > 0 && negative / r.impressions > 0.05)
    means += ` ${negative} members found it not relevant, hid it or reported it: more than 5% of impressions.`
  const next =
    r.impressions > 0 && negative / r.impressions > 0.05
      ? 'Review the creative and categories with the advertiser before extending the campaign.'
      : r.verifiedConversions === 0 && r.clicks > 0
        ? 'Ask the advertiser for their conversion report so it can be verified.'
        : r.eligibleAudience === null
          ? 'The audience who chose these categories is still small; consider contextual topics or a non-personalized fallback.'
          : 'Keep the campaign running and compare again next week.'
  return { happened, means, next }
}

function ReportView({ campaign }: { campaign: Campaign }) {
  const api = useAppApi()
  const [r, setR] = useState<CampaignReport | null>(null)
  const [month, setMonth] = useState(() => {
    const d = new Date()
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)).toISOString().slice(0, 7)
  })
  const [conv, setConv] = useState('')
  const [selfConv, setSelfConv] = useState('')
  const [note, setNote] = useState('')
  const [net, setNet] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [error, setError] = useState<unknown>(null)
  const load = useCallback(async () => setR(await api.founderCampaignReport(campaign.id)), [api, campaign.id])
  useEffect(() => {
    void load().catch(setError)
  }, [load])
  if (!r) return <Spinner label="Loading the report…" />
  const rows: Array<[string, string]> = [
    ['Eligible audience (chose a matching category)', few(r.eligibleAudience)],
    ['Reach', few(r.reach)],
    ['Valid impressions', String(r.impressions)],
    ['Outbound clicks', String(r.clicks)],
    ['Click-through rate', r.ctr === null ? 'n/a' : `${(r.ctr * 100).toFixed(1)}%`],
    ['Verified conversions', String(r.verifiedConversions)],
    ['Self-reported conversions (not verified)', r.selfReportedConversions === null ? 'none recorded' : String(r.selfReportedConversions)],
    ['Relevant / not relevant', `${r.relevant} / ${r.notRelevant}`],
    ['Hidden / reported', `${r.hidden} / ${r.reported}`],
    ['By preference (impressions, clicks)', `${r.byMatch.preference.impressions}, ${r.byMatch.preference.clicks}`],
    ['By context (impressions, clicks)', `${r.byMatch.context.impressions}, ${r.byMatch.context.clicks}`],
    ['Not personalized (impressions, clicks)', `${r.byMatch.general.impressions}, ${r.byMatch.general.clicks}`],
    ['With creators’ posts / in the feed', `${r.contentImpressions} / ${r.feedImpressions}`],
    ...(r.creativeKind === 'video' ? ([['Video plays (3 s) / completions', `${r.videoPlays} / ${r.videoCompletions}`]] as Array<[string, string]>) : []),
    ['Advertiser satisfaction', r.advertiserSatisfaction === null ? 'not recorded' : `${r.advertiserSatisfaction} of 5`],
  ]
  async function act(f: () => Promise<string>) {
    setError(null)
    setMsg(null)
    try {
      setMsg(await f())
      await load()
    } catch (e) {
      setError(e)
    }
  }
  return (
    <div className="mt-3 space-y-3 rounded-2xl bg-paper p-4" data-testid="campaign-report">
      <p className="text-[13px] font-semibold text-ink-700">Actual observations, aggregate only. Groups under 10 are withheld; nothing identifies a member.</p>
      <Steps story={campaignStory(r)} />
      <button
        type="button"
        className={buttonClass('secondary', 'sm')}
        onClick={() => {
          const body = [
            'metric,value',
            ...rows.map(([k, v]) => `"${k}","${v}"`),
            `"Revenue recorded (simulated)","${simulatedDollars(r.simulatedRevenueCents)}"`,
          ].join('\n')
          const url = URL.createObjectURL(new Blob([body], { type: 'text/csv' }))
          const a = document.createElement('a')
          a.href = url
          a.download = `campaign-${campaign.name}.csv`
          a.click()
          setTimeout(() => URL.revokeObjectURL(url), 1000)
        }}
      >
        Export report (CSV)
      </button>
      <dl className="grid gap-2 text-[14px] sm:grid-cols-2">
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt className="text-[12px] text-ink-600">{k}</dt>
            <dd className="font-semibold tabular-nums text-ink-900">{v}</dd>
          </div>
        ))}
        <div>
          <dt className="text-[12px] text-ink-600">Revenue recorded (simulated)</dt>
          <dd className="font-semibold tabular-nums text-ink-900">{simulatedDollars(r.simulatedRevenueCents)}</dd>
        </div>
      </dl>
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="block text-sm font-semibold text-ink-800">
          Month
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className={field} />
        </label>
        <Text label="Verified conversions" value={conv} onChange={setConv} />
        <Text label="How they were verified" value={note} onChange={setNote} />
        <Text label="Self-reported by the advertiser (optional)" value={selfConv} onChange={setSelfConv} />
      </div>
      <button
        type="button"
        className={buttonClass('secondary', 'sm')}
        onClick={() =>
          act(
            async () => (
              await api.founderRecordConversions(campaign.id, `${month}-01`, Number(conv), note, selfConv.trim() === '' ? null : Number(selfConv)),
              'Conversions recorded.'
            ),
          )
        }
      >
        Record verified conversions
      </button>
      <div className="grid gap-2 sm:grid-cols-3">
        <Text label="Simulated net revenue for the month ($)" value={net} onChange={setNet} />
      </div>
      <button
        type="button"
        className={buttonClass('secondary', 'sm')}
        onClick={() =>
          act(async () => {
            const x = await api.founderAttributeCampaignRevenue(campaign.id, `${month}-01`, Math.round(Number(net) * 100))
            return `Attributed: ${simulatedDollars(x.contentCents)} to creators' content (shared), ${simulatedDollars(x.feedCents)} to the feed (Splitpost). Simulated.`
          })
        }
      >
        Attribute simulated revenue
      </button>
      {msg && <Message tone="success">{msg}</Message>}
      {error !== null && <Message tone="error">{messageFor(error)}</Message>}
    </div>
  )
}

export function AdsManagePage() {
  const api = useAppApi()
  const { founder } = useFeedbackAccess()
  const [admin, setAdmin] = useState<AdsAdmin | null | undefined>(undefined)
  const [demand, setDemand] = useState<Array<{ category: string; label: string; members: number | null }>>([])
  const [open, setOpen] = useState<string | null>(null)
  const [error, setError] = useState<unknown>(null)
  // Approving confirms the Advertising Policy (founder decision, Nov 25), advertiser by advertiser.
  const [policyOk, setPolicyOk] = useState<Record<string, boolean>>({})
  const load = useCallback(async () => {
    try {
      const a = await api.founderAds()
      setAdmin(a)
      if (a) setDemand(await api.founderAdDemand())
    } catch (e) {
      setError(e)
    }
  }, [api])
  useEffect(() => {
    if (founder) void load()
  }, [load, founder])
  if (!founder) return <Message tone="info">Only the founder can see this.</Message>
  if (error !== null && admin === undefined) return <Message tone="error">{messageFor(error)}</Message>
  if (admin === undefined) return <Spinner label="Loading advertising…" />
  if (admin === null) return <Message tone="info">Advertising isn't available on this database yet.</Message>
  async function act(f: () => Promise<void>) {
    setError(null)
    try {
      await f()
      await load()
    } catch (e) {
      setError(e)
    }
  }
  return (
    <>
      <PageHeader title="Advertising" subtitle="Founder only. Managed onboarding, campaigns and aggregate reports. Money is simulated during the pilot." />
      {error !== null && <Message tone="error">{messageFor(error)}</Message>}
      <h2 className="mb-2 mt-2 font-display text-lg font-bold text-ink-900">Advertisers</h2>
      <ul className="mb-3 space-y-2" aria-label="Advertisers">
        {admin.advertisers.map((a) => (
          <li key={a.id}>
            <Card className="p-4 text-[14px]">
              <p className="font-semibold text-ink-900">
                {a.name} <span className="ml-1 text-[12px] font-bold uppercase text-ink-600">{a.status}</span>
              </p>
              {a.requested_by_username && <p className="text-[13px] font-semibold text-brand-800">Requested by @{a.requested_by_username} from their account</p>}
              <p className="mt-1 text-ink-700">
                {a.offering}. Solves: {a.problem_solved}. Outcome: {a.desired_outcome}.
              </p>
              {a.status === 'pending' && (
                <label className="mt-2 flex gap-2 text-[13px] leading-snug text-ink-800">
                  <input
                    type="checkbox"
                    checked={!!policyOk[a.id]}
                    onChange={(e) => setPolicyOk((p) => ({ ...p, [a.id]: e.target.checked }))}
                    className="mt-0.5 h-5 w-5 shrink-0"
                  />
                  <span>
                    Meets the Advertising Policy: no deceptive financial claims, get-rich-quick schemes, guaranteed returns or predatory products, and not a
                    regulated financial product (those wait for legal review).<span className="sr-only">{` ${a.name}`}</span>
                  </span>
                </label>
              )}
              {a.status === 'pending' && (
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    disabled={!policyOk[a.id]}
                    onClick={() =>
                      act(() =>
                        api.founderReviewAdvertiser(
                          a.id,
                          true,
                          'Meets the Advertising Policy (no deceptive financial claims, get-rich-quick schemes, guaranteed returns, predatory or regulated financial products)',
                        ),
                      )
                    }
                    className={buttonClass('primary', 'sm')}
                  >
                    Approve<span className="sr-only">{` ${a.name}`}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => act(() => api.founderReviewAdvertiser(a.id, false, 'Does not meet the Advertising Policy'))}
                    className={buttonClass('secondary', 'sm')}
                  >
                    Decline<span className="sr-only">{` ${a.name}`}</span>
                  </button>
                </div>
              )}
            </Card>
          </li>
        ))}
      </ul>
      <AdvertiserForm admin={admin} onSaved={load} />
      <h2 className="mb-2 mt-6 font-display text-lg font-bold text-ink-900">Campaigns</h2>
      <ul className="mb-3 space-y-2" aria-label="Campaigns">
        {admin.campaigns.map((c) => (
          <li key={c.id}>
            <Card className="p-4 text-[14px]">
              <p className="font-semibold text-ink-900">
                {c.name} · {c.advertiser} <span className="ml-1 text-[12px] font-bold uppercase text-ink-600">{c.status}</span>
              </p>
              <p className="mt-1 text-ink-700">
                {c.headline} · {c.placement === 'both' ? 'posts and feed' : c.placement === 'content' ? "creators' posts" : 'feed'} · {c.starts_on} to{' '}
                {c.ends_on}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {c.status !== 'active' && c.status !== 'completed' && (
                  <button type="button" onClick={() => act(() => api.founderSetCampaignStatus(c.id, 'active'))} className={buttonClass('primary', 'sm')}>
                    Activate<span className="sr-only">{` ${c.name}`}</span>
                  </button>
                )}
                {c.status === 'active' && (
                  <button type="button" onClick={() => act(() => api.founderSetCampaignStatus(c.id, 'paused'))} className={buttonClass('secondary', 'sm')}>
                    Pause<span className="sr-only">{` ${c.name}`}</span>
                  </button>
                )}
                <button
                  type="button"
                  aria-expanded={open === c.id}
                  onClick={() => setOpen(open === c.id ? null : c.id)}
                  className={buttonClass('secondary', 'sm')}
                >
                  Report<span className="sr-only">{` for ${c.name}`}</span>
                </button>
              </div>
              {open === c.id && <ReportView campaign={c} />}
            </Card>
          </li>
        ))}
      </ul>
      <CampaignForm admin={admin} onSaved={load} />
      <h2 className="mb-2 mt-6 font-display text-lg font-bold text-ink-900">Commercial demand</h2>
      <Card className="p-4">
        <p className="text-[13px] text-ink-600">Members who chose each category. Under 10 is withheld.</p>
        <ul className="mt-2 grid gap-1 text-[14px] sm:grid-cols-2" data-testid="ad-demand">
          {demand.map((d) => (
            <li key={d.category} className="flex justify-between gap-2">
              <span>{d.label}</span>
              <span className="tabular-nums text-ink-700">{few(d.members)}</span>
            </li>
          ))}
        </ul>
      </Card>
    </>
  )
}
