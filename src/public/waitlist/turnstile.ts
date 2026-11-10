// Loads Cloudflare Turnstile only when the waitlist form is switched on.
// vercel.json's Content Security Policy allows https://challenges.cloudflare.com
// in script-src and frame-src for this. Nothing here runs while the form is off.

type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string
  reset: (id?: string) => void
  remove: (id?: string) => void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

export type TurnstileWidget = { reset: () => void; remove: () => void }

export type MountTurnstile = (
  el: HTMLElement,
  siteKey: string,
  onToken: (token: string | null) => void,
) => Promise<TurnstileWidget>

const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

/** The action the server function requires Cloudflare to report ('join'). */
export const TURNSTILE_ACTION = 'join'
let loading: Promise<TurnstileApi> | null = null

function loadScript(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile)
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const s = document.createElement('script')
      s.src = SCRIPT
      s.async = true
      s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('Turnstile did not load')))
      s.onerror = () => {
        loading = null
        reject(new Error('Turnstile did not load'))
      }
      document.head.appendChild(s)
    })
  }
  return loading
}

export const mountTurnstile: MountTurnstile = async (el, siteKey, onToken) => {
  const api = await loadScript()
  const id = api.render(el, {
    sitekey: siteKey,
    action: TURNSTILE_ACTION,
    callback: (token: string) => onToken(token),
    'expired-callback': () => onToken(null),
    'error-callback': () => onToken(null),
  })
  return { reset: () => api.reset(id), remove: () => api.remove(id) }
}
