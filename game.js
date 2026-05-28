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
// Per-type "suit" symbol that appears in card corners + as a faded center watermark.
const TYPE_SYMBOL = {
  disease:    '♥',
  drug:       '♣',
  anatomy:    '♠',
  physiology: '♦',
  lab:        '★',
  imaging:    '◐',
};
const POINTS_PER_CLUE  = 10;  // each unused clue dealt at round-end (before streak multiplier)
const POINTS_PER_MISS  = 10;  // deducted per unneeded extra-draw (target was already in hand)
const POINTS_PER_WRONG = 25;  // deducted per wrong card played; also resets the streak
const STREAK_CAP       = 3;   // multiplier cap (3x at streak >= 5)

const state = {
  courses: [],               // [{id, name, cards}] from data/courses.json
  courseOrder: [],           // course ids in manifest order
  allCards: [],              // flat list of all cards (tagged with .course/.courseName)
  bricks: [],                // [{key, id, course, title, type, week, cards:[...]}], one per brick
  selectedBrickIds: new Set(),// holds composite brick keys ("course:brick_id")
  typeFilter: new Set(TYPES),
  handMode: 'decoys',        // 'decoys' | 'siblings' | 'random'
  expandedCourses: new Set(),// course ids opened in the select screen
  expandedWeeks: new Set(),  // "course:week" keys opened in the select screen
  history: [],               // past round outcomes for review; persists across games this page-session
  game: null,
};

// ---------- bootstrap ----------

document.addEventListener('DOMContentLoaded', async () => {
  state.courses = await loadCourses();
  state.allCards = await loadAllCourseCards(state.courses);
  state.bricks = groupByBrick(state.allCards);
  state.selectedBrickIds = new Set(state.bricks.map(b => b.key));
  state.courseOrder = state.courses.map(c => c.id);
  renderSelectScreen();
  wireButtons();
});

// A brick is uniquely keyed by course + brick_id (brick numbers repeat across courses).
function groupByBrick(cards) {
  const byKey = new Map();
  for (const c of cards) {
    const key = `${c.course}:${c.brick_id}`;
    if (!byKey.has(key)) {
      byKey.set(key, {
        key,
        id: c.brick_id,
        course: c.course,
        courseName: c.courseName,
        title: c.brick_title,
        type: c.type,
        week: c.week,        // may be undefined for courses without weeks
        cards: [],
      });
    }
    byKey.get(key).cards.push(c);
  }
  return [...byKey.values()];
}

// Load the course manifest. Falls back to a single legacy course if absent.
async function loadCourses() {
  try {
    const res = await fetch('data/courses.json');
    if (!res.ok) throw new Error('courses.json fetch failed');
    const courses = await res.json();
    if (Array.isArray(courses) && courses.length) return courses;
    throw new Error('empty courses.json');
  } catch (e) {
    console.warn('No courses.json — falling back to single legacy course', e);
    return [{ id: 'renal', name: 'Renal & Urinary System', cards: 'data/cards.json' }];
  }
}

// Load every course's cards.json, tagging each card with its course id + name.
// A course whose cards file is missing (e.g. still being built) is skipped.
async function loadAllCourseCards(courses) {
  const all = [];
  for (const co of courses) {
    try {
      const res = await fetch(co.cards);
      if (!res.ok) throw new Error('fetch failed: ' + co.cards);
      const cards = await res.json();
      for (const c of cards) { c.course = co.id; c.courseName = co.name; }
      all.push(...cards);
    } catch (e) {
      console.warn('Could not load course cards:', co.id, e);
    }
  }
  return all.length ? all : STUB_CARDS;
}

function wireButtons() {
  byId('btn-start').onclick     = () => show('select');
  byId('btn-deal').onclick      = startGame;
  byId('btn-select-all').onclick  = () => { state.bricks.forEach(b => state.selectedBrickIds.add(b.key)); renderSelectScreen(); };
  byId('btn-select-none').onclick = () => { state.selectedBrickIds.clear(); renderSelectScreen(); };
  byId('btn-quit').onclick      = () => { if (confirm('Quit this game?')) show('title'); };
  byId('btn-replay').onclick    = () => show('select');
  byId('hand-size').addEventListener('input', renderSelectScreen);
  byId('hand-mode').addEventListener('change', e => { state.handMode = e.target.value; });
  byId('clue-deck').onclick     = () => onClueDeckClick();
  byId('extras-deck').onclick   = () => onExtrasDeckClick();
  byId('btn-history').onclick      = openHistory;
  byId('btn-history-over').onclick = openHistory;
  byId('btn-close-history').onclick = closeHistory;
  byId('history-backdrop').onclick  = closeHistory;
  byId('btn-sound').onclick     = () => { sfx.toggleMute(); sfx.click(); };

  // Click-to-enlarge for image clue cards (anywhere they appear: clue pile,
  // history modal thumbnails). Also tap-to-fan the clue pile (mainly for touch
  // devices where :hover doesn't fire). All delegated so it works for
  // dynamically-added cards.
  document.addEventListener('click', e => {
    const clueCard = e.target.closest('.clue-card.has-image');
    if (clueCard) {
      const img = clueCard.querySelector('.clue-image');
      if (img && img.src) openImageLightbox(img.src);
      return;
    }
    const historyChip = e.target.closest('.history-buzzword.is-image');
    if (historyChip) {
      const img = historyChip.querySelector('img');
      if (img && img.src) openImageLightbox(img.src);
      return;
    }
    // Tap inside the clue pile toggles the fan; tap anywhere else collapses it.
    const pile = byId('clue-pile');
    if (!pile) return;
    if (e.target.closest('#clue-pile')) {
      pile.classList.toggle('fanned');
    } else if (pile.classList.contains('fanned')) {
      pile.classList.remove('fanned');
    }
  });

  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (byId('image-lightbox')) closeImageLightbox();
    else if (!byId('history-modal').classList.contains('hidden')) closeHistory();
  });
  // Initial sound button glyph
  byId('btn-sound').textContent = sfx.muted ? '🔇' : '🔊';
}

