// Generate build/stop.png + build/stop.ico — a "stop" icon styled to match the app's glossy
// glass brain logo (build/icon.png): same light frosted-glass rounded tile, but the subject is a
// glossy RED octagonal stop sign (white-rimmed) instead of the blue brain. Used by stop.bat's
// desktop shortcut. Pure Node (no native deps for the drawing) + png-to-ico for the .ico.
// Run: `node build/make-stop-icon.mjs`.
import zlib from 'node:zlib'
import { writeFileSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import pngToIco from 'png-to-ico'

const here = dirname(fileURLToPath(import.meta.url))
const S = 512 // output resolution (square); png-to-ico downsizes to 256/48/32/16
const SS = 4 // supersampling factor per axis → anti-aliasing

// ---- geometry / colour helpers ------------------------------------------------------------------
const SQRT2 = Math.SQRT2
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x)
const lerp = (a, b, t) => a + (b - a) * t
const mix = (c1, c2, t) => [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)]

// signed distance to a rounded rectangle (negative inside). Coords in [0,1].
function sdRoundRect(px, py, cx, cy, hw, hh, r) {
  const qx = Math.abs(px - cx) - (hw - r)
  const qy = Math.abs(py - cy) - (hh - r)
  const ax = Math.max(qx, 0), ay = Math.max(qy, 0)
  return Math.hypot(ax, ay) + Math.min(Math.max(qx, qy), 0) - r
}
// inside a regular, flat-topped octagon of half-width `a` centred at (0.5,0.5)?
function inOct(px, py, a) {
  const x = Math.abs(px - 0.5), y = Math.abs(py - 0.5)
  return x <= a && y <= a && x + y <= a * SQRT2
}

// tile + octagon parameters
const M = 0.055 // tile margin
const HW = (1 - 2 * M) / 2 // tile half-size
const RR = 0.22 * (1 - 2 * M) // tile corner radius
const GLASS_TOP = [0.94, 0.965, 1.0]
const GLASS_BOT = [0.82, 0.87, 0.94]
const OCT_A = 0.252 // octagon half-width
const OCT_A_IN = OCT_A - 0.02 // inner edge → leaves a white rim
const RED_TOP = [1.0, 0.43, 0.38]
const RED_BOT = [0.74, 0.06, 0.06]

// "over" compositing accumulator
function makeAcc() { return { r: 0, g: 0, b: 0, a: 0 } }
function over(acc, sr, sg, sb, sa) {
  if (sa <= 0) return
  const na = sa + acc.a * (1 - sa)
  if (na <= 0) return
  acc.r = (sr * sa + acc.r * acc.a * (1 - sa)) / na
  acc.g = (sg * sa + acc.g * acc.a * (1 - sa)) / na
  acc.b = (sb * sa + acc.b * acc.a * (1 - sa)) / na
  acc.a = na
}

// colour of a single (sub)sample at normalized (x,y)
function sample(x, y) {
  const acc = makeAcc()

  // 1) soft drop shadow (slightly below the tile) for depth
  const sd = sdRoundRect(x, y - 0.012, 0.5, 0.5, HW, HW, RR)
  if (sd > 0) over(acc, 0, 0, 0, clamp01(1 - sd / 0.055) * 0.22)

  // 2) glass tile
  const d = sdRoundRect(x, y, 0.5, 0.5, HW, HW, RR)
  if (d < 0) {
    const v = clamp01((y - M) / (1 - 2 * M)) // 0 top → 1 bottom
    const g = mix(GLASS_TOP, GLASS_BOT, v)
    over(acc, g[0], g[1], g[2], 1)
    // top sheen (glossy glass)
    over(acc, 1, 1, 1, clamp01((0.6 - v) * 1.05) * 0.45)
    // inner white border, just inside the edge
    if (d > -0.014) over(acc, 1, 1, 1, 0.7)
  }

  // 3) red octagon (stop sign) with white rim
  if (inOct(x, y, OCT_A)) {
    const vo = clamp01((y - (0.5 - OCT_A)) / (2 * OCT_A))
    if (inOct(x, y, OCT_A_IN)) {
      const red = mix(RED_TOP, RED_BOT, vo)
      over(acc, red[0], red[1], red[2], 1)
      // glossy highlight on the upper half of the sign
      over(acc, 1, 1, 1, clamp01((0.42 - vo) * 1.5) * 0.4)
    } else {
      over(acc, 1, 1, 1, 0.95) // white rim
    }
  }

  return acc
}

// ---- render (supersampled) ----------------------------------------------------------------------
const px = Buffer.alloc(S * S * 4)
for (let j = 0; j < S; j++) {
  for (let i = 0; i < S; i++) {
    let r = 0, g = 0, b = 0, a = 0
    for (let sj = 0; sj < SS; sj++) {
      for (let si = 0; si < SS; si++) {
        const x = (i + (si + 0.5) / SS) / S
        const y = (j + (sj + 0.5) / SS) / S
        const c = sample(x, y)
        r += c.r * c.a; g += c.g * c.a; b += c.b * c.a; a += c.a
      }
    }
    const n = SS * SS
    const o = (j * S + i) * 4
    const aa = a / n
    // un-premultiply for straight-alpha PNG
    px[o] = Math.round(aa > 0 ? clamp01(r / a) * 255 : 0)
    px[o + 1] = Math.round(aa > 0 ? clamp01(g / a) * 255 : 0)
    px[o + 2] = Math.round(aa > 0 ? clamp01(b / a) * 255 : 0)
    px[o + 3] = Math.round(aa * 255)
  }
}

// ---- encode PNG (RGBA, 8-bit) -------------------------------------------------------------------
const crcTable = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0 }
  return t
})()
function crc32(buf) { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0)
  const t = Buffer.from(type, 'latin1')
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0)
  return Buffer.concat([len, t, data, crc])
}
const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(S, 0); ihdr.writeUInt32BE(S, 4); ihdr[8] = 8; ihdr[9] = 6
const raw = Buffer.alloc(S * (S * 4 + 1))
for (let j = 0; j < S; j++) {
  raw[j * (S * 4 + 1)] = 0 // filter: none
  px.copy(raw, j * (S * 4 + 1) + 1, j * S * 4, (j + 1) * S * 4)
}
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0))
])

const pngPath = join(here, 'stop.png')
const icoPath = join(here, 'stop.ico')
writeFileSync(pngPath, png)
const ico = await pngToIco(readFileSync(pngPath))
writeFileSync(icoPath, ico)
console.log(`wrote ${pngPath} (${png.length} bytes) and ${icoPath} (${ico.length} bytes)`)
