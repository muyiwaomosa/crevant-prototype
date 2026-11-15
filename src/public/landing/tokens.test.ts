import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = join(__dirname, '..', '..', '..')
const css = readFileSync(join(ROOT, 'src', 'index.css'), 'utf8')
const html = readFileSync(join(ROOT, 'index.html'), 'utf8')

function token(name: string): string {
  const m = new RegExp(`--color-${name}:\\s*(#[0-9a-f]{6})`, 'i').exec(css)
  if (!m) throw new Error(`missing token --color-${name}`)
  return m[1]
}

/** WCAG 2.2 relative luminance and contrast ratio. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

describe('Splitpost design tokens', () => {
  it('defines the sp- palette and type tokens', () => {
    for (const n of ['sp-midnight', 'sp-midnight-raised', 'sp-orange', 'sp-orange-text', 'sp-neutral', 'sp-ink', 'sp-muted', 'sp-muted-on-dark']) token(n)
    expect(css).toMatch(/--font-sp-display:\s*'Archivo'/)
    expect(css).toMatch(/--font-sp-body:\s*'Inter'/)
  })

  it('tunes the shared tokens to the Splitpost palette, so the tour and account screens match the site', () => {
    // brand (buttons, links, focus) is midnight; spark (highlights, notes) is orange.
    expect(token('brand-700')).toBe(token('sp-midnight-raised'))
    expect(token('brand-900')).toBe(token('sp-midnight'))
    expect(token('spark-400')).toBe(token('sp-orange'))
    expect(token('spark-600')).toBe(token('sp-orange-text'))
    expect(token('paper')).toBe(token('sp-neutral'))
    expect(css).toMatch(/--font-sans: 'Inter'/)
    expect(css).toMatch(/--font-display: 'Archivo'/)
    // No teal or amber left from the old Crevant palette.
    expect(css).not.toMatch(/#0b6a5c|#0e7c6b|#f5a524/i)
  })

  it('keeps the shared-token pairs the tour relies on readable', () => {
    const pairs: Array<[string, string, string]> = [
      ['primary button: white on brand-600', '#ffffff', token('brand-600')],
      ['links: brand-700 on white', token('brand-700'), '#ffffff'],
      ['badges: brand-700 on brand-50', token('brand-700'), token('brand-50')],
      ['notes: spark-700 on spark-50', token('spark-700'), token('spark-50')],
      ['spark button: ink-900 on spark-400', token('ink-900'), token('spark-400')],
      ['spark text on white', token('spark-600'), '#ffffff'],
      ['body text on paper', token('ink-600'), token('paper')],
    ]
    for (const [what, fg, bg] of pairs) expect(contrast(fg, bg), `${what}: ${contrast(fg, bg).toFixed(2)}`).toBeGreaterThanOrEqual(4.5)
  })

  it('meets WCAG 2.2 AA for the pairs the design uses', () => {
    const pairs: Array<[string, string, string, number]> = [
      ['button text: midnight on orange', 'sp-midnight', 'sp-orange', 4.5],
      ['body text: ink on warm neutral', 'sp-ink', 'sp-neutral', 4.5],
      ['links: orange text on warm neutral', 'sp-orange-text', 'sp-neutral', 4.5],
      ['muted text on warm neutral', 'sp-muted', 'sp-neutral', 4.5],
      ['muted text on midnight', 'sp-muted-on-dark', 'sp-midnight', 4.5],
      ['headline accent: orange on midnight (large text)', 'sp-orange', 'sp-midnight', 3],
    ]
    for (const [what, fg, bg, min] of pairs) {
      expect(contrast(token(fg), token(bg)), `${what}: ${contrast(token(fg), token(bg)).toFixed(2)}`).toBeGreaterThanOrEqual(min)
    }
    // White on orange fails for text, which is why buttons use midnight text.
    expect(contrast('#ffffff', token('sp-orange'))).toBeLessThan(4.5)
  })

  it('loads Archivo on its own link, leaving the existing font request exactly as it was', () => {
    const links = [...html.matchAll(/<link href="(https:\/\/fonts\.googleapis\.com\/css2\?[^"]+)" rel="stylesheet" \/>/g)].map((m) => m[1])
    // Combining families into one request changes how Google serves the existing
    // faces, which shifts text rendering slightly on some screens. Kept apart.
    expect(links).toEqual([
      'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500..800&family=Inter:wght@400..700&display=swap',
      'https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,400..900&display=swap',
    ])
  })
})
