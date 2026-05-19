#!/usr/bin/env node
// Crop a rectangle out of a rendered PDF page PNG.
//
// Usage:
//   node scripts/crop.js <input.png> <output.png> <x> <y> <w> <h> [--resize-max=WIDTH]
//
// Example:
//   node scripts/crop.js data/pages/week2/38/p-03.png data/images/38-1/1.png 220 130 450 380
//
// Coordinates are pixels from the top-left of the source image. The output
// directory is created if it doesn't exist. If --resize-max is given and the
// crop is wider than that, it gets scaled down (keeps aspect ratio) so the
// committed PNGs stay small.

const { Jimp } = require('jimp');
const fs = require('fs');
const path = require('path');

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 6) {
    console.error('Usage: node scripts/crop.js <input.png> <output.png> <x> <y> <w> <h> [--resize-max=WIDTH]');
    process.exit(1);
  }
  const [input, output, xs, ys, ws, hs, ...rest] = args;
  const x = parseInt(xs, 10);
  const y = parseInt(ys, 10);
  const w = parseInt(ws, 10);
  const h = parseInt(hs, 10);
  const resizeArg = rest.find(a => a.startsWith('--resize-max='));
  const resizeMax = resizeArg ? parseInt(resizeArg.split('=')[1], 10) : 600;

  if ([x, y, w, h].some(n => !Number.isFinite(n) || n < 0)) {
    console.error('Invalid bbox:', { x, y, w, h });
    process.exit(1);
  }

  const img = await Jimp.read(input);
  const sw = img.bitmap.width, sh = img.bitmap.height;

  // Clamp to source bounds so a slightly-overshoot bbox doesn't throw.
  const cx = Math.min(Math.max(0, x), sw - 1);
  const cy = Math.min(Math.max(0, y), sh - 1);
  const cw = Math.min(w, sw - cx);
  const ch = Math.min(h, sh - cy);

  let out = img.crop({ x: cx, y: cy, w: cw, h: ch });
  if (resizeMax && cw > resizeMax) {
    const ratio = resizeMax / cw;
    out = out.resize({ w: resizeMax, h: Math.round(ch * ratio) });
  }

  fs.mkdirSync(path.dirname(output), { recursive: true });
  await out.write(output);
  console.log('wrote', output, `(${out.bitmap.width}x${out.bitmap.height} from ${sw}x${sh} @ ${cx},${cy} ${cw}x${ch})`);
}

main().catch(e => { console.error(e); process.exit(1); });
