// Phoneme inventory and tokenizer for the ipa-dict en_US transcriptions.
// Shared by the build script (node) and the game (browser).

// Two-char phonemes must be matched before their first char is taken alone.
// ɔɪ is the only digraph whose first char also stands alone (ɔ as in "thought"),
// so greedy longest-match is required, not optional.
export const DIGRAPHS = ['eɪ', 'oʊ', 'aɪ', 'aʊ', 'ɔɪ', 'tʃ', 'dʒ'];

export const VOWELS = ['i', 'ɪ', 'ɛ', 'æ', 'ə', 'ʌ', 'u', 'ʊ', 'ɔ', 'ɑ', 'eɪ', 'oʊ', 'aɪ', 'aʊ', 'ɔɪ'];
export const CONSONANTS = ['p', 'b', 't', 'd', 'k', 'ɡ', 'tʃ', 'dʒ', 'f', 'v', 'θ', 'ð', 's', 'z', 'ʃ', 'ʒ', 'h', 'm', 'n', 'ŋ', 'ɾ', 'ɫ', 'ɹ', 'ʍ', 'w', 'j'];

/* ipa-dict follows four conventions the charts do not: ə covers both schwa and
   wedge, ʍ is spelled out as the sequence hw, the flap is left as a plain t or d,
   and the r-coloured vowel of "bird" is the single symbol ɝ. resolve() undoes all
   four, so data/ holds exactly what the game tiles and reveals. */
// A stress mark belongs to the next vowel it reaches, so the vowels are listed
// out to stop the match running past one to a later ə.
const AFTER_STRESS = /([ˈˌ])([^iɪɛæəɝuʊɔɑaeo]*)ə/g;
// General American taps a t or d between a vowel (or ɹ) and an unstressed vowel:
// batter, water, party. A following stress mark is not in the class, which is
// what keeps attack unflapped; a preceding n keeps winter unflapped. Before a
// syllabic n the stop glottalises instead of tapping, so button and kitten are
// excluded — metal and bottom, which have no n, still tap.
const FLAP = /(?<=[iɪɛæəʌuʊɔɑ]|ɹ)[td](?=[iɪɛæəʌuʊɔɑ])(?!ən)/g;
export function resolve(ipa, word) {
  const s = /wh/.test(word) ? ipa.replace(/hw/g, 'ʍ') : ipa;
  return s
    // Wedge before ɝ: bird is /bəɹd/, never /bʌɹd/, so the ə must not exist yet
    // when the stress rule runs.
    .replace(AFTER_STRESS, '$1$2ʌ')
    // Neither sheet has ɝ. It is the ə + ɹ of "bird", which both sheets do have.
    .replace(/ɝ/g, 'əɹ')
    // Flap last, so water reaches it as /ˈwɔtəɹ/ and taps like city does.
    .replace(FLAP, 'ɾ');
}
export const PHONEMES = [...CONSONANTS, ...VOWELS];

const PHONEME_SET = new Set(PHONEMES);

// Stress marks carry no tile of their own — the grid is phonemes only.
const STRESS = /[ˈˌ]/g;

/** "/ˈkæt/" -> ["k","æ","t"]. Returns null if anything outside the inventory appears. */
export function tokenize(ipa) {
  const s = ipa.replace(/^\/|\/$/g, '').replace(STRESS, '');
  const out = [];
  for (let i = 0; i < s.length; ) {
    const two = s.slice(i, i + 2);
    if (DIGRAPHS.includes(two)) { out.push(two); i += 2; continue; }
    const one = s[i];
    if (!PHONEME_SET.has(one)) return null;
    out.push(one); i += 1;
  }
  return out;
}

/** ipa-dict packs variants as "/a/, /b/" — take the first, it is the primary. */
export function firstPronunciation(field) {
  return field.split(',')[0].trim();
}
