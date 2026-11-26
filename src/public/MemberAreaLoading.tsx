import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AuthCard, Spinner } from './auth/AuthUi'
import { buttonClass } from '../components/ui'

/** Shown for the moment the members area's code is loading. */
export function MemberAreaLoading() {
  return (
    <div className="px-4 py-20">
      <div className="mx-auto max-w-md">
        <Spinner label="Opening Splitpost…" />
      </div>
    </div>
  )
}

/** A chunk that no longer exists (Splitpost was updated while the tab was open) or a dropped connection. */
export function isLoadFailure(error: unknown): boolean {
  const text = error instanceof Error ? `${error.name} ${error.message}` : String(error)
  return /dynamically imported module|Importing a module script failed|error loading dynamically imported|ChunkLoadError|Failed to fetch/i.test(text)
}

/**
 * Keeps an unexpected error from leaving a blank page: the member sees what
 * happened and can reload, and nothing they had saved is lost (every change
 * is saved on the server as it is made). Nothing about the error is sent
 * anywhere; it stays in the browser console.
 */
export class MemberAreaBoundary extends Component<{ children: ReactNode }, { error: unknown }> {
  state = { error: null as unknown }

  static getDerivedStateFromError(error: unknown) {
    return { error }
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.warn('Splitpost could not show this page', error, info.componentStack)
  }

  render() {
    if (this.state.error === null) return this.props.children
    const updated = isLoadFailure(this.state.error)
    return (
      <AuthCard
          title={updated ? 'Splitpost needs a reload' : 'Something went wrong on this page'}
          intro={
            <p>
              {updated
                ? 'Splitpost was updated, or the connection dropped, while this page was open. Reload to continue.'
                : 'This page could not be shown. Reloading usually fixes it. Anything you already posted or saved is kept.'}
            </p>
          }
        >
          <div className="flex flex-wrap gap-2">
            <button type="button" className={buttonClass('primary')} onClick={() => window.location.reload()}>
              Reload
            </button>
            <a href="/app" className={buttonClass('secondary')}>
              Go to Home
            </a>
          </div>
      </AuthCard>
    )
  }
}
