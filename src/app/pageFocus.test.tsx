// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { Link, MemoryRouter, Outlet, Route, Routes } from 'react-router-dom'
import { titleFor, usePageFocus } from './pageFocus'

function Layout() {
  usePageFocus()
  return (
    <>
      <nav>
        <Link to="/app">Home</Link>
        <Link to="/app/split">My Split</Link>
        <Link to="/app/new">New post</Link>
        <Link to="/app/split?face=history">History view</Link>
      </nav>
      <main id="main" tabIndex={-1}>
        <Outlet />
      </main>
    </>
  )
}
function Later() {
  const [ready, setReady] = useState(false)
  return ready ? <h1>My Split</h1> : <button onClick={() => setReady(true)}>load</button>
}
function Compose() {
  return <textarea aria-label="Write a post" autoFocus />
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="app" element={<Layout />}>
          <Route index element={<h1>Home</h1>} />
          <Route path="split" element={<Later />} />
          <Route path="new" element={<Compose />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

describe('page titles and focus in the members area (WCAG 2.4.2, 2.4.3)', () => {
  afterEach(cleanup)

  it('titles the tab after the page heading', () => {
    expect(titleFor('  My   Split ')).toBe('My Split · Splitpost')
    expect(titleFor('')).toBe('Splitpost')
    renderAt('/app')
    expect(document.title).toBe('Home · Splitpost')
  })

  it('follows a heading that appears after the page loads', async () => {
    renderAt('/app/split')
    expect(document.title).toBe('Splitpost')
    fireEvent.click(screen.getByRole('button', { name: 'load' }))
    await waitFor(() => expect(document.title).toBe('My Split · Splitpost'))
  })

  it('leaves focus alone on the first load, then moves it to the main content after navigating', () => {
    renderAt('/app')
    expect(document.activeElement).toBe(document.body)
    const link = screen.getByRole('link', { name: 'My Split' })
    link.focus()
    fireEvent.click(link)
    expect(document.activeElement).toBe(document.getElementById('main'))
  })

  it('keeps the focus a page gave itself, and does not move it when only the view changes', () => {
    renderAt('/app')
    fireEvent.click(screen.getByRole('link', { name: 'New post' }))
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Write a post' }))
    fireEvent.click(screen.getByRole('link', { name: 'My Split' }))
    const view = screen.getByRole('link', { name: 'History view' })
    view.focus()
    fireEvent.click(view)
    expect(document.activeElement).toBe(view)
  })
})
