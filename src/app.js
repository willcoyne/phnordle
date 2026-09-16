import { tokenize } from './ipa.js';

const ROWS = 6;
const EPOCH = Date.UTC(2026, 0, 1);            // day 0 of the Phnordle calendar

// One example word per phoneme. Without these the keyboard is unusable to
// anyone who has not memorised the IPA, which is nearly everyone.
const EG = {
  p: 'pie', b: 'bee', t: 'tea', d: 'do', k: 'key', 'ɡ': 'go', 'tʃ': 'chew', 'dʒ': 'jaw',
  f: 'fee', v: 'view', 'θ': 'thin', 'ð': 'this', s: 'see', z: 'zoo', 'ʃ': 'shoe', 'ʒ': 'vision', h: 'he',
  m: 'me', n: 'no', 'ŋ': 'sing', 'ɫ': 'low', 'ɹ': 'red', w: 'we', j: 'yes',
  i: 'see', 'ɪ': 'sit', 'ɛ': 'bed', 'æ': 'cat', 'ə': 'sofa', 'ɝ': 'bird', u: 'too', 'ʊ': 'book', 'ɔ': 'thought', 'ɑ': 'father',
  'eɪ': 'day', 'oʊ': 'go', 'aɪ': 'my', 'aʊ': 'now', 'ɔɪ': 'boy',
};
export const KEY_ROWS = [
  ['p', 'b', 't', 'd', 'k', 'ɡ', 'tʃ', 'dʒ'],
  ['f', 'v', 'θ', 'ð', 's', 'z', 'ʃ', 'ʒ', 'h'],
  ['m', 'n', 'ŋ', 'ɫ', 'ɹ', 'w', 'j'],
  ['i', 'ɪ', 'ɛ', 'æ', 'ə', 'ɝ', 'u', 'ʊ', 'ɔ', 'ɑ'],
  ['eɪ', 'oʊ', 'aɪ', 'aʊ', 'ɔɪ'],
];

/* Chart layout: the same keys, arranged where the IPA charts put them.
   Consonants by place (columns) and manner (rows); vowels by tongue position
   inside the vowel quadrilateral. */
const PLACES = [
  ['Bilab.', 'Bilabial'], ['Labiod.', 'Labiodental'], ['Dent.', 'Dental'], ['Alv.', 'Alveolar'],
  ['Postalv.', 'Postalveolar'], ['Pal.', 'Palatal'], ['Vel.', 'Velar'], ['Glot.', 'Glottal'],
];
// One array per place column, voiceless first — the pairing the chart is for.
export const CONS_GRID = [
  ['Plosive', ['p', 'b'], [], [], ['t', 'd'], [], [], ['k', 'ɡ'], []],
  ['Affricate', [], [], [], [], ['tʃ', 'dʒ'], [], [], []],
  ['Fricative', [], ['f', 'v'], ['θ', 'ð'], ['s', 'z'], ['ʃ', 'ʒ'], [], [], ['h']],
  ['Nasal', ['m'], [], [], ['n'], [], [], ['ŋ'], []],
  ['Approximant', [], [], [], ['ɹ'], [], ['j'], ['w'], []],
  ['Lateral', [], [], [], ['ɫ'], [], [], [], []],
];
// Percent of the quad box: x = front→back, y = close→open.
export const VPOS = {
  i: [12, 7], 'ɪ': [19, 23], 'ɛ': [27, 50], 'æ': [34, 81], 'ə': [49, 44], 'ɝ': [51, 64],
  u: [90, 7], 'ʊ': [82, 23], 'ɔ': [88, 58], 'ɑ': [77, 87],
};
// [phoneme, start point, glide target] — drawn as an arrow, as on a diphthong chart.
export const DIPHS = [
  ['eɪ', [11, 48], 'ɪ'], ['aɪ', [67, 88], 'ɪ'], ['ɔɪ', [90, 56], 'ɪ'],
  ['oʊ', [93, 40], 'ʊ'], ['aʊ', [86, 88], 'ʊ'],
];

const $ = id => document.getElementById(id);
const el = (tag, cls, txt) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (txt != null) n.textContent = txt;
  return n;
};
const store = {
  get: (k, d) => { try { return JSON.parse(localStorage.getItem('phnordle:' + k)) ?? d; } catch { return d; } },
  set: (k, v) => localStorage.setItem('phnordle:' + k, JSON.stringify(v)),
};

/** Parse tab-separated "word<TAB>ipa" lines into {word, ipa, ph}. */
function parse(text) {
  const out = [];
  for (const line of text.split('\n')) {
    if (!line) continue;
    const [word, ipa] = line.split('\t');
    const ph = tokenize(ipa);
    if (ph) out.push({ word, ipa, ph });
  }
  return out;
}

