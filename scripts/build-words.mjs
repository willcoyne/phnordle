// Turns words/en_US.txt into the three lists the game loads.
// Run: node scripts/build-words.mjs
import fs from 'node:fs';
import { tokenize, firstPronunciation, resolve } from '../src/ipa.js';

const MIN = 4, MAX = 9;           // phoneme count — the grid is phonemes, not spelling
const COMMON_TARGET = 1200;

const entries = [];               // [word, ipa, phonemeCount]
for (const line of fs.readFileSync('words/en_US.txt', 'utf8').split('\n')) {
  if (!line) continue;
  const [word, field] = line.split('\t');
  if (!/^[a-z]+$/.test(word)) continue;          // drops "'em", "a la carte", proper-noun casing
  const ipa = resolve(firstPronunciation(field), word);
  const t = tokenize(ipa);
  if (!t || t.length < MIN || t.length > MAX) continue;
  entries.push([word, ipa, t.length]);
}

const byWord = new Map(entries.map(e => [e[0], e]));

// Frequency-ordered intersection: "common" means common in real usage, and the
// order is the frequency rank, so slicing the head gives the most common ones.
const freq = fs.readFileSync('scripts/google-10000-english-usa.txt', 'utf8').split('\n');
const common = [];
for (const w of freq) {
  const e = byWord.get(w.trim());
  if (e) common.push(e);
  if (common.length >= COMMON_TARGET) break;
}

const fmt = list => list.map(([w, ipa]) => `${w}\t${ipa}`).join('\n') + '\n';
fs.writeFileSync('data/common.txt', fmt(common));
fs.writeFileSync('data/all.txt', fmt(entries));

const hist = n => entries.filter(e => e[2] === n).length;
const chist = n => common.filter(e => e[2] === n).length;
console.log(`all:    ${entries.length}`);
console.log(`common: ${common.length}`);
console.log('len   all   common');
for (let n = MIN; n <= MAX; n++) console.log(`${n}  ${String(hist(n)).padStart(6)}  ${String(chist(n)).padStart(6)}`);