// ============= SOUND EFFECTS ====================================================
// Synthesized via Web Audio API. AudioContext is created lazily on first user gesture.

const sfx = {
  ctx: null,
  muted: localStorage.getItem('sfxMuted') === '1',
  master: null,
  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.4;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return true;
  },
  toggleMute() {
    this.muted = !this.muted;
    localStorage.setItem('sfxMuted', this.muted ? '1' : '0');
    const btn = byId('btn-sound');
    if (btn) btn.textContent = this.muted ? '🔇' : '🔊';
  },
  _osc(freq, type, attack, hold, release, gain = 0.18, freqEnd = null) {
    if (this.muted || !this.ensure()) return;
    const t0 = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (freqEnd != null) o.frequency.exponentialRampToValueAtTime(Math.max(0.01, freqEnd), t0 + attack + hold + release);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + attack);
    g.gain.setValueAtTime(gain, t0 + attack + hold);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + attack + hold + release);
    o.connect(g).connect(this.master);
    o.start(t0);
    o.stop(t0 + attack + hold + release + 0.02);
  },
  // Soft noise burst with a smooth quadratic decay + optional filter sweep, used by
  // card-flip/click/shuffle. Lower-pitched and quieter than a raw highpass hiss.
  _swoosh({ dur = 0.12, filter = 'lowpass', f0 = 2200, f1 = 500, q = 0.7, gain = 0.09, fadeIn = 0.01 }) {
    if (this.muted || !this.ensure()) return;
    const t0 = this.ctx.currentTime;
    const sr = this.ctx.sampleRate;
    const buf = this.ctx.createBuffer(1, Math.max(1, sr * dur), sr);
    const d = buf.getChannelData(0);
    const fadeInSamples = Math.max(1, fadeIn * sr);
    for (let i = 0; i < d.length; i++) {
      const t = i / d.length;
      const attack = Math.min(1, i / fadeInSamples);     // smooth attack
      const decay = Math.pow(1 - t, 1.8);                 // quadratic-ish decay
      d[i] = (Math.random() * 2 - 1) * attack * decay;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filt = this.ctx.createBiquadFilter();
    filt.type = filter; filt.Q.value = q;
    filt.frequency.setValueAtTime(f0, t0);
    filt.frequency.exponentialRampToValueAtTime(Math.max(50, f1), t0 + dur);
    const g = this.ctx.createGain();
    g.gain.value = gain;
    src.connect(filt).connect(g).connect(this.master);
    src.start(t0);
  },
  click()    { this._swoosh({ dur: 0.06, filter: 'bandpass', f0: 1800, f1: 1800, q: 4,   gain: 0.18 }); },
  flip()     { this._swoosh({ dur: 0.14, filter: 'lowpass',  f0: 2800, f1: 700,  q: 0.7, gain: 0.12 }); },
  wrong()    { this._osc(200, 'triangle', 0.006, 0.05, 0.22, 0.16, 105); },
  coin()     { this._osc(1320, 'sine', 0.002, 0.02, 0.18, 0.16); setTimeout(() => this._osc(1760, 'sine', 0.002, 0.02, 0.18, 0.12), 50); },
  streak()   { this._osc(880, 'sine', 0.003, 0.02, 0.30, 0.18, 1760); },
  shuffle()  { for (let i = 0; i < 3; i++) setTimeout(() => this._swoosh({ dur: 0.11, filter: 'lowpass', f0: 2200, f1: 550, q: 0.7, gain: 0.09 }), i * 75); },
  celebrate() {
    // Quick C major arpeggio with a sparkle on top
    const notes = [523.25, 659.25, 784.0, 1046.5];
    notes.forEach((f, i) => setTimeout(() => this._osc(f, 'triangle', 0.005, 0.04, 0.55, 0.22), i * 75));
    setTimeout(() => this._osc(1568.0, 'sine', 0.002, 0.05, 0.7, 0.16), 320);
  },
};

function openHistory() {
  renderHistory();
  byId('history-modal').classList.remove('hidden');
}
function closeHistory() {
  byId('history-modal').classList.add('hidden');
}
function renderHistory() {
  const listEl = byId('history-list');
  listEl.innerHTML = '';
  if (state.history.length === 0) {
    listEl.append(el('div', { class: 'history-empty' }, 'No rounds played yet.'));
    return;
  }
  // Most recent first.
  for (let i = state.history.length - 1; i >= 0; i--) {
    const entry = state.history[i];
    const card = el('div', { class: 'history-entry ' + entry.result });
    // Header row
    const head = el('div', { class: 'history-entry-head' });
    head.append(
      el('div', { class: 'history-entry-title' }, entry.target.title),
      el('div', { class: 'history-entry-meta' },
        entry.result === 'correct' ? '✓ solved' : '✕ exhausted',
        ` · ${entry.cluesUsed}/${entry.totalClues} clue${entry.cluesUsed === 1 ? '' : 's'} used`),
    );
    card.append(head);
    // Brick lineage (if it differs from the entity title)
    if (entry.target.brick_title && entry.target.brick_title !== entry.target.title) {
      card.append(el('div', { class: 'history-entry-brick' }, `From: ${entry.target.brick_title}`));
    }
    // Buzzword chips — first cluesUsed were seen during play, rest were dealt at round-end
    const chips = el('div', { class: 'history-buzzwords' });
    entry.shuffledClues.forEach((b, idx) => {
      const cls = 'history-buzzword' + (idx < entry.cluesUsed ? ' seen' : '');
      if (isImageClue(b)) {
        chips.append(el('span', { class: cls + ' is-image' },
          el('img', { src: b.img, alt: 'visual clue' })
        ));
      } else {
        chips.append(el('span', { class: cls }, b));
      }
    });
    card.append(chips);
    listEl.append(card);
  }
}

