# Brick → card-list extraction procedure

You read one brick's already-extracted transcript and emit a list of **named entities** (cards) that live inside that brick, each with its own 8 buzzwords.

The orchestrator passes you these variables:
- `brick_id` — numeric id (e.g. `54`)
- `brick_title` — the brick's overall title (e.g. `Renal Stones`)
- `week`, `type` — same as the source brick
- `input` — path to the existing JSON: `data/bricks/<brick_id>.json`. Contains `{transcript, ...}`.
- `output` — path to write: `data/topics/<brick_id>.json` (an **array** of card objects)

## What counts as a card

A card is **one specific named entity** that the brick teaches as a distinct learnable thing. Examples of how granularity should go:

- `Renal Stones` brick → cards for **calcium oxalate**, **struvite**, **uric acid**, **cystine**, **calcium phosphate** stones (each is a named entity).
- `Hereditary Renal Transport Disorders` brick → **Bartter syndrome**, **Gitelman syndrome**, **Liddle syndrome**, **pseudohypoaldosteronism** if mentioned.
- `Renal Imaging` brick → **renal ultrasound**, **noncontrast CT**, **DMSA scan**, **MRI** (each named modality).
- `GFR` brick → **inulin clearance**, **creatinine clearance**, **KDIGO eGFR staging**, **renal plasma flow / PAH**, etc. — break out distinct concepts/methods.
- `Acute Kidney Injury` brick → cards for **prerenal AKI**, **intrinsic AKI**, **postrenal AKI** (the brick's own enumeration), plus any specific named entities like contrast-induced nephropathy if substantively covered.
- `Anatomy of the Urinary System` brick → **kidney gross anatomy**, **ureter anatomy**, **bladder anatomy**, **urethra anatomy** — distinct structures.

If the brick is genuinely atomic (e.g. `Anti-GBM Disease (Goodpasture Syndrome)`, `Minimal Change Disease`, `Polycystic Kidney Disease`, single drug-class bricks), emit **exactly one card** — the brick itself.

**Rule of thumb**: if the brick has section headings, sub-tables, or a list-style enumeration of named conditions/concepts/structures, those are your cards. If it's one continuous narrative about one entity, it's one card.

Don't fan out into trivia — only break out things a learner would want to be able to identify from buzzwords. Aim for **1–6 cards per brick**; rarely more.

## Buzzword rules per card

For each card, write exactly **8 buzzwords**, ordered **vague → giveaway**:
- ≤ 8 words each, punchy.
- The buzzwords must distinguish THIS card from its siblings within the brick. E.g. for calcium oxalate stones, lead with clues that point specifically to calcium oxalate (hypercalciuria, ethylene glycol, envelope crystals) — not generic "renal stone" clues that fit struvite or uric acid equally.
- Last 1–2 buzzwords should be dead-giveaway (pathognomonic feature, eponymous finding, defining mechanism).
- No proper nouns / eponyms in the first 4 buzzwords.

## Output shape

`data/topics/<brick_id>.json` is an **array**:

```json
[
  {
    "id": "<brick_id>-1",
    "title": "Card-specific title (e.g. 'Calcium Oxalate Stones')",
    "brick_id": "<brick_id>",
    "brick_title": "<brick_title>",
    "week": <week>,
    "type": "<type>",
    "buzzwords": ["vague clue", "...", "giveaway"]
  },
  { "id": "<brick_id>-2", ... },
  ...
]
```

Use real `\n`-escaped JSON. Use sequential sub-ids starting from `1`.

## Validation

After writing, validate from `C:\Users\zbenj\card_buzzwordgame`:

```
node -e "const a=JSON.parse(require('fs').readFileSync(process.argv[1])); if(!Array.isArray(a)) throw new Error('expected array'); a.forEach((c,i)=>{ if(c.buzzwords.length!==8) throw new Error('card '+i+' has '+c.buzzwords.length+' buzzwords, expected 8'); if(!c.title||!c.brick_id||!c.type) throw new Error('card '+i+' missing fields'); }); console.log('OK',a.length,'cards'); a.forEach(c=>console.log('  -',c.title));" <output>
```

## Report

Report back:
- Number of cards emitted
- The list of card titles (so the user can spot misses or over-splits)
- 1-sentence justification of how you decided the split
