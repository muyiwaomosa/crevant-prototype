// @vitest-environment jsdom
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { PublicRoutes } from '../public/PublicApp'
import { Wordmark } from '../components/Wordmark'
import { SPLITPOST_LOGO_SRC } from './SplitpostLogo'

const ROOT = join(__dirname, '..', '..')
const read = (...p: string[]) => readFileSync(join(ROOT, ...p))
const MASTER = read('src', 'logo', 'splitpost-logo.svg').toString('utf8')

/** Width and height from a PNG's IHDR chunk. */
function pngSize(buf: Buffer) {
  expect(buf.subarray(1, 4).toString('ascii')).toBe('PNG')
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) }
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? sourceFiles(p) : /\.(tsx?|css)$/.test(f) ? [p] : []
  })
}

afterEach(cleanup)

describe('the official Splitpost logo', () => {
  it('is one master file in the approved colours only', () => {
    const colours = new Set(MASTER.match(/#[0-9a-f]{6}/gi)!.map((c) => c.toLowerCase()))
    expect([...colours].sort()).toEqual(['#2447a6', '#a8d9cf', '#f6b888', '#faf7f1'])
  })

  it('is the favicon, byte for byte', () => {
    expect(read('public', 'favicon.svg').toString('utf8')).toBe(MASTER)
  })

  it('leaves no competing marks in the code (the old square split mark is gone)', () => {
    for (const f of sourceFiles(join(ROOT, 'src'))) {
      if (f.endsWith('logo.test.tsx')) continue
      const src = readFileSync(f, 'utf8')
      expect(src, f).not.toMatch(/\b(SplitMark|LogoMark)\b/)
      expect(src, f).not.toMatch(/M64 0V64H0Z/)
    }
  })

  it('renders the same file in the site header, footer and every section seam', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/']}>
        <PublicRoutes />
      </MemoryRouter>,
    )
    const logos = [...container.querySelectorAll('img[data-testid="splitpost-logo"]')]
    expect(container.querySelector('header img[data-testid="splitpost-logo"]')).toBeTruthy()
    expect(container.querySelector('footer img[data-testid="splitpost-logo"]')).toBeTruthy()
    expect(container.querySelectorAll('[data-testid="seam"] img[data-testid="splitpost-logo"]')).toHaveLength(8)
    expect(new Set(logos.map((l) => l.getAttribute('src')))).toEqual(new Set([SPLITPOST_LOGO_SRC]))
    // Decorative beside the wordmark, so screen readers hear "Splitpost" once.
    for (const l of logos) expect(l.getAttribute('alt')).toBe('')
  })

  it('renders the same file in the demo and account screens', () => {
    const { container } = render(<Wordmark />)
    expect(container.querySelector('img[data-testid="splitpost-logo"]')!.getAttribute('src')).toBe(SPLITPOST_LOGO_SRC)
  })
})

describe('logo derivatives (built by scripts/brand/build-icons.mjs)', () => {
  const html = read('index.html').toString('utf8')

  it('links the favicon, app icons, manifest and sharing image from index.html, and each file exists', () => {
    for (const href of ['/favicon.svg', '/favicon.ico', '/media/brand/apple-touch-icon.png', '/media/brand/site.webmanifest']) {
      expect(html).toContain(`href="${href}"`)
      expect(existsSync(join(ROOT, 'public', href)), href).toBe(true)
    }
    expect(html).toContain('content="https://crevant-prototype.vercel.app/media/brand/og-image.png"')
  })

  it('has the right sizes', () => {
    expect(pngSize(read('public', 'media', 'brand', 'apple-touch-icon.png'))).toEqual({ w: 180, h: 180 })
    expect(pngSize(read('public', 'media', 'brand', 'icon-192.png'))).toEqual({ w: 192, h: 192 })
    expect(pngSize(read('public', 'media', 'brand', 'icon-512.png'))).toEqual({ w: 512, h: 512 })
    expect(pngSize(read('public', 'media', 'brand', 'icon-maskable-512.png'))).toEqual({ w: 512, h: 512 })
    expect(pngSize(read('public', 'media', 'brand', 'og-image.png'))).toEqual({ w: 1200, h: 630 })
    const ico = read('public', 'favicon.ico')
    expect(ico.readUInt16LE(2)).toBe(1)
    expect([0, 1, 2].map((i) => ico.readUInt8(6 + 16 * i))).toEqual([16, 32, 48])
  })

  it('lists every icon in the web manifest, all under /media/ so the Vercel rewrite serves them as files', () => {
    const manifest = JSON.parse(read('public', 'media', 'brand', 'site.webmanifest').toString('utf8'))
    expect(manifest.name).toBe('Splitpost')
    for (const icon of manifest.icons) {
      expect(icon.src.startsWith('/media/brand/')).toBe(true)
      expect(existsSync(join(ROOT, 'public', icon.src))).toBe(true)
    }
    expect(manifest.icons.some((i: { purpose?: string }) => i.purpose === 'maskable')).toBe(true)
  })
})
