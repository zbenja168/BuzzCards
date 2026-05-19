// Brick Buzz — game logic.
// Card data shape: { id, title, brick_id, brick_title, week, type, buzzwords:[8] }
// One brick contributes 1..N cards. Selection happens at the brick level.

const TYPES = ['disease', 'physiology', 'anatomy', 'drug', 'lab', 'imaging'];
const TYPE_LABEL = {
  disease:    'Diseases',
  physiology: 'Physiology',
  anatomy:    'Anatomy',
  drug:       'Drugs',
  lab:        'Labs',
  imaging:    'Imaging',
};
const EXHAUST_PENALTY = 3;   // extra "buzzword equivalents" when buzzwords are exhausted unsolved
const MISS_PENALTY    = 1;   // extra "buzzword equivalents" per miss

const state = {
  allCards: [],              // flat list of all cards
  bricks: [],                // [{id, title, type, week, cards:[...]}], one per brick
  selectedBrickIds: new Set(),
  typeFilter: new Set(TYPES),
  handMode: 'decoys',        // 'decoys' | 'siblings' | 'random'
  game: null,
};

// ---------- bootstrap ----------

document.addEventListener('DOMContentLoaded', async () => {
  state.allCards = await loadCards();
  state.bricks = groupByBrick(state.allCards);
  state.selectedBrickIds = new Set(state.bricks.map(b => b.id));
  renderSelectScreen();
  wireButtons();
});

function groupByBrick(cards) {
  const byId = new Map();
  for (const c of cards) {
    if (!byId.has(c.brick_id)) {
      byId.set(c.brick_id, {
        id: c.brick_id,
        title: c.brick_title,
        type: c.type,
        week: c.week,
        cards: [],
      });
    }
    byId.get(c.brick_id).cards.push(c);
  }
  return [...byId.values()].sort((a, b) =>
    (a.week - b.week) || (Number(a.id) - Number(b.id))
  );
}

async function loadCards() {
  try {
    const res = await fetch('data/cards.json');
    if (!res.ok) throw new Error('cards.json fetch failed');
    return await res.json();
  } catch (e) {
    console.warn('Could not load cards.json — using stub data', e);
    return STUB_CARDS;
  }
}

function wireButtons() {
  byId('btn-start').onclick     = () => show('select');
  byId('btn-deal').onclick      = startGame;
  byId('btn-select-all').onclick  = () => { state.bricks.forEach(b => state.selectedBrickIds.add(b.id)); renderSelectScreen(); };
  byId('btn-select-none').onclick = () => { state.selectedBrickIds.clear(); renderSelectScreen(); };
  byId('btn-quit').onclick      = () => { if (confirm('Quit this game?')) show('title'); };
  byId('btn-replay').onclick    = () => show('select');
  byId('hand-size').addEventListener('input', renderSelectScreen);
  byId('hand-mode').addEventListener('change', e => { state.handMode = e.target.value; });
  byId('clue-deck').onclick     = () => onClueDeckClick();
  byId('extras-deck').onclick   = () => onExtrasDeckClick();
}

function onClueDeckClick() {
  const g = state.game;
  if (!g || !g.target) return;
  revealNextClue('voluntary');
}

function onExtrasDeckClick() {
  const g = state.game;
  if (!g || !g.target) return;
  if (g.extras.length === 0) return;
  // Pop next extra and merge into the player's hand. Draws are free during the round —
  // but each draw retroactively counts as a miss if the target was already in the hand
  // when the round started. We apply that penalty at round-end (correct play or exhaust).
  const drawn = g.extras.shift();
  g.hand.push(drawn);
  renderGame();
}

// ---------- screens ----------

function show(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
  byId('screen-' + name).classList.remove('hidden');
  byId('screen-' + name).classList.remove('screen'); void byId('screen-' + name).offsetWidth; byId('screen-' + name).classList.add('screen');
}

// ---------- select screen ----------

