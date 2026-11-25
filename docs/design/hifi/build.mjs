// SP-DESIGN-002 high-fidelity previews. Design source only, not application code.
// Builds screens.html (all screens) and transition.html (interactive multi-face demo) from shared
// components, using the existing Splitpost tokens (src/index.css --color-sp-*), Archivo and Inter,
// the official logo and the lucide icon set the app already uses. Sample people and numbers only.
// Usage: node docs/design/hifi/build.mjs
import { createRequire } from 'node:module'
import { writeFileSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const require = createRequire(join(here, '../../../package.json'))
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const L = require('lucide-react')

const icon = (name, size = 22, stroke = 2, cls = '') => {
  if (!L[name]) throw new Error('missing icon ' + name)
  return renderToStaticMarkup(React.createElement(L[name], { size, strokeWidth: stroke, className: cls, 'aria-hidden': true }))
}
// My Split nav icon: a monochrome (currentColor) simplification of the official split-post symbol, drawn on
// lucide's 24 px grid. Circle outline with the post in two filled pieces split by the logo's -14 degree gap.
// Active: the same drawing in cobalt with a heavier stroke, like the other lucide nav icons, so it never reads as
// a second copy of the full-colour logo.
const SP_TOP = 'M6.5 12.5V8.6A1.6 1.6 0 0 1 8.1 7H15.9A1.6 1.6 0 0 1 17.5 8.6V9.75Z'
const SP_BOT = 'M6.5 15L17.5 12.25V15.4A1.6 1.6 0 0 1 15.9 17H8.1A1.6 1.6 0 0 1 6.5 15.4Z'
const splitMark = (size = 25, stroke = 2) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="${stroke}"/><path fill="currentColor" d="${SP_TOP}${SP_BOT}"/></svg>`
const splitIcon = (size, active, kind = 'brand') => kind === 'gem' ? icon('Gem', size, active ? 2.4 : 1.9) : splitMark(size, active ? 2.4 : 1.9)
const logoSvg = readFileSync(join(here, '../../../src/logo/splitpost-logo.svg'), 'utf8').replace(/<!--[\s\S]*?-->/g, '')
const logo = (s = 30) => logoSvg.replace('width="56" height="56"', `width="${s}" height="${s}"`).replace(/sp-logo-(top|bottom)/g, (m) => m + '-' + s + Math.random().toString(36).slice(2, 6))
const M = '../../../public/media'
const P = (n) => `${M}/tour/people/${n}.jpg`

const css = `
@font-face{font-family:Archivo;src:url(../../../node_modules/@fontsource-variable/archivo/files/archivo-latin-wdth-normal.woff2) format('woff2');font-weight:100 900;font-stretch:62% 125%}
@font-face{font-family:Inter;src:url(../../../node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2) format('woff2');font-weight:100 900}
:root{--primary:#2447a6;--raised:#3156b5;--deep:#172f70;--night:#12255a;--seafoam:#a8d9cf;--seafoam-tint:#e7f4f1;--apricot:#f6b888;--apricot-text:#94481a;--apricot-tint:#fef4ec;
--ivory:#faf7f1;--card:#fff;--ink:#1b2430;--muted:#4e5a68;--muted-dark:#d3def3;--line:#e9e4da;--blue-50:#eef2fb;--blue-100:#dce4f6;--heart:#e0483a;
--display:Archivo,'Arial Narrow',system-ui,sans-serif;--body:Inter,system-ui,-apple-system,'Segoe UI',sans-serif}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:var(--body);color:var(--ink);background:#ece7dc;-webkit-font-smoothing:antialiased}
svg{display:block;flex:none}
.d{font-family:var(--display);font-stretch:108%;letter-spacing:-.02em}
.board{padding:40px;display:flex;flex-direction:column;gap:44px}
.row{display:flex;gap:36px;flex-wrap:wrap;align-items:flex-start}
.label{font:600 13px var(--body);color:var(--muted);margin-bottom:12px;letter-spacing:.01em}
.label b{color:var(--ink)}
/* phone */
.phone{width:390px;height:844px;border-radius:46px;background:var(--ivory);overflow:hidden;position:relative;box-shadow:0 0 0 9px #11161c,0 0 0 10px #2c333b,0 30px 60px -20px rgba(18,37,90,.45);display:flex;flex-direction:column}
.status{height:46px;display:flex;justify-content:space-between;align-items:flex-end;padding:0 30px 6px;font:600 15px var(--body);flex:none}
.status .r{display:flex;gap:6px;align-items:center}
.status.dark{color:#fff}
.scroll{flex:1;min-height:0;overflow:hidden;position:relative}
/* app header */
.bar{display:flex;align-items:center;justify-content:space-between;padding:6px 18px 10px}
.brand{display:flex;align-items:center;gap:8px}
.brand .wm{font:850 22px var(--display);font-stretch:110%;letter-spacing:-.03em;color:var(--primary)}
.iconbtn{width:38px;height:38px;border-radius:50%;display:grid;place-items:center;background:#fff;color:var(--ink);box-shadow:0 1px 0 var(--line)}
/* faces switcher */
.faces{margin:0 18px 12px;background:#efe9de;border-radius:999px;padding:4px;display:flex;position:relative}
.faces span{flex:1;text-align:center;font:600 13.5px var(--body);color:var(--muted);padding:8px 0;border-radius:999px;position:relative;z-index:1;white-space:nowrap}
.faces span.on{background:var(--primary);color:#fff;box-shadow:0 4px 12px -4px rgba(36,71,166,.6)}
.faces.dark{background:rgba(255,255,255,.12)}.faces.dark span{color:var(--muted-dark)}.faces.dark span.on{background:#fff;color:var(--primary)}
/* nav */
.nav{height:86px;flex:none;background:rgba(250,247,241,.94);backdrop-filter:blur(12px);border-top:1px solid var(--line);display:flex;justify-content:space-around;align-items:flex-start;padding:10px 8px 0}
.nav a{display:flex;flex-direction:column;align-items:center;gap:4px;font:600 10.5px var(--body);color:var(--muted);width:64px}
.nav a.on{color:var(--primary)}
.nav a.create{margin-top:-4px}
.nav a.create .plus{width:50px;height:50px;border-radius:18px;background:var(--primary);color:#fff;display:grid;place-items:center;box-shadow:0 8px 18px -6px rgba(36,71,166,.7)}
.nav .me{width:26px;height:26px;border-radius:50%;object-fit:cover;box-shadow:0 0 0 2px var(--ivory),0 0 0 3.5px currentColor}
/* clique strip */
.strip{display:flex;gap:14px;padding:2px 18px 14px;overflow:hidden}
.strip .p{display:flex;flex-direction:column;align-items:center;gap:6px;width:62px;font:600 11.5px var(--body);color:var(--ink)}
.ring{width:60px;height:60px;border-radius:50%;padding:3px;background:conic-gradient(var(--apricot),var(--seafoam),var(--apricot));position:relative}
.ring img{width:100%;height:100%;border-radius:50%;object-fit:cover;border:2.5px solid var(--ivory)}
.ring .n{position:absolute;right:-3px;top:-2px;background:var(--primary);color:#fff;font:700 10.5px var(--body);border-radius:999px;padding:2px 6px;border:2px solid var(--ivory)}
.ring.seen{background:#ddd6c9}
.sec{display:flex;justify-content:space-between;align-items:baseline;padding:4px 18px 10px}
.sec h3{font:800 17px var(--display);font-stretch:105%}
.sec span{font:500 12.5px var(--body);color:var(--muted)}
/* post card */
.post{margin:0 12px 16px;background:var(--card);border-radius:26px;overflow:hidden;box-shadow:0 1px 0 var(--line),0 12px 30px -18px rgba(27,36,48,.35)}
.post .media{position:relative;height:360px;background:#ccc}
.post .media>img{width:100%;height:100%;object-fit:cover}
.post .media.short{height:250px}
.shade{position:absolute;inset:0;background:linear-gradient(180deg,rgba(13,22,48,.45),transparent 28%,transparent 62%,rgba(13,22,48,.55))}
.who{position:absolute;left:14px;top:14px;right:14px;display:flex;align-items:center;gap:9px;color:#fff}
.who img{width:36px;height:36px;border-radius:50%;object-fit:cover;border:2px solid #fff}
.who b{font:700 14.5px var(--body);display:block}
.who small{font:500 12px var(--body);opacity:.85}
.tag{display:inline-flex;align-items:center;gap:4px;font:700 11px var(--body);border-radius:999px;padding:3px 9px}
.tag.clique{background:var(--apricot);color:#5a2a0b}
.tag.sea{background:var(--seafoam);color:#173f37}
.tag.sim{background:var(--seafoam-tint);color:#1f5e52;border:1px solid #c5e6de}
.tag.nb{background:#fff;color:var(--muted);border:1px solid var(--line)}
.tag.act{background:var(--blue-50);color:var(--primary)}
.tag.spon{background:#fff;color:var(--apricot-text);border:1px solid var(--apricot)}
.play{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:66px;height:66px;border-radius:50%;background:rgba(255,255,255,.92);display:grid;place-items:center;color:var(--primary);box-shadow:0 10px 30px rgba(0,0,0,.25)}
.dur{position:absolute;right:14px;bottom:14px;color:#fff;font:600 12.5px var(--body);background:rgba(0,0,0,.45);border-radius:8px;padding:3px 8px}
.post .txt{padding:14px 16px 4px;font:400 15px/1.5 var(--body)}
.post .txt b{font-weight:650}
.acts{display:flex;align-items:center;gap:18px;padding:10px 16px 14px;color:var(--ink);font:600 13px var(--body)}
.acts span{display:flex;align-items:center;gap:6px}
.acts .sp{flex:1}
.acts .liked{color:var(--heart)}
.textpost{padding:16px 16px 4px;display:flex;gap:10px;align-items:center}
.textpost img{width:40px;height:40px;border-radius:50%;object-fit:cover}
.textpost b{font:700 14.5px var(--body);display:block}.textpost small{font:500 12px var(--body);color:var(--muted)}
.big{padding:10px 16px 2px;font:700 21px/1.3 var(--display);font-stretch:100%;letter-spacing:-.01em}
.repost{display:flex;align-items:center;gap:6px;font:600 12px var(--body);color:var(--muted);padding:12px 16px 0}
/* discover */
.search{margin:2px 18px 12px;height:46px;border-radius:16px;background:#fff;display:flex;align-items:center;gap:10px;padding:0 14px;color:#8a93a0;font:500 15px var(--body);box-shadow:0 1px 0 var(--line)}
.chips{display:flex;gap:8px;padding:0 18px 14px;overflow:hidden}
.chip{display:inline-flex;align-items:center;gap:6px;font:600 13px var(--body);padding:8px 13px;border-radius:999px;background:#fff;color:var(--ink);white-space:nowrap;box-shadow:0 1px 0 var(--line)}
.chip.on{background:var(--ink);color:#fff}
.feature{margin:0 12px 14px;border-radius:28px;overflow:hidden;position:relative;height:350px;color:#fff}
.feature img.bg{width:100%;height:100%;object-fit:cover;position:absolute;inset:0}
.feature .g{position:absolute;inset:0;background:linear-gradient(180deg,transparent 30%,rgba(18,37,90,.92))}
.feature .c{position:absolute;left:18px;right:18px;bottom:18px}
.feature .c .av{width:52px;height:52px;border-radius:50%;border:3px solid #fff;object-fit:cover;margin-bottom:10px}
.feature h4{font:850 24px var(--display);font-stretch:108%;letter-spacing:-.02em}
.feature p{font:500 14px/1.45 var(--body);opacity:.92;margin:6px 0 12px}
.why{display:inline-flex;align-items:center;gap:6px;font:600 12px var(--body);background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.25);padding:6px 10px;border-radius:999px;backdrop-filter:blur(6px)}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;font:700 14px var(--body);border-radius:999px;padding:10px 18px;background:var(--seafoam);color:#12312b;white-space:nowrap}
.btn.blue{background:var(--primary);color:#fff}
.btn.ghost{background:transparent;color:#fff;box-shadow:inset 0 0 0 1.5px rgba(255,255,255,.55)}
.btn.line{background:#fff;color:var(--primary);box-shadow:inset 0 0 0 1.5px var(--blue-100)}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:0 12px}
.tile{border-radius:20px;overflow:hidden;background:#fff;position:relative;box-shadow:0 1px 0 var(--line)}
.tile img{width:100%;height:150px;object-fit:cover}
.tile .t{padding:9px 11px 11px;font:600 13px/1.35 var(--body)}
.tile .t small{display:flex;align-items:center;gap:4px;color:var(--primary);font:600 11.5px var(--body);margin-top:6px}
/* create */
.ctop{display:flex;justify-content:space-between;align-items:center;padding:8px 18px 14px}
.ctop h2{font:850 22px var(--display);font-stretch:108%}
.compose{margin:0 12px;background:#fff;border-radius:26px;padding:16px;box-shadow:0 1px 0 var(--line)}
.compose .me{display:flex;align-items:center;gap:10px;margin-bottom:12px}
.compose .me img{width:42px;height:42px;border-radius:50%;object-fit:cover}
.compose .me b{font:700 14.5px var(--body);display:block}
.compose .me small{display:flex;align-items:center;gap:4px;font:500 12px var(--body);color:var(--muted)}
.compose .ta{font:400 18px/1.45 var(--body);color:var(--ink);min-height:84px}
.vprev{position:relative;border-radius:18px;overflow:hidden;height:196px;margin-top:10px}
.vprev img{width:100%;height:100%;object-fit:cover}
.vprev .x{position:absolute;right:10px;top:10px;width:30px;height:30px;border-radius:50%;background:rgba(0,0,0,.5);color:#fff;display:grid;place-items:center}
.upl{margin-top:12px;background:var(--ivory);border-radius:14px;padding:11px 12px}
.upl .r{display:flex;justify-content:space-between;font:600 12.5px var(--body)}
.upl .r span{color:var(--muted);font-weight:500}
.pbar{height:6px;border-radius:3px;background:#e5ded1;margin-top:8px;overflow:hidden}.pbar i{display:block;height:100%;width:38%;background:var(--primary);border-radius:3px}
.chk{display:flex;align-items:center;gap:6px;font:600 12px var(--body);color:#1f5e52;margin-top:8px}
.topic{margin:14px 12px 0;padding:14px 16px;background:#fff;border-radius:22px;box-shadow:0 1px 0 var(--line)}
.topic .h{font:700 14px var(--body);display:flex;justify-content:space-between}
.topic .h span{font:500 12px var(--body);color:var(--muted)}
.tools{margin:12px 12px 0;background:#fff;border-radius:20px;display:flex;justify-content:space-around;padding:12px;box-shadow:0 10px 30px -14px rgba(27,36,48,.35);color:var(--primary)}
.tools span{display:flex;flex-direction:column;align-items:center;gap:4px;font:600 11px var(--body);color:var(--ink)}
.note{margin:12px 14px 0;font:500 12px/1.5 var(--body);color:var(--muted);display:flex;gap:8px}
/* my split */
.hero-blue{background:var(--primary);color:#fff;padding:0 0 22px;position:relative;overflow:hidden}
.hero-blue:after{content:'';position:absolute;right:-90px;top:-40px;width:260px;height:400px;background:var(--raised);transform:rotate(24deg);opacity:.55}
.hero-blue>*{position:relative;z-index:1}
.hb-top{display:flex;justify-content:space-between;align-items:center;padding:8px 18px 14px}
.hb-top h2{font:850 26px var(--display);font-stretch:110%;letter-spacing:-.02em}
.pts{padding:4px 22px 0}
.pts .k{font:600 13px var(--body);color:var(--muted-dark)}
.pts .v{font:900 58px/1 var(--display);font-stretch:112%;letter-spacing:-.03em;margin:4px 0 14px}
.pts .v small{font:700 16px var(--body);letter-spacing:0;color:var(--muted-dark);margin-left:4px}
.splitbar{display:flex;height:14px;border-radius:7px;overflow:hidden;gap:3px}
.splitbar i:first-child{flex:1040;background:var(--seafoam)}.splitbar i:last-child{flex:200;background:var(--apricot)}
.legend{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px}
.legend div{background:rgba(255,255,255,.09);border-radius:16px;padding:10px 12px}
.legend b{display:flex;align-items:center;gap:6px;font:800 20px var(--display);font-stretch:105%}
.legend b i{width:10px;height:10px;border-radius:3px;display:inline-block}
.legend span{font:500 11.5px/1.35 var(--body);color:var(--muted-dark);display:block;margin-top:2px}
.simcard{margin:-2px 12px 12px;background:#fff;border-radius:24px;padding:16px;border:1.5px dashed #b9dcd3;position:relative}
.simcard .k{display:flex;justify-content:space-between;align-items:center;font:600 13px var(--body);color:var(--muted)}
.simcard .v{font:900 36px var(--display);font-stretch:108%;margin:4px 0}
.simcard p{font:500 12.5px/1.45 var(--body);color:var(--muted)}
.lst{margin:0 12px;background:#fff;border-radius:24px;padding:6px 16px;box-shadow:0 1px 0 var(--line)}
.li{display:flex;align-items:center;gap:12px;padding:11px 0;border-bottom:1px solid #f1ece3}
.li:last-child{border:0}
.li .ic{width:38px;height:38px;border-radius:12px;display:grid;place-items:center;flex:none}
.li .t{flex:1;font:600 13.5px/1.35 var(--body)}
.li .t small{display:block;font:500 12px var(--body);color:var(--muted)}
.li .n{font:800 15px var(--display);font-stretch:105%}
.stack{display:flex}.stack img{width:30px;height:30px;border-radius:50%;object-fit:cover;border:2px solid #fff;margin-left:-8px}.stack img:first-child{margin-left:0}
/* profile */
.cover{height:190px;position:relative;flex:none}
.cover>img.bg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.cover .status{position:relative;z-index:1}
.cover .top{position:absolute;left:14px;right:14px;top:52px;display:flex;justify-content:space-between;z-index:1}
.cover .top span{width:36px;height:36px;border-radius:50%;background:rgba(250,247,241,.9);display:grid;place-items:center}
.cover{z-index:2}
.cover .pav{position:absolute;left:18px;bottom:-44px;width:88px;height:88px;border-radius:50%;object-fit:cover;border:4px solid var(--ivory);z-index:3}
.pf{padding:48px 18px 0;position:relative}
.pf h2{font:850 25px var(--display);font-stretch:108%;letter-spacing:-.02em;margin-top:6px}
.pf .h{font:500 13px var(--body);color:var(--muted)}
.pf p{font:400 14.5px/1.45 var(--body);margin:8px 0}
.stats{display:flex;gap:22px;margin:10px 0 12px}
.stats b{font:850 19px var(--display);font-stretch:105%;display:block}
.stats span{font:500 12px var(--body);color:var(--muted)}
.pgrid{display:grid;grid-template-columns:repeat(3,1fr);gap:3px;margin-top:4px}
.pgrid div{height:126px;position:relative;overflow:hidden}
.pgrid img{width:100%;height:100%;object-fit:cover}
.pgrid .tx{background:var(--blue-50);color:var(--primary);font:700 12.5px/1.35 var(--display);padding:10px;display:flex;align-items:flex-end}
.pgrid .pl{position:absolute;left:7px;bottom:6px;color:#fff;display:flex;align-items:center;gap:3px;font:600 11px var(--body)}
/* analytics */
.story{padding:2px 20px 14px}
.story .eyebrow{font:700 11.5px var(--body);letter-spacing:.08em;text-transform:uppercase;color:var(--apricot-text)}
.story h3{font:850 25px/1.12 var(--display);font-stretch:106%;letter-spacing:-.02em;margin-top:6px}
.story h3 em{font-style:normal;color:var(--primary)}
.rings{margin:0 12px 12px;background:#fff;border-radius:26px;padding:18px;display:flex;gap:16px;align-items:center;box-shadow:0 1px 0 var(--line)}
.rings .lg div{display:flex;gap:8px;align-items:flex-start;margin:6px 0;font:500 12.5px/1.35 var(--body);color:var(--muted)}
.rings .lg b{display:block;font:800 18px var(--display);font-stretch:105%;color:var(--ink)}
.rings .lg i{width:10px;height:10px;border-radius:3px;margin-top:6px;flex:none}
.src{margin:0 12px 12px;background:#fff;border-radius:24px;padding:16px;box-shadow:0 1px 0 var(--line)}
.src .h{font:700 14px var(--body);margin-bottom:10px}
.srow{display:flex;align-items:center;gap:10px;margin:9px 0;font:600 12.5px var(--body)}
.srow .sbar{flex:1;height:10px;background:#f1ece3;border-radius:5px;overflow:hidden}.srow .sbar i{display:block;height:100%;border-radius:5px}
.insight{margin:0 12px 12px;background:var(--apricot-tint);border-radius:22px;padding:14px 16px;display:flex;gap:12px;font:500 13.5px/1.45 var(--body);border:1px solid #fbd9bd}
.insight b{display:block;font:800 14.5px var(--body);margin-bottom:2px}
.split3{display:flex;height:46px;border-radius:14px;overflow:hidden;margin:12px 0 8px}
.split3 div{display:flex;align-items:center;justify-content:center;font:700 12px var(--body)}
/* desktop */
.desk{width:1440px;height:900px;background:var(--ivory);border-radius:18px;overflow:hidden;display:flex;box-shadow:0 30px 70px -30px rgba(18,37,90,.5),0 0 0 1px #d9d2c4}
.rail{width:248px;padding:26px 18px;border-right:1px solid var(--line);display:flex;flex-direction:column;gap:4px;flex:none}
.rail .brand{margin:0 8px 26px}
.rail a{display:flex;align-items:center;gap:14px;padding:12px 14px;border-radius:16px;font:600 15.5px var(--body);color:var(--muted)}
.rail a.on{background:#fff;color:var(--primary);box-shadow:0 1px 0 var(--line)}
.rail a.cr{background:var(--primary);color:#fff;margin:10px 0;justify-content:center}
.rail .sp{flex:1}
.dcol{width:620px;margin:0 auto;padding:22px 0;overflow:hidden}
.dright{width:300px;padding:26px 28px 0 0;flex:none}
.panel{background:#fff;border-radius:24px;padding:18px;box-shadow:0 1px 0 var(--line);margin-bottom:16px}
.panel h4{font:800 16px var(--display);font-stretch:105%;margin-bottom:12px}
/* control */
.cc{width:1440px;height:900px;border-radius:18px;overflow:hidden;display:flex;background:#f6f3ec;box-shadow:0 30px 70px -30px rgba(18,37,90,.5),0 0 0 1px #d9d2c4}
.cc .rail{background:var(--night);border:0;color:#fff}
.cc .rail a{color:var(--muted-dark)}.cc .rail a.on{background:rgba(255,255,255,.1);color:#fff;box-shadow:none}
.cc .rail a em{margin-left:auto;font:700 11.5px var(--body);font-style:normal;background:var(--apricot);color:#4a2109;border-radius:999px;padding:2px 8px}
.ccmain{flex:1;padding:30px 36px;overflow:hidden}
.cch{display:flex;justify-content:space-between;align-items:center}
.cch h1{font:850 30px var(--display);font-stretch:108%;letter-spacing:-.02em}
.kpis{display:grid;grid-template-columns:1.6fr 1fr 1fr 1fr;gap:16px;margin:22px 0}
.kpi{background:#fff;border-radius:24px;padding:18px 20px;box-shadow:0 1px 0 var(--line)}
.kpi .k{font:600 13px var(--body);color:var(--muted);display:flex;justify-content:space-between;align-items:center}
.kpi .v{font:900 38px var(--display);font-stretch:108%;letter-spacing:-.02em;margin-top:6px}
.kpi .s{font:500 12.5px var(--body);color:var(--muted)}
.kpi.nsm{background:var(--primary);color:#fff}.kpi.nsm .k,.kpi.nsm .s{color:var(--muted-dark)}
.queues{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
.q{background:#fff;border-radius:22px;padding:18px 20px;box-shadow:0 1px 0 var(--line);display:flex;gap:14px;align-items:center}
.q .ic{width:46px;height:46px;border-radius:14px;display:grid;place-items:center;flex:none}
.q b{font:800 24px var(--display);font-stretch:105%;display:block}
.q span{font:500 13px var(--body);color:var(--muted)}
.q .go{margin-left:auto;color:var(--primary)}
/* profile actions */
.pacts{display:flex;gap:8px}.pacts .btn{flex:1;padding:10px 8px;font-size:13.5px;gap:5px}
/* intelligence framework: What happened, What it means, What to do next */
.step{display:flex;align-items:center;gap:7px;padding:0 20px 7px;font:700 11px var(--body);letter-spacing:.08em;text-transform:uppercase;color:var(--apricot-text)}
.step i{font:800 10.5px var(--body);font-style:normal;width:18px;height:18px;border-radius:50%;display:grid;place-items:center;background:var(--apricot-tint);border:1px solid #fbd9bd;letter-spacing:0}
.means{margin:0 12px 12px;background:#fff;border-radius:20px;padding:12px 16px;font:500 13.5px/1.45 var(--body);box-shadow:0 1px 0 var(--line)}
.means b{font-weight:700}
.iq{margin:0 12px 12px;background:#fff;border-radius:22px;padding:6px 16px;box-shadow:0 1px 0 var(--line)}
.iq .s{display:flex;gap:11px;padding:8px 0;border-bottom:1px solid #f1ece3}.iq .s:last-child{border:0}
.iq .s>span:first-child{width:30px;height:30px;border-radius:10px;display:grid;place-items:center;flex:none}
.iq .s small{display:block;font:700 10.5px var(--body);letter-spacing:.08em;text-transform:uppercase;color:var(--apricot-text);margin-bottom:2px}
.iq .s div{font:500 13px/1.4 var(--body)}
.iq .s b{font-weight:700}
/* catch-up */
.cu{display:flex;align-items:center;gap:11px;padding:6px 18px 14px}
.cu img{width:44px;height:44px;border-radius:50%;object-fit:cover;box-shadow:0 0 0 2.5px var(--ivory),0 0 0 5px var(--apricot)}
.cu b{font:850 17px var(--display);font-stretch:104%;display:block;white-space:nowrap}
.cu small{font:600 12.5px var(--body);color:var(--primary)}
.cu .x{margin-left:auto}
.ord{display:flex;justify-content:space-between;align-items:center;padding:0 18px 6px;font:600 12px var(--body);color:var(--muted)}
.of{display:flex;align-items:center;gap:8px;padding:0 22px 8px;font:600 12px var(--body);color:var(--muted)}
.of b{color:var(--primary)}
.done{margin:0 12px 16px;display:flex;gap:12px;align-items:center;text-align:left;padding:12px 16px;border-radius:22px;border:1.5px dashed #c5e6de;background:var(--seafoam-tint);color:#1f5e52}
.done .c{width:40px;height:40px;border-radius:50%;background:var(--seafoam);color:#12312b;display:grid;place-items:center;flex:none}
.done b{font:850 18px var(--display);font-stretch:106%;display:block;color:var(--ink)}
.done span{font:500 12.5px/1.45 var(--body)}
/* bottom sheets */
.dim{position:absolute;inset:0;background:rgba(13,22,48,.48);z-index:10}
.sheet{position:absolute;left:0;right:0;bottom:0;background:var(--ivory);border-radius:30px 30px 0 0;padding:10px 20px 30px;z-index:11;box-shadow:0 -20px 40px -20px rgba(0,0,0,.4)}
.sheet .grab{width:40px;height:5px;border-radius:3px;background:#d6cfc1;margin:0 auto 16px}
.sheet h3{font:850 23px/1.15 var(--display);font-stretch:106%;letter-spacing:-.02em}
.sheet .sub{font:500 14px/1.5 var(--body);color:var(--muted);margin:6px 0 14px}
.sheet .hd{display:flex;align-items:center;gap:12px;margin-bottom:4px}
.sheet .hd .ic{width:44px;height:44px;border-radius:14px;display:grid;place-items:center;flex:none}
.opts{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.opt{display:flex;align-items:center;gap:9px;background:#fff;border-radius:16px;padding:13px 14px;font:700 14.5px var(--body);box-shadow:inset 0 0 0 1.5px var(--line)}
.opt i{width:18px;height:18px;border-radius:50%;box-shadow:inset 0 0 0 2px #c9c1b2;flex:none}
.opt.on{box-shadow:inset 0 0 0 2px var(--primary);color:var(--primary)}.opt.on i{box-shadow:inset 0 0 0 5px var(--primary)}
.nbbox{display:flex;gap:10px;margin:14px 0 16px;padding:12px 14px;border-radius:16px;background:var(--seafoam-tint);border:1px solid #c5e6de;font:500 13px/1.45 var(--body);color:#1f4d44}
.nbbox b{color:var(--ink)}
.sheet .btn.full{display:flex;width:100%;padding:15px;font-size:15.5px}
.sheet .later{text-align:center;font:600 14px var(--body);color:var(--muted);margin-top:12px}
.wl{display:flex;gap:12px;padding:11px 0;border-bottom:1px solid #f1ece3;font:500 13.5px/1.45 var(--body)}
.wl:last-of-type{border:0}
.wl>span:first-child{width:32px;height:32px;border-radius:10px;display:grid;place-items:center;flex:none;background:var(--blue-50);color:var(--primary)}
.wl b{display:block;font-weight:700}
/* sponsored (advertising) */
.ad{margin:0 12px 16px;background:#fff;border-radius:20px;overflow:hidden;box-shadow:inset 0 0 0 1px var(--line)}
.ad .ah{display:flex;align-items:center;gap:9px;padding:11px 14px}
.ad .bm{width:30px;height:30px;border-radius:8px;background:#f1ece3;color:var(--muted);display:grid;place-items:center;flex:none}
.ad .ah b{font:700 13.5px var(--body);display:block}
.ad .ah .tag{font-size:10.5px;padding:2px 8px}
.ad .ah .more{margin-left:auto;color:var(--muted)}
.ad .cr{position:relative;height:150px}
.ad .cr img{width:100%;height:100%;object-fit:cover}
.ad .cr .play{width:48px;height:48px}
.ad .al{display:flex;align-items:center;gap:10px;padding:11px 14px 12px}
.ad .al p{flex:1;font:500 13px/1.4 var(--body)}
.ad .al .btn{padding:8px 14px;font-size:13px;background:var(--ink);color:#fff}
.ad .wy{display:flex;align-items:center;gap:5px;padding:0 14px 12px;font:600 12px var(--body);color:var(--primary)}
.post.withad{margin-bottom:0;border-radius:26px 26px 0 0}
.adlink{margin:0 12px 16px;background:var(--apricot-tint);border-radius:0 0 22px 22px;padding:9px 9px 9px;box-shadow:0 12px 30px -18px rgba(27,36,48,.35)}
.adlink .lk{display:flex;align-items:center;gap:6px;padding:0 6px 8px;font:600 11.5px var(--body);color:var(--apricot-text)}
.adlink .ad{margin:0;border-radius:16px;box-shadow:inset 0 0 0 1px #fbd9bd}
.adlink .ad .cr{height:104px}
/* icon comparison */
.cmp{background:#fff;border-radius:24px;padding:26px 28px;box-shadow:0 1px 0 var(--line);display:inline-block}
.cmp h3{font:850 22px var(--display);font-stretch:106%;margin-bottom:4px}
.cmp>p{font:500 14px var(--body);color:var(--muted);margin-bottom:20px;max-width:1150px}
.cmpg{display:grid;grid-template-columns:auto 390px 390px 1fr;gap:20px 30px;align-items:center}
.cmpg .rl{font:700 13px var(--body);color:var(--muted);width:120px}
.cmpg .ch{font:800 15px var(--body)}
.cmpg .navbox{width:390px;border-radius:18px;overflow:hidden;box-shadow:0 0 0 1px var(--line)}
.cmpg .navbox .nav{height:76px}
.big3{display:flex;gap:22px;align-items:center}
.big3 div{display:flex;flex-direction:column;align-items:center;gap:8px;font:600 12px var(--body);color:var(--muted)}
.big3 .t{width:104px;height:104px;border-radius:24px;background:var(--ivory);display:grid;place-items:center;box-shadow:inset 0 0 0 1px var(--line)}
`

// ---------- shared components ----------
const status = (dark = false) => `<div class="status${dark ? ' dark' : ''}"><span>9:41</span><span class="r">${icon('Signal', 16, 2.4)}${icon('Wifi', 16, 2.4)}${icon('BatteryFull', 22, 1.8)}</span></div>`
const nav = (on, kind = 'brand') => `<nav class="nav">
  <a class="${on === 'home' ? 'on' : ''}">${icon('House', 25, on === 'home' ? 2.4 : 1.9)}Home</a>
  <a class="${on === 'discover' ? 'on' : ''}">${icon('Compass', 25, on === 'discover' ? 2.4 : 1.9)}Discover</a>
  <a class="create ${on === 'create' ? 'on' : ''}"><span class="plus">${icon('Plus', 26, 2.6)}</span></a>
  <a class="${on === 'split' ? 'on' : ''}">${splitIcon(25, on === 'split', kind)}My Split</a>
  <a class="${on === 'profile' ? 'on' : ''}"><img class="me" src="${P('sam')}" alt="">Profile</a></nav>`
const faces = (list, on, dark = false) => `<div class="faces${dark ? ' dark' : ''}" role="tablist">${list.map((f, i) => `<span class="${i === on ? 'on' : ''}">${f}</span>`).join('')}</div>`
const appbar = () => `<div class="bar"><div class="brand">${logo(32)}<span class="wm">splitpost</span></div><span class="iconbtn">${icon('MessageSquareHeart', 19)}</span></div>`
const acts = (likes, comments, liked = false, saved = false) => `<div class="acts"><span class="${liked ? 'liked' : ''}">${icon('Heart', 21, 2)}${likes}</span><span>${icon('MessageCircle', 21)}${comments}</span><span>${icon('Repeat2', 22)}</span><span>${icon('Send', 20)}</span><span class="sp"></span><span>${icon(saved ? 'BookmarkCheck' : 'Bookmark', 21)}</span></div>`
const videoPost = (o) => `<article class="post"><div class="media${o.short ? ' short' : ''}"><img src="${o.img}" alt=""><div class="shade"></div>
  <div class="who"><img src="${P(o.p)}" alt=""><div><b>${o.name} ${o.clique ? `<span class="tag clique">${icon('Sparkle', 11, 2.4)}Clique</span>` : ''}</b><small>${o.meta}</small></div></div>
  ${o.video ? `<span class="play">${icon('Play', 28, 2.2)}</span><span class="dur">${o.video}</span>` : ''}</div>
  <div class="txt">${o.text}</div>${acts(o.likes, o.comments, o.liked, o.saved)}</article>`
const textPost = (o) => `<article class="post">${o.repost ? `<div class="repost">${icon('Repeat2', 15)}${o.repost}</div>` : ''}<div class="textpost"><img src="${P(o.p)}" alt=""><div><b>${o.name} ${o.clique ? '<span class="tag clique">Clique</span>' : ''}</b><small>${o.meta}</small></div></div><div class="big">${o.text}</div>${acts(o.likes, o.comments)}</article>`

// ---------- home faces (shared by screens and the transition demo) ----------
const homeFace = (k) => {
  if (k === 0) return `
  <div class="sec"><h3>New from your Clique</h3><span>4 creators</span></div>
  <div class="strip">${[['amara', 'Amara', 4], ['kofi', 'Kofi', 2], ['lena', 'Lena', 12], ['hana', 'Hana', 1], ['theo', 'Theo', 0]].map(([p, n, c]) => `<div class="p"><div class="ring${c ? '' : ' seen'}"><img src="${P(p)}" alt="">${c ? `<span class="n">${c > 9 ? '9+' : c}</span>` : ''}</div>${n}</div>`).join('')}</div>
  ${videoPost({ img: `${M}/landing/photos/creator-editing-1200.webp`, p: 'amara', name: 'Amara Obi', meta: '12 min · Money & business', clique: true, video: '3:42', text: '<b>Amara</b> The 50/30/20 budget, rebuilt for a first paycheque. Full breakdown in the video.', likes: '248', comments: '36', liked: true })}
  ${videoPost({ img: `${M}/tour/posts/kofi-harvest.jpg`, p: 'kofi', name: 'Kofi Mensah', meta: '1 h · Food & cooking', clique: true, text: '<b>Kofi</b> Harvest day. Three recipes from one basket coming this week.', likes: '91', comments: '14', short: true })}`
  if (k === 1) return `
  <div class="sec"><h3>My Clique</h3><span>8 creators · Manage</span></div>
  ${videoPost({ img: `${M}/tour/posts/kofi-harvest.jpg`, p: 'kofi', name: 'Kofi Mensah', meta: '1 h · Food & cooking', clique: true, text: '<b>Kofi</b> Harvest day. Three recipes from one basket coming this week.', likes: '91', comments: '14' })}
  ${textPost({ p: 'hana', name: 'Hana Sato', meta: '3 h · Books & writing', clique: true, text: 'What is one book that changed how you work? Best answers make next week\'s list.', likes: '57', comments: '112' })}`
  return `
  <div class="sec"><h3>Following</h3><span>Newest first · everything</span></div>
  ${textPost({ repost: 'Sam reposted · original by Theo Laurent', p: 'theo', name: 'Theo Laurent', meta: '2 h · Travel', text: 'Four days, one backpack, zero plans. Here is the route.', likes: '64', comments: '9' })}
  ${videoPost({ img: `${M}/tour/posts/theo-trail.jpg`, p: 'theo', name: 'Theo Laurent', meta: '2 h · Travel', video: '4:58', text: '<b>Theo</b> The full ridge trail, start to summit.', likes: '133', comments: '21', short: true })}`
}
const homeScreen = (k = 0) => `<div class="phone">${status()}${appbar()}${faces(['Clique first', 'My Clique', 'Following'], k)}<div class="scroll">${homeFace(k)}</div>${nav('home')}</div>`

// ---------- screens ----------
const discover = `<div class="phone">${status()}<div class="bar"><h2 class="d" style="font-size:26px;font-weight:850">Discover</h2><span class="iconbtn">${icon('SlidersHorizontal', 18)}</span></div>
<div class="search">${icon('Search', 19)}Search creators, posts and topics</div>
${faces(['Relevant', 'Creators', 'Content'], 0)}
<div class="chips"><span class="chip on">For your interests</span><span class="chip">${icon('UtensilsCrossed', 15)}Food</span><span class="chip">${icon('BookOpen', 15)}Books</span><span class="chip">${icon('Mountain', 15)}Travel</span></div>
<div class="scroll">
<div class="feature"><img class="bg" src="${M}/tour/posts/kofi-harvest.jpg" alt=""><div class="g"></div><div class="c"><img class="av" src="${P('kofi')}" alt=""><div style="display:flex;gap:8px;align-items:center"><h4>Kofi Mensah</h4><span class="tag sea">New voice</span></div>
<p>Farm-to-table cooking for busy weeknights. One basket, three meals, every Thursday.</p>
<div style="display:flex;justify-content:space-between;align-items:center"><span class="why">${icon('Sparkles', 14)}Because you chose Food &amp; cooking</span><span class="btn">${icon('UserPlus', 16, 2.4)}Follow</span></div></div></div>
<div class="sec"><h3>Posts you might value</h3><span>Rotates daily</span></div>
<div class="grid2"><div class="tile"><img src="${M}/tour/posts/hana-book.jpg" alt=""><div class="t">Five books that taught me to write clearly<small>${icon('BookOpen', 13)}Books · you chose this</small></div></div>
<div class="tile"><img src="${M}/landing/photos/teacher-recording-640.webp" alt=""><div class="t">Fractions in four minutes, for real<small>${icon('GraduationCap', 13)}Learning · new creator</small></div></div></div>
</div>${nav('discover')}</div>`

const create = `<div class="phone">${status()}<div class="ctop"><span class="iconbtn">${icon('X', 19)}</span><h2>New post</h2><span class="btn blue" style="padding:9px 18px">Post</span></div>
<div class="scroll"><div class="compose"><div class="me"><img src="${P('amara')}" alt=""><div><b>Amara Obi</b><small>${icon('Users', 13)}Available to all your followers</small></div></div>
<div class="ta">This week: how I split my first paycheque, and what I'd change now.</div>
<div class="vprev"><img src="${M}/landing/photos/teacher-recording-640.webp" alt=""><span class="x">${icon('X', 16, 2.4)}</span><span class="dur">4:12</span></div>
<div class="upl"><div class="r">Uploading video<span>38% · 41 of 108 MB</span></div><div class="pbar"><i></i></div><div class="chk">${icon('CircleCheck', 15, 2.4)}H.264 · 720p · 4 min 12 s · supported format</div></div></div>
<div class="topic"><div class="h">Topic<span>Needed to appear in Discover</span></div><div class="chips" style="padding:10px 0 0"><span class="chip on">${icon('TrendingUp', 15)}Money &amp; business</span><span class="chip">${icon('GraduationCap', 15)}Learning</span><span class="chip">+ More</span></div></div>
<div class="note">${icon('Info', 16)}<span>Videos up to 5 minutes. MP4 or MOV files recorded in H.264 are supported. If a file can't be used, we'll explain why before you post.</span></div>
<div class="tools"><span>${icon('Image', 24)}Photo</span><span>${icon('Clapperboard', 24)}Video</span><span>${icon('Hash', 24)}Topic</span><span>${icon('Smile', 24)}Emoji</span></div></div>${nav('create')}</div>`

const iq = (rows) => `<div class="iq">${rows.map(([ic, bg, c, k, t]) => `<div class="s"><span style="background:${bg};color:${c}">${icon(ic, 17)}</span><div><small>${k}</small>${t}</div></div>`).join('')}</div>`
const mysplit = `<div class="phone"><div class="hero-blue">${status(true)}<div class="hb-top"><h2>My Split</h2><span class="tag sim" style="background:rgba(168,217,207,.18);color:#cfeee7;border-color:rgba(168,217,207,.4)">Pilot · simulated</span></div>
${faces(['Overview', 'History', 'Opportunities'], 0, true)}
<div class="pts"><div class="k">Your Connection Points</div><div class="v">1,240<small>total</small></div><div class="splitbar"><i></i><i></i></div>
<div class="legend"><div><b><i style="background:var(--seafoam)"></i>1,040</b><span>Recognized points. Your contribution, not redeemable.</span></div><div><b><i style="background:var(--apricot)"></i>200</b><span>Redemption-eligible points, from 2 qualified referrals.</span></div></div></div></div>
<div class="scroll" style="padding-top:14px"><div class="simcard" style="padding:13px 16px"><div class="k">Estimated value of your eligible points<span class="tag sim">Simulated</span></div><div class="v">$3.20</div><p>What your 200 eligible points would be worth from today's simulated fan pool. Nothing is paid during the pilot.</p></div>
${iq([
  ['UserRoundPlus', 'var(--apricot-tint)', 'var(--apricot-text)', 'What happened', 'Your <b>two referrals qualified</b> (+200 eligible points).'],
  ['Users', 'var(--seafoam-tint)', '#1f5e52', 'What it means', '<b>Kofi gained 2 followers through you.</b>'],
  ['Send', 'var(--blue-50)', 'var(--primary)', 'What to do next', "Share Kofi's new harvest post with someone who'd value it."]])}</div>${nav('split')}</div>`

const profileScreen = (overlay = '') => `<div class="phone"><div class="cover"><img class="bg" src="${M}/studio-light.jpg" alt="">${status(true)}<img class="pav" src="${P('amara')}" alt=""><div class="top"><span>${icon('ChevronLeft', 20)}</span><span>${icon('Ellipsis', 20)}</span></div></div>
<div class="scroll"><div class="pf"><h2>Amara Obi</h2><div class="h">@amaraobi · Money &amp; business</div>
<p>Money talk for first-generation earners. A new budget breakdown every Tuesday.</p>
<div class="stats"><div><b>1,284</b><span>Followers</span></div><div><b>96</b><span>Clique</span></div><div><b>41</b><span>Active Supporters</span></div></div>
<div class="pacts"><span class="btn blue">${icon('Check', 16, 2.6)}Following</span><span class="btn" style="background:var(--apricot);color:#4a2109">${icon('Sparkle', 15, 2.4)}Join Clique</span><span class="btn line">${icon('HandHeart', 16, 2.2)}Support</span></div></div>
<div class="pgrid" style="margin-top:16px"><div><img src="${M}/landing/photos/creator-editing-640.webp" alt=""><span class="pl">${icon('Play', 12, 3)}3:42</span></div><div class="tx">The one budget rule I'd keep if I had to drop the rest.</div><div><img src="${M}/landing/photos/teacher-recording-640.webp" alt=""><span class="pl">${icon('Play', 12, 3)}4:12</span></div>
<div><img src="${M}/landing/photos/metalworker-640.webp" alt=""></div><div><img src="${M}/landing/photos/filmmaker-600.webp" alt=""></div><div class="tx">Ask me anything: first salary edition.</div></div></div>
${nav('none')}${overlay}</div>`
const profile = profileScreen()

const ring = (outer, inner, sz = 128) => `<svg width="${sz}" height="${sz}" viewBox="0 0 128 128"><circle cx="64" cy="64" r="56" fill="none" stroke="#e7f4f1" stroke-width="14"/><circle cx="64" cy="64" r="56" fill="none" stroke="var(--seafoam)" stroke-width="14" stroke-dasharray="${351.9 * outer} 352" transform="rotate(-90 64 64)" stroke-linecap="round"/><circle cx="64" cy="64" r="36" fill="none" stroke="#eef2fb" stroke-width="14"/><circle cx="64" cy="64" r="36" fill="none" stroke="var(--primary)" stroke-width="14" stroke-dasharray="${226.2 * inner} 227" transform="rotate(-90 64 64)" stroke-linecap="round"/><text x="64" y="70" text-anchor="middle" font-family="Archivo" font-weight="900" font-size="19" fill="#1b2430">61%</text></svg>`
const step = (n, t) => `<div class="step"><i>${n}</i>${t}</div>`
const attention = `<div class="phone">${status()}<div class="bar"><div class="brand"><img src="${P('amara')}" style="width:34px;height:34px;border-radius:50%;object-fit:cover" alt=""><b class="d" style="font-size:19px;font-weight:850">Your insights</b></div><span class="tag act">Last 7 days</span></div>
${faces(['Profile', 'Attention', 'Retention', 'Money'], 1)}
<div class="scroll">${step(1, 'What happened')}<div class="story" style="padding-top:0;padding-bottom:10px"><h3 style="font-size:21px;margin:0">Every post was available to all <em>1,284 followers</em>. 784 of them saw at least one.</h3></div>
<div class="rings" style="padding:14px 16px;margin-bottom:10px">${ring(1, 0.61, 104)}<div class="lg"><div><i style="background:var(--seafoam)"></i><span><b>100%</b>Available. Your posts were in every follower's Home.</span></div><div><i style="background:var(--primary)"></i><span><b>61%</b>Reached. Followers who actually viewed a post.</span></div></div></div>
<div class="src" style="padding:12px 16px;margin-bottom:12px"><div class="h" style="margin-bottom:4px">Where your 27 new followers came from</div>
${[['Compass', 'Discover', 14, 'var(--primary)'], ['Send', 'Shared links', 9, 'var(--apricot)'], ['User', 'Your profile', 4, 'var(--seafoam)']].map(([ic, n, v, c]) => `<div class="srow" style="margin:6px 0">${icon(ic, 17)}<span style="width:92px">${n}</span><span class="sbar"><i style="width:${v * 6.5}%;background:${c}"></i></span><b>${v}</b></div>`).join('')}</div>
${step(2, 'What it means')}<div class="means">Discover brings new people; <b>your Clique comments 3× more</b> than other followers.</div>
${step(3, 'What to do next')}<div class="insight">${icon('Lightbulb', 22)}<span><b>Ask your Clique a question</b>End your next post with one.</span></div></div>${nav('profile')}</div>`

const money = `<div class="phone">${status()}<div class="bar"><div class="brand"><img src="${P('amara')}" style="width:34px;height:34px;border-radius:50%;object-fit:cover" alt=""><b class="d" style="font-size:19px;font-weight:850">Your insights</b></div><span class="tag act">November</span></div>
${faces(['Profile', 'Attention', 'Retention', 'Money'], 3)}
<div class="scroll">${step(1, 'What happened')}<div class="story" style="padding-top:0;padding-bottom:10px"><h3 style="font-size:21px;margin:0">Ads shown with your posts would earn you <em>$41.60</em> this month.</h3><div style="margin-top:7px"><span class="tag sim">Simulated · not paid during the pilot</span></div></div>
<div class="src" style="padding:12px 16px;margin-bottom:10px"><div class="h" style="margin-bottom:0">How $104.00 of simulated ad revenue splits</div>
<div class="split3" style="height:40px;margin:10px 0 7px"><div style="flex:40;background:var(--primary);color:#fff">You 40%</div><div style="flex:20;background:var(--seafoam);color:#173f37">Fans 20%</div><div style="flex:40;background:#e9e4da;color:var(--muted)">Splitpost 40%</div></div>
<div style="font:500 12px/1.45 var(--body);color:var(--muted)">From ads placed with your posts. Ads elsewhere in the app aren't part of creator splits.</div></div>
<div class="lst" style="margin-bottom:12px;padding:2px 16px"><div class="li" style="padding:9px 0"><span class="ic" style="background:var(--blue-50);color:var(--primary);font:800 13px var(--display)">KB</span><span class="t">Kitchen brand campaign<small>3 posts · 2,140 impressions</small></span><span class="n">$28.00</span></div>
<div class="li" style="padding:9px 0"><span class="ic" style="background:var(--seafoam-tint);color:#1f5e52;font:800 13px var(--display)">GA</span><span class="t">Grocery app campaign<small>1 post · 960 impressions</small></span><span class="n">$13.60</span></div></div>
${step(2, 'What it means')}<div class="means">Tuesday budget posts carried <b>two thirds</b>. <b>12 people</b> would support you <span class="tag nb" style="padding:1px 7px">Non-binding</span></div>
${step(3, 'What to do next')}<div class="insight">${icon('Lightbulb', 22)}<span><b>Keep the Tuesday breakdowns going</b>Thank your 12 supporters in your next post.</span></div></div>${nav('profile')}</div>`

// ---------- refinements after approval ----------
// Clique catch-up: tapping an avatar in the Clique strip opens that creator's unseen posts, oldest first.
const catchup = `<div class="phone">${status()}<div class="cu"><span class="iconbtn">${icon('ChevronLeft', 20)}</span><img src="${P('amara')}" alt=""><div><b>Catch up with Amara</b><small>4 new since you last looked</small></div><span class="iconbtn x">${icon('Ellipsis', 19)}</span></div>
<div class="ord"><span>Oldest unseen first</span><span>Scrolled to the end</span></div>
<div class="scroll"><div class="of"><b>3 of 4</b>· Yesterday</div>
${textPost({ p: 'amara', name: 'Amara Obi', meta: '1 day · Money & business', clique: true, text: 'Ask me anything: first salary edition.', likes: '64', comments: '48' })}
<div class="of"><b>4 of 4</b>· 12 min ago</div>
${videoPost({ img: `${M}/landing/photos/creator-editing-1200.webp`, p: 'amara', name: 'Amara Obi', meta: '12 min · Money & business', clique: true, video: '3:42', text: '<b>Amara</b> The 50/30/20 budget, rebuilt.', likes: '248', comments: '36', short: true }).replace('class="media short"', 'class="media short" style="height:190px"')}
<div class="done"><div class="c">${icon('Check', 22, 2.8)}</div><div><b>All caught up</b><span>You've seen everything new from Amara.</span></div></div></div>${nav('home')}</div>`

// Support Intent sheet: non-binding, nothing charged.
const supportSheet = `<div class="dim"></div><div class="sheet"><div class="grab"></div>
<div class="hd"><span class="ic" style="background:var(--seafoam-tint);color:#1f5e52">${icon('HandHeart', 24)}</span><h3>Show Amara you'd support her</h3></div>
<p class="sub">How much would you be willing to support Amara's work?</p>
<div class="opts">${[['$3 a month', 0], ['$5 a month', 1], ['$10 a month', 0], ['Not sure yet', 0]].map(([t, on]) => `<span class="opt${on ? ' on' : ''}"><i></i>${t}</span>`).join('')}</div>
<div class="nbbox">${icon('ShieldCheck', 20)}<span><b>Non-binding.</b> Nothing is charged, now or later. This tells Amara and Splitpost what people would be willing to support.</span></div>
<span class="btn blue full">Record my support intent</span><div class="later">Not now</div></div>`
const support = profileScreen(supportSheet)

// Advertising: clearly labelled, never styled as a creator post, and smaller than posts.
const adCard = (o) => `<div class="ad"><div class="ah"><span class="bm">${icon('Store', 17)}</span><div><b>${o.brand}</b><span class="tag spon">${o.label}</span></div><span class="more">${icon('Ellipsis', 20)}</span></div>
<div class="cr"><img src="${o.img}" alt="" style="${o.pos || ''}">${o.video ? `<span class="play">${icon('Play', 22, 2.2)}</span><span class="dur">${o.video}</span>` : ''}</div>
<div class="al"><p>${o.line}</p><span class="btn">Learn more</span></div><div class="wy">${icon('Info', 14, 2.2)}Why this ad?</div></div>`
const kofiPost = videoPost({ img: `${M}/tour/posts/kofi-harvest.jpg`, p: 'kofi', name: 'Kofi Mensah', meta: '1 h · Food & cooking', clique: true, text: '<b>Kofi</b> Harvest day. Three recipes from one basket coming this week.', likes: '91', comments: '14', short: true })
const adContentScreen = (overlay = '') => `<div class="phone">${status()}${appbar()}${faces(['Clique first', 'My Clique', 'Following'], 0)}<div class="scroll">
${kofiPost.replace('class="post"', 'class="post withad"').replace('class="media short"', 'class="media short" style="height:190px"')}
<div class="adlink"><div class="lk">${icon('Link2', 14, 2.2)}Sponsored · shown with Kofi's post</div>${adCard({ brand: 'Ironleaf Cookware', label: 'Sponsored', img: `${M}/landing/photos/metalworker-640.webp`, line: 'Hand-forged pans for one-basket cooking.' })}</div>
${textPost({ p: 'hana', name: 'Hana Sato', meta: '3 h · Books & writing', clique: true, text: 'What is one book that changed how you work?', likes: '57', comments: '112' })}
</div>${nav('home')}${overlay}</div>`
const adContent = adContentScreen()
const adFeed = `<div class="phone">${status()}${appbar()}${faces(['Clique first', 'My Clique', 'Following'], 2)}<div class="scroll">
${textPost({ repost: 'Sam reposted · original by Theo Laurent', p: 'theo', name: 'Theo Laurent', meta: '2 h · Travel', text: 'Four days, one backpack, zero plans. Here is the route.', likes: '64', comments: '9' })}
${adCard({ brand: 'Brightframe Cameras', label: 'Sponsored', img: `${M}/landing/photos/filmmaker-600.webp`, pos: 'object-position:center 30%', video: '0:20', line: 'Shoot steady travel video on a phone budget.' })}
${videoPost({ img: `${M}/tour/posts/theo-trail.jpg`, p: 'theo', name: 'Theo Laurent', meta: '2 h · Travel', video: '4:58', text: '<b>Theo</b> The full ridge trail, start to summit.', likes: '133', comments: '21', short: true })}
</div>${nav('home')}</div>`
const whyAdSheet = `<div class="dim"></div><div class="sheet"><div class="grab"></div>
<div class="hd"><span class="ic" style="background:var(--apricot-tint);color:var(--apricot-text)">${icon('Info', 24)}</span><h3>Why this ad?</h3></div>
<p class="sub">Ironleaf Cookware · Sponsored, shown with Kofi's post</p>
<div class="wl"><span>${icon('Tag', 17)}</span><span><b>Matched to the post or your choice</b>Shown because Kofi's post is about Food &amp; cooking, or because you chose <b style="display:inline">Cooking gear</b> as an optional commercial preference.</span></div>
<div class="wl"><span>${icon('ShieldCheck', 17)}</span><span><b>Never sensitive interests</b>Ads never use health, religion, politics, sexuality or other sensitive interests.</span></div>
<div class="wl"><span>${icon('EyeOff', 17)}</span><span><b>Hide ads from this advertiser</b>You won't see Ironleaf Cookware ads again.</span></div>
<span class="btn line full" style="margin-top:14px">${icon('SlidersHorizontal', 16)}Manage ad preferences</span><div class="later">Done</div></div>`
const whyAd = adContentScreen(whyAdSheet)

// Icon comparison for My Split: brand symbol versus gem.
const navBox = (on, kind) => `<div class="navbox">${nav(on, kind)}</div>`
const bigIcon = (kind) => `<div class="big3"><div><span class="t" style="color:var(--muted)">${splitIcon(76, false, kind)}</span>Inactive</div><div><span class="t" style="color:var(--primary)">${splitIcon(76, true, kind)}</span>Active</div></div>`
const iconCompare = `<div class="cmp"><h3>My Split icon: brand symbol or gem</h3><p>The brand symbol is a single-colour simplification of the Splitpost logo, drawn on the same 24 px grid and stroke as the other navigation icons. Shown at 1x (25 px) in the bottom navigation and enlarged, inactive and active.</p>
<div class="cmpg"><span></span><span class="ch">Brand symbol (recommended)</span><span class="ch">Gem (approved draft)</span><span class="ch">Next to the Home header logo</span>
<span class="rl">1x · My Split active</span>${navBox('split', 'brand')}${navBox('split', 'gem')}<div style="display:flex;align-items:center;gap:18px">${logo(32)}<span style="color:var(--primary)">${splitMark(25, 2.4)}</span><span style="color:var(--muted)">${splitMark(25, 1.9)}</span><span style="font:500 12.5px/1.4 var(--body);color:var(--muted);max-width:200px">Full-colour logo, then the nav symbol active and inactive</span></div>
<span class="rl">1x · My Split inactive</span>${navBox('home', 'brand')}${navBox('home', 'gem')}<span></span>
<span class="rl">Enlarged (76 px)</span>${bigIcon('brand')}${bigIcon('gem')}<span></span></div></div>`

// ---------- desktop ----------
const deskRail = (on) => `<aside class="rail"><div class="brand">${logo(34)}<span class="wm">splitpost</span></div>
${[['House', 'Home', 'home'], ['Compass', 'Discover', 'discover'], ['split', 'My Split', 'split'], ['User', 'Profile', 'profile']].map(([ic, n, k]) => `<a class="${on === k ? 'on' : ''}">${ic === 'split' ? splitIcon(22, on === k) : icon(ic, 22, on === k ? 2.4 : 1.9)}${n}</a>`).join('')}
<a class="cr">${icon('Plus', 20, 2.6)}Create</a><div class="sp"></div><a>${icon('MessageSquareHeart', 20)}Send feedback</a><a><img src="${P('sam')}" style="width:28px;height:28px;border-radius:50%;object-fit:cover" alt="">Sam Rivera</a></aside>`
const deskHome = `<div class="desk">${deskRail('home')}<main style="flex:1;display:flex;gap:28px;overflow:hidden;padding-left:40px">
<div class="dcol" style="margin:0">${faces(['Clique first', 'My Clique', 'Following'], 0).replace('class="faces"', 'class="faces" style="margin:0 12px 16px;max-width:420px"')}${homeFace(0)}</div>
<div class="dright"><div class="panel"><h4>Your Clique</h4>${[['amara', 'Amara Obi', '4 new posts'], ['kofi', 'Kofi Mensah', '2 new posts'], ['lena', 'Lena Novak', '12 new posts'], ['hana', 'Hana Sato', '1 new post'], ['theo', 'Theo Laurent', 'All caught up']].map(([p, n, s]) => `<div class="li" style="padding:9px 0"><img src="${P(p)}" style="width:40px;height:40px;border-radius:50%;object-fit:cover" alt=""><span class="t">${n}<small>${s}</small></span></div>`).join('')}<div style="font:600 13px var(--body);color:var(--primary);margin-top:8px">Manage Clique</div></div>
<div class="panel" style="background:var(--primary);color:#fff"><div style="font:600 13px var(--body);color:var(--muted-dark)">My Split</div><div class="d" style="font-size:34px;font-weight:900;margin:4px 0">1,240 <span style="font:600 14px var(--body)">points</span></div><div class="splitbar" style="height:10px"><i></i><i></i></div><div style="font:500 12px/1.4 var(--body);color:var(--muted-dark);margin-top:8px">1,040 recognized · 200 redemption eligible · rewards simulated in the pilot</div></div></div></main></div>`

const spark = `<svg width="100%" height="58" viewBox="0 0 300 58" preserveAspectRatio="none"><path d="M0 48 L40 44 L80 46 L120 34 L160 36 L200 22 L240 24 L300 8" fill="none" stroke="#a8d9cf" stroke-width="3" stroke-linecap="round"/><path d="M0 48 L40 44 L80 46 L120 34 L160 36 L200 22 L240 24 L300 8 L300 58 L0 58Z" fill="rgba(168,217,207,.15)"/></svg>`
const control = `<div class="cc"><aside class="rail"><div class="brand">${logo(34)}<span class="wm" style="color:#fff">Control Center</span></div>
${[['LayoutDashboard', 'Overview', '', 1], ['Users', 'Members & access', ''], ['Flag', 'Moderation', '4'], ['Scale', 'Appeals', '1'], ['UserRoundCheck', 'Referral review', '2'], ['Megaphone', 'Campaigns', '1'], ['Coins', 'Economics', ''], ['MessageSquareHeart', 'Feedback', ''], ['Activity', 'Health', ''], ['ScrollText', 'Audit log', '']].map(([ic, n, c, on]) => `<a class="${on ? 'on' : ''}">${icon(ic, 19)}${n}${c ? `<em>${c}</em>` : ''}</a>`).join('')}</aside>
<main class="ccmain"><div class="cch"><div><div style="font:600 13px var(--body);color:var(--muted)">Week of Dec 28</div><h1>Ecosystem health</h1></div><div style="display:flex;gap:8px"><span class="tag act">Actual</span><span class="tag sim">Simulated shown separately</span><span class="tag nb">Test data excluded</span></div></div>
<div class="kpis"><div class="kpi nsm"><div class="k">Weekly Active Creator-Consumer Connections<span class="tag" style="background:rgba(255,255,255,.14);color:#fff">North Star</span></div><div class="v">312</div><div class="s">Up 18% on last week · 41 from founder-dependent activity</div>${spark}</div>
<div class="kpi"><div class="k">Activation${icon('Zap', 17)}</div><div class="v">64%</div><div class="s">of new members within 7 days</div></div>
<div class="kpi"><div class="k">Registration${icon('DoorOpen', 17)}</div><div class="v">142<span style="font:600 16px var(--body);color:var(--muted)"> / 200</span></div><div class="s">pilot cap · 9 today of 25</div><div class="pbar" style="margin-top:10px"><i style="width:71%"></i></div></div>
<div class="kpi"><div class="k">Fan pool${icon('Scale', 17)}</div><div class="v">$62.40</div><div class="s"><span class="tag sim">Simulated</span> reconciled to the cent</div></div></div>
<div class="queues">${[['Flag', 'Reports to review', '4', 'oldest 3 h', '#fdecea', 'var(--heart)'], ['UserRoundCheck', 'Referrals flagged', '2', 'oldest 1 day', 'var(--apricot-tint)', 'var(--apricot-text)'], ['Megaphone', 'Campaign awaiting approval', '1', 'Kitchen brand · 5 h', 'var(--blue-50)', 'var(--primary)'], ['Scale', 'Appeals', '1', 'due in 6 days', 'var(--blue-50)', 'var(--primary)'], ['ShieldCheck', 'Data quality checks', '0', 'all passing · 06:00', 'var(--seafoam-tint)', '#1f5e52'], ['Activity', 'Service health', 'OK', 'email, media, database', 'var(--seafoam-tint)', '#1f5e52']].map(([ic, n, v, s, bg, c]) => `<div class="q"><span class="ic" style="background:${bg};color:${c}">${icon(ic, 22)}</span><div><b>${v}</b><span>${n}<br>${s}</span></div><span class="go">${icon('ChevronRight', 22)}</span></div>`).join('')}</div>
<div style="display:grid;grid-template-columns:1.35fr 1fr 1fr;gap:16px;margin-top:16px">
<div class="kpi"><div class="k">Content-associated ad revenue, December<span class="tag sim">Simulated settlement</span></div>
<div style="display:flex;gap:28px;margin:12px 0 10px;font:500 12.5px var(--body);color:var(--muted)"><div><b class="d" style="display:block;font-size:24px;font-weight:900;color:var(--ink)">$1,400</b>Agreed campaign value <span class="tag act">Actual commitment</span></div><div><b class="d" style="display:block;font-size:24px;font-weight:900;color:var(--ink)">$312</b>Eligible net revenue to date</div></div>
<div class="split3" style="height:40px"><div style="flex:40;background:var(--primary);color:#fff">Creators $124.80</div><div style="flex:20;background:var(--seafoam);color:#173f37">Fans $62.40</div><div style="flex:40;background:#e9e4da;color:var(--muted)">Splitpost $124.80</div></div>
<div style="font:500 12px var(--body);color:var(--muted)">Ledger, pool and allocations reconcile to the cent · last check 06:00 ${icon('CircleCheck', 13, 2.4, 'inline')}</div></div>
<div class="kpi" style="padding-bottom:8px"><div class="k">Founder insight · this week<span class="tag act">Actual</span></div>${iq([
  ['TrendingUp', 'var(--blue-50)', 'var(--primary)', 'What happened', 'Connections rose <b>18% to 312</b>; 41 came from founder activity.'],
  ['Lightbulb', 'var(--apricot-tint)', 'var(--apricot-text)', 'What it means', 'Growth still leans on you: <b>13%</b> needs your posts or invites.'],
  ['UserPlus', 'var(--seafoam-tint)', '#1f5e52', 'What to do next', 'Invite 3 waitlisted creators to post before Friday.']]).replace('class="iq"', 'class="iq" style="margin:4px 0 0;padding:0;box-shadow:none"')}</div>
<div class="kpi"><div class="k">Recent administrative actions<span style="color:var(--primary);font-weight:600">Audit log</span></div>
${[['EyeOff', 'Post hidden · harassment report', 'Moderator · 14:02'], ['UserRoundCheck', 'Referral approved after review', 'Founder · 11:40'], ['SlidersHorizontal', 'Daily registration limit 20 → 25', 'Founder · Mon'], ['Megaphone', 'Campaign approved · Grocery app', 'Founder · Sun']].map(([ic, t, s]) => `<div class="li" style="padding:9px 0"><span class="ic" style="background:var(--blue-50);color:var(--primary);width:34px;height:34px">${icon(ic, 17)}</span><span class="t">${t}<small>${s}</small></span></div>`).join('')}</div></div></main></div>`

const page = (title, body, extra = '') => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>${css}${extra}</style></head><body>${body}</body></html>`

writeFileSync(join(here, 'screens.html'), page('Splitpost Visual Design', `<div class="board">
<section id="mobile-a"><div class="row">
<div><div class="label"><b>Home</b> · Clique first (default face)</div><div id="scr-home">${homeScreen(0)}</div></div>
<div><div class="label"><b>Discover</b> · Relevant</div><div id="scr-discover">${discover}</div></div>
<div><div class="label"><b>Create</b> · one composer</div><div id="scr-create">${create}</div></div>
</div></section>
<section id="mobile-b"><div class="row">
<div><div class="label"><b>My Split</b> · Overview</div><div id="scr-split">${mysplit}</div></div>
<div><div class="label"><b>Profile</b> · as a member sees it</div><div id="scr-profile">${profile}</div></div>
<div><div class="label"><b>Creator insights</b> · Attention (owner only, not shown to members)</div><div id="scr-attention">${attention}</div></div>
<div><div class="label"><b>Creator insights</b> · Money (owner only, not shown to members)</div><div id="scr-money">${money}</div></div>
</div></section>
<section id="mobile-c"><div class="row">
<div><div class="label"><b>Content-associated ad</b> · attached to Kofi's post</div><div id="scr-ad-content">${adContent}</div></div>
<div><div class="label"><b>General feed ad</b> · between two posts in Home</div><div id="scr-ad-feed">${adFeed}</div></div>
<div><div class="label"><b>Why this ad?</b> · bottom sheet</div><div id="scr-why-ad">${whyAd}</div></div>
</div></section>
<section id="mobile-d"><div class="row">
<div><div class="label"><b>Clique catch-up</b> · after tapping Amara in the Clique strip</div><div id="scr-catchup">${catchup}</div></div>
<div><div class="label"><b>Support Intent</b> · from the Support button on a profile</div><div id="scr-support">${support}</div></div>
</div></section>
<section id="icon-compare">${iconCompare}</section>
<section id="desktop-home"><div class="label"><b>Desktop Home</b> · connection only; discovery stays in Discover</div>${deskHome}</section>
<section id="control"><div class="label"><b>Control Center</b> · founder and authorised operators</div>${control}</section>
</div>`))

// ---------- transition demo ----------
const demoCss = `
body{background:#ece7dc;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:22px;min-height:100vh;padding:20px 0}
.track{display:flex;width:300%;height:100%;transition:transform 320ms cubic-bezier(.22,.8,.24,1);will-change:transform}
.track>section{width:33.3333%;height:100%;overflow:hidden}
.viewport{flex:1;overflow:hidden;position:relative;touch-action:pan-y}
.faces span{cursor:pointer;transition:background 220ms,color 220ms}
.dots{display:flex;justify-content:center;gap:6px;margin:-4px 0 8px}.dots i{width:6px;height:6px;border-radius:3px;background:#cfc6b6;transition:all 260ms}.dots i.on{width:18px;background:var(--primary)}
@media (prefers-reduced-motion:reduce){.track,.dots i,.faces span{transition:none}}
.hint{font:600 13px var(--body);color:var(--muted)}`
writeFileSync(join(here, 'transition.html'), page('Splitpost Face Transition', `
<div class="phone" id="demo">${status()}${appbar()}
<div class="faces" role="tablist" aria-label="Home views">${['Clique first', 'My Clique', 'Following'].map((f, i) => `<span role="tab" tabindex="${i ? -1 : 0}" aria-selected="${!i}" data-i="${i}" class="${i ? '' : 'on'}">${f}</span>`).join('')}</div>
<div class="dots" aria-hidden="true"><i class="on"></i><i></i><i></i></div>
<div class="viewport"><div class="track">${[0, 1, 2].map((k) => `<section role="tabpanel" aria-label="Face ${k + 1} of 3">${homeFace(k)}</section>`).join('')}</div></div>${nav('home')}</div>
<div class="hint">Swipe the feed sideways, tap a label, or use the arrow keys</div>
<script>
const track=document.querySelector('.track'),tabs=[...document.querySelectorAll('[role=tab]')],dots=[...document.querySelectorAll('.dots i')],vp=document.querySelector('.viewport');let cur=0;
function go(i){cur=Math.max(0,Math.min(2,i));track.style.transform='translateX('+(-cur*33.3333)+'%)';tabs.forEach((t,j)=>{t.classList.toggle('on',j===cur);t.setAttribute('aria-selected',j===cur);t.tabIndex=j===cur?0:-1});dots.forEach((d,j)=>d.classList.toggle('on',j===cur));history.replaceState(null,'','#face='+cur)}
tabs.forEach(t=>t.onclick=()=>go(+t.dataset.i));
document.addEventListener('keydown',e=>{if(e.key==='ArrowRight')go(cur+1);if(e.key==='ArrowLeft')go(cur-1)});
let sx=0,sy=0,dx=0,drag=false,locked=null;
vp.addEventListener('pointerdown',e=>{if(e.clientX<16||e.clientX>innerWidth-16)return;sx=e.clientX;sy=e.clientY;dx=0;drag=true;locked=null;track.style.transition='none'});
vp.addEventListener('pointermove',e=>{if(!drag)return;dx=e.clientX-sx;const dy=e.clientY-sy;if(locked===null&&(Math.abs(dx)>8||Math.abs(dy)>8))locked=Math.abs(dx)>Math.abs(dy)*1.5;if(!locked)return;const w=vp.offsetWidth;track.style.transform='translateX(calc('+(-cur*33.3333)+'% + '+dx+'px))'});
addEventListener('pointerup',()=>{if(!drag)return;drag=false;track.style.transition='';if(locked&&Math.abs(dx)>48)go(cur+(dx<0?1:-1));else go(cur)});
</script>`, demoCss))

// ---------- landing page evolution ----------
const lcss = `
.site{width:1440px;background:var(--ivory)}
.sh{background:var(--primary);color:#fff;position:relative;overflow:hidden}
.sh:before{content:'';position:absolute;left:52%;top:-200px;width:900px;height:1400px;background:var(--raised);transform:rotate(22deg);opacity:.5}
.sh>*{position:relative}
.hdr{display:flex;justify-content:space-between;align-items:center;padding:14px 168px;border-bottom:1px solid rgba(255,255,255,.12)}
.hdr nav{display:flex;gap:30px;align-items:center;font:600 15px var(--body)}
.hero{display:grid;grid-template-columns:1fr 540px;gap:40px;padding:56px 168px 70px;align-items:center}
.hero h1{font:900 72px/.95 var(--display);font-stretch:108%;letter-spacing:-.025em}
.hero h1 span{color:var(--apricot);display:block}
.sig{display:inline-flex;align-items:center;gap:10px;margin:22px 0 18px;font:850 22px var(--display);font-stretch:108%;color:#fff;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.2);padding:8px 16px 8px 10px;border-radius:999px}
.hero p{font:400 18px/1.6 var(--body);color:var(--muted-dark);max-width:560px}
.hero p b{color:#fff;font-weight:600}
.cta{display:flex;gap:12px;margin:26px 0 16px}
.cta .btn{padding:15px 26px;font-size:16.5px}
.small{font:500 13.5px/1.55 var(--body);color:var(--muted-dark);max-width:600px}
.sec2{padding:90px 168px}
.eyebrow{font:800 12.5px var(--body);letter-spacing:.12em;text-transform:uppercase;color:var(--apricot-text)}
.sec2 h2{font:900 52px/1 var(--display);font-stretch:106%;letter-spacing:-.025em;margin:12px 0 14px;max-width:760px}
.sec2 .lead{font:400 18px/1.6 var(--body);color:var(--muted);max-width:700px}
.shots{display:grid;grid-template-columns:repeat(3,1fr);gap:40px;margin-top:50px}
.shot{text-align:center}
.shot img{width:300px;border-radius:38px;box-shadow:0 0 0 7px #11161c,0 30px 50px -24px rgba(18,37,90,.45)}
.shot h4{font:850 21px var(--display);font-stretch:106%;margin:26px 0 6px}
.shot p{font:400 15px/1.5 var(--body);color:var(--muted);max-width:320px;margin:0 auto}
.paths{display:grid;grid-template-columns:repeat(3,1fr);gap:22px;margin-top:44px}
.path{background:#fff;border-radius:28px;overflow:hidden;box-shadow:0 1px 0 var(--line)}
.path img{width:100%;height:220px;object-fit:cover}
.path .c{padding:22px 24px 26px}
.path h4{font:850 25px var(--display);font-stretch:106%;margin:6px 0 8px}
.path p{font:400 15px/1.55 var(--body);color:var(--muted);min-height:94px}
.disc{background:var(--primary);color:#fff;padding:54px 168px;display:grid;grid-template-columns:1fr 1.4fr;gap:60px}
.disc h3{font:900 34px/1.05 var(--display);font-stretch:106%}
.disc ul{list-style:none;display:grid;grid-template-columns:1fr 1fr;gap:14px 28px}
.disc li{display:flex;gap:10px;font:500 15px/1.5 var(--body);color:var(--muted-dark)}
.disc li svg{color:var(--seafoam);margin-top:2px}
`
const shot = (src, t, d) => `<div class="shot"><img src="previews/${src}.png" alt=""><h4>${t}</h4><p>${d}</p></div>`
writeFileSync(join(here, 'landing.html'), page('Splitpost Landing Evolution', `<div class="site">
<section class="sh"><div class="hdr"><div class="brand">${logo(40)}<span class="wm" style="color:#fff;font-size:25px">splitpost</span></div><nav><span>For creators</span><span>For members</span><span>For advertisers</span><span>Sign In</span><span class="btn" style="padding:11px 20px">Join the Waitlist</span></nav></div>
<div class="hero"><div><h1>You Create The Post.<span>You Deserve a Split.</span></h1>
<div class="sig">${logo(30)}Don't just post. Get your split.</div>
<p>You put in the work. You grow your followers. But the money doesn't always follow.</p>
<p style="margin-top:12px"><b>We're building a social platform where your content can help you earn, and your followers can become a real community.</b></p>
<div class="cta"><span class="btn">Join the Waitlist ${icon('ArrowRight', 18, 2.4)}</span><span class="btn ghost">I have an invitation link</span></div>
<div class="small">A controlled pilot for adults 18+. Join with an invitation or a member's referral link, or join the waitlist. No guaranteed reach, views or earnings. Rewards and earnings are simulated during the pilot.</div></div>
<img src="site-hero-illustration.png" alt="" style="width:540px;-webkit-mask-image:radial-gradient(ellipse 72% 70% at 52% 50%,#000 78%,transparent 100%);mask-image:radial-gradient(ellipse 72% 70% at 52% 50%,#000 78%,transparent 100%)"></div></section>
<section class="sec2"><div class="eyebrow">See Splitpost</div><h2>Your people first. Your contribution counted.</h2>
<p class="lead">Product previews with sample people and numbers.</p>
<div class="shots">${shot('screen-home', 'Your Clique comes first', "Everything you post is available to everyone who follows you, in order. Who watches is always their choice.")}${shot('screen-split', 'See your split', 'Connection Points recognize how you help creators grow. Which points are redemption eligible, and what they are estimated to be worth, is always shown, and always labelled as simulated in the pilot.')}${shot('screen-attention', 'Know what works', 'Creators see who their posts were available to, who actually saw them, and where new followers came from.')}</div></section>
<section class="sec2" style="padding-top:0"><div class="eyebrow">Find your path</div><h2>Three ways to be part of the pilot.</h2>
<div class="paths">
<div class="path"><img src="${M}/landing/photos/creator-editing-1200.webp" alt=""><div class="c"><span class="tag act">Creators</span><h4>Build an audience you can reach</h4><p>Your posts are available to everyone who follows you, and you see 40% of ad revenue from ads shown with your posts. That share is simulated during the pilot.</p><span class="btn blue">Apply as a creator</span></div></div>
<div class="path"><img src="${M}/landing/photos/filmmaker-960.webp" alt="" style="object-position:center 30%"><div class="c"><span class="tag sea">Members</span><h4>Support the creators you value</h4><p>Follow people, choose your Clique, and earn Connection Points for helping them grow. Points have no cash value during the pilot.</p><span class="btn blue">Join the waitlist</span></div></div>
<div class="path"><img src="${M}/landing/photos/metalworker-1200.webp" alt=""><div class="c"><span class="tag clique">Advertisers</span><h4>Reach people who chose the topic</h4><p>Managed test campaigns, shown beside relevant creators and clearly labelled, with a campaign report from the first day.</p><span class="btn line">Talk to us</span></div></div></div></section>
<section class="disc"><h3>What the pilot is, plainly.</h3><ul>
${['Adults 18+ only, through invitations, referral links or the waitlist.', 'Connection Points have no cash value and are not money.', 'Creator earnings, fan rewards and point values are simulated. Nothing is paid out.', 'No guaranteed reach, views or earnings.', 'Posts are available to all followers; reach depends on who chooses to look.', 'Features are still being built and tested.'].map((t) => `<li>${icon('Check', 18, 2.6)}${t}</li>`).join('')}</ul></section></div>`, lcss))

console.log('built screens.html, transition.html and landing.html')
