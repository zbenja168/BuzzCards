# Brick Buzz

A browser card game where you guess medical topics from buzzword clues — built from ScholarRx renal/urinary brick PDFs.

**Play it:** open `index.html` in a browser, or visit the GitHub Pages URL once deployed.

## How the game works

- You start with a hand of N topic cards drawn from the bricks you've picked.
- One card in your hand is the hidden target. Clues are revealed one at a time, vague → giveaway.
- Each turn: play a card from your hand, or call for another clue.
- **Wrong play**: card stays in hand, miss recorded, next clue forced.
- **Correct play**: card discarded, hand replenished.
- **Clues exhausted**: target revealed, score takes a penalty.
- **Final score** = total buzzwords used + miss penalty. Lower is better.

## Layout

- `weekN_sourcebricks/` — source PDFs (do not modify)
- `data/cards.json` — aggregated card data the game loads at runtime
- `data/bricks/<id>.json` — per-brick extraction (transcript + buzzwords)
- `data/pages/` — rendered PDF page PNGs (gitignored, regenerable)
- `index.html`, `game.js`, `styles.css` — the static site (Tailwind via CDN)
- `scripts/` — extraction + aggregation helpers

## Local development

Just open `index.html` — no build step. For correct relative-path data loading, serve through any static server:

```
node scripts/dev_server.js
# then open http://localhost:3000/
```

## Rebuilding card data from PDFs

```
bash scripts/render_all.sh        # PDFs → PNG pages
# (per-brick extraction is currently done by AI vision in development)
node scripts/aggregate.js         # data/bricks/*.json → data/cards.json
```
