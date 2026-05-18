// Brick Buzz — game logic.
// Card data shape: { id, title, week, type, source, pages, buzzwords:[vague→specific], transcript }

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
  allCards: [],
  selectedIds: new Set(),
  typeFilter: new Set(TYPES),
  game: null,
};

// ---------- bootstrap ----------

document.addEventListener('DOMContentLoaded', async () => {
  state.allCards = await loadCards();
  state.selectedIds = new Set(state.allCards.map(c => c.id));
  renderSelectScreen();
  wireButtons();
});

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
  byId('btn-select-all').onclick  = () => { state.allCards.forEach(c => state.selectedIds.add(c.id)); renderSelectScreen(); };
  byId('btn-select-none').onclick = () => { state.selectedIds.clear(); renderSelectScreen(); };
  byId('btn-call-clue').onclick = () => revealNextClue('voluntary');
  byId('btn-quit').onclick      = () => { if (confirm('Quit this game?')) show('title'); };
  byId('btn-replay').onclick    = () => show('select');
}

// ---------- screens ----------

function show(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
  byId('screen-' + name).classList.remove('hidden');
  byId('screen-' + name).classList.remove('screen'); void byId('screen-' + name).offsetWidth; byId('screen-' + name).classList.add('screen');
}

// ---------- select screen ----------

function renderSelectScreen() {
  // type filter pills
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

  // tiles
  const grid = byId('brick-grid');
  grid.innerHTML = '';
  const visible = state.allCards.filter(c => state.typeFilter.has(c.type));
  visible.sort((a,b) => (a.week - b.week) || (Number(a.id) - Number(b.id)));
  for (const c of visible) {
    const checked = state.selectedIds.has(c.id);
    const tile = el('label', { class: 'tile' + (checked ? ' selected' : '') });
    const cb = el('input', { type:'checkbox' });
    cb.checked = checked;
    cb.onchange = () => {
      cb.checked ? state.selectedIds.add(c.id) : state.selectedIds.delete(c.id);
      renderSelectScreen();
    };
    const body = el('div', { class: 'flex-1' });
    body.append(
      el('div', { class: 'font-medium leading-snug' }, c.title),
      el('div', { class: 'text-[10px] uppercase tracking-wider text-ink-500 mt-1' }, `${TYPE_LABEL[c.type] || c.type} · Wk ${c.week}`)
    );
    tile.append(cb, body);
    grid.append(tile);
  }

  // counter + dealer button
  const selectedVisible = visible.filter(c => state.selectedIds.has(c.id)).length;
  byId('selected-count').textContent = selectedVisible;
  byId('btn-deal').disabled = selectedVisible < parseInt(byId('hand-size').value, 10);
}

byId_lazy(); // safe-guard: ensure handlers below run after DOMContentLoaded
function byId_lazy() {
  document.addEventListener('DOMContentLoaded', () => {
    byId('hand-size').addEventListener('input', renderSelectScreen);
  });
}

// ---------- game loop ----------

function startGame() {
  const handSize = clamp(parseInt(byId('hand-size').value, 10) || 5, 3, 10);
  const pool = state.allCards
    .filter(c => state.selectedIds.has(c.id) && state.typeFilter.has(c.type))
    .map(c => ({ ...c }));
  if (pool.length < handSize) return;

  shuffle(pool);

  const hand = pool.splice(0, handSize);
  state.game = {
    deck: pool,
    hand,
    target: null,
    revealed: [],            // buzzwords revealed for current target
    buzzwordsUsed: 0,
    misses: 0,
    cardsPlayed: 0,
    wrongThisRound: new Set(),  // ids in hand that were tried wrong this round
  };
  startRound();
  show('game');
}

function startRound() {
  const g = state.game;
  if (g.hand.length === 0) return endGame();
  // pick a hidden target from the hand
  g.target = g.hand[Math.floor(Math.random() * g.hand.length)];
  g.revealed = [];
  g.wrongThisRound = new Set();
  // reveal the first clue immediately
  revealNextClue('initial');
  renderGame();
}

function revealNextClue(why) {
  const g = state.game;
  if (!g.target) return;
  if (g.revealed.length >= g.target.buzzwords.length) {
    // all clues exhausted — auto-resolve round
    return exhaustRound();
  }
  const idx = g.revealed.length;
  g.revealed.push(g.target.buzzwords[idx]);
  if (why !== 'initial') g.buzzwordsUsed += 1;
  renderGame();
}

