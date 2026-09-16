// Phoneme inventory and tokenizer for the ipa-dict en_US transcriptions.
// Shared by the build script (node) and the game (browser).

// Two-char phonemes must be matched before their first char is taken alone.
// ɔɪ is the only digraph whose first char also stands alone (ɔ as in "thought"),
// so greedy longest-match is required, not optional.
export const DIGRAPHS = ['eɪ', 'oʊ', 'aɪ', 'aʊ', 'ɔɪ', 'tʃ', 'dʒ'];

export const VOWELS = ['i', 'ɪ', 'ɛ', 'æ', 'ə', 'ɝ', 'u', 'ʊ', 'ɔ', 'ɑ', 'eɪ', 'oʊ', 'aɪ', 'aʊ', 'ɔɪ'];
export const CONSONANTS = ['p', 'b', 't', 'd', 'k', 'ɡ', 'tʃ', 'dʒ', 'f', 'v', 'θ', 'ð', 's', 'z', 'ʃ', 'ʒ', 'h', 'm', 'n', 'ŋ', 'ɫ', 'ɹ', 'w', 'j'];
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
