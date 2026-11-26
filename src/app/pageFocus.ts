import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'

/** The tab title for a page heading: "Home · Splitpost". */
export function titleFor(heading: string | null | undefined) {
  const h = (heading ?? '').replace(/\s+/g, ' ').trim()
  return h ? `${h} · Splitpost` : 'Splitpost'
}

/**
 * Screen reader and keyboard support for moving between members-area pages
 * (WCAG 2.4.2 and 2.4.3):
 *  - the browser tab is titled after the page's main heading, and follows it
 *    as the page loads (a heading can appear after its data);
 *  - after moving to another page (not on the first load, and not when only
 *    the ?face= view changes), focus goes to the main content, so a screen
 *    reader starts there instead of on the link just used. A field the new
 *    page focused itself (the composer, a form) keeps its focus.
 */
export function usePageFocus(mainId = 'main') {
  const { pathname } = useLocation()
  const first = useRef(true)

  useEffect(() => {
    const main = document.getElementById(mainId)
    if (!main) return
    const update = () => {
      const t = titleFor(main.querySelector('h1')?.textContent)
      if (document.title !== t) document.title = t
    }
    update()
    const observer = new MutationObserver(update)
    observer.observe(main, { childList: true, subtree: true, characterData: true })
    return () => observer.disconnect()
  }, [mainId])

  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    const main = document.getElementById(mainId)
    if (!main || main.contains(document.activeElement)) return
    main.focus({ preventScroll: true })
  }, [pathname, mainId])
}