function playCard(cardId) {
  const g = state.game;
  if (!g.target) return;
  if (cardId === g.target.id) {
    // correct
    g.cardsPlayed += 1;
    toast('Correct — ' + g.target.title, 'right');
    // remove from hand
    g.hand = g.hand.filter(c => c.id !== cardId);
    // replenish if deck has cards
    if (g.deck.length > 0) g.hand.push(g.deck.shift());
    g.target = null;
    g.revealed = [];
    setTimeout(() => startRound(), 700);
    renderGame();
  } else {
    // wrong: stays in hand, miss++, eliminate this card from this round, force next clue
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
  // remove from hand, replenish
  g.hand = g.hand.filter(c => c.id !== target.id);
  if (g.deck.length > 0) g.hand.push(g.deck.shift());
  g.buzzwordsUsed += EXHAUST_PENALTY;
  g.target = null;
  g.revealed = [];
  setTimeout(() => startRound(), 1400);
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
  for (const c of g.hand) {
    const card = el('div', {
      class: 'card' + (g.wrongThisRound.has(c.id) ? ' eliminated' : ''),
      'data-id': c.id,
    });
    card.append(
      el('div', { class: 'card-title' }, c.title),
      el('div', { class: 'card-type' }, `${TYPE_LABEL[c.type] || c.type} · Wk ${c.week}`),
    );
    if (!g.wrongThisRound.has(c.id)) card.onclick = () => playCard(c.id);
    handEl.append(card);
  }

  // call-clue button disable when exhausted
  byId('btn-call-clue').disabled = !g.target || g.revealed.length >= g.target.buzzwords.length;
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
  t.className = '';
  t.classList.add(kind, 'show');
  // ensure base classes still apply via classList; the fixed positioning is on the element directly in HTML
  t.classList.add('fixed','bottom-6','left-1/2','-translate-x-1/2','px-5','py-3','rounded-full','shadow-cardLg','font-semibold','transition-all');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.classList.remove('show'); t.classList.add('opacity-0','pointer-events-none'); }, ms);
}

// fallback stub data so the UI is browsable before extraction completes
const STUB_CARDS = [
  { id:'demo1', title:'Anti-GBM Disease (Goodpasture Syndrome)', week:3, type:'disease', source:'', pages:0,
    buzzwords:['hemoptysis and hematuria together','young smoker with cough and renal failure','rapidly progressive glomerulonephritis','pulmonary-renal syndrome','crescentic glomerulonephritis on biopsy','type II hypersensitivity reaction','antibodies against alpha-3 chain of type IV collagen','linear IgG along glomerular basement membrane'], transcript:'' },
  { id:'demo2', title:'Minimal Change Disease', week:3, type:'disease', source:'', pages:0,
    buzzwords:['child with sudden swelling','nephrotic syndrome in a child','massive proteinuria, normal BP','selective albuminuria','responds to steroids','light microscopy looks normal','effacement of podocyte foot processes','electron microscopy buzzword'], transcript:'' },
  { id:'demo3', title:'Loop Diuretics', week:1, type:'drug', source:'', pages:0,
    buzzwords:['drug for fluid overload','strongest diuretic class','works on the thick ascending limb','can cause ototoxicity','wastes calcium','furosemide and bumetanide','blocks NKCC2','blocks Na-K-2Cl cotransporter'], transcript:'' },
  { id:'demo4', title:'Sodium Homeostasis', week:1, type:'physiology', source:'', pages:0,
    buzzwords:['key extracellular cation','sets plasma osmolality','regulated by aldosterone','reabsorbed all along the nephron','principal cell channel','ENaC in the collecting duct','target of mineralocorticoid receptor','sodium-potassium pump driven'], transcript:'' },
  { id:'demo5', title:'Renal Stones', week:3, type:'disease', source:'', pages:0,
    buzzwords:['flank pain radiating to groin','hematuria with severe colic','most common type is calcium oxalate','radiopaque on x-ray','envelope-shaped crystals','non-contrast CT is best test','strain the urine','calcium oxalate dihydrate buzzword'], transcript:'' },
];
