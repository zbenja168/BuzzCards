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
  hideTypes: false,          // hide type/brick footer on hand cards for hard mode
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
  byId('btn-call-clue').onclick = () => revealNextClue('voluntary');
  byId('btn-quit').onclick      = () => { if (confirm('Quit this game?')) show('title'); };
  byId('btn-replay').onclick    = () => show('select');
  byId('hand-size').addEventListener('input', renderSelectScreen);
  byId('hand-mode').addEventListener('change', e => { state.handMode = e.target.value; });
  byId('hide-types').addEventListener('change', e => { state.hideTypes = e.target.checked; });
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

  shuffle(pool);

  // Pick the first target, then build the hand around it according to the mode.
  const target = pool[0];
  const hand = buildBiasedHand(target, pool, handSize, state.handMode);
  const handIds = new Set(hand.map(c => c.id));
  const deck = pool.filter(c => !handIds.has(c.id));

  state.game = {
    deck,
    hand,
    initialTarget: target,    // first round target, set in startRound
    target: null,
    revealed: [],
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
  if (g.hand.length === 0 && g.deck.length === 0) return endGame();

  // Draw up to 2 face-down extras from deck for this round.
  g.extras = [];
  while (g.extras.length < 2 && g.deck.length > 0) g.extras.push(g.deck.shift());
  g.extrasFlipped = new Set();

  // Target candidate pool = hand + extras. First round bias respected if possible.
  const pool = [...g.hand, ...g.extras];
  if (pool.length === 0) return endGame();

  if (g.initialTarget && pool.some(c => c.id === g.initialTarget.id)) {
    g.target = pool.find(c => c.id === g.initialTarget.id);
    g.initialTarget = null;
  } else {
    g.target = pool[Math.floor(Math.random() * pool.length)];
  }

  g.shuffledClues = [...g.target.buzzwords];
  shuffle(g.shuffledClues);
  g.revealed = [];
  g.wrongThisRound = new Set();
  revealNextClue('initial');
  renderGame();
}

// Flip a face-down extra to face-up. Costs +1 buzzword (same as calling a clue).
function flipExtra(cardId) {
  const g = state.game;
  if (!g.target) return;
  if (!g.extras.some(c => c.id === cardId)) return;
  if (g.extrasFlipped.has(cardId)) return;
  g.extrasFlipped.add(cardId);
  g.buzzwordsUsed += 1;
  renderGame();
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
  // Must be playable: either in hand, or a flipped extra.
  const inHand   = g.hand.some(c => c.id === cardId);
  const inExtras = g.extras.some(c => c.id === cardId) && g.extrasFlipped.has(cardId);
  if (!inHand && !inExtras) return;

  if (cardId === g.target.id) {
    // correct
    g.cardsPlayed += 1;
    toast('Correct — ' + g.target.title, 'right');
    if (inHand) {
      g.hand = g.hand.filter(c => c.id !== cardId);
      if (g.deck.length > 0) g.hand.push(g.deck.shift());
    }
    // If correct was from extras, hand size stays the same; the un-flipped extras get returned to deck below.
    returnUnusedExtrasToDeck();
    g.target = null;
    g.revealed = [];
    setTimeout(() => startRound(), 700);
    renderGame();
  } else {
    // wrong: stays where it is, miss++, eliminate it from this round, force next clue
    g.misses += 1;
    g.wrongThisRound.add(cardId);
    toast('Not it — try again', 'wrong');
    revealNextClue('forced');
  }
}

function exhaustRound() {
  const g = state.game;
  const target = g.target;
  toast(`Out of clues — it was ${target.title}`, 'info', 1800);
  // Remove target from wherever it lived; replenish hand if needed.
  const wasInHand = g.hand.some(c => c.id === target.id);
  if (wasInHand) {
    g.hand = g.hand.filter(c => c.id !== target.id);
    if (g.deck.length > 0) g.hand.push(g.deck.shift());
  }
  // Unrevealed/extra cards (other than the target) return to the deck.
  returnUnusedExtrasToDeck(target.id);
  g.buzzwordsUsed += EXHAUST_PENALTY;
  g.target = null;
  g.revealed = [];
  setTimeout(() => startRound(), 1400);
}

// Return any extras (face-up or face-down) that weren't played back to the bottom of the deck.
// Caller may pass a "skipId" to drop a specific card (e.g. the revealed target).
function returnUnusedExtrasToDeck(skipId) {
  const g = state.game;
  for (const c of g.extras) {
    if (c.id === skipId) continue;
    g.deck.push(c);
  }
  g.extras = [];
  g.extrasFlipped = new Set();
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
  byId('stat-cards-left').textContent = g.deck.length + g.hand.length;

  // buzzwords
  const ol = byId('buzzword-list');
  ol.innerHTML = '';
  g.revealed.forEach((b, i) => {
    const li = el('li', { class: i === g.revealed.length - 1 ? 'revealing' : '' }, b);
    ol.append(li);
  });

  // hand
  const handEl = byId('hand');
  handEl.innerHTML = '';
  for (const c of g.hand) handEl.append(renderHandCard(c));

  // extras
  const extrasEl = byId('extras');
  extrasEl.innerHTML = '';
  for (const c of g.extras) {
    if (g.extrasFlipped.has(c.id)) {
      extrasEl.append(renderHandCard(c));
    } else {
      const slot = el('div', { class: 'card face-down', 'data-id': c.id });
      slot.append(
        el('div', { class: 'face-down-label' }, 'Draw extra'),
        el('div', { class: 'face-down-cost' }, '+1 buzzword'),
      );
      slot.onclick = () => flipExtra(c.id);
      extrasEl.append(slot);
    }
  }
  byId('extras-wrap').style.display = g.extras.length ? '' : 'none';

  // call-clue button disable when exhausted
  byId('btn-call-clue').disabled = !g.target || g.revealed.length >= g.shuffledClues.length;
}

function renderHandCard(c) {
  const g = state.game;
  const card = el('div', {
    class: 'card' + (g.wrongThisRound.has(c.id) ? ' eliminated' : ''),
    'data-id': c.id,
  });
  card.append(el('div', { class: 'card-title' }, c.title));
  if (!state.hideTypes) {
    card.append(el('div', { class: 'card-type' },
      c.brick_title && c.brick_title !== c.title
        ? `${c.brick_title} · Wk ${c.week}`
        : `${TYPE_LABEL[c.type] || c.type} · Wk ${c.week}`));
  }
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