const data = { common: [], all: [], valid: new Set() };
const S = {
  mode: 'classic', entry: null, rows: [], cur: [], done: false, hinted: false, day: 0,
  layout: 'rows', vowels: 'mono',
};

const dayIndex = () => {
  const n = new Date();
  return Math.floor((Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()) - EPOCH) / 864e5);
};

// Deterministic but not sequential: neighbouring days must not give neighbouring words.
// Every step re-coerces with >>> 0 — bare ^= yields a signed int32, and a negative
// index here just returns undefined instead of failing loudly.
export function dailyEntry(pool, day) {
  let h = Math.imul(day + 1, 2654435761) >>> 0;
  h = (h ^ (h >>> 15)) >>> 0;
  h = Math.imul(h, 2246822507) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  return pool[h % pool.length];
}

const poolFor = mode => mode === 'hard'
  ? data.all.filter(e => e.ph.length >= 4 && e.ph.length <= 9)
  : data.common.filter(e => e.ph.length >= 4 && e.ph.length <= (mode === 'classic' ? 8 : 9));

export function score(guess, answer) {
  const res = Array(guess.length).fill('x');
  const pool = new Map();
  answer.forEach((p, i) => { if (guess[i] !== p) pool.set(p, (pool.get(p) || 0) + 1); });
  guess.forEach((p, i) => { if (p === answer[i]) res[i] = 'g'; });
  guess.forEach((p, i) => {
    if (res[i] === 'x' && pool.get(p) > 0) { res[i] = 'y'; pool.set(p, pool.get(p) - 1); }
  });
  return res;
}

/* ---------- rendering ---------- */

function render() {
  const n = S.entry.ph.length;
  const board = $('board');
  board.innerHTML = '';
  for (let r = 0; r < ROWS; r++) {
    const row = el('div', 'row');
    row.style.gridTemplateColumns = 'repeat(' + n + ', auto)';
    const guess = S.rows[r];
    for (let c = 0; c < n; c++) {
      const sym = guess ? guess.ph[c] : (r === S.rows.length ? S.cur[c] : null);
      const tile = el('div', 'tile', sym || '');
      if (guess) tile.classList.add(guess.res[c]);
      else if (sym) tile.classList.add('filled');
      row.appendChild(tile);
    }
    board.appendChild(row);
  }
  renderKeys();
  renderStats();
}

function renderKeys() {
  // Best mark seen per phoneme: green beats yellow beats gray.
  const rank = { x: 0, y: 1, g: 2 };
  const best = new Map();
  for (const { ph, res } of S.rows) {
    ph.forEach((p, i) => {
      if (!best.has(p) || rank[res[i]] > rank[best.get(p)]) best.set(p, res[i]);
    });
  }
  const kb = $('keyboard');
  kb.innerHTML = '';
  kb.className = S.layout;
  kb.appendChild(tabs([['rows', 'Rows'], ['chart', 'IPA chart']], S.layout, v => {
    S.layout = v;
    store.set('layout', v);
    renderKeys();
  }));
  (S.layout === 'chart' ? chartKeys : rowKeys)(kb, best);
}

function rowKeys(kb, best) {
  KEY_ROWS.forEach((keys, i) => {
    const row = el('div', 'krow');
    const last = i === KEY_ROWS.length - 1;
    if (last) row.appendChild(mkAction('ENTER', submit));
    for (const p of keys) row.appendChild(mkKey(p, best));
    if (last) row.appendChild(mkAction('DEL', back));
    kb.appendChild(row);
  });
}

function chartKeys(kb, best) {
  kb.appendChild(consChart(best));
  kb.appendChild(vowelChart(best));
  const row = el('div', 'krow');
  row.appendChild(mkAction('ENTER', submit));
  row.appendChild(mkAction('DEL', back));
  kb.appendChild(row);
}

function consChart(best) {
  const wrap = el('div', 'chart');
  wrap.appendChild(el('div', 'chart-head', 'Consonants'));
  const g = el('div', 'cgrid');
  g.appendChild(el('div', 'clabel'));
  for (const [abbr, full] of PLACES) {
    const h = el('div', 'chead', abbr);
    h.title = full;
    g.appendChild(h);
  }
  for (const [manner, ...cells] of CONS_GRID) {
    g.appendChild(el('div', 'clabel', manner));
    for (const cell of cells) {
      const c = el('div', 'ccell');
      for (const p of cell) c.appendChild(mkKey(p, best));
      g.appendChild(c);
    }
  }
  wrap.appendChild(g);
  return wrap;
}

// Quad box is 460x230 units with a 30-unit gutter on top for the column labels;
// aspect-ratio in the CSS matches, so percent coords and viewBox units line up.
const U = ([x, y]) => [x * 4.6, y * 2.3];