function renderSelectScreen() {
  // type filter pills (counts: number of cards of this type)
  const tf = byId('type-filters');
  tf.innerHTML = '';
  for (const t of TYPES) {
    const count = state.allCards.filter(c => c.type === t).length;
    if (!count) continue;
    const pill = el('button', { class: 'pill ' + (state.typeFilter.has(t) ? 'active' : '') }, `${TYPE_LABEL[t]} · ${count}`);
    pill.onclick = () => {
      state.typeFilter.has(t) ? state.typeFilter.delete(t) : state.typeFilter.add(t);
      renderSelectScreen();
    };
    tf.append(pill);
  }

  // brick tiles
  const grid = byId('brick-grid');
  grid.innerHTML = '';
  const visible = state.bricks.filter(b => state.typeFilter.has(b.type));
  for (const b of visible) {
    const checked = state.selectedBrickIds.has(b.id);
    const tile = el('label', { class: 'tile' + (checked ? ' selected' : '') });
    const cb = el('input', { type:'checkbox' });
    cb.checked = checked;
    cb.onchange = () => {
      cb.checked ? state.selectedBrickIds.add(b.id) : state.selectedBrickIds.delete(b.id);
      renderSelectScreen();
    };
    const body = el('div', { class: 'flex-1 min-w-0' });
    body.append(
      el('div', { class: 'font-medium leading-snug' }, b.title),
      el('div', { class: 'text-[10px] uppercase tracking-wider text-ink-500 mt-1' },
        `${TYPE_LABEL[b.type] || b.type} · Wk ${b.week} · ${b.cards.length} card${b.cards.length === 1 ? '' : 's'}`)
    );
    tile.append(cb, body);
    grid.append(tile);
  }

  // counter shows total CARDS from selected, visible bricks
  const selectedCardCount = visible
    .filter(b => state.selectedBrickIds.has(b.id))
    .reduce((sum, b) => sum + b.cards.length, 0);
  byId('selected-count').textContent = selectedCardCount;
  byId('btn-deal').disabled = selectedCardCount < parseInt(byId('hand-size').value, 10);
}

// ---------- game loop ----------

function startGame() {
  const handSize = clamp(parseInt(byId('hand-size').value, 10) || 5, 3, 10);
  const pool = state.bricks
    .filter(b => state.selectedBrickIds.has(b.id) && state.typeFilter.has(b.type))
    .flatMap(b => b.cards.map(c => ({ ...c })));
  if (pool.length < handSize) return;

  state.game = {
    pool,                       // universe of cards for this session (no mutation)
    usedTargetIds: new Set(),   // targets already played this game (correct or exhausted)
    handSize,                   // per-round
    hand: [],
    extras: [],
    target: null,
    revealed: [],
    shuffledClues: [],
    buzzwordsUsed: 0,
    misses: 0,
    cardsPlayed: 0,
    wrongThisRound: new Set(),
  };
  startRound();
  show('game');
}

// Build a hand that biases toward the target's siblings/cousins.
// modes:
//   'siblings' — fill with same-brick siblings first, then cousins (same week+type), then anything.
//   'decoys'   — half siblings, ~25% cousins, ~25% other. The default.
//   'random'   — old behavior, no bias.
function buildBiasedHand(target, pool, n, mode) {
  const others = pool.filter(c => c.id !== target.id);
  if (mode === 'random') {
    return [target, ...shuffled(others).slice(0, n - 1)];
  }

  const siblings = shuffled(others.filter(c => c.brick_id === target.brick_id));
  const cousins  = shuffled(others.filter(c =>
    c.brick_id !== target.brick_id && c.week === target.week && c.type === target.type
  ));
  const rest     = shuffled(others.filter(c =>
    c.brick_id !== target.brick_id && (c.week !== target.week || c.type !== target.type)
  ));

  let need = n - 1;
  const hand = [target];

  if (mode === 'siblings') {
    take(hand, siblings, need); need = n - hand.length;
    take(hand, cousins,  need); need = n - hand.length;
    take(hand, rest,     need);
  } else { // decoys
    const wantSib    = Math.min(siblings.length, Math.max(1, Math.floor((n - 1) * 0.5)));
    const wantCousin = Math.min(cousins.length,  Math.max(1, Math.floor((n - 1) * 0.25)));
    take(hand, siblings, wantSib);
    take(hand, cousins,  wantCousin);
    take(hand, rest,     n - hand.length);
    // if not enough rest, top up from remaining cousins then siblings
    if (hand.length < n) take(hand, cousins,  n - hand.length);
    if (hand.length < n) take(hand, siblings, n - hand.length);
  }

  return shuffled(hand);
}

