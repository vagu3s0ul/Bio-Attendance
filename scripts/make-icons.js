/**
 * Generates the app icon / adaptive icon / splash / favicon PNGs.
 * Dependency-free: hand-rolled PNG encoder (zlib + CRC32).
 *
 * Brand (SPSC Essence): light #FAFAFA canvas, #2D6CDF rounded badge with a
 * white check mark — matches the login card's wordmark badge.
 *
 * Usage: node scripts/make-icons.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

/* ----------------------------- PNG encoder ------------------------------ */

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePNG(width, height, pixelAt) {
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    const rowStart = y * (1 + width * 4);
    raw[rowStart] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = pixelAt(x, y);
      const o = rowStart + 1 + x * 4;
      raw[o] = r;
      raw[o + 1] = g;
      raw[o + 2] = b;
      raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ------------------------------ Drawing --------------------------------- */

const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

const PRIMARY = [45, 108, 223]; // #2D6CDF
const WHITE = [255, 255, 255];
const CANVAS = [250, 250, 250]; // #FAFAFA

function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
  t = clamp01(t);
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Signed-ish distance to the check mark polyline (normalized coords). */
function checkDistance(px, py) {
  return Math.min(
    distToSegment(px, py, 0.3, 0.54, 0.43, 0.66),
    distToSegment(px, py, 0.43, 0.66, 0.72, 0.34)
  );
}

/** Signed distance from the rounded-rect edge (positive inside). */
function roundedRectEdge(ux, uy, radius) {
  const cx = Math.min(Math.max(ux, radius), 1 - radius);
  const cy = Math.min(Math.max(uy, radius), 1 - radius);
  return radius - Math.hypot(ux - cx, uy - cy);
}

/**
 * Pixel sampler with 2x2 supersampling.
 * opts:
 *   canvas: { r,g,b } solid background (omit → transparent)
 *   badge:  { mode: 'rect'|'circle', radius } drawn in PRIMARY (omit → none)
 *   check:  { scale, stroke } white check mark
 */
function makeRenderer(size, opts = {}) {
  const canvas = opts.canvas || null;
  const badge = opts.badge || null;
  const stroke = opts.check?.stroke ?? 0.037;
  const scale = opts.check?.scale ?? 1;
  const SS = 2;

  return (x, y) => {
    let r = 0,
      g = 0,
      b = 0,
      a = 0;
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        const px = (x + (sx + 0.5) / SS) / size;
        const py = (y + (sy + 0.5) / SS) / size;

        let cr, cg, cb, ca;
        if (canvas) {
          cr = canvas.r;
          cg = canvas.g;
          cb = canvas.b;
          ca = 1;
        } else {
          cr = cg = cb = 0;
          ca = 0;
        }

        if (badge) {
          const inside =
            badge.mode === 'circle'
              ? badge.radius - Math.hypot(px - 0.5, py - 0.5)
              : roundedRectEdge(px, py, badge.radius);
          const amt = clamp01((inside * size) / 1.5);
          if (amt > 0) {
            cr = lerp(cr, PRIMARY[0], amt);
            cg = lerp(cg, PRIMARY[1], amt);
            cb = lerp(cb, PRIMARY[2], amt);
            ca = Math.max(ca, amt);
          }
        }

        const ux = (px - 0.5) / scale + 0.5;
        const uy = (py - 0.5) / scale + 0.5;
        const d = checkDistance(ux, uy);
        const sd = (stroke - d) * size;
        if (sd > 0) {
          const amt = clamp01(sd / 1.5);
          cr = lerp(cr, WHITE[0], amt);
          cg = lerp(cg, WHITE[1], amt);
          cb = lerp(cb, WHITE[2], amt);
          ca = Math.max(ca, amt);
        }

        r += cr;
        g += cg;
        b += cb;
        a += ca;
      }
    }
    const n = SS * SS;
    return [
      Math.round(clamp01(r / n) * 255),
      Math.round(clamp01(g / n) * 255),
      Math.round(clamp01(b / n) * 255),
      Math.round(clamp01(a / n) * 255),
    ];
  };
}

/* ------------------------------ Outputs --------------------------------- */

const outDir = path.join(__dirname, '..', 'assets');
fs.mkdirSync(outDir, { recursive: true });

function write(name, width, height, opts) {
  const buf = encodePNG(width, height, makeRenderer(width, opts));
  fs.writeFileSync(path.join(outDir, name), buf);
  console.log(`✓ ${name} (${width}x${height}, ${(buf.length / 1024).toFixed(1)} KB)`);
}

write('icon.png', 1024, 1024, {
  canvas: CANVAS,
  badge: { mode: 'rect', radius: 0.22 },
  check: { stroke: 0.042 },
});
write('adaptive-icon.png', 1024, 1024, {
  badge: { mode: 'circle', radius: 0.36 },
  check: { stroke: 0.05, scale: 1.15 },
});
write('splash.png', 1284, 2778, {
  canvas: CANVAS,
  badge: { mode: 'circle', radius: 0.16 },
  check: { stroke: 0.035, scale: 1.15 },
});
write('favicon.png', 64, 64, {
  canvas: CANVAS,
  badge: { mode: 'rect', radius: 0.22 },
  check: { stroke: 0.042 },
});

console.log('Done.');
