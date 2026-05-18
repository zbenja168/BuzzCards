# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

A browser-based card game built from medical study materials (ScholarRx "Brick Exchange" PDFs on the renal/urinary system). Hosted on GitHub Pages — pure static site, no backend, no build step.

**The game**: player has a hand of topic cards. Each round, one card in the hand is the hidden target. Buzzword clues are revealed one at a time (vague → specific). Player guesses by playing a card from hand. Wrong guess: card stays in hand, miss recorded, next buzzword forced. Correct: card discarded, hand replenished from deck. Buzzwords exhausted: target revealed, score penalty. Goal: lowest total buzzwords + miss penalty.

## Repo layout

- `weekN_sourcebricks/` — original PDFs (65 total, image-based ScholarRx prints, no text layer). **Gitignored** (private, derivative-content concerns) and **do not modify**.
- `data/pages/<week>/<id>/p-NN.png` — rendered pages from `pdftoppm`. **Gitignored** (large, regenerable).
- `data/bricks/<id>.json` — per-brick extracted data: `{id, title, week, type, source, transcript, buzzwords:[vague→specific]}`. Committed.
- `data/cards.json` — aggregated array of all bricks; loaded by the game at runtime. Committed.
- `index.html`, `game.js`, `styles.css` — the static site at repo root (Tailwind via CDN). GitHub Pages serves from here.
- `scripts/` — extraction/build/dev helpers (`render_all.sh`, `aggregate.js`, `find_missing.js`, `dev_server.js`).

## Tech stack

Vanilla HTML/CSS/JS + Tailwind via CDN. No bundler, no framework, no build step. `git push` → GitHub Pages serves it. Test locally with any static server (e.g. `npx serve game`).

## Brick types

Each brick is tagged: `disease | anatomy | physiology | drug | lab | imaging`. Player filters by type and by individual brick in the brick-selection screen.

## Buzzword authoring rules

- Brief and punchy (≤ ~8 words each)
- 6–10 per brick
- **Ordered vague → specific** (early reveals could plausibly fit many topics; final reveals are dead giveaways)
- No proper nouns in early buzzwords; save the eponym for the final 1–2
- For diseases: end with the pathognomonic finding (e.g. "linear IgG along GBM")

## PDF extraction

PDFs are image-based (Microsoft Print to PDF, no text layer). `pdftotext` returns empty. No tesseract installed. Extraction uses `pdftoppm` to rasterize, then vision (read the PNG) to transcribe + author buzzwords. Render command:

```
pdftoppm -png -r 110 <input.pdf> data/pages/<week>/<id>/p
```

Some pages have inverted/mirrored text artifacts from the original web-to-PDF print — ignore those regions.

## Don't

- Don't add a bundler or framework unless explicitly asked — the value is "commit and it deploys."
- Don't commit the rendered PNGs in `data/pages/` once extraction is done (large; regenerable). Add to `.gitignore` after extraction.
- Don't modify files in `weekN_sourcebricks/`.
