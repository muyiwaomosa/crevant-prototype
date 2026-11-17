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

describe('Splitpost design tokens (Modern Disruptor)', () => {
  it('defines the chosen palette exactly, with the accessible variants from contrast testing', () => {
    expect(token('sp-primary').toLowerCase()).toBe('#2447a6')
    expect(token('sp-accent').toLowerCase()).toBe('#f6b888')
    expect(token('sp-secondary').toLowerCase()).toBe('#a8d9cf')
    expect(token('sp-bg').toLowerCase()).toBe('#faf7f1')
    expect(token('sp-ink').toLowerCase()).toBe('#1b2430')
    expect(token('sp-accent-text').toLowerCase()).toBe('#94481a')
    for (const n of ['sp-primary-raised', 'sp-secondary-tint', 'sp-secondary-on-dark', 'sp-link', 'sp-muted', 'sp-muted-on-dark']) token(n)
    expect(css).toMatch(/--font-sp-display:\s*'Archivo Variable', 'Archivo'/)
    expect(css).toMatch(/--font-sp-body:\s*'Inter Variable', 'Inter'/)
  })

  it('tunes the shared tokens to the same palette, so the tour, /join and account screens match', () => {
    expect(token('brand-600')).toBe(token('sp-primary'))
    expect(token('brand-500')).toBe(token('sp-primary-raised'))
    expect(token('spark-400')).toBe(token('sp-accent'))
    expect(token('spark-600')).toBe(token('sp-accent-text'))
    expect(token('paper')).toBe(token('sp-bg'))
    expect(css).toMatch(/--font-sans: 'Inter Variable', 'Inter'/)
    expect(css).toMatch(/--font-display: 'Archivo Variable', 'Archivo'/)
  })

  it('retires the earlier palettes everywhere: no orange, midnight, teal, green or gold', () => {
    expect(css).not.toMatch(/#ff6a2b|#b83c14|#10142e|#1b2152|#163d3a|#38a88a|#d6a14a|#f5f1e8|sp-(orange|midnight|teal|green|gold|cream)\b/i)
    const sources = [readFileSync(join(ROOT, 'public', 'favicon.svg'), 'utf8'), readFileSync(join(ROOT, 'src', 'components', 'Wordmark.tsx'), 'utf8')]
    for (const src of sources) expect(src).not.toMatch(/#ff6a2b|#10142e|#163d3a|#38a88a/i)
    expect(html).toMatch(/<meta name="theme-color" content="#faf7f1" \/>/)
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
      ['buttons and fills: ink on seafoam', 'sp-ink', 'sp-secondary', 4.5],
      ['body text: ink on ivory', 'sp-ink', 'sp-bg', 4.5],
      ['text on cobalt: ivory on cobalt', 'sp-bg', 'sp-primary', 4.5],
      ['links and eyebrows on ivory', 'sp-link', 'sp-bg', 4.5],
      ['small seafoam text on cobalt', 'sp-secondary-on-dark', 'sp-primary', 4.5],
      ['apricot text on ivory', 'sp-accent-text', 'sp-bg', 4.5],
      ['apricot on cobalt (headline highlight, small labels)', 'sp-accent', 'sp-primary', 4.5],
      ['ink on apricot (avatar initials)', 'sp-ink', 'sp-accent', 4.5],
      ['muted text on ivory', 'sp-muted', 'sp-bg', 4.5],
      ['muted text on cobalt', 'sp-muted-on-dark', 'sp-primary', 4.5],
      ['muted text on raised cobalt', 'sp-muted-on-dark', 'sp-primary-raised', 4.5],
      ['ink on the seafoam tint', 'sp-ink', 'sp-secondary-tint', 4.5],
      ['links on the seafoam tint', 'sp-link', 'sp-secondary-tint', 4.5],
    ]
    for (const [what, fg, bg, min] of pairs) {
      expect(contrast(token(fg), token(bg)), `${what}: ${contrast(token(fg), token(bg)).toFixed(2)}`).toBeGreaterThanOrEqual(min)
    }
    // The unrefined apricot would fail for small text on cobalt; that's why it was lifted.
    expect(contrast('#f2a66b', token('sp-primary'))).toBeLessThan(4.5)
    // Apricot and seafoam can't carry text on ivory, which is why the darker text variants exist.
    expect(contrast(token('sp-accent'), token('sp-bg'))).toBeLessThan(3)
  })

  it('serves its typefaces itself: no Google Fonts link, and the font tokens name the self-hosted families', () => {
    expect(html).not.toMatch(/fonts\.googleapis\.com|fonts\.gstatic\.com/)
    for (const t of ['font-sans', 'font-sp-body']) expect(css).toMatch(new RegExp(`--${t}: 'Inter Variable'`))
    for (const t of ['font-display', 'font-sp-display']) expect(css).toMatch(new RegExp(`--${t}: 'Archivo Variable'`))
  })
})
