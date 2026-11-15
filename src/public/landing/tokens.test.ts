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

describe('Splitpost design tokens (Connected Growth)', () => {
  it('defines the approved palette exactly, with the accessible text variants', () => {
    expect(token('sp-teal').toLowerCase()).toBe('#163d3a')
    expect(token('sp-green').toLowerCase()).toBe('#38a88a')
    expect(token('sp-cream').toLowerCase()).toBe('#f5f1e8')
    expect(token('sp-gold').toLowerCase()).toBe('#d6a14a')
    expect(token('sp-green-text').toLowerCase()).toBe('#23775f')
    expect(token('sp-gold-text').toLowerCase()).toBe('#8a5f1a')
    for (const n of ['sp-teal-raised', 'sp-green-on-dark', 'sp-ink', 'sp-muted', 'sp-muted-on-dark']) token(n)
    expect(css).toMatch(/--font-sp-display:\s*'Archivo'/)
    expect(css).toMatch(/--font-sp-body:\s*'Inter'/)
  })

  it('tunes the shared tokens to the same palette, so the tour, /join and account screens match', () => {
    expect(token('brand-700')).toBe(token('sp-teal-raised'))
    expect(token('brand-900')).toBe(token('sp-teal'))
    expect(token('spark-400')).toBe(token('sp-green'))
    expect(token('spark-600')).toBe(token('sp-green-text'))
    expect(token('paper')).toBe(token('sp-cream'))
    expect(css).toMatch(/--font-sans: 'Inter'/)
    expect(css).toMatch(/--font-display: 'Archivo'/)
  })

  it('retires orange and midnight everywhere', () => {
    expect(css).not.toMatch(/#ff6a2b|#b83c14|#10142e|#1b2152|sp-orange|sp-midnight/i)
    const sources = [readFileSync(join(ROOT, 'public', 'favicon.svg'), 'utf8'), readFileSync(join(ROOT, 'src', 'components', 'Wordmark.tsx'), 'utf8')]
    for (const src of sources) expect(src).not.toMatch(/#ff6a2b|#10142e/i)
    expect(html).toMatch(/<meta name="theme-color" content="#f5f1e8" \/>/)
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
      ['button and fill text: ink on green', 'sp-ink', 'sp-green', 4.5],
      ['body text: ink on cream', 'sp-ink', 'sp-cream', 4.5],
      ['text on teal: cream on teal', 'sp-cream', 'sp-teal', 4.5],
      ['links and eyebrows: green-text on cream', 'sp-green-text', 'sp-cream', 4.5],
      ['small green text on teal', 'sp-green-on-dark', 'sp-teal', 4.5],
      ['gold text on cream', 'sp-gold-text', 'sp-cream', 4.5],
      ['gold on teal', 'sp-gold', 'sp-teal', 4.5],
      ['ink on gold (avatar initials)', 'sp-ink', 'sp-gold', 4.5],
      ['muted text on cream', 'sp-muted', 'sp-cream', 4.5],
      ['muted text on teal', 'sp-muted-on-dark', 'sp-teal', 4.5],
      ['large text: green on teal (tagline, split word)', 'sp-green', 'sp-teal', 3],
    ]
    for (const [what, fg, bg, min] of pairs) {
      expect(contrast(token(fg), token(bg)), `${what}: ${contrast(token(fg), token(bg)).toFixed(2)}`).toBeGreaterThanOrEqual(min)
    }
    // Growth Green and Gold fail as text on cream, which is why the darker text variants exist.
    expect(contrast(token('sp-green'), token('sp-cream'))).toBeLessThan(3)
    expect(contrast(token('sp-gold'), token('sp-cream'))).toBeLessThan(3)
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
