// Draws the app icons (a white key on blue) as PNGs for the installable owner dashboard (PWA).
// Run once after changing the design: node scripts/generate-icons.mjs
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'apps', 'web', 'public');
const BLUE = [29, 78, 216];
const WHITE = [255, 255, 255];

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** Pixel colour at (x, y) in a unit square (0..1). `inset` shrinks the key (maskable icons). */
function colour(x, y, inset) {
  const s = (v) => (v - 0.5) / (1 - 2 * inset) + 0.5;
  const u = s(x);
  const v = s(y);
  const ring = Math.hypot(u - 0.33, v - 0.5);
  if (ring < 0.17 && ring > 0.08) return WHITE; // the key's bow
  if (u > 0.47 && u < 0.85 && v > 0.46 && v < 0.54) return WHITE; // the shaft
  if (u > 0.7 && u < 0.76 && v >= 0.54 && v < 0.66) return WHITE; // teeth
  if (u > 0.8 && u < 0.85 && v >= 0.54 && v < 0.62) return WHITE;
  return BLUE;
}

function png(size, inset) {
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x += 1) {
      const [r, g, b] = colour((x + 0.5) / size, (y + 0.5) / size, inset);
      const i = y * (size * 3 + 1) + 1 + x * 3;
      raw[i] = r;
      raw[i + 1] = g;
      raw[i + 2] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const [name, size, inset] of [
  ['icon-192.png', 192, 0],
  ['icon-512.png', 512, 0],
  ['icon-maskable-512.png', 512, 0.1],
  ['apple-touch-icon.png', 180, 0.05],
]) {
  writeFileSync(join(out, name), png(size, inset));
  console.log(`wrote ${name}`);
}
