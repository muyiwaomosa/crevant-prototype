// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { FaceView } from './FaceView'

// jsdom has no PointerEvent: without this, drags would carry no coordinates and
// the "never switches" checks would pass for the wrong reason.
if (typeof window !== 'undefined' && !('PointerEvent' in window)) {
  class TestPointerEvent extends MouseEvent {
    pointerType: string
    constructor(type: string, init: MouseEventInit & { pointerType?: string } = {}) {
      super(type, init)
      this.pointerType = init.pointerType ?? 'mouse'
    }
  }
  ;(window as unknown as { PointerEvent: typeof TestPointerEvent }).PointerEvent = TestPointerEvent
}
window.scrollTo = () => {}

let where = ''
function Where() {
  where = useLocation().search
  return null
}

function renderFaces(path = '/x') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/x"
          element={
            <>
              <Where />
              <FaceView
                label="Test views"
                faces={[
                  { key: 'one', label: 'One', content: <p>Face one</p> },
                  { key: 'two', label: 'Two', content: <input aria-label="Draft" /> },
                  { key: 'three', label: 'Three', content: <p>Face three</p> },
                ]}
              />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  )
}

const selected = () => screen.getAllByRole('tab').find((t) => t.getAttribute('aria-selected') === 'true')?.textContent
const surface = () => screen.getByRole('tabpanel').parentElement as HTMLElement

function drag(dx: number, dy: number, startX = 200) {
  const el = surface()
  fireEvent.pointerDown(el, { clientX: startX, clientY: 300, pointerType: 'touch' })
  fireEvent.pointerMove(el, { clientX: startX + dx / 2, clientY: 300 + dy / 2, pointerType: 'touch' })
  fireEvent.pointerMove(el, { clientX: startX + dx, clientY: 300 + dy, pointerType: 'touch' })
  fireEvent.pointerUp(el, { clientX: startX + dx, clientY: 300 + dy, pointerType: 'touch' })
}

afterEach(cleanup)

describe('FaceView (multi-face navigation)', () => {
  it('starts on the first face, with labelled tabs, and only mounts what has been shown', () => {
    renderFaces()
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['One', 'Two', 'Three'])
    expect(selected()).toBe('One')
    expect(screen.getByText('Face one')).toBeTruthy()
    expect(screen.queryByText('Face three')).toBeNull()
  })

  it('a tap changes the face and records it in the URL; the first face has no parameter', () => {
    renderFaces()
    fireEvent.click(screen.getByRole('tab', { name: 'Three' }))
    expect(selected()).toBe('Three')
    expect(where).toBe('?face=three')
    fireEvent.click(screen.getByRole('tab', { name: 'One' }))
    expect(where).toBe('')
  })

  it('opens the face named in the URL', () => {
    renderFaces('/x?face=two')
    expect(selected()).toBe('Two')
  })

  it('arrow, Home and End keys move between faces and focus the tab', () => {
    renderFaces()
    const list = screen.getByRole('tablist')
    fireEvent.keyDown(list, { key: 'ArrowRight' })
    expect(selected()).toBe('Two')
    expect(document.activeElement?.textContent).toBe('Two')
    fireEvent.keyDown(list, { key: 'End' })
    expect(selected()).toBe('Three')
    fireEvent.keyDown(list, { key: 'ArrowRight' })
    expect(selected()).toBe('Three')
    fireEvent.keyDown(list, { key: 'Home' })
    expect(selected()).toBe('One')
  })

  it('a horizontal swipe of 48 px or more changes the face, in the swipe direction', () => {
    renderFaces()
    drag(-80, 4)
    expect(selected()).toBe('Two')
    drag(90, -3)
    expect(selected()).toBe('One')
  })

  it('short, mostly vertical and edge drags never change the face', () => {
    renderFaces()
    drag(-40, 0)
    expect(selected()).toBe('One')
    drag(-80, -100)
    expect(selected()).toBe('One')
    drag(-80, 0, 8)
    expect(selected()).toBe('One')
  })

  it('keeps a face mounted after leaving it, so input survives switching', () => {
    renderFaces('/x?face=two')
    fireEvent.change(screen.getByLabelText('Draft'), { target: { value: 'half written' } })
    fireEvent.click(screen.getByRole('tab', { name: 'One' }))
    fireEvent.click(screen.getByRole('tab', { name: 'Two' }))
    expect((screen.getByLabelText('Draft') as HTMLInputElement).value).toBe('half written')
  })

  it('a drag that starts on a form control never switches faces', () => {
    renderFaces('/x?face=two')
    const input = screen.getByLabelText('Draft')
    fireEvent.pointerDown(input, { clientX: 200, clientY: 300, pointerType: 'touch' })
    fireEvent.pointerMove(surface(), { clientX: 100, clientY: 300, pointerType: 'touch' })
    fireEvent.pointerUp(surface(), { clientX: 100, clientY: 300, pointerType: 'touch' })
    expect(selected()).toBe('Two')
  })
})
