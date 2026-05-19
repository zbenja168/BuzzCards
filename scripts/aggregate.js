#!/usr/bin/env node
// Aggregate all data/topics/<brick_id>.json arrays into a single flat data/cards.json,
// sorted by brick_id then sub-index.

const fs = require('fs');
const path = require('path');

const topicsDir = path.join(__dirname, '..', 'data', 'topics');
const outPath   = path.join(__dirname, '..', 'data', 'cards.json');

const REQUIRED = ['id','title','brick_id','brick_title','week','type','buzzwords'];
const TYPES    = new Set(['disease','anatomy','physiology','drug','lab','imaging']);

let problems = [];
let cards = [];
let perBrick = {};

for (const file of fs.readdirSync(topicsDir).filter(f => f.endsWith('.json')).sort()) {
  const full = path.join(topicsDir, file);
  let arr;
  try {
    arr = JSON.parse(fs.readFileSync(full, 'utf8'));
  } catch (e) {
    problems.push(`${file}: invalid JSON — ${e.message}`);
    continue;
  }
  if (!Array.isArray(arr)) {
    problems.push(`${file}: expected array, got ${typeof arr}`);
    continue;
  }
  for (const [i, c] of arr.entries()) {
    for (const k of REQUIRED) if (c[k] === undefined) problems.push(`${file}[${i}]: missing field ${k}`);
    if (!TYPES.has(c.type)) problems.push(`${file}[${i}]: unknown type "${c.type}"`);
    if (!Array.isArray(c.buzzwords) || c.buzzwords.length !== 8) {
      problems.push(`${file}[${i}]: expected 8 buzzwords, got ${c.buzzwords?.length}`);
    }
    cards.push(c);
    perBrick[c.brick_id] = (perBrick[c.brick_id] || 0) + 1;
  }
}

cards.sort((a, b) => {
  const ba = Number(a.brick_id), bb = Number(b.brick_id);
  if (ba !== bb) return ba - bb;
  // sub-index from id like "54-3"
  const sa = Number((a.id || '').split('-')[1] || 0);
  const sb = Number((b.id || '').split('-')[1] || 0);
  return sa - sb;
});

console.log(`Aggregated ${cards.length} cards from ${Object.keys(perBrick).length} bricks.`);
if (problems.length) {
  console.log(`\nProblems (${problems.length}):`);
  for (const p of problems) console.log('  - ' + p);
} else {
  console.log('No problems detected.');
}

fs.writeFileSync(outPath, JSON.stringify(cards, null, 2));
console.log(`\nWrote ${outPath} (${fs.statSync(outPath).size} bytes).`);

const byType = {};
for (const c of cards) byType[c.type] = (byType[c.type] || 0) + 1;
console.log('\nBy type:', byType);

// Distribution of cards-per-brick
const counts = Object.values(perBrick).sort((a, b) => a - b);
const avg = counts.reduce((a, b) => a + b, 0) / counts.length;
console.log(`Cards per brick: min=${counts[0]}, median=${counts[Math.floor(counts.length/2)]}, avg=${avg.toFixed(1)}, max=${counts[counts.length-1]}`);

process.exit(problems.length ? 1 : 0);