function vowelChart(best) {
  const wrap = el('div', 'chart');
  const head = el('div', 'chart-head', 'Vowels');
  head.appendChild(tabs([['mono', 'Monophthongs'], ['di', 'Diphthongs']], S.vowels, v => {
    S.vowels = v;
    store.set('vowels', v);
    renderKeys();
  }));
  wrap.appendChild(head);

  const quad = el('div', 'quad');
  const lines = S.vowels === 'di' ? DIPHS.map(([, from, to]) => arrow(from, VPOS[to])).join('') : '';
  quad.innerHTML = `<svg viewBox="0 -30 460 260" aria-hidden="true">
    <defs><marker id="ar" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5"
      orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
    <g fill="currentColor" font-size="12" text-anchor="middle">
      <text x="110" y="-11">Front</text><text x="253" y="-11">Central</text><text x="391" y="-11">Back</text>
    </g>
    <g fill="none" stroke="currentColor" stroke-width="1.5">
      <path d="M36.8 0 H460 V230 H128.8 Z"/>
      <path d="M67 76 H460 M98 153 H460" stroke-width=".75"/>
      <path d="M184 0 V230 M322 0 V230" stroke-width=".75"/>
    </g>
    <g stroke="currentColor" stroke-width="1.6" marker-end="url(#ar)">${lines}</g>
  </svg>`;

  if (S.vowels === 'mono') {
    for (const p in VPOS) quad.appendChild(place(mkKey(p, best), VPOS[p]));
  } else {
    for (const t of ['ɪ', 'ʊ']) quad.appendChild(place(el('span', 'qghost', t), VPOS[t]));
    for (const [p, from] of DIPHS) quad.appendChild(place(mkKey(p, best), from));
  }
  wrap.appendChild(quad);
  wrap.appendChild(el('div', 'chart-foot', S.vowels === 'mono'
    ? 'front → back across, close → open down'
    : 'arrows show the glide; ɪ and ʊ are the targets'));
  return wrap;
}

/** Trimmed so the line starts clear of the key and stops short of its target. */
function arrow(from, to) {
  const [x1, y1] = U(from), [x2, y2] = U(to);
  const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
  const a = 22 / len, b = 13 / len;
  return `<line x1="${x1 + dx * a}" y1="${y1 + dy * a}" x2="${x2 - dx * b}" y2="${y2 - dy * b}"/>`;
}

function place(node, [x, y]) {
  // Top offset folds in the 30-unit label gutter: 30/260 of the box.
  node.style.left = x + '%';
  node.style.top = (11.54 + y * 0.8846) + '%';
  return node;
}

function mkKey(p, best) {
  const k = el('button', 'key' + (best.has(p) ? ' ' + best.get(p) : ''));
  k.appendChild(el('span', 'sym', p));
  k.appendChild(el('span', 'eg', EG[p]));
  k.onclick = () => push(p);
  return k;
}

const mkAction = (label, fn) => {
  const b = el('button', 'key wide', label);
  b.onclick = fn;
  return b;
};

function tabs(opts, active, onpick) {
  const box = el('div', 'ktabs');
  for (const [val, label] of opts) {
    const b = el('button', val === active ? 'active' : null, label);
    b.type = 'button';
    b.onclick = () => onpick(val);
    box.appendChild(b);
  }
  return box;
}

function renderStats() {
  const box = $('stats');
  if (S.mode === 'classic') { box.hidden = true; return; }
  const st = stats();
  box.hidden = false;
  box.innerHTML = '';
  for (const pair of [['Streak', st.streak], ['Best', st.best], ['Won', st.won], ['Lost', st.lost]]) {
    const s = el('span', null, pair[0] + ' ');
    s.appendChild(el('b', null, pair[1]));
    box.appendChild(s);
  }
}

function say(html) { $('msg').innerHTML = html; }

function showSub() {
  const spell = $('spell').checked && S.mode !== 'classic';
  $('sub').textContent = S.mode === 'classic'
    ? 'Phnordle #' + S.day + ' — ' + S.entry.ph.length + ' sounds'
    : S.entry.ph.length + ' sounds' + (spell ? ' — “' + S.entry.word + '”' : '');
}

/* ---------- play ---------- */

function push(p) {
  if (S.done || S.cur.length >= S.entry.ph.length) return;
  S.cur.push(p);
  render();
}
function back() { if (!S.done) { S.cur.pop(); render(); } }

function shake(text) {
  say(text);
  const row = $('board').children[S.rows.length];
  if (row) { row.classList.add('shake'); setTimeout(() => row.classList.remove('shake'), 500); }
}

