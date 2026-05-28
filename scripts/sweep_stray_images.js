#!/usr/bin/env node
// Delete image files under data/<course>/images that are not referenced by any
// buzzword in data/<course>/topics. Usage: node scripts/sweep_stray_images.js <course>
const fs = require('fs'), path = require('path');
const course = process.argv[2];
if (!course) { console.error('usage: node scripts/sweep_stray_images.js <course>'); process.exit(1); }
const norm = p => p.split(path.sep).join('/');
const tdir = path.join('data', course, 'topics');
const idir = path.join('data', course, 'images');
const ref = new Set();
for (const f of fs.readdirSync(tdir).filter(f => f.endsWith('.json'))) {
  const arr = JSON.parse(fs.readFileSync(path.join(tdir, f), 'utf8'));
  for (const c of arr) for (const b of c.buzzwords)
    if (b && typeof b === 'object' && b.img) ref.add(norm(b.img));
}
const all = [];
(function walk(p) {
  if (!fs.existsSync(p)) return;
  for (const e of fs.readdirSync(p)) {
    const fp = path.join(p, e);
    fs.statSync(fp).isDirectory() ? walk(fp) : all.push(norm(fp));
  }
})(idir);
const stray = all.filter(f => !ref.has(f));
console.log('referenced:', ref.size, '| on disk:', all.length, '| stray:', stray.length);
for (const s of stray) { fs.unlinkSync(s); console.log('  rm', s); }
// prune empty dirs
(function prune(p) {
  if (!fs.existsSync(p)) return;
  for (const e of fs.readdirSync(p)) { const fp = path.join(p, e); if (fs.statSync(fp).isDirectory()) prune(fp); }
  if (p !== idir && fs.readdirSync(p).length === 0) { fs.rmdirSync(p); console.log('  rmdir', norm(p)); }
})(idir);
console.log('sweep done');
