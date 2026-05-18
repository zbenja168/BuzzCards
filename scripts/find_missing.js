#!/usr/bin/env node
// Print which brick ids (1..65) are missing or have invalid JSON in data/bricks/.
const fs = require('fs');
const path = require('path');
const bricksDir = path.join(__dirname, '..', 'data', 'bricks');

const have = new Set();
for (const f of fs.readdirSync(bricksDir)) {
  const m = f.match(/^(\d+)\.json$/);
  if (!m) continue;
  try {
    const j = JSON.parse(fs.readFileSync(path.join(bricksDir, f), 'utf8'));
    if (Array.isArray(j.buzzwords) && j.buzzwords.length === 8 && j.transcript && j.transcript.length > 100) {
      have.add(Number(m[1]));
    }
  } catch (e) { /* invalid, treat as missing */ }
}

const missing = [];
for (let id = 1; id <= 65; id++) if (!have.has(id)) missing.push(id);

console.log(`Have ${have.size} valid bricks. Missing ${missing.length}:`);
console.log(missing.join(','));
