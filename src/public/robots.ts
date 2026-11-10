import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import site from '../../config/public-site.json'
import { INDEXING_ALLOWED } from '../build-flags'

/** The only pages search engines may ever index, and only once approved. */
export const INDEXABLE_PATHS: readonly string[] = site.indexablePaths

const normalise = (pathname: string) => (pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname)

/** The robots directive for a page: index only approved pages, only when indexing is allowed. */
export function robotsDirective(pathname: string, indexingAllowed: boolean): string {
  return indexingAllowed && INDEXABLE_PATHS.includes(normalise(pathname)) ? 'index, follow' : 'noindex'
}

/** Sets <meta name="robots"> on the page. */
export function setRobotsMeta(content: string) {
  let meta = document.querySelector<HTMLMetaElement>('meta[name="robots"]')
  if (!meta) {
    meta = document.createElement('meta')
    meta.name = 'robots'
    document.head.appendChild(meta)
  }
  meta.content = content
}

/** Keeps <meta name="robots"> right as the visitor moves between public pages. */
export function useRobotsMeta(indexingAllowed: boolean = INDEXING_ALLOWED) {
  const { pathname } = useLocation()
  useEffect(() => setRobotsMeta(robotsDirective(pathname, indexingAllowed)), [pathname, indexingAllowed])
}
