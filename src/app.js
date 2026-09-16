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
const KEY_ROWS = [
  ['p', 'b', 't', 'd', 'k', 'ɡ', 'tʃ', 'dʒ'],
  ['f', 'v', 'θ', 'ð', 's', 'z', 'ʃ', 'ʒ', 'h'],
  ['m', 'n', 'ŋ', 'ɫ', 'ɹ', 'w', 'j'],
  ['i', 'ɪ', 'ɛ', 'æ', 'ə', 'ɝ', 'u', 'ʊ', 'ɔ', 'ɑ'],
  ['eɪ', 'oʊ', 'aɪ', 'aʊ', 'ɔɪ'],
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
const S = { mode: 'classic', entry: null, rows: [], cur: [], done: false, hinted: false, day: 0 };

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
  KEY_ROWS.forEach((keys, i) => {
    const row = el('div', 'krow');
    const last = i === KEY_ROWS.length - 1;
    if (last) row.appendChild(mkAction('ENTER', submit));
    for (const p of keys) {
      const k = el('button', 'key' + (best.has(p) ? ' ' + best.get(p) : ''));
      k.appendChild(el('span', 'sym', p));
      k.appendChild(el('span', 'eg', EG[p]));
      k.onclick = () => push(p);
      row.appendChild(k);
    }
    if (last) row.appendChild(mkAction('DEL', back));
    kb.appendChild(row);
  });
}
const mkAction = (label, fn) => {
  const b = el('button', 'key wide', label);
  b.onclick = fn;
  return b;
};

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
