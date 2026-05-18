#!/usr/bin/env node
// Aggregate all data/bricks/*.json into a single data/cards.json (sorted by numeric id).
// Validates each brick has the expected fields and 8 buzzwords.

const fs = require('fs');
const path = require('path');

const bricksDir = path.join(__dirname, '..', 'data', 'bricks');
const outPath   = path.join(__dirname, '..', 'data', 'cards.json');

const REQUIRED = ['id','title','week','type','source','pages','buzzwords','transcript'];
const TYPES    = new Set(['disease','anatomy','physiology','drug','lab','imaging']);

let problems = [];
let cards = [];

for (const file of fs.readdirSync(bricksDir).filter(f => f.endsWith('.json')).sort()) {
  const full = path.join(bricksDir, file);
  let j;
  try {
    j = JSON.parse(fs.readFileSync(full, 'utf8'));
  } catch (e) {
    problems.push(`${file}: invalid JSON — ${e.message}`);
    continue;
  }
  for (const k of REQUIRED) if (j[k] === undefined) problems.push(`${file}: missing field ${k}`);
  if (!TYPES.has(j.type)) problems.push(`${file}: unknown type "${j.type}"`);
  if (!Array.isArray(j.buzzwords) || j.buzzwords.length !== 8) {
    problems.push(`${file}: expected 8 buzzwords, got ${j.buzzwords?.length}`);
  }
  if (typeof j.transcript !== 'string' || j.transcript.length < 100) {
    problems.push(`${file}: transcript too short (${j.transcript?.length} chars)`);
  }
  cards.push(j);
}

cards.sort((a, b) => Number(a.id) - Number(b.id));

console.log(`Aggregated ${cards.length} bricks.`);
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

process.exit(problems.length ? 1 : 0);
