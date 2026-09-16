// Self-check for the two pieces that are not obvious: phoneme tokenizing and
// Wordle marking with repeated phonemes. Run: node scripts/test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tokenize, resolve, PHONEMES } from '../src/ipa.js';
import { score, dailyEntry, KEY_ROWS, CONS_GRID, VPOS, DIPHS } from '../src/app.js';

// --- tokenizer ---
assert.deepEqual(tokenize('/ˈkæt/'), ['k', 'æ', 't']);
assert.deepEqual(tokenize('/ˈtʃɝtʃ/'), ['tʃ', 'ɝ', 'tʃ'], 'affricates are one tile');
assert.deepEqual(tokenize('/ˈdʒɔɪn/'), ['dʒ', 'ɔɪ', 'n'], 'ɔɪ wins over bare ɔ');
assert.deepEqual(tokenize('/ˈθɔt/'), ['θ', 'ɔ', 't'], 'bare ɔ still works');
assert.deepEqual(tokenize('/ˌɪnfɝˈmeɪʃən/'), ['ɪ', 'n', 'f', 'ɝ', 'm', 'eɪ', 'ʃ', 'ə', 'n'], 'stress marks are dropped');
assert.equal(tokenize('/ˈkæt qq/'), null, 'unknown symbols reject');
assert.deepEqual(tokenize('/ˈkʌp/'), ['k', 'ʌ', 'p']);
assert.deepEqual(tokenize('/ˈʍɪtʃ/'), ['ʍ', 'ɪ', 'tʃ'], 'ʍ is one tile');

// --- ipa-dict conventions the chart does not share ---
// ə covers schwa and wedge; the stress mark belongs to the next vowel it reaches.
assert.equal(resolve('/ˈkəp/', 'cup'), '/ˈkʌp/');
assert.equal(resolve('/ˈbətən/', 'button'), '/ˈbʌtən/', 'only the stressed ə moves');
assert.equal(resolve('/ˌəndɝˈstænd/', 'understand'), '/ˌʌndɝˈstænd/', 'secondary stress counts too');
assert.equal(resolve('/əˈbaʊt/', 'about'), '/əˈbaʊt/', 'a mark does not reach backwards');
assert.equal(resolve('/ˈsoʊfə/', 'sofa'), '/ˈsoʊfə/', 'a mark does not reach past another vowel');
// hw is ʍ in the wh- words and two sounds in the borrowings that merely look alike.
assert.equal(resolve('/ˈhwɪtʃ/', 'which'), '/ˈʍɪtʃ/');
assert.equal(resolve('/ˈhwæŋ/', 'huang'), '/ˈhwæŋ/', 'hua- and hwa- borrowings keep h + w');

// --- marking ---
const m = (g, a) => score(g.split(' '), a.split(' ')).join('');
assert.equal(m('k æ t', 'k æ t'), 'ggg');
assert.equal(m('t æ k', 'k æ t'), 'ygy');
assert.equal(m('p ɪ ɡ', 'k æ t'), 'xxx');
// Repeats are the case naive implementations get wrong: only as many yellows as
// there are unmatched copies left in the answer.
assert.equal(m('t t t', 't ɛ n'), 'gxx', 'extra copies go gray, not yellow');
assert.equal(m('s s t', 't ɛ s'), 'yxy', 'one copy in the answer marks one guess tile');
assert.equal(m('n n', 'n n'), 'gg');
assert.equal(m('t s t', 't ɛ t'), 'gxg', 'greens are consumed before yellows');

// --- daily pick ---
// The hash must land in range for every day, not just today: an unsigned slip
// makes the index negative and hands the game an undefined word.
const pool = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
const seen = new Set();
for (let day = 0; day < 20000; day++) {
  const pick = dailyEntry(pool, day);
  assert.ok(pool.includes(pick), 'day ' + day + ' gave ' + pick);
  seen.add(pick);
}
assert.equal(seen.size, pool.length, 'every word is reachable');
assert.equal(dailyEntry(pool, 42), dailyEntry(pool, 42), 'same day, same word');
let adjacent = 0;
for (let day = 0; day < 500; day++) if (dailyEntry(pool, day) === dailyEntry(pool, day + 1)) adjacent++;
assert.ok(adjacent < 150, 'consecutive days should rarely repeat, got ' + adjacent);

// --- data matches the shipped inventory ---
for (const f of ['data/common.txt', 'data/all.txt']) {
  const lines = fs.readFileSync(f, 'utf8').split('\n').filter(Boolean);
  assert.ok(lines.length > 0, f + ' is empty');
  const used = new Set();
  for (const line of lines) {
    const [word, ipa] = line.split('\t');
    const ph = tokenize(ipa);
    assert.ok(ph, f + ': cannot tokenize ' + word + ' ' + ipa);
    assert.ok(ph.length >= 4 && ph.length <= 9, f + ': ' + word + ' is ' + ph.length + ' phonemes');
    for (const p of ph) {
      assert.ok(PHONEMES.includes(p), f + ': ' + p + ' is not a key on the keyboard');
      used.add(p);
    }
  }
  // And the other direction: a key no word can use is a key that can never be pressed.
  if (f === 'data/all.txt') for (const p of PHONEMES) assert.ok(used.has(p), p + ' is on the keyboard but in no word');
  console.log(f + ': ' + lines.length + ' entries ok, ' + used.size + '/' + PHONEMES.length + ' phonemes used');
}

// --- keyboard layouts ---
// Both layouts must offer every phoneme exactly once, or a word becomes untypeable.
const cover = keys => assert.deepEqual([...keys].sort(), [...PHONEMES].sort());
cover(KEY_ROWS.flat());
const consKeys = CONS_GRID.flatMap(([, ...places]) => places.flatMap(pair => pair || [])).filter(Boolean);
cover([...consKeys, ...Object.keys(VPOS), ...DIPHS.map(d => d[0])]);
for (const [, , target] of DIPHS) assert.ok(VPOS[target], target + ' has no position to glide to');
for (const [manner, ...places] of CONS_GRID) {
  assert.equal(places.length, 8, manner + ' must have one column per place');
  // Each filled column is a [voiceless, voiced] pair; the renderer emits two cells either way.
  for (const pair of places) if (pair) assert.equal(pair.length, 2, manner + ' has a malformed pair');
}

console.log('all checks passed');