function onClueDeckClick() {
  const g = state.game;
  if (!g || !g.target || g.animating) return;
  sfx.flip();
  revealNextClue('voluntary');
}

function onExtrasDeckClick() {
  const g = state.game;
  if (!g || !g.target || g.animating) return;
  if (g.extras.length === 0) return;
  // Pop next extra and merge into the player's hand. Draws are free during the round —
  // but each draw retroactively counts as a miss if the target was already in the hand
  // when the round started. We apply that penalty at round-end (correct play or exhaust).
  const drawn = g.extras.shift();
  g.hand.push(drawn);
  g.justDrewExtraId = drawn.id;  // flag for animation in renderGame
  sfx.flip();
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

  // Bricks grouped by course (top level), then by week within a course if that
  // course's bricks carry week numbers (renal), else a flat brick list (boom).
  const grid = byId('brick-grid');
  grid.innerHTML = '';
  const visible = state.bricks.filter(b => state.typeFilter.has(b.type));

  const byCourse = new Map();
  for (const b of visible) {
    if (!byCourse.has(b.course)) byCourse.set(b.course, []);
    byCourse.get(b.course).push(b);
  }
  // Render courses in manifest order, then any leftovers.
  const order = [...state.courseOrder, ...[...byCourse.keys()].filter(c => !state.courseOrder.includes(c))];
  for (const courseId of order) {
    if (!byCourse.has(courseId)) continue;
    grid.append(renderCourseSection(courseId, byCourse.get(courseId)));
  }

  // counter shows total CARDS from selected, visible bricks
  const selectedCardCount = visible
    .filter(b => state.selectedBrickIds.has(b.key))
    .reduce((sum, b) => sum + b.cards.length, 0);
  byId('selected-count').textContent = selectedCardCount;
  byId('btn-deal').disabled = selectedCardCount < parseInt(byId('hand-size').value, 10);
}

// One collapsible course panel. Inside: week sub-sections if the course has
// weeks, otherwise brick tiles directly.
function renderCourseSection(courseId, bricks) {
  const expanded     = state.expandedCourses.has(courseId);
  const courseName   = bricks[0].courseName || courseId;
  const totalCards   = bricks.reduce((s, b) => s + b.cards.length, 0);
  const selectedHere = bricks.filter(b => state.selectedBrickIds.has(b.key)).length;
  const allSelected  = selectedHere === bricks.length;

  const section = el('div', { class: 'course-section' + (expanded ? ' expanded' : '') });

  const header = el('div', { class: 'course-header' });
  header.append(
    el('span', { class: 'week-chevron' }, '▾'),
    el('span', { class: 'course-title' }, courseName),
    el('span', { class: 'week-meta' }, `${selectedHere}/${bricks.length} bricks · ${totalCards} cards`),
  );
  const selAll = el('button', { class: 'week-select-all', type: 'button' },
    allSelected ? 'Clear course' : 'All in course');
  selAll.onclick = (e) => {
    e.stopPropagation();
    if (allSelected) bricks.forEach(b => state.selectedBrickIds.delete(b.key));
    else             bricks.forEach(b => state.selectedBrickIds.add(b.key));
    renderSelectScreen();
  };
  header.append(selAll);
  header.onclick = () => {
    if (state.expandedCourses.has(courseId)) state.expandedCourses.delete(courseId);
    else                                      state.expandedCourses.add(courseId);
    section.classList.toggle('expanded');
  };

  const body = el('div', { class: 'course-body' });
  const hasWeeks = bricks.some(b => b.week != null && b.week !== '');
  if (hasWeeks) {
    const byWeek = new Map();
    for (const b of bricks) {
      const wk = b.week != null ? b.week : 0;
      if (!byWeek.has(wk)) byWeek.set(wk, []);
      byWeek.get(wk).push(b);
    }
    const weeks = [...byWeek.keys()].sort((a, b) => a - b);
    for (const wk of weeks) body.append(renderWeekSection(courseId, wk, byWeek.get(wk)));
  } else {
    const tiles = el('div', { class: 'course-tiles' });
    for (const b of bricks) tiles.append(renderBrickTile(b));
    body.append(tiles);
  }

  section.append(header, body);
  return section;
}

// One collapsible week panel — header bar + an expanding grid of brick tiles.
// Week expansion is keyed by "course:week" so weeks don't collide across courses.
function renderWeekSection(courseId, week, bricks) {
  const wkKey        = `${courseId}:${week}`;
  const expanded     = state.expandedWeeks.has(wkKey);
  const totalCards   = bricks.reduce((s, b) => s + b.cards.length, 0);
  const selectedHere = bricks.filter(b => state.selectedBrickIds.has(b.key)).length;
  const allSelected  = selectedHere === bricks.length;

  const section = el('div', { class: 'week-section' + (expanded ? ' expanded' : '') });

  // ---- header ----
  const header = el('div', { class: 'week-header' });
  header.append(
    el('span', { class: 'week-chevron' }, '▾'),
    el('span', { class: 'week-title' }, `Week ${week}`),
    el('span', { class: 'week-meta' },
      `${selectedHere}/${bricks.length} bricks · ${totalCards} cards`),
  );
  const selAll = el('button', { class: 'week-select-all', type: 'button' },
    allSelected ? 'Clear week' : 'All in week');
  selAll.onclick = (e) => {
    e.stopPropagation();
    if (allSelected) bricks.forEach(b => state.selectedBrickIds.delete(b.key));
    else             bricks.forEach(b => state.selectedBrickIds.add(b.key));
    renderSelectScreen();
  };
  header.append(selAll);
  header.onclick = () => {
    if (state.expandedWeeks.has(wkKey)) state.expandedWeeks.delete(wkKey);
    else                                 state.expandedWeeks.add(wkKey);
    section.classList.toggle('expanded');
  };

  // ---- body (brick tiles) ----
  const body = el('div', { class: 'week-body' });
  for (const b of bricks) body.append(renderBrickTile(b));

  section.append(header, body);
  return section;
}

