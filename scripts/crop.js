#!/usr/bin/env node
// Crop a rectangle out of a rendered PDF page and write it (WebP by default).
//
// Usage:
//   node scripts/crop.js <input.png> <output> <x> <y> <w> <h> [--resize-max=WIDTH] [--quality=N]
//
// Example:
//   node scripts/crop.js data/pages/boom/5/p-03.png data/boom/images/boom-5-2/1.webp 220 130 450 380
//
// Coordinates are pixels from the top-left of the source. The output directory
// is created if missing. The output format is inferred from the output file's
// extension (use .webp to keep committed images small; .png also works). If
// --resize-max is given and the crop is wider, it's scaled down (aspect kept).

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 6) {
    console.error('Usage: node scripts/crop.js <input> <output> <x> <y> <w> <h> [--resize-max=WIDTH] [--quality=N]');
    process.exit(1);
  }
  const [input, output, xs, ys, ws, hs, ...rest] = args;
  let x = parseInt(xs, 10), y = parseInt(ys, 10), w = parseInt(ws, 10), h = parseInt(hs, 10);
  const resizeArg = rest.find(a => a.startsWith('--resize-max='));
  const qualArg   = rest.find(a => a.startsWith('--quality='));
  const resizeMax = resizeArg ? parseInt(resizeArg.split('=')[1], 10) : 600;
  const quality   = qualArg ? parseInt(qualArg.split('=')[1], 10) : 80;

  if ([x, y, w, h].some(n => !Number.isFinite(n) || n < 0)) {
    console.error('Invalid bbox:', { x, y, w, h });
    process.exit(1);
  }

  const meta = await sharp(input).metadata();
  // Clamp to source bounds so a slight overshoot doesn't throw.
  x = Math.min(Math.max(0, x), meta.width - 1);
  y = Math.min(Math.max(0, y), meta.height - 1);
  w = Math.min(w, meta.width - x);
  h = Math.min(h, meta.height - y);

  let pipe = sharp(input).extract({ left: x, top: y, width: w, height: h });
  if (resizeMax && w > resizeMax) pipe = pipe.resize({ width: resizeMax });

  const ext = path.extname(output).toLowerCase();
  if (ext === '.webp') pipe = pipe.webp({ quality });
  else if (ext === '.png') pipe = pipe.png();
  else if (ext === '.jpg' || ext === '.jpeg') pipe = pipe.jpeg({ quality });

  fs.mkdirSync(path.dirname(output), { recursive: true });
  const info = await pipe.toFile(output);
  console.log('wrote', output, `(${info.width}x${info.height}, ${info.size} bytes, from ${meta.width}x${meta.height} @ ${x},${y} ${w}x${h})`);
}

main().catch(e => { console.error(e); process.exit(1); });