function take(target, src, k) {
  while (k-- > 0 && src.length) target.push(src.shift());
}
function shuffled(arr) { const a = [...arr]; shuffle(a); return a; }

function startRound() {
  const g = state.game;

  // Eligible targets = pool minus already-used targets.
  const eligible = g.pool.filter(c => !g.usedTargetIds.has(c.id));
  if (eligible.length === 0) return endGame();

  // Pick the round's target at random.
  const target = eligible[Math.floor(Math.random() * eligible.length)];

  // Build a fresh hand biased around THIS target. The decoys actually decoy now.
  // Hand draws from the eligible pool (excluding used targets) but excludes the target
  // itself from filler choices (we want target placed deliberately, in hand or extras).
  const handCandidates = eligible.filter(c => c.id !== target.id);
  const handAndTarget  = buildBiasedHand(target, [target, ...handCandidates], g.handSize, state.handMode);

  // Hand is the set MINUS the target (we'll place target in either hand or extras separately).
  let hand   = handAndTarget.filter(c => c.id !== target.id);
  let extras = [];

  // Decide where the target goes: ~5/7 of the time in hand, ~2/7 in extras, mirroring the layout odds.
  const totalSlots = g.handSize + 2;
  const targetInExtras = Math.random() < (2 / totalSlots);

  if (targetInExtras) {
    // Hand: pick handSize cards from the non-target pool (already in `hand` above, but length = handSize - 1).
    // We need to top it up.
    if (hand.length < g.handSize) {
      const used = new Set([target.id, ...hand.map(c => c.id)]);
      const extra = shuffled(eligible.filter(c => !used.has(c.id))).slice(0, g.handSize - hand.length);
      hand = [...hand, ...extra];
    }
    // Extras: target + 1 more decoy
    const handIds = new Set([target.id, ...hand.map(c => c.id)]);
    const extraDecoy = pickExtraDecoy(target, eligible, handIds);
    extras = shuffled([target, ...(extraDecoy ? [extraDecoy] : [])]);
  } else {
    // Target sits in hand. Replace one hand slot with the target.
    if (hand.length >= g.handSize) hand = hand.slice(0, g.handSize - 1);
    hand = shuffled([target, ...hand]);
    // Extras: 2 decoys from the eligible pool
    const handIds = new Set(hand.map(c => c.id));
    const decoys = pickExtraDecoys(target, 2, eligible, handIds);
    extras = decoys;
  }

  g.hand = hand;
  g.extras = extras;
  g.target = target;
  g.targetInHandAtStart = !targetInExtras;       // for end-of-round draw penalty
  g.initialExtrasCount  = extras.length;
  g.shuffledClues = [...target.buzzwords];
  shuffle(g.shuffledClues);
  g.revealed = [];
  g.wrongThisRound = new Set();
  revealNextClue('initial');
  renderGame();
}

// Pick decoy cards for the extras: prefer siblings of target, fall back to cousins, then any.
function pickExtraDecoys(target, n, eligible, excludeIds) {
  const out = [];
  const remaining = eligible.filter(c => !excludeIds.has(c.id) && c.id !== target.id);
  const siblings = shuffled(remaining.filter(c => c.brick_id === target.brick_id));
  const cousins  = shuffled(remaining.filter(c =>
    c.brick_id !== target.brick_id && c.week === target.week && c.type === target.type
  ));
  const rest     = shuffled(remaining.filter(c =>
    c.brick_id !== target.brick_id && (c.week !== target.week || c.type !== target.type)
  ));
  while (out.length < n) {
    let next = siblings.shift() || cousins.shift() || rest.shift();
    if (!next) break;
    out.push(next);
  }
  return out;
}
function pickExtraDecoy(target, eligible, excludeIds) {
  return pickExtraDecoys(target, 1, eligible, excludeIds)[0];
}