function renderBrickTile(b) {
  const checked = state.selectedBrickIds.has(b.key);
  const tile = el('label', { class: 'tile' + (checked ? ' selected' : '') });
  const cb = el('input', { type: 'checkbox' });
  cb.checked = checked;
  cb.onchange = () => {
    cb.checked ? state.selectedBrickIds.add(b.key) : state.selectedBrickIds.delete(b.key);
    renderSelectScreen();
  };
  const body = el('div', { class: 'flex-1 min-w-0' });
  body.append(
    el('div', { class: 'font-medium leading-snug' }, b.title),
    el('div', { class: 'text-[10px] uppercase tracking-wider text-ink-500 mt-1' },
      `${TYPE_LABEL[b.type] || b.type} · ${b.cards.length} card${b.cards.length === 1 ? '' : 's'}`),
  );
  tile.append(cb, body);
  return tile;
}

// ---------- game loop ----------

function startGame() {
  const handSize = clamp(parseInt(byId('hand-size').value, 10) || 5, 3, 10);
  const pool = state.bricks
    .filter(b => state.selectedBrickIds.has(b.key) && state.typeFilter.has(b.type))
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
    score: 0,
    streak: 0,                  // consecutive correct rounds; resets on exhaust
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
  g.shuffledClues = shuffleWithImageBias([...target.buzzwords]);
  g.revealed = [];
  g.wrongThisRound = new Set();
  g.justStartedRound = true;                     // tells renderGame to animate the deal
  revealNextClue('initial');                     // this calls renderGame, which animates everything
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
  g.justRevealedClueIdx = idx;   // flag for animation in renderGame
  renderGame();
}

function playCard(cardId) {
  const g = state.game;
  if (!g.target || g.animating) return;
  if (!g.hand.some(c => c.id === cardId)) return; // only hand cards are playable; extras must be drawn first

  if (cardId === g.target.id) {
    // Correct — celebrate, then penalty popups, then deal remaining clues, then fly back & shuffle.
    g.cardsPlayed += 1;
    g.usedTargetIds.add(g.target.id);
    g.streak += 1;
    state.history.push({
      target: { ...g.target },
      result: 'correct',
      cluesUsed:     g.revealed.length,
      totalClues:    g.shuffledClues.length,
      shuffledClues: [...g.shuffledClues],
    });
    const penaltyCount = computeUnneededDrawCount();
    byId('stat-cards-left').textContent = g.pool.length - g.usedTargetIds.size;
    g.target = null;
    g.animating = true;

    // 🎉 Celebration: card spotlight + confetti + big target title overlay.
    const playedCardEl = byId('hand').querySelector(`[data-id="${cardId}"]`);
    celebrateCorrect(playedCardEl, g.hand.find(c => c.id === cardId).title);
    sfx.celebrate();
    // Streak ticked up — show the new multiplier with a pulse and chime if it grew the multiplier.
    updateStreakDisplay(true);
    if (g.streak >= 2) sfx.streak();

    // After the spotlight, the played card glides into the center of the clue pile
    // and becomes the "base" of the stack; the remaining clues then land on top of it.
    setTimeout(() => moveAnswerToPile(playedCardEl, g.hand.find(c => c.id === cardId) || { id: cardId }), 800);

    let t = 1700;  // celebration (~800ms) + move-into-pile flight (~900ms)
    if (penaltyCount > 0) {
      for (let i = 0; i < penaltyCount; i++) {
        setTimeout(() => deductScore(POINTS_PER_MISS, byId('extras-deck')), t + i * 220);
      }
      t += penaltyCount * 220 + 200;
    }
    setTimeout(() => dealRemainingCluesThenShuffle(), t);
  } else {
    // Wrong: stays in hand, eliminated from this round, force next clue. Hefty
    // penalty + the streak resets — wrong diagnoses should sting.
    g.wrongThisRound.add(cardId);
    const cardEl = byId('hand').querySelector(`[data-id="${cardId}"]`);
    deductScore(POINTS_PER_WRONG, cardEl);
    sfx.wrong();
    const streakBroke = g.streak >= 2;
    if (streakBroke) {
      g.streak = 0;
      updateStreakDisplay(true);
    }
    toast(`Not it · −${POINTS_PER_WRONG}${streakBroke ? ' · streak broken' : ''}`, 'wrong');
    revealNextClue('forced');
  }
}

function exhaustRound() {
  const g = state.game;
  const target = g.target;
  state.history.push({
    target: { ...target },
    result: 'exhaust',
    cluesUsed:     g.revealed.length,
    totalClues:    g.shuffledClues.length,
    shuffledClues: [...g.shuffledClues],
  });
  const penaltyCount = computeUnneededDrawCount();
  const streakBroken = g.streak >= 2;
  toast(`Out of clues — it was ${target.title}${streakBroken ? ' · streak broken' : ''}`, 'info', 1800);
  g.usedTargetIds.add(target.id);
  byId('stat-cards-left').textContent = g.pool.length - g.usedTargetIds.size;
  g.streak = 0;
  updateStreakDisplay(true);
  sfx.wrong();
  g.target = null;
  g.animating = true;

  let t = 1000;
  if (penaltyCount > 0) {
    for (let i = 0; i < penaltyCount; i++) {
      setTimeout(() => deductScore(POINTS_PER_MISS, byId('extras-deck')), 400 + i * 220);
    }
    t = Math.max(t, 400 + penaltyCount * 220 + 200);
  }
  setTimeout(() => endRoundFlyBackAndShuffle(), t);
}

// Returns how many extras were drawn while the target was already in the hand.
function computeUnneededDrawCount() {
  const g = state.game;
  if (!g.targetInHandAtStart) return 0;
  return Math.max(0, (g.initialExtrasCount || 0) - g.extras.length);
}

