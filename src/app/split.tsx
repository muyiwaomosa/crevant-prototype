import { useEffect, useState } from 'react'
import { Check, Copy, Share2 } from 'lucide-react'
import { Card, PageHeader, buttonClass } from '../components/ui'
import { FaceView } from '../components/FaceView'
import { MySplitIcon } from '../components/MySplitIcon'
import { Message } from '../public/auth/AuthUi'
import { messageFor } from './api'
import { useAppApi } from './AppApiContext'

/**
 * My Split (SP-DESIGN-002). IP-1 delivers the destination, its three faces and
 * the member's personal referral link. Connection Points, the simulated fan
 * pool and contribution history arrive with the rewards work package; until
 * then each face says plainly what will appear there and makes no claims.
 */
export function MySplitPage() {
  return (
    <>
      <PageHeader title="My Split" subtitle="How you help the creators you value grow. Rewards are simulated during the pilot." />
      <FaceView
        label="My Split views"
        faces={[
          { key: 'overview', label: 'Overview', content: <Overview /> },
          { key: 'history', label: 'History', content: <History /> },
          { key: 'opportunities', label: 'Opportunities', content: <Opportunities /> },
        ]}
      />
    </>
  )
}

function Overview() {
  return (
    <div className="space-y-4">
      <Card className="overflow-hidden p-0">
        <div className="bg-brand-600 p-5 text-white">
          <div className="flex items-center gap-3">
            <MySplitIcon className="h-8 w-8" strokeWidth={2} />
            <h2 className="font-display text-[22px] font-extrabold">Your contribution, made visible</h2>
          </div>
          <p className="mt-3 text-[15px] leading-relaxed text-[#d3def3]">
            Connection Points will recognize how you help creators grow: thoughtful comments, saves, reposts, shares, and inviting people who go on to follow a creator.
          </p>
        </div>
        <div className="space-y-2 p-5 text-[14px] leading-relaxed text-ink-700">
          <p>
            <strong className="text-ink-900">Coming in the pilot:</strong> your points, which ones are redemption eligible, and an estimate of what eligible points would be worth from the simulated fan pool.
          </p>
          <p className="rounded-xl bg-[#e7f4f1] px-3 py-2 text-[13px] text-[#1f5e52]" data-testid="split-disclosure">
            During the pilot all rewards and values are simulated. Connection Points have no cash value and nothing is paid out.
          </p>
        </div>
      </Card>
    </div>
  )
}

function History() {
  return (
    <Card className="p-6 text-center">
      <h2 className="font-display text-lg font-extrabold">Nothing here yet</h2>
      <p className="mt-2 text-[14px] text-ink-700">Your contributions will be listed here, newest first, once Connection Points are switched on for the pilot.</p>
    </Card>
  )
}

function Opportunities() {
  const api = useAppApi()
  const [code, setCode] = useState<string | null | undefined>(undefined)
  const [error, setError] = useState<unknown>(null)
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    let live = true
    api.myReferralCode().then(
      (c) => live && setCode(c),
      (e) => live && (setError(e), setCode(null)),
    )
    return () => {
      live = false
    }
  }, [api])
  const link = code ? `${window.location.origin}/register/${code}` : null
  async function copy() {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2500)
    } catch {
      setCopied(false)
    }
  }
  async function share() {
    if (!link) return
    try {
      await navigator.share({ title: 'Join me on Splitpost', url: link })
    } catch {
      // Cancelled or unavailable: the copy button still works.
    }
  }
  return (
    <div className="space-y-4">
      <Card className="p-5">
        <h2 className="font-display text-lg font-extrabold">Invite someone who'd value it</h2>
        <p className="mt-2 text-[14px] leading-relaxed text-ink-700">
          Share your personal link with an adult who would enjoy the creators you follow. When they join through it and follow a creator, that's a direct contribution to that creator's growth.
        </p>
        {error !== null && <div className="mt-3"><Message tone="error">{messageFor(error)}</Message></div>}
        {code === undefined && <p className="mt-3 text-sm text-ink-600">Getting your link…</p>}
        {code === null && error === null && <p className="mt-3 text-sm text-ink-600">Personal links aren't available yet.</p>}
        {link && (
          <div className="mt-4 space-y-3">
            <div className="break-all rounded-xl bg-paper px-3 py-2 font-mono text-[13px] text-ink-900" data-testid="referral-link">
              {link}
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={copy} className={buttonClass('primary')}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? 'Copied' : 'Copy link'}
              </button>
              {typeof navigator !== 'undefined' && 'share' in navigator && (
                <button type="button" onClick={share} className={buttonClass('secondary')}>
                  <Share2 className="h-4 w-4" />
                  Share
                </button>
              )}
            </div>
          </div>
        )}
        <p className="mt-4 text-[12.5px] text-ink-600">
          Places in the pilot are limited and registration can be paused. People can only join through a valid link. Rewards for referrals are simulated and not yet switched on.
        </p>
      </Card>
    </div>
  )
}
