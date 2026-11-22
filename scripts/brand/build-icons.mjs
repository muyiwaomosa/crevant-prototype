#!/usr/bin/env node
// Builds every logo derivative from the one official file, src/logo/splitpost-logo.svg:
//   public/favicon.svg                         the logo itself, byte for byte
//   public/favicon.ico                         16, 32 and 48 px (PNG entries)
//   public/media/brand/icon-192.png, -512.png  the logo on a transparent background
//   public/media/brand/apple-touch-icon.png    180 px, the logo on an ivory tile (iOS fills corners black otherwise)
//   public/media/brand/icon-maskable-512.png   the logo inside Android's safe zone, on ivory
//   public/media/brand/og-image.png            1200 x 630 sharing image
// The logo is never redrawn: each output places the same SVG, scaled. Run with
//   node scripts/brand/build-icons.mjs
// (uses the preinstalled Playwright Chromium). Paths under /media/ are served
// as static files by the existing Vercel rewrite.
import { readFileSync, writeFileSync, copyFileSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SRC = join(ROOT, 'src', 'logo', 'splitpost-logo.svg')
const OUT = join(ROOT, 'public', 'media', 'brand')
const IVORY = '#faf7f1'
const COBALT = '#2447a6'
const svg = readFileSync(SRC, 'utf8')
const dataUri = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`

const require = createRequire(import.meta.url)
const { chromium } = require('playwright')

mkdirSync(OUT, { recursive: true })
copyFileSync(SRC, join(ROOT, 'public', 'favicon.svg'))

const browser = await chromium.launch()
async function render(html, width, height, transparent = false) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 })
  await page.setContent(`<!doctype html><html><head><style>html,body{margin:0;width:${width}px;height:${height}px;overflow:hidden;${transparent ? 'background:transparent' : ''}}</style></head><body>${html}</body></html>`, { waitUntil: 'networkidle' })
  await page.evaluate(() => document.fonts.ready)
  const png = await page.screenshot({ omitBackground: transparent, clip: { x: 0, y: 0, width, height } })
  await page.close()
  return png
}
const logoOn = (size, scale, bg) =>
  `<div style="width:${size}px;height:${size}px;display:grid;place-items:center;background:${bg}"><img src="${dataUri}" style="width:${Math.round(size * scale)}px;height:${Math.round(size * scale)}px"></div>`

const written = []
const save = (name, buf) => { writeFileSync(join(OUT, name), buf); written.push(`public/media/brand/${name}`) }

for (const size of [192, 512]) save(`icon-${size}.png`, await render(logoOn(size, 1, 'transparent'), size, size, true))
save('apple-touch-icon.png', await render(logoOn(180, 0.84, IVORY), 180, 180))
save('icon-maskable-512.png', await render(logoOn(512, 0.72, IVORY), 512, 512))

// favicon.ico: PNG entries are valid ICO payloads (Vista and later, every current browser).
const icoSizes = [16, 32, 48]
const pngs = []
for (const s of icoSizes) pngs.push(await render(logoOn(s, 1, 'transparent'), s, s, true))
const header = Buffer.alloc(6 + 16 * pngs.length)
header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(pngs.length, 4)
let offset = header.length
pngs.forEach((png, i) => {
  const e = 6 + 16 * i
  header.writeUInt8(icoSizes[i], e); header.writeUInt8(icoSizes[i], e + 1)
  header.writeUInt16LE(1, e + 4); header.writeUInt16LE(32, e + 6)
  header.writeUInt32LE(png.length, e + 8); header.writeUInt32LE(offset, e + 12)
  offset += png.length
})
writeFileSync(join(ROOT, 'public', 'favicon.ico'), Buffer.concat([header, ...pngs]))
written.push('public/favicon.ico')

// Sharing image: the logo, the wordmark and the brand line (the approved
// headline, Website Redesign Master Implementation Brief), on cobalt, with the
// approved footer disclosure. Uses the self-hosted typefaces, so it renders
// without the network.
const font = (pkg, file) =>
  `data:font/woff2;base64,${readFileSync(join(ROOT, 'node_modules', '@fontsource-variable', pkg, 'files', file)).toString('base64')}`
save('og-image.png', await render(`
  <style>
    @font-face{font-family:Archivo;src:url(${font('archivo', 'archivo-latin-wdth-normal.woff2')}) format('woff2');font-weight:100 900;font-stretch:62% 125%}
    @font-face{font-family:Inter;src:url(${font('inter', 'inter-latin-wght-normal.woff2')}) format('woff2');font-weight:100 900}
  </style>
  <div style="position:relative;width:1200px;height:630px;background:${COBALT};color:${IVORY};font-family:Archivo,Arial,sans-serif;overflow:hidden">
    <div style="position:absolute;inset:0;background:linear-gradient(118deg,transparent 0 64%,rgb(255 255 255/0.05) 64% 100%)"></div>
    <div style="position:absolute;left:84px;top:72px;display:flex;align-items:center;gap:22px">
      <img src="${dataUri}" style="width:96px;height:96px">
      <span style="font-weight:900;font-size:52px;letter-spacing:-0.02em;font-stretch:108%">splitpost</span>
    </div>
    <div style="position:absolute;left:84px;top:236px;font-weight:900;font-size:92px;line-height:0.98;letter-spacing:-0.02em;font-stretch:95%">
      <div>Don't just post.</div><div style="color:#f6b888">Get your split.</div>
    </div>
    <div style="position:absolute;left:84px;bottom:66px;font-family:Inter,Arial,sans-serif;font-weight:600;font-size:26px;color:#d3def3">An invitation-only pilot for adults 18 and older.</div>
  </div>`, 1200, 630))

writeFileSync(join(OUT, 'site.webmanifest'), JSON.stringify({
  name: 'Splitpost',
  short_name: 'Splitpost',
  icons: [
    { src: '/media/brand/icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: '/media/brand/icon-512.png', sizes: '512x512', type: 'image/png' },
    { src: '/media/brand/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
  theme_color: IVORY,
  background_color: IVORY,
  display: 'standalone',
  start_url: '/',
}, null, 2) + '\n')
written.push('public/media/brand/site.webmanifest', 'public/favicon.svg')

await browser.close()
console.log(written.join('\n'))