// Deal each remaining (unused) clue out as a card. Each awards POINTS_PER_CLUE * streakMultiplier.
// We append new clue cards directly to the pile DOM rather than re-rendering so the
// .answer-card we placed in the pile center is preserved underneath the growing stack.
function dealRemainingCluesThenShuffle() {
  const g = state.game;
  const total = g.shuffledClues.length;
  const remaining = total - g.revealed.length;
  if (remaining === 0) {
    setTimeout(endRoundFlyBackAndShuffle, 250);
    return;
  }
  const perClue = Math.round(POINTS_PER_CLUE * getStreakMultiplier());
  const pile = byId('clue-pile');
  const clueDeck = byId('clue-deck');
  let i = 0;
  function dealNext() {
    if (i >= remaining) {
      setTimeout(endRoundFlyBackAndShuffle, 400);
      return;
    }
    const newIdx = g.revealed.length;
    const clue = g.shuffledClues[newIdx];
    g.revealed.push(clue);

    // Build + append the new clue card manually (z-index above the answer card).
    const card = el('div', { class: 'card clue-card' });
    card.style.zIndex = String(newIdx + 1);
    card.append(
      el('div', { class: 'card-emblem clue-emblem' }, '✦'),
      el('div', { class: 'clue-index' }, toRoman(newIdx + 1)),
    );
    appendClueBody(card, clue);
    pile.append(card);

    // Animate it in from the clue deck, auto-fit its text (text clues only),
    // ping the deck count.
    requestAnimationFrame(() => {
      const txt = card.querySelector('.clue-text');
      if (txt) autoFitText(txt, 15, 7);
      flyFromDeck(card, clueDeck, { duration: 380 });
    });
    sfx.flip();
    // Decrement the deck counter visually
    byId('clue-deck-count').textContent = Math.max(0, total - g.revealed.length);

    // Award the (multiplied) points once the new clue card has landed visually
    setTimeout(() => {
      awardScore(perClue, card);
      sfx.coin();
    }, 280);
    i++;
    setTimeout(dealNext, 330);
  }
  dealNext();
}

function getStreakMultiplier() {
  const s = state.game ? (state.game.streak || 0) : 0;
  if (s <= 1) return 1;
  return Math.min(1 + (s - 1) * 0.5, STREAK_CAP);
}

function updateStreakDisplay(pulse) {
  const g = state.game;
  if (!g) return;
  const mult = getStreakMultiplier();
  const el = byId('stat-streak');
  if (!el) return;
  el.textContent = '×' + (mult % 1 === 0 ? mult : mult.toFixed(1));
  el.classList.remove('warm', 'hot', 'blazing');
  if      (g.streak >= 6) el.classList.add('blazing');
  else if (g.streak >= 4) el.classList.add('hot');
  else if (g.streak >= 2) el.classList.add('warm');
  if (pulse) {
    el.classList.remove('streak-pulse');
    void el.offsetWidth;
    el.classList.add('streak-pulse');
  }
}

function endRoundFlyBackAndShuffle() {
  endRoundAnimation().then(() => {
    state.game.animating = false;
    state.game.revealed = [];
    startRound();
  });
}