function revealNextClue(why) {
  const g = state.game;
  if (!g.target) return;
  if (g.revealed.length >= g.shuffledClues.length) {
    // all clues exhausted — auto-resolve round
    return exhaustRound();
  }
  const idx = g.revealed.length;
  g.revealed.push(g.shuffledClues[idx]);
  if (why !== 'initial') g.buzzwordsUsed += 1;
  renderGame();
}

function playCard(cardId) {
  const g = state.game;
  if (!g.target) return;
  if (!g.hand.some(c => c.id === cardId)) return; // only hand cards are playable; extras must be drawn first

  if (cardId === g.target.id) {
    // Correct — round ends, target retires, fresh hand next round.
    g.cardsPlayed += 1;
    g.usedTargetIds.add(g.target.id);
    const penalty = applyEndOfRoundDrawPenalty();
    const msg = `Correct — ${g.target.title}` + (penalty > 0 ? ` (+${penalty} miss${penalty > 1 ? 'es' : ''} for unneeded draws)` : '');
    toast(msg, 'right', penalty > 0 ? 1700 : 1100);
    g.target = null;
    g.revealed = [];
    setTimeout(() => startRound(), penalty > 0 ? 1100 : 700);
    renderGame();
  } else {
    // Wrong: stays where it is, miss++, eliminated from this round, force next clue.
    g.misses += 1;
    g.wrongThisRound.add(cardId);
    toast('Not it — try again', 'wrong');
    revealNextClue('forced');
  }
}

function exhaustRound() {
  const g = state.game;
  const target = g.target;
  const penalty = applyEndOfRoundDrawPenalty();
  const tail = penalty > 0 ? ` (+${penalty} miss${penalty > 1 ? 'es' : ''} for unneeded draws)` : '';
  toast(`Out of clues — it was ${target.title}${tail}`, 'info', 1800);
  g.usedTargetIds.add(target.id);
  g.buzzwordsUsed += EXHAUST_PENALTY;
  g.target = null;
  g.revealed = [];
  setTimeout(() => startRound(), 1400);
}

// If the target was in the hand at the start of the round, each extra the player
// drew was an "unneeded" reveal — count one miss per draw. Returns the penalty applied.
function applyEndOfRoundDrawPenalty() {
  const g = state.game;
  if (!g.targetInHandAtStart) return 0;
  const drawn = (g.initialExtrasCount || 0) - g.extras.length;
  if (drawn <= 0) return 0;
  g.misses += drawn;
  return drawn;
}

function endGame() {
  const g = state.game;
  const score = g.buzzwordsUsed + g.misses * MISS_PENALTY;
  byId('final-score').textContent = score;
  byId('final-played').textContent = g.cardsPlayed;
  byId('final-misses').textContent = g.misses;
  byId('final-avg').textContent = g.cardsPlayed > 0 ? (g.buzzwordsUsed / g.cardsPlayed).toFixed(1) : '—';
  show('over');
}

// ---------- render ----------

