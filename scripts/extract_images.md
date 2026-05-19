# Brick → image-clue extraction procedure

You scan one brick's rendered PDF pages, find figures that would make good **visual clues** for that brick's existing cards, crop them out cleanly, and patch the card's `buzzwords` array to include the image.

The orchestrator passes you these variables:
- `brick_id` — numeric id (e.g. `38`)
- `week` — `1` | `2` | `3` | `4`
- `pages_dir` — `data/pages/week<week>/<brick_id>/` containing `p-01.png ... p-NN.png`
- `topics_path` — `data/topics/<brick_id>.json` (an array of card objects you will MUTATE in place)
- `images_dir` — `data/images/<brick_id>/` (you create this; one subdir per card-id underneath)

## Step 1 — Read the topic file

Read `topics_path`. You get an array of card objects:
```json
[
  { "id": "38-1", "title": "Renal Ultrasound", "buzzwords": ["...", "..."], ... },
  ...
]
```

Note each card's `id` and `title`. These are the candidate "answers" you're trying to find images for.

## Step 2 — Scan the pages

Read every page PNG in `pages_dir` using the Read tool (each comes back as a viewable image). For each page, decide:

**Is there a figure on this page that depicts one of the cards?**

If yes — extract it. **Be inclusive, not picky.** Labels, captions, and embedded text are OK; the player gets to see them and that's fine. The goal is to give every card that has a figure SOME visual content.

### What to include (anything visual)
- Anatomy diagrams (even with "Kidney →" / "Ureter →" labels)
- Histology slides, with or without letter overlays
- Mechanism flowcharts, with or without text boxes
- Imaging panels (US / CT / MRI / X-ray), with or without captions
- IF / EM / gross pathology specimens
- Urine sediment / crystal photomicrographs
- Drug structural formulas
- Graphs / charts (autoregulation curves, dose-response, etc.)
- Tables that are visually distinctive (e.g. urinalysis findings)
- Pathognomonic clinical photos

### What to still skip
- Pages that are pure text / no figure at all
- Title pages, objective slides, MCQ option lists, video placeholders
- Tiny / illegible / low-quality figures where the player genuinely can't see what it is
- The page-level header banner ("Brick Exchange • <brick title>") — don't crop that *as* the image; it's not a figure

## Step 3 — Crop each good figure

For each good figure you identify:

1. Determine the bounding box in source-page pixel coordinates. The source PNGs are rendered at 110 DPI by `pdftoppm`, so a typical page is ~935 wide × ~1210 tall but you should **measure from the actual image** you just read (its size is shown in the viewer). Aim for a tight crop around just the figure — exclude the figure caption / number ("Figure 3"), the page header ("Brick Exchange • ..."), and any surrounding body text.

2. Decide which card this image belongs to. Match the image to the card whose `title` it visually represents.

3. Pick the next available output filename: `data/images/<brick_id>/<card-id>/<n>.png` where `<n>` starts at `1` and increments per card. Example: `data/images/38/38-1/1.png`, `data/images/38/38-1/2.png`.

4. Call the crop helper via Bash:
   ```
   node scripts/crop.js <source_page_path> <output_path> <x> <y> <w> <h>
   ```
   Example:
   ```
   node scripts/crop.js data/pages/week2/38/p-03.png data/images/38/38-1/1.png 220 130 450 380
   ```

5. **Read the output PNG you just wrote** to verify the crop. If the crop has spoiler text inside it (a caption, a label that names the answer), or a body of text bleeding into the image, adjust the bbox and re-run `crop.js`. Re-verify until clean. If you can't get a clean crop, delete the file (`rm <output>`) and skip — DO NOT commit a bad image.

## Step 4 — Patch the topic JSON

After all crops for a card are done, **patch that card's `buzzwords` array** in `topics_path`:

- Replace **1 or 2** text buzzwords with image clues. Image clues are objects: `{ "img": "data/images/<brick_id>/<card-id>/<n>.png" }`.
- Choose which text buzzwords to replace based on what the image visually conveys — if you cropped a hexagonal crystal photo and the buzzwords are `["hexagonal crystals", "COLA wasting", ...]`, replace `"hexagonal crystals"` with the image (the image IS the hexagonal-crystals clue, so don't double up).
- Keep the array length at exactly **8 entries** — substitution, not addition.
- Keep ordering roughly vague→specific (the game shuffles at runtime, but the on-disk order is the canonical reference).
- For cards where you cropped **zero good images**, leave their buzzwords array completely untouched.

Example before:
```json
{
  "id": "54-3",
  "title": "Uric Acid Stones",
  "buzzwords": ["gouty patient", "high purine diet", "tumor lysis", "radiolucent stone",
                "acidic urine", "allopurinol prevents", "rhomboid crystals", "alkalinize urine"]
}
```

After (image was the rhomboid-crystals photomicrograph, replacing that entry):
```json
{
  "id": "54-3",
  "title": "Uric Acid Stones",
  "buzzwords": ["gouty patient", "high purine diet", "tumor lysis", "radiolucent stone",
                "acidic urine", "allopurinol prevents",
                { "img": "data/images/54/54-3/1.png" },
                "alkalinize urine"]
}
```

## Step 5 — Validate + report

After writing the patched topic file, run this validator from the repo root:

```
node -e "const a=JSON.parse(require('fs').readFileSync(process.argv[1])); if(!Array.isArray(a)) throw new Error('expected array'); a.forEach((c,i)=>{ if(c.buzzwords.length!==8) throw new Error('card '+i+' has '+c.buzzwords.length+' buzzwords, expected 8'); c.buzzwords.forEach((b,j)=>{ if(typeof b==='object'){ if(!b.img) throw new Error('card '+i+' clue '+j+' missing img'); if(!require('fs').existsSync(b.img)) throw new Error('card '+i+' clue '+j+' image not found: '+b.img); } else if(typeof b!=='string') throw new Error('card '+i+' clue '+j+' invalid type'); }); }); const imgCount = a.reduce((s,c)=>s+c.buzzwords.filter(b=>typeof b==='object').length,0); console.log('OK',a.length,'cards,',imgCount,'image clues');" <topics_path>
```

Report back:
- Number of pages scanned
- Number of images cropped, broken down per card
- Any cards that had figures you intentionally skipped (and why)
- Number of cards left untouched (no good images found)

Keep the report under 200 words.
