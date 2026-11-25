import { useCallback, useEffect, useRef, useState } from 'react'
import { mountTurnstile, type MountTurnstile, type TurnstileWidget } from '../public/waitlist/turnstile'

/**
 * Cloudflare Turnstile for Supabase Auth (open beta): sign-up, sign-in,
 * password reset and resending the confirmation email. Supabase verifies the
 * token itself (Authentication, Attack Protection, CAPTCHA), so the browser
 * only passes it on as `captchaToken`.
 *
 * The site key is public: VITE_AUTH_TURNSTILE_SITE_KEY, set for the member
 * app's Production build only. Without it (staging Previews, local) no widget
 * is shown and no token is sent, which is right while Supabase's CAPTCHA
 * protection is off for that project. A token works once, so callers reset
 * after every attempt.
 */
export const AUTH_TURNSTILE_SITE_KEY = String(import.meta.env.VITE_AUTH_TURNSTILE_SITE_KEY ?? '').trim()
export const AUTH_TURNSTILE_ACTION = 'auth'

export type Captcha = {
  enabled: boolean
  box: React.RefObject<HTMLDivElement | null>
  token: string | null
  failed: boolean
  reset: () => void
}

export function useCaptcha(siteKey: string = AUTH_TURNSTILE_SITE_KEY, mount: MountTurnstile = mountTurnstile): Captcha {
  const box = useRef<HTMLDivElement | null>(null)
  const widget = useRef<TurnstileWidget | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (!siteKey || !box.current) return
    let gone = false
    mount(box.current, siteKey, setToken, AUTH_TURNSTILE_ACTION)
      .then((w) => {
        if (gone) w.remove()
        else widget.current = w
      })
      .catch(() => setFailed(true))
    return () => {
      gone = true
      widget.current?.remove()
      widget.current = null
    }
  }, [siteKey, mount])
  const reset = useCallback(() => {
    setToken(null)
    widget.current?.reset()
  }, [])
  return { enabled: Boolean(siteKey), box, token, failed, reset }
}

/** The widget's place on the page. Renders nothing when no site key is set. */
export function CaptchaBox({ captcha }: { captcha: Captcha }) {
  if (!captcha.enabled) return null
  return (
    <div>
      <div ref={captcha.box} data-testid="auth-captcha" />
      {captcha.failed && <p className="mt-2 text-sm text-ink-700">The security check didn't load. Refresh the page and try again.</p>}
    </div>
  )
}

/** The message for a submit before the check is done. */
export const CAPTCHA_NEEDED = 'Complete the security check, then try again.'