function renderGame() {
  const g = state.game;
  byId('stat-buzzwords').textContent = g.buzzwordsUsed;
  byId('stat-misses').textContent    = g.misses;
  byId('stat-cards-left').textContent = g.pool.length - g.usedTargetIds.size;

  // Clue deck: shows clues remaining; disabled when none left
  const totalClues = g.shuffledClues ? g.shuffledClues.length : 0;
  const cluesLeft  = Math.max(0, totalClues - g.revealed.length);
  byId('clue-deck-count').textContent = cluesLeft;
  byId('clue-deck').classList.toggle('disabled', !g.target || cluesLeft <= 0);

  // Clue pile: each revealed clue is a face-up card, oldest first, newest on top.
  // CSS handles stacked state + hover fan.
  const pile = byId('clue-pile');
  pile.innerHTML = '';
  g.revealed.forEach((clue, i) => {
    const card = el('div', { class: 'card clue-card' });
    card.style.zIndex = String(i + 1);
    card.append(
      el('div', { class: 'clue-index' }, `Clue ${i + 1}`),
      el('div', { class: 'clue-text' }, clue),
    );
    pile.append(card);
  });

  // Hand (fan layout): cards overlap with negative margin and each is rotated
  // slightly around its bottom-center. Hover lifts the card and brings it to the top.
  const handEl = byId('hand');
  handEl.innerHTML = '';
  const n = g.hand.length;
  const center = (n - 1) / 2;
  const ROT_STEP = 6;   // degrees between adjacent cards
  const ARC_STEP = 3;   // px of edge lift for the arc curve
  g.hand.forEach((c, i) => {
    const offset   = i - center;
    const rotation = offset * ROT_STEP;
    const yArc     = Math.abs(offset) * ARC_STEP;
    const card     = renderHandCard(c);
    card.style.setProperty('--card-rot', `${rotation}deg`);
    card.style.setProperty('--card-y',   `${yArc}px`);
    card.style.setProperty('--card-z',   String(i + 1));
    handEl.append(card);
  });

  // Extras deck (single pile, click to draw into hand)
  byId('extras-deck-count').textContent = g.extras.length;
  byId('extras-deck').classList.toggle('disabled', !g.target || g.extras.length === 0);
}

function renderHandCard(c) {
  const g = state.game;
  const card = el('div', {
    class: 'card hand-card' + (g.wrongThisRound.has(c.id) ? ' eliminated' : ''),
    'data-id': c.id,
  });
  card.append(el('div', { class: 'card-title' }, c.title));
  if (!g.wrongThisRound.has(c.id)) card.onclick = () => playCard(c.id);
  return card;
}

// ---------- helpers ----------

function byId(id) { return document.getElementById(id); }
function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v;
    else if (v !== false && v != null) n.setAttribute(k, v);
  }
  for (const k of kids) if (k != null) n.append(k.nodeType ? k : document.createTextNode(k));
  return n;
}
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } }
function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

let toastTimer = null;
function toast(text, kind = 'info', ms = 1100) {
  const t = byId('toast');
  t.textContent = text;
  t.className = '';                  // strip everything
  t.classList.add(kind, 'show');      // visual style + visibility (#toast styles in styles.css)
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.classList.remove('show'); }, ms);
}

// Fallback stub data shown only when data/cards.json fails to load (e.g. file:// access).
// Three example cards from one brick so the brick-grouping UI is browsable.
const STUB_CARDS = [
  { id:'54-1', title:'Calcium Oxalate Stones', brick_id:'54', brick_title:'Renal Stones', week:3, type:'disease',
    buzzwords:['flank pain radiating to groin','most common kidney stone type','Crohn disease or bariatric surgery','low urinary citrate inhibitor','hyperparathyroidism mobilizes bone calcium','high urine calcium and oxalate','thiazides and citrate for prevention','envelope or dumbbell urine crystals'] },
  { id:'54-3', title:'Struvite Stones', brick_id:'54', brick_title:'Renal Stones', week:3, type:'disease',
    buzzwords:['recurrent upper urinary tract infections','alkaline urine pH','magnesium ammonium phosphate composition','urease-positive bacteria split urea','Proteus, Klebsiella, Ureaplasma organisms','large branching renal pelvis cast','staghorn calculus on imaging','coffin-lid shaped crystals'] },
  { id:'47-1', title:'Anti-GBM Disease (Goodpasture Syndrome)', brick_id:'47', brick_title:'Anti-GBM Disease (Goodpasture Syndrome)', week:3, type:'disease',
    buzzwords:['hemoptysis and hematuria together','young smoker with cough and renal failure','rapidly progressive glomerulonephritis','pulmonary-renal syndrome','type II hypersensitivity reaction','antibodies against alpha-3 chain of type IV collagen','crescentic glomerulonephritis on biopsy','linear IgG along glomerular basement membrane'] },
];
