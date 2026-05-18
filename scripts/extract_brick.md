# Brick extraction procedure

You are extracting one ScholarRx "Brick Exchange" study document into structured JSON for a buzzword card game. The orchestrator passes you these variables:

- `id` — numeric brick id (e.g. `47`)
- `title` — full topic title (e.g. `Anti-GBM Disease (Goodpasture Syndrome)`)
- `week` — 1–4
- `type` — one of: `disease | anatomy | physiology | drug | lab | imaging`
- `pages` — number of rendered page PNGs
- `page_dir` — relative dir containing `p-01.png` … `p-NN.png`
- `output` — JSON file to write (e.g. `data/bricks/47.json`)

## Steps

1. **Read every page image in order** with the Read tool (`<page_dir>/p-01.png` … `p-{pages:02d}.png`). Skim each, transcribe what's readable.
2. **Ignore artifacts**: page headers/footers ("Brick Exchange •…", timestamps, URL footers, page numbers), the orange "Listen to this Brick" widget on page 1, and any inverted/mirrored text on later pages (web-to-PDF print artifacts — skip those regions).
3. **Compose a clean markdown transcript** of the educational content. Keep section headings (Pathophysiology, Clinical Features, Diagnosis, Treatment, Summary, etc.), bullet lists, and tables. It does not have to be word-perfect — usable as a study transcript.
4. **Author exactly 8 buzzwords** ordered **strictly vague → specific (last is the giveaway)**:
   - ≤ 8 words each, punchy
   - No proper nouns / eponyms in the first 4
   - Mix of demographics, symptoms, labs, biopsy/imaging, mechanism, pathognomonic feature
   - **Order monotonically** — every later clue should narrow the field at least as much as the previous one. Don't put a generic clue (e.g. "crescentic GN on biopsy") after a specific one (e.g. "antibodies against alpha-3 of type IV collagen").
   - For non-disease bricks (anatomy, physiology, drug, lab, imaging): treat the topic as the "answer" and write clues identifying it. Vague clues hint at general domain; final clues use the topic's defining mechanism/feature/term.

## Output

Write exactly this shape to `output` (valid JSON, real `\n` newlines in `transcript`):

```json
{
  "id": "<id>",
  "title": "<title>",
  "week": <week>,
  "type": "<type>",
  "source": "week<week>_sourcebricks/<id>.pdf",
  "pages": <pages>,
  "buzzwords": [
    "vaguest clue",
    "...",
    "dead-giveaway clue"
  ],
  "transcript": "# <title>\n\n## Section\n\n..."
}
```

## Validation

After writing, run from `C:\Users\zbenj\card_buzzwordgame`:

```
node -e "const j=JSON.parse(require('fs').readFileSync(process.argv[1])); if(j.buzzwords.length!==8) throw new Error('need 8 buzzwords, got '+j.buzzwords.length); console.log('OK',j.id,j.buzzwords.length,'buzzwords,',j.transcript.length,'chars')" <output>
```

Report: confirm validated, paste the 8 buzzwords, 1-sentence transcript quality note.
