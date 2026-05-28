# Course brick → image-clue extraction (multi-course, WebP)

You scan one brick's rendered PDF pages, find figures that depict the brick's cards, crop them as WebP, and patch the card's `buzzwords` to include the image. Course-namespaced output.

The orchestrator passes you:
- `course` — course slug (e.g. `boom`)
- `brick_id` — numeric id (e.g. `5`)
- `pages_dir` — `data/pages/<course>/<brick_id>/` (`p-01.png ...`)
- `topics_path` — `data/<course>/topics/<brick_id>.json` (array of cards you MUTATE in place)
- `images_dir` — `data/<course>/images/` (you create subdirs under it)

## Step 1 — Read the topic file
Read `topics_path`. Note each card's `id` (e.g. `boom-5-2`) and `title`. These are the candidate answers.

## Step 2 — Scan the pages
Read every page PNG in `pages_dir`. For each page decide: **is there a figure that depicts one of the cards?** If yes, extract it. **Be INCLUSIVE, not picky** — labels, captions, and embedded text are fine; the player gets to see them.

### Include (anything visual that depicts a card)
- Pathway / mechanism diagrams (glycolysis, ETC, urea cycle, signaling cascades, etc.)
- Histology / EM / IF, gross pathology, clinical photos
- Karyotypes, pedigrees, gel/blot images, electrophoresis
- Structural formulas, graphs/curves (Michaelis-Menten, O2-Hb, etc.)
- Tables that are visually distinctive of a single card

### Still skip
- Pure-text pages, title pages, MCQ option lists, "Listen to this Brick" widgets, learning-objective lists
- Tiny/illegible figures
- A single figure that depicts MANY cards at once (a whole-course summary) — it would spoil several cards; skip it
- The page-level header banner

## Step 3 — Crop each good figure (WebP)
For each figure:
1. Determine the bbox in source-page pixels (measure from the page you read; pages are ~935×1210). Crop tight around the figure; exclude the figure caption/number, the page header, and surrounding body text.
2. Match it to the card whose `title` it depicts.
3. Output filename: `data/<course>/images/<card-id>/<n>.webp` (n from 1, per card). Example: `data/boom/images/boom-5-2/1.webp`.
4. Run:
   ```
   node scripts/crop.js <source_page_path> <output_path> <x> <y> <w> <h>
   ```
   crop.js writes WebP automatically from the `.webp` extension.
5. **Read the output `.webp` to verify** the crop is clean and on-topic. If a caption that names the answer bled in, tighten the bbox and re-run. If you can't get a usable crop, delete it (`rm <output>`) and skip.

Cap at **1–2 images per card** — pick the most depictive.

## Step 4 — Patch the topic JSON
For each card you cropped images for, replace **1–2** text buzzwords with image objects `{ "img": "data/<course>/images/<card-id>/<n>.webp" }`. Replace the buzzword the image visually conveys (don't duplicate it). Keep each array at exactly **8 entries**. Cards with no good figure: leave untouched.

## Step 5 — Validate + report
```
node -e "const a=JSON.parse(require('fs').readFileSync(process.argv[1])); a.forEach((c,i)=>{ if(c.buzzwords.length!==8)throw new Error('card '+i+' len '+c.buzzwords.length); c.buzzwords.forEach((b,j)=>{ if(typeof b==='object'){ if(!b.img)throw new Error('card '+i+' clue '+j+' no img'); if(!require('fs').existsSync(b.img))throw new Error('missing '+b.img);} }); }); const n=a.reduce((s,c)=>s+c.buzzwords.filter(b=>typeof b==='object').length,0); console.log('OK',a.length,'cards,',n,'image clues');" <topics_path>
```
Report: pages scanned, images cropped per card, cards skipped. Under 150 words.
