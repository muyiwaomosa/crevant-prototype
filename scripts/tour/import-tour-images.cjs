// Imports the full resolution Canva originals for the sample tour's
// fictional people and post images, and writes small, metadata-free JPEGs
// into public/media/tour/.
//
// Usage (from the repository root):
//   node scripts/tour/import-tour-images.cjs <folder-with-downloads>
//
// Each download may be named after its Canva media id (MAHacg72yAs.jpg) or
// its tour id (amara.jpg, amara-budget.png). Previews are refused: every
// source must be at least 1000 pixels on its shorter side, so a blurry
// thumbnail can never be enlarged into the tour by accident.
// Needs ImageMagick (convert and identify).

const { execFileSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..', '..')
const MANIFEST = require('./tour-images.json')
const MIN_SOURCE = 1000

const src = process.argv[2]
if (!src || !fs.statSync(src, { throwIfNoEntry: false })?.isDirectory()) {
  console.error('Usage: node scripts/tour/import-tour-images.cjs <folder-with-downloads>')
  process.exit(1)
}
const files = fs.readdirSync(src).filter((f) => /\.(jpe?g|png|webp)$/i.test(f))

function findSource(item) {
  const keys = [item.canvaMediaId, item.id].map((k) => k.toLowerCase())
  const f = files.find((name) => keys.includes(path.parse(name).name.toLowerCase()))
  return f ? path.join(src, f) : null
}

function size(file) {
  const [w, h] = execFileSync('identify', ['-format', '%w %h', `${file}[0]`]).toString().trim().split(' ').map(Number)
  return { w, h }
}

const jobs = [
  ...MANIFEST.people.map((p) => ({ item: p, out: path.join(ROOT, 'public/media/tour/people', `${p.id}.jpg`), geometry: '320x320', quality: '84' })),
  ...MANIFEST.posts.map((p) => ({ item: p, out: path.join(ROOT, 'public/media/tour/posts', `${p.id}.jpg`), geometry: '1200x900', quality: '80' })),
]

const missing = []
const tooSmall = []
for (const job of jobs) {
  const file = findSource(job.item)
  if (!file) {
    missing.push(job.item)
    continue
  }
  const { w, h } = size(file)
  if (Math.min(w, h) < MIN_SOURCE) {
    tooSmall.push({ ...job.item, w, h })
    continue
  }
  fs.mkdirSync(path.dirname(job.out), { recursive: true })
  // Fill the target box, centre crop, drop all metadata, progressive JPEG.
  execFileSync('convert', [
    `${file}[0]`, '-auto-orient', '-colorspace', 'sRGB',
    '-resize', `${job.geometry}^`, '-gravity', 'center', '-extent', job.geometry,
    '-strip', '-interlace', 'Plane', '-sampling-factor', '4:2:0', '-quality', job.quality, job.out,
  ])
  console.log(`saved ${path.relative(ROOT, job.out)} (${(fs.statSync(job.out).size / 1024).toFixed(0)} KB, from ${w}x${h})`)
}

const link = (id) => `https://www.canva.com/M/${id}`
for (const m of missing) console.error(`MISSING ${m.id}: download ${link(m.canvaMediaId)}`)
for (const t of tooSmall) console.error(`TOO SMALL ${t.id}: ${t.w}x${t.h}, need the full size file from ${link(t.canvaMediaId)}`)
if (missing.length || tooSmall.length) process.exit(1)
console.log(`All ${jobs.length} tour images imported.`)