// After the celebration, the played card flies from the hand to a NEW spot
// to the right of the clue pile. The whole pile shifts with it — existing
// clue cards slide along, and any clues dealt out next will land on top of
// the answer card at that new location.
function moveAnswerToPile(cardEl, cardData) {
  if (!cardEl) return;
  const pile = byId('clue-pile');

  // 1) Capture old positions BEFORE applying the pile shift, so we can
  //    FLIP each affected card to its new home in one synchronized animation.
  const playedOldRect = cardEl.getBoundingClientRect();
  const existingClues = [...pile.querySelectorAll('.clue-card')];
  const clueOldRects  = existingClues.map(c => c.getBoundingClientRect());

  // 2) Strip celebration + hand-specific styling. Suppress the base .card
  //    transform transition so CSS doesn't try to ease the celebrating
  //    transform back to none in parallel with the WAA animation below.
  //    Also pin a high z-index inline so the card stays visible the whole
  //    flight — .celebrating has z-index 2000 but .answer-card drops to 0,
  //    which lets the hand cards / decks / confetti occlude the travel.
  cardEl.style.transition = 'none';
  cardEl.style.zIndex = '3000';
  cardEl.classList.remove('celebrating', 'fading', 'hand-card');
  cardEl.classList.add('answer-card');
  cardEl.style.removeProperty('--card-rot');
  cardEl.style.removeProperty('--card-y');
  cardEl.style.removeProperty('--card-z');
  cardEl.style.removeProperty('margin-left');
  cardEl.style.transform = '';

  // 3) Apply the pile shift instantly — CSS moves .clue-pile right via a
  //    translateX rule keyed on .has-answer. Each card then gets its own
  //    WAA animation below so they all slide together smoothly.
  pile.classList.add('has-answer');

  // 4) Move the played card into the pile DOM (prepend → DOM index 0 →
  //    z-index 0 by the .answer-card rule, so clues stack on top of it).
  pile.prepend(cardEl);
  if (state.game) state.game.hand = state.game.hand.filter(c => c.id !== cardData.id);

  // 5) FLIP-animate the played card from its hand position to its new spot.
  //    Because the card was scaled up by .celebrating, we MUST use the center
  //    delta (not left/top delta) — `transform: translate() scale()` with
  //    transform-origin 50% 50% positions by center, not by top-left.
  const playedNewRect = cardEl.getBoundingClientRect();
  const oldCx = playedOldRect.left + playedOldRect.width  / 2;
  const oldCy = playedOldRect.top  + playedOldRect.height / 2;
  const newCx = playedNewRect.left + playedNewRect.width  / 2;
  const newCy = playedNewRect.top  + playedNewRect.height / 2;
  const pdx = oldCx - newCx;
  const pdy = oldCy - newCy;
  const psx = playedOldRect.width  / Math.max(1, playedNewRect.width);
  const psy = playedOldRect.height / Math.max(1, playedNewRect.height);
  const startScale = ((psx + psy) / 2).toFixed(3);
  // Slight arc: lift the card a bit past straight-line during the middle of
  // the flight so it visibly travels rather than dissolving toward the target.
  const midScale = (1 + parseFloat(startScale)) / 2;
  const playedAni = cardEl.animate(
    [
      { transform: `translate(${pdx}px, ${pdy}px) scale(${startScale})`, opacity: 1, offset: 0 },
      { transform: `translate(${(pdx * 0.5).toFixed(1)}px, ${(pdy * 0.5 - 30).toFixed(1)}px) scale(${midScale.toFixed(3)})`, opacity: 1, offset: 0.5 },
      { transform: 'none', opacity: 1, offset: 1 },
    ],
    { duration: 900, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', fill: 'none' }
  );
  // Restore the base transition + drop the inline z-index once the flight ends,
  // letting CSS (z-index 0 from .clue-pile .answer-card) take over.
  const restore = () => {
    cardEl.style.transition = '';
    cardEl.style.zIndex = '';
  };
  playedAni.finished.then(restore, restore);

  // 6) FLIP-animate each existing clue card so it slides along with the pile
  //    to its new (shifted) position. We compose the inverse offset with each
  //    card's natural nth-child transform so it lands exactly where CSS wants it.
  existingClues.forEach((c, i) => {
    const oldR = clueOldRects[i];
    const newR = c.getBoundingClientRect();
    const cdx = oldR.left - newR.left;
    const cdy = oldR.top  - newR.top;
    if (Math.abs(cdx) < 1 && Math.abs(cdy) < 1) return;
    const naturalT = getComputedStyle(c).transform;
    const naturalStr = naturalT && naturalT !== 'none' ? naturalT : 'translate(0,0)';
    c.animate(
      [
        { transform: `translate(${cdx}px, ${cdy}px) ${naturalStr}` },
        { transform: naturalStr },
      ],
      { duration: 700, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', fill: 'none' }
    );
  });
}

// --- Celebration ---

function celebrateCorrect(cardEl, title) {
  // 1) Lift, glow, and scale the played card via a CSS class.
  // (No .fading anymore — the card animates into the clue pile instead.)
  if (cardEl) cardEl.classList.add('celebrating');
  // 2) Confetti burst centered on the played card.
  if (cardEl) {
    const r = cardEl.getBoundingClientRect();
    spawnConfetti(r.left + r.width / 2, r.top + r.height / 2);
  } else {
    spawnConfetti(window.innerWidth / 2, window.innerHeight / 2);
  }
  // 3) Big target-title burst near the top of the screen.
  spawnTitleBurst(title);
}

function spawnConfetti(x, y) {
  const COUNT = 30;
  const COLORS = ['#10b981', '#f59e0b', '#3b82f6', '#ec4899', '#f97316', '#a855f7', '#22c55e'];
  for (let i = 0; i < COUNT; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti' + (i % 3 === 0 ? ' square' : '');
    const angle = (Math.PI * 2 * i / COUNT) + (Math.random() * 0.5 - 0.25);
    const dist  = 90 + Math.random() * 130;
    const dx = Math.cos(angle) * dist;
    const dy = Math.sin(angle) * dist - 30;            // slight upward bias
    const finalDy = dy + 220 + Math.random() * 120;     // gravity after the burst
    const rot = Math.random() * 720 - 360;
    piece.style.left = x + 'px';
    piece.style.top  = y + 'px';
    piece.style.backgroundColor = COLORS[i % COLORS.length];
    document.body.appendChild(piece);
    piece.animate(
      [
        { transform: 'translate(-50%, -50%) rotate(0deg) scale(1)',                opacity: 1 },
        { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) rotate(${rot}deg) scale(1)`,             opacity: 1, offset: 0.32 },
        { transform: `translate(calc(-50% + ${dx * 1.15}px), calc(-50% + ${finalDy}px)) rotate(${rot * 1.6}deg) scale(0.8)`, opacity: 0 }
      ],
      { duration: 1400 + Math.random() * 600, easing: 'cubic-bezier(0.2, 0.6, 0.3, 1)', fill: 'forwards' }
    ).finished.then(() => piece.remove(), () => piece.remove());
  }
}

function spawnTitleBurst(title) {
  const div = document.createElement('div');
  div.className = 'correct-burst';
  div.append(
    el('div', { class: 'correct-burst-check' }, '✓'),
    el('div', { class: 'correct-burst-title' }, title),
  );
  document.body.appendChild(div);
  div.animate(
    [
      { transform: 'translate(-50%, -50%) scale(0.45) rotate(-6deg)', opacity: 0 },
      { transform: 'translate(-50%, -50%) scale(1.15) rotate(2deg)',  opacity: 1, offset: 0.18 },
      { transform: 'translate(-50%, -50%) scale(1.0) rotate(-1deg)',  opacity: 1, offset: 0.60 },
      { transform: 'translate(-50%, -50%) scale(0.92) rotate(0deg)',  opacity: 0 }
    ],
    { duration: 1500, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)', fill: 'forwards' }
  ).finished.then(() => div.remove(), () => div.remove());
}

// --- Score helpers ---
function awardScore(amount, originEl) {
  const g = state.game;
  g.score += amount;
  byId('stat-score').textContent = g.score;
  pulseScore('positive');
  spawnPointsPopup(`+${amount}`, originEl, true);
}
function deductScore(amount, originEl) {
  const g = state.game;
  g.score -= amount;
  byId('stat-score').textContent = g.score;
  pulseScore('negative');
  spawnPointsPopup(`−${amount}`, originEl, false);
}
function spawnPointsPopup(text, originEl, positive) {
  let x, y;
  if (originEl) {
    const r = originEl.getBoundingClientRect();
    x = r.left + r.width / 2;
    y = r.top + r.height * 0.25;
  } else {
    const r = byId('stat-score').getBoundingClientRect();
    x = r.left + r.width / 2;
    y = r.top;
  }
  const popup = document.createElement('div');
  popup.className = 'score-popup ' + (positive ? 'positive' : 'negative');
  popup.textContent = text;
  popup.style.left = x + 'px';
  popup.style.top  = y + 'px';
  document.body.appendChild(popup);
  popup.animate(
    [
      { transform: 'translate(-50%, 8px) scale(0.7)',   opacity: 0 },
      { transform: 'translate(-50%, -16px) scale(1.25)', opacity: 1, offset: 0.18 },
      { transform: 'translate(-50%, -90px) scale(1.0)',  opacity: 0 },
    ],
    { duration: 1100, easing: 'cubic-bezier(0.22, 0.8, 0.36, 1)', fill: 'forwards' }
  ).finished.then(() => popup.remove(), () => popup.remove());
}
let scorePulseTimer = null;
function pulseScore(kind) {
  const el = byId('stat-score');
  el.classList.remove('pulse-positive', 'pulse-negative');
  void el.offsetWidth;       // restart animation
  el.classList.add(kind === 'positive' ? 'pulse-positive' : 'pulse-negative');
  clearTimeout(scorePulseTimer);
  scorePulseTimer = setTimeout(() => el.classList.remove('pulse-positive', 'pulse-negative'), 500);
}

function endGame() {
  const g = state.game;
  byId('final-score').textContent  = g.score;
  byId('final-played').textContent = g.cardsPlayed;
  show('over');
}

// ---------- render ----------

function renderGame() {
  const g = state.game;
  byId('stat-score').textContent      = g.score;
  byId('stat-cards-left').textContent = g.pool.length - g.usedTargetIds.size;
  updateStreakDisplay(false);

  // Clue deck: shows clues remaining; disabled when none left
  const totalClues = g.shuffledClues ? g.shuffledClues.length : 0;
  const cluesLeft  = Math.max(0, totalClues - g.revealed.length);
  byId('clue-deck-count').textContent = cluesLeft;
  byId('clue-deck').classList.toggle('disabled', !g.target || cluesLeft <= 0);

  // Clue pile: each revealed clue is a face-up card, oldest first, newest on top.
  const pile = byId('clue-pile');
  pile.classList.remove('has-answer');
  pile.innerHTML = '';
  g.revealed.forEach((clue, i) => {
    const card = el('div', { class: 'card clue-card' });
    card.style.zIndex = String(i + 1);
    card.append(
      el('div', { class: 'card-emblem clue-emblem' }, '✦'),
      el('div', { class: 'clue-index' }, toRoman(i + 1)),
    );
    appendClueBody(card, clue);
    pile.append(card);
  });

  // Hand (fan layout)
  const handEl = byId('hand');
  handEl.innerHTML = '';
  const n = g.hand.length;
  const center = (n - 1) / 2;
  const ROT_STEP = 6;
  const ARC_STEP = 3;
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

  // Extras deck
  byId('extras-deck-count').textContent = g.extras.length;
  byId('extras-deck').classList.toggle('disabled', !g.target || g.extras.length === 0);

  // Post-render: auto-fit text + run animations triggered by state flags.
  requestAnimationFrame(() => {
    // Shrink the font as low as 7px when needed so even the longest
    // single word fits the card width — no hyphenation, no mid-word breaks.
    handEl.querySelectorAll('.card-title').forEach(t => autoFitText(t, 16, 7));
    pile.querySelectorAll('.clue-text').forEach(t => autoFitText(t, 15, 7));

    // Deal-in animation when a fresh round starts
    if (g.justStartedRound) {
      const deck = byId('extras-deck');
      [...handEl.children].forEach((c, i) => flyFromDeck(c, deck, { delay: 60 + i * 55 }));
      g.justStartedRound = false;
    }
    // Clue reveal animation
    if (g.justRevealedClueIdx !== undefined) {
      const newClue = pile.children[g.justRevealedClueIdx];
      if (newClue) flyFromDeck(newClue, byId('clue-deck'), { duration: 380 });
      g.justRevealedClueIdx = undefined;
    }
    // Extra-draw animation
    if (g.justDrewExtraId) {
      const drawnCard = handEl.querySelector(`[data-id="${g.justDrewExtraId}"]`);
      if (drawnCard) flyFromDeck(drawnCard, byId('extras-deck'), { duration: 380 });
      g.justDrewExtraId = null;
    }
  });
}

// ---------- Animations ----------

// Animate a freshly-placed card so it appears to fly out of the given deck into its current position.
function flyFromDeck(targetEl, deckEl, opts = {}) {
  if (!targetEl || !deckEl || typeof targetEl.animate !== 'function') return null;
  const t = targetEl.getBoundingClientRect();
  const d = deckEl.getBoundingClientRect();
  const dx = (d.left + d.width / 2) - (t.left + t.width / 2);
  const dy = (d.top  + d.height / 2) - (t.top  + t.height / 2);
  // The card already has a CSS-computed transform (fan/stack rotation). Concatenate
  // the deck-direction translate onto it so the FROM state preserves rotation.
  const natural  = getComputedStyle(targetEl).transform;
  const naturalT = (natural && natural !== 'none') ? natural : 'translate(0,0)';
  const startT   = `${naturalT} translate(${dx}px, ${dy}px) scale(0.55)`;
  return targetEl.animate(
    [
      { transform: startT,   opacity: 0 },
      { transform: naturalT, opacity: 1 },
    ],
    {
      duration: opts.duration ?? 420,
      delay: opts.delay ?? 0,
      easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
      fill: 'none',
    }
  );
}

// Animate a card from its current spot away into the given deck (round-end).
function flyToDeck(sourceEl, deckEl, opts = {}) {
  if (!sourceEl || !deckEl || typeof sourceEl.animate !== 'function') return { finished: Promise.resolve() };
  const s = sourceEl.getBoundingClientRect();
  const d = deckEl.getBoundingClientRect();
  const dx = (d.left + d.width / 2) - (s.left + s.width / 2);
  const dy = (d.top  + d.height / 2) - (s.top  + s.height / 2);
  const natural  = getComputedStyle(sourceEl).transform;
  const naturalT = (natural && natural !== 'none') ? natural : 'translate(0,0)';
  const endT     = `${naturalT} translate(${dx}px, ${dy}px) scale(0.35)`;
  return sourceEl.animate(
    [
      { transform: naturalT, opacity: 1 },
      { transform: endT,     opacity: 0 },
    ],
    {
      duration: opts.duration ?? 380,
      delay: opts.delay ?? 0,
      easing: 'cubic-bezier(0.55, 0, 0.65, 0)',
      fill: 'forwards',
    }
  );
}

// End-of-round: send hand cards → extras deck and clue cards → clue deck, then wiggle both decks.
function endRoundAnimation() {
  const handCards = [...byId('hand').children];
  const clueCards = [...byId('clue-pile').children];
  const extrasDeck = byId('extras-deck');
  const clueDeck   = byId('clue-deck');
  const finished = [];
  handCards.forEach((c, i) => finished.push(flyToDeck(c, extrasDeck, { delay: i * 25 }).finished));
  clueCards.forEach((c, i) => finished.push(flyToDeck(c, clueDeck,   { delay: i * 25 }).finished));
  if (!finished.length) return Promise.resolve();
  return Promise.all(finished).catch(() => {}).then(() => {
    // Both decks do a quick shuffle wobble; resolve when wobble ends.
    extrasDeck.classList.add('shuffling');
    clueDeck.classList.add('shuffling');
    sfx.shuffle();
    return new Promise(resolve => setTimeout(() => {
      extrasDeck.classList.remove('shuffling');
      clueDeck.classList.remove('shuffling');
      resolve();
    }, 380));
  });
}

// Shrink a text element's font size by 1px at a time until it stops overflowing
// either dimension of its parent card. Uses the element's own scrollWidth vs
// clientWidth (standard overflow check) and the card's available content height
// (computed from its padding) for accurate measurement.
function autoFitText(el, startPx, minPx) {
  if (!el) return;
  const card = el.closest('.card');
  if (!card) return;
  let px = startPx;
  el.style.fontSize = px + 'px';

  const cs = getComputedStyle(card);
  const padTop    = parseFloat(cs.paddingTop)    || 0;
  const padBottom = parseFloat(cs.paddingBottom) || 0;
  const availH    = card.clientHeight - padTop - padBottom - 4;   // tiny extra margin

  let guard = 0;
  while (guard++ < 36) {
    const overflowsW = el.scrollWidth  > el.clientWidth;            // a single word wider than its line
    const overflowsH = el.scrollHeight > availH;                    // wrapped text too tall
    if ((!overflowsW && !overflowsH) || px <= minPx) break;
    px -= 1;
    el.style.fontSize = px + 'px';
  }
}

function renderHandCard(c) {
  const g = state.game;
  const card = el('div', {
    class: 'card hand-card' + (g.wrongThisRound.has(c.id) ? ' eliminated' : ''),
    'data-id': c.id,
    'data-type': c.type,
  });
  card.append(
    el('div', { class: 'card-emblem' }, TYPE_SYMBOL[c.type] || '✦'),
    el('div', { class: 'card-title' }, c.title),
  );
  if (!g.wrongThisRound.has(c.id)) card.onclick = () => playCard(c.id);
  return card;
}

// ---------- helpers ----------

function byId(id) { return document.getElementById(id); }
function toRoman(n) {
  const map = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
  return map[n] || String(n);
}
function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v;
    else if (v !== false && v != null) n.setAttribute(k, v);
  }
  for (const k of kids) if (k != null) n.append(k.nodeType ? k : document.createTextNode(k));
  return n;
}

// A clue is either a plain string (text buzzword) or an object { img: "path" }.
function isImageClue(c) { return c && typeof c === 'object' && typeof c.img === 'string'; }
// Click-to-enlarge lightbox for image clues. Click anywhere on the overlay
// (including the image) to dismiss; ESC also closes it.
function openImageLightbox(src) {
  closeImageLightbox();
  const overlay = el('div', { class: 'image-lightbox', id: 'image-lightbox' });
  overlay.append(el('img', { src, alt: 'enlarged clue image' }));
  overlay.addEventListener('click', closeImageLightbox);
  document.body.append(overlay);
  requestAnimationFrame(() => overlay.classList.add('open'));
  if (typeof sfx !== 'undefined') sfx.click();
}
function closeImageLightbox() {
  const overlay = byId('image-lightbox');
  if (overlay) overlay.remove();
}
// Shuffle that biases image clues toward the front of the reveal order.
// Each clue gets a sort key; images draw their key from a narrower range
// near 0, so they almost always end up in the first ~2 reveals, with enough
// noise that the exact slot still varies. Cards with no image clues behave
// like a uniform shuffle.
function shuffleWithImageBias(arr) {
  return arr
    .map(c => ({ c, k: isImageClue(c) ? Math.random() * 0.25 : Math.random() }))
    .sort((a, b) => a.k - b.k)
    .map(o => o.c);
}
// Append the right body content to a .clue-card based on the clue shape.
function appendClueBody(card, clue) {
  if (isImageClue(clue)) {
    card.classList.add('has-image');
    card.append(el('img', { class: 'clue-image', src: clue.img, alt: 'visual clue', loading: 'eager' }));
  } else {
    card.append(el('div', { class: 'clue-text' }, clue));
  }
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
