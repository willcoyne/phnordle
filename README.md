# Phnordle

Wordle, but you guess the **IPA transcription** of a hidden English word.

Each tile is one *phoneme*, not one letter — `tʃ` and `aɪ` each fill a single tile — so
"church" is five letters but three tiles: `tʃ ɝ tʃ`. Every key on the phonetic keyboard
carries an example word (`ʃ` → *shoe*), which is what makes the game playable without
already knowing the IPA.

## Running it

```
node scripts/serve.mjs      # http://localhost:8080
```

Static HTML/CSS/JS, no dependencies and no build step. It must be served over http —
the game `fetch`es its word lists, so opening `index.html` from disk will not work.

```
node scripts/test.mjs       # self-checks
node scripts/build-words.mjs # regenerate data/ from words/en_US.txt
```

## Modes

| Mode | Answers | Length | Notes |
|---|---|---|---|
| Classic | 1,200 common words | 4–8 phonemes | One shared "Phnordle of the day", 6 tries, progress saved. A single-use **Hint** reveals the *spelling* but never the transcription. |
| Endless Easy | same common list | 4–9 phonemes | Unlimited words, streak + win/loss totals, optional **Show spelling** toggle. |
| Endless Hard | all 101,036 words | 4–9 phonemes | Straight from the full dictionary, rare words included. |

Guesses must be the real pronunciation of *some* English word of the same length —
the equivalent of Wordle rejecting non-words. Marking follows Wordle exactly,
including repeated-phoneme handling (extra copies go gray once the answer's copies
are used up).

Seven themes (Wordle, Noir, Phosphor, Amber, Aurora, Ember, Blueprint), theme and mode
persist in `localStorage`.

## How the data is built

`words/en_US.txt` is `word<TAB>/ipa/`. `scripts/build-words.mjs` keeps purely
alphabetic single words, tokenises the transcription into phonemes and writes:

- `data/common.txt` — the 1,200 most frequent words that survive the filters
- `data/all.txt` — all 101,036, used for hard mode and for validating guesses

The tokeniser (`src/ipa.js`) greedy-matches seven digraphs (`eɪ oʊ aɪ aʊ ɔɪ tʃ dʒ`)
before single characters, and drops stress marks. It covers **all 125,927** dictionary
entries with no failures, yielding a 39-phoneme keyboard.

### Known quirks in the source dictionary

- It is conservative about a few American pronunciations: `what` is `/ˈhwət/` and
  `news` is `/ˈnjuz/`, which many speakers will not say that way.
- `ɫ` (dark L) is used for every /l/, and `ə` covers both /ə/ and /ʌ/.
- A handful of lowercase proper nouns (`sony`, `google`) ride in on the frequency list.
- `tʃ`/`dʒ` are always read as affricates, so a word like *courtship* tokenises its
  `t`+`ʃ` as one tile. Rare enough to leave alone.

## Credits

- Pronunciations: [open-dict-data/ipa-dict](https://github.com/open-dict-data/ipa-dict) (MIT)
- Word frequencies: [first20hours/google-10000-english](https://github.com/first20hours/google-10000-english) (public domain)
- Theme names nod to [ascii.krackeddevs.com](http://ascii.krackeddevs.com/)
