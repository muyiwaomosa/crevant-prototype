// EXPERIMENT ONLY (SP-VID-001). Not application code. Dependency-free MP4/MOV header sniffer used in the video feasibility tests.
// Minimal ISO BMFF (MP4/MOV) sniffer: finds moov (start or end), reads mvhd duration,
// first video track's stsd codec fourcc and tkhd size. Reads only small byte ranges.
async function sniffVideo(readRange, size) {
  const u32 = (b, o) => (b[o] << 24 >>> 0) + (b[o+1] << 16) + (b[o+2] << 8) + b[o+3];
  const str = (b, o) => String.fromCharCode(b[o], b[o+1], b[o+2], b[o+3]);
  let off = 0, moov = null, brand = null;
  while (off + 8 <= size) {
    const h = await readRange(off, 16);
    let len = u32(h, 0); const type = str(h, 4);
    if (len === 1) len = Number((BigInt(u32(h, 8)) << 32n) + BigInt(u32(h, 12)));
    if (len === 0) len = size - off;
    if (type === 'ftyp') { const f = await readRange(off, Math.min(len, 64)); brand = str(f, 8); }
    if (type === 'moov') { if (len > 8 * 1024 * 1024) return { ok: false, reason: 'moov_too_large' }; moov = await readRange(off, len); break; }
    if (len < 8) return { ok: false, reason: 'not_mp4' };
    off += len;
  }
  if (!moov) return { ok: false, reason: 'no_moov', brand };
  const out = { ok: true, brand, tracks: [] };
  const walk = (b, s, e, path) => {
    let o = s;
    while (o + 8 <= e) {
      const len = u32(b, o), t = str(b, o + 4); if (len < 8) break;
      const p = path + '/' + t;
      if (t === 'mvhd') { const v = b[o+8]; out.timescale = v ? u32(b, o+28) : u32(b, o+20); out.duration = v ? u32(b, o+32)*2**32 + u32(b, o+36) : u32(b, o+24); }
      if (t === 'trak') out.tracks.push({});
      const tr = out.tracks[out.tracks.length - 1];
      if (t === 'tkhd' && tr) { const v = b[o+8]; const base = o + (v ? 96 : 84); tr.width = u32(b, base) >>> 16; tr.height = u32(b, base+4) >>> 16; }
      if (t === 'hdlr' && tr && path.endsWith('/mdia')) tr.handler = str(b, o + 16);
      if (t === 'stsd' && tr) tr.codec = str(b, o + 20);
      if (['moov','trak','mdia','minf','stbl'].includes(t)) walk(b, o + 8, o + len, p);
      o += len;
    }
  };
  walk(moov, 8, moov.length, 'moov');
  out.seconds = out.duration / out.timescale;
  out.video = out.tracks.find(t => t.handler === 'vide');
  out.audio = out.tracks.find(t => t.handler === 'soun');
  return out;
}
if (typeof module !== 'undefined') module.exports = { sniffVideo };
