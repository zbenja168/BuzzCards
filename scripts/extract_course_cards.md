# Course brick → cards extraction (combined, multi-course)

You read one brick's rendered PDF pages directly and emit a list of **named-entity cards**, each with 8 punchy buzzwords. This combines the old transcribe + card-authoring steps into one pass and writes course-namespaced output.

The orchestrator passes you:
- `course` — short course slug (e.g. `boom`)
- `brick_id` — numeric id within the course (e.g. `1`)
- `pages_dir` — `data/pages/<course>/<brick_id>/` containing `p-01.png ...`
- `output` — path to write: `data/<course>/topics/<brick_id>.json` (an **array**). Create parent dirs as needed. **Overwrite** any existing file.

## Step 1 — Read the pages

Read every page PNG in `pages_dir` with the Read tool (each renders as a viewable image). The first page has the brick title + learning objectives; that title is the `brick_title`. Ignore page headers/footers, "Listen to this Brick" widgets, MCQ option lists, and any inverted/mirrored print artifacts.

## Step 2 — Split into cards

A card is **one specific named entity** the brick teaches as a distinct learnable thing (a pathway, enzyme, intermediate, disorder, molecule, structure, etc.).

- If the brick enumerates several named concepts (section headings, sub-tables, lists), each is a card. Aim for **1–6 cards**, rarely more.
- If the brick is genuinely atomic (one focused topic), emit **exactly one card** — the brick itself.

## CARD TITLES — short and plain
- **≤4 words**, natural name of the entity, no textbook-section phrasing, no redundant parentheticals.

## TYPE — tag each card one of:
`disease | anatomy | physiology | drug | lab | imaging`
(For a metabolism/biochem course most cards are `physiology`; metabolic disorders are `disease`; drugs/inhibitors are `drug`.)

## BUZZWORDS — punchy clinical/biochemical pearls
This is the most important rule. Buzzwords should sound like **flashcard snippets a student mutters**, not textbook sentences.
- **Target 1–3 words. Max 6 words.** 8 per card.
- One idea per buzzword. No conjunctions stitching multiple ideas.
- They must **distinguish this card from its siblings** in the brick.
- Order roughly **vague → specific** (early ones could fit many topics; final 1–2 are dead giveaways / the eponym or pathognomonic detail). The game shuffles at runtime, so each must also stand alone.
- No proper nouns / eponyms in the early buzzwords; save them for the last 1–2.
- **No teaching analogies or metaphors as buzzwords.** If the brick explains something via analogy (e.g. "the spillway turbine", "dam-and-lake", "cellular power plant"), translate it to the underlying fact ("proton-driven rotary enzyme", "electrochemical gradient", "makes most cellular ATP"). Buzzwords are factual pearls, not mnemonics.

Bad → Good examples:
| Bad (too long/explanatory) | Good (punchy) |
|---|---|
| `Rate-limiting enzyme of glycolysis regulated by AMP` | `rate-limiting step` |
| `Catalyzes fructose-6-P to fructose-1,6-bisphosphate` | `PFK-1` |
| `Accumulation of branched-chain keto acids` | `maple syrup urine` |
| `Deficiency causes lactic acidosis in infants` | `infantile lactic acidosis` |

## Output shape

`data/<course>/topics/<brick_id>.json` is an **array**:
```json
[
  {
    "id": "<course>-<brick_id>-1",
    "title": "Card title",
    "course": "<course>",
    "brick_id": "<brick_id>",
    "brick_title": "<brick title from page 1>",
    "type": "<type>",
    "buzzwords": ["punchy", "...", "8 total"]
  },
  { "id": "<course>-<brick_id>-2", ... }
]
```
Use sequential sub-ids from `1`. Real `\n`-free JSON values.

## Validate

From repo root:
```
node -e "const a=JSON.parse(require('fs').readFileSync(process.argv[1])); if(!Array.isArray(a))throw new Error('not array'); a.forEach((c,i)=>{ if(c.buzzwords.length!==8)throw new Error('card '+i+' has '+c.buzzwords.length+' buzzwords'); ['id','title','course','brick_id','type'].forEach(k=>{if(!c[k])throw new Error('card '+i+' missing '+k)}); const long=c.buzzwords.filter(b=>String(b).split(/\\s+/).length>6); if(long.length>2)throw new Error('card '+i+' too many long buzzwords: '+long.join(' | ')); }); console.log('OK',a.length,'cards'); a.forEach(c=>console.log('  -',c.type,'·',c.title));" <output>
```

## Report
Card count, titles, and one sentence on how the split went. Under 150 words.