function submit() {
  if (S.done) { if (S.mode !== 'classic') next(); return; }
  if (S.cur.length < S.entry.ph.length) { shake('Not enough sounds'); return; }
  if (!data.valid.has(S.cur.join(''))) { shake('Not the pronunciation of any word'); return; }

  const res = score(S.cur, S.entry.ph);
  S.rows.push({ ph: S.cur.slice(), res });
  S.cur = [];
  const won = res.every(r => r === 'g');
  if (won || S.rows.length === ROWS) finish(won); else say('');
  render();
  if (S.mode === 'classic') saveDaily();
}

function finish(won) {
  S.done = true;
  const reveal = '<span class="reveal">' + S.entry.word + ' — ' + S.entry.ipa + '</span>';
  if (S.mode === 'classic') {
    say(won ? 'Solved in ' + S.rows.length : reveal);
    return;
  }
  const st = stats();
  if (won) { st.won++; st.streak++; st.best = Math.max(st.best, st.streak); }
  else { st.lost++; st.streak = 0; }
  store.set('stats:' + S.mode, st);
  say((won ? 'Correct' : reveal) + ' · press Enter for the next word');
}

const stats = () => store.get('stats:' + S.mode, { streak: 0, best: 0, won: 0, lost: 0 });

function next() {
  const pool = poolFor(S.mode);
  start(pool[Math.floor(Math.random() * pool.length)]);
}

function start(entry) {
  S.entry = entry;
  S.rows = [];
  S.cur = [];
  S.done = false;
  S.hinted = false;
  say('');
  showSub();
  render();
}

/* ---------- classic persistence ---------- */

const dailyKey = () => 'daily:' + S.day;
function saveDaily() {
  store.set(dailyKey(), { word: S.entry.word, rows: S.rows.map(r => r.ph), hinted: S.hinted });
}
function loadDaily() {
  const saved = store.get(dailyKey());
  if (!saved || saved.word !== S.entry.word) return;
  for (const ph of saved.rows) S.rows.push({ ph, res: score(ph, S.entry.ph) });
  S.hinted = saved.hinted;
  if (S.hinted) $('hint-btn').disabled = true;
  const last = S.rows[S.rows.length - 1];
  const solved = !!last && last.res.every(r => r === 'g');
  if (solved || S.rows.length === ROWS) finish(solved);
}

/* ---------- mode switching ---------- */

function setMode(mode) {
  S.mode = mode;
  for (const b of $('modes').children) b.classList.toggle('active', b.dataset.mode === mode);
  $('hint-btn').hidden = mode !== 'classic';
  $('hint-btn').disabled = false;
  $('spell-toggle').hidden = mode === 'classic';
  store.set('mode', mode);

  if (mode !== 'classic') { next(); return; }
  S.day = dayIndex();
  start(dailyEntry(poolFor('classic'), S.day));
  loadDaily();
  render();
}

/* ---------- boot ---------- */

function boot([commonText, allText]) {
  data.common = parse(commonText);
  data.all = parse(allText);
  // Any real word's pronunciation is a legal guess, exactly as Wordle accepts
  // far more words than it ever uses as answers.
  for (const e of data.all) data.valid.add(e.ph.join(''));

  $('theme').onchange = e => {
    document.documentElement.dataset.theme = e.target.value;
    store.set('theme', e.target.value);
  };
  const theme = store.get('theme', 'wordle');
  $('theme').value = theme;
  document.documentElement.dataset.theme = theme;

  S.layout = store.get('layout', 'rows');
  S.vowels = store.get('vowels', 'mono');

  for (const b of $('modes').children) b.onclick = () => setMode(b.dataset.mode);
  $('spell').onchange = showSub;
  $('hint-btn').onclick = () => {
    S.hinted = true;
    $('hint-btn').disabled = true;
    say('<span class="reveal">The word is “' + S.entry.word + '”</span>');
    saveDaily();
  };
  $('help-btn').onclick = () => $('help').showModal();
  $('help-close').onclick = () => $('help').close();
  document.addEventListener('keydown', e => {
    if ($('help').open) return;
    if (e.key === 'Enter') submit();
    else if (e.key === 'Backspace') back();
  });

  setMode(store.get('mode', 'classic'));
  if (!store.get('seen', false)) { $('help').showModal(); store.set('seen', true); }
}

// Guarded so node can import score() for the self-check without a DOM.
if (typeof document !== 'undefined') {
  // Two-arg then, not .catch: a failure inside boot() must not be reported as a
  // failed download.
  Promise.all([
    fetch('data/common.txt').then(r => r.text()),
    fetch('data/all.txt').then(r => r.text()),
  ]).then(boot, () => say('Could not load the word lists — serve this over http, not file://'));
}
