# Phnordle build log

Record of the 2026-09-15 session: installing the `ponytail` skill, then building
Phnordle from `thingstodo.txt`.

---

## 0. Preamble — installing the `ponytail` skill

`ponytail` was not in the installed skills, the three registered marketplaces
(`claude-plugins-official`, `anthropic-agent-skills`, `alexgreensh-token-optimizer`),
or the 2,951-entry plugin catalog cache. Found it published at
[DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail) (MIT).

`claude plugin marketplace add` was blocked by the auto-mode classifier — reasonable,
since it fetches and registers third-party code that installs lifecycle hooks. Handed
the two commands over instead; they were run manually:

```
/plugin marketplace add DietrichGebert/ponytail
/plugin install ponytail@ponytail
```

Verified Node.js v24.14.0 was on PATH first (the plugin's hooks require it). Result:
plugin active, `UserPromptSubmit` hook reporting `PONYTAIL MODE ACTIVE — level: full`,
six `ponytail:*` skills registered.

The whole build below therefore ran under ponytail's "laziest thing that works"
constraint — which is why it is vanilla HTML/CSS/JS with no framework, no bundler and
no dependencies.

---

## 1. Starting point

```
LICENSE
thingstodo.txt          the spec
IPA cheat sheet.pdf
words/en_US.txt         3.1 MB, 125,927 lines
```

`thingstodo.txt` asked for: a Wordle front end using the IPA; a Classic daily mode
(4–8, hint that reveals the word but not the transcription); Endless Easy (common
words, spelling toggle, streak and totals); Endless Hard (full dictionary); credit to
ipa-dict; a Wordle-like look with switchable themes.

---

## 2. Investigating the dictionary

The whole design hinges on how IPA strings decompose, so this came before any code.

**Format.** `word<TAB>/ipa/`. 8,419 lines pack variant pronunciations as
`/a/, /b/` — the first is primary. Zero malformed lines (every line has exactly 2
tab-separated fields).

**Symbol inventory.** 37 distinct characters. Notable:

| Finding | Consequence |
|---|---|
| `ˈ` (136,910) and `ˌ` (33,222) are stress marks | Not phonemes — stripped, they get no tile |
| `ɫ` (49,937) appears; plain `l` never does | Dark L *is* the /l/ phoneme here |
| No `ʌ` at all | `ə` covers both /ə/ and /ʌ/ |
| 9,082 spaces | All inside *variant* pronunciations, never the primary one |

**Digraph test.** Whether `aɪ`, `tʃ` etc. are one tile or two decides the keyboard,
the grid width and the whole feel of the game. Counting characters that break each
pairing:

```
a[^ʊɪ]     0        e[^ɪ]       0        o[^ʊ]       0
ɔ[^ɪ]      10,608   [^aeoɔ]ʊ    2,224    [^aeɔ]ɪ     38,256
[^t]ʃ      5,865    [^d]ʒ       454
```

`a`, `e`, `o` **never** stand alone — they only ever open `aɪ/aʊ`, `eɪ`, `oʊ`. But
`ɔ`, `ʊ`, `ɪ`, `ʃ`, `ʒ` all occur bare. So greedy longest-match is *required*, not
merely tidy: `/ˈdʒɔɪn/` must read `dʒ ɔɪ n`, while `/ˈθɔt/` must still read `θ ɔ t`.

Digraph frequencies: `oʊ` 17,118 · `eɪ` 11,992 · `aɪ` 10,061 · `dʒ` 6,338 ·
`tʃ` 4,889 · `aʊ` 2,977 · `ɔɪ` 1,204.

**Result: a 39-phoneme inventory** (24 consonants + 15 vowels) that tokenises
**125,927 / 125,927 entries with zero failures.**

---

## 3. Decisions made

| Decision | Reasoning |
|---|---|
| **Grid width = phoneme count, not letter count** | The spec says "4–8 letters", but the grid is what you *type*, and you type phonemes. Letter-counting would give "through" (7 letters) a 3-tile board. Flagged as the one interpretation call. |
| **Example word under every key** (`ʃ` → *shoe*) | Nearly nobody has the IPA memorised; without these the keyboard is unusable. |
| **Guesses validated against all 101,036 pronunciations** | Wordle's defining constraint is that guesses are real words. Without it you probe one phoneme at a time and the game collapses. Answers come from the common list; guesses from the full one — same split Wordle uses. |
| **Static HTML/CSS/JS, no deps, no build** | Ponytail ladder: nothing here needs a framework. |
| **Plain `.txt` data, not JSON** | `fetch` + `split` beats shipping and parsing JSON for `word<TAB>ipa` rows. |
| **Themes as CSS-variable swaps** | Adding a theme is one `[data-theme=x]` block and one `<option>`, nothing else. |
| **Frequency list for "common"** | Pulled public-domain [google-10000-english-usa](https://github.com/first20hours/google-10000-english) (9,999 words) rather than hand-curating 1,000 words. Intersecting in frequency order means slicing the head gives genuinely common words. |

---

## 4. What was built

```
index.html              62   page shell, help dialog, inline SVG favicon
src/ipa.js              35   39-phoneme inventory + greedy tokenizer  (shared)
src/app.js             298   game logic, all three modes
src/style.css          107   7 themes as variable swaps
scripts/build-words.mjs 41   en_US.txt -> data/
scripts/test.mjs        58   self-checks
scripts/serve.mjs       21   static dev server (stdlib node:http)
README.md                    docs + credits
                       ---
                       622 lines of code, 0 dependencies
```

`src/ipa.js` is imported by both the Node build script and the browser, so the
tokeniser can never drift between the data and the game.

### Data generated

| File | Size | Contents |
|---|---|---|
| `data/common.txt` | 25.8 KB | 1,200 most frequent words surviving the filters |
| `data/all.txt` | 2.36 MB | all 101,036 alphabetic single words, 4–9 phonemes |

Filters: purely alphabetic (drops `'em`, `a la carte`, cased proper nouns), tokenisable,
4–9 phonemes. Length distribution:

```
phonemes      4       5       6       7       8       9
all      14,951  23,242  24,068  18,119  12,861   7,795
common      343     306     227     174     104      46
```

### Modes as shipped

- **Classic** — daily word from the common list, 4–8 phonemes, 6 tries. Deterministic
  hash of the day index (not sequential, so neighbouring days differ). Progress saved
  to `localStorage`. Single-use Hint reveals the *spelling* only.
- **Endless Easy** — same list, 4–9 phonemes, unlimited words, streak / best / won /
  lost, optional "Show spelling" toggle.
- **Endless Hard** — all 101,036 words, 4–9 phonemes.

Seven themes (Wordle, Noir, Phosphor, Amber, Aurora, Ember, Blueprint) — names nodding
to ascii.krackeddevs.com. Theme and mode persist.

---

## 5. Verification

### Unit self-checks — `node scripts/test.mjs`

Tokeniser (affricates as one tile, `ɔɪ` beating bare `ɔ`, stress marks dropped, unknown
symbols rejected); Wordle marking including the repeated-phoneme cases naive
implementations get wrong; the daily-pick hash over 20,000 days; and **every one of the
102,236 shipped entries** re-tokenised and checked against the 39 keys on the keyboard.

### Browser run

No `chromium-cli` available and no Playwright installed. Rather than pull a ~150 MB
dependency, drove the real page in installed Chrome over the DevTools Protocol using
Node 24's built-in `WebSocket` and `fetch` — zero new dependencies. The harness lives in
the session scratchpad (`smoke.mjs`), not the repo, because it hardcodes a Windows
Chrome path.

It plays an actual round: reads the target word via the spelling toggle, looks up its
transcription, clicks a *different* real word as a decoy first guess, then clicks the
correct phonemes. Final run, exit 0, no console errors:

```
[classic]      help dialog · 6-wide board · "Phnordle #257" · 41 keys
               hint reveals spelling only, single-use
[easy]         target "inside" -> ɪ n s aɪ d
               decoy ɔ n ɫ aɪ n -> xgxgx      (greens and yellows both land)
               correct guess    -> ggggg
               win message, streak incremented
[hard]         9-wide board
[themes]       switches, settles on rgb(2,10,3), persists across reload
               mode persists across reload
```

---

## 6. Bugs found and fixed

**Two real defects, both invisible to the unit tests — only the browser run caught them.**

1. **Signed-int32 hash killed Classic mode outright.**
   `h ^= h >>> 13` yields a *signed* int32. When the top bit was set, `h % pool.length`
   went negative and `pool[-n]` returned `undefined` — the game then threw on
   `S.entry.ph`. Classic mode was dead on arrival. Fixed by re-coercing with `>>> 0` at
   every step, plus a regression check asserting a valid pick for all of days 0–20,000,
   that every word is reachable, and that consecutive days rarely repeat.

2. **`.then(boot).catch(...)` swallowed boot errors.**
   The catch was meant for a failed download but also caught anything thrown inside
   `boot()`, relabelling it "Could not load the word lists — serve this over http".
   That is exactly what hid bug #1. Fixed with the two-argument
   `.then(boot, onFetchFailure)` so a boot failure surfaces instead of being disguised.

**One false alarm**, recorded because it cost real time: phosphor's background computed
as `rgb(237,238,237)` instead of `#020a03`. Not a bug — the check was sampling partway
through the 200 ms theme transition. Confirmed by injecting a probe div with the same
colour, which computed correctly. The `color-scheme` per-theme declaration added while
chasing it was kept, because it genuinely does fix scrollbar and `<select>` rendering on
the dark themes.

Minor: added `type="button"` to the six static buttons (linter), and an inline SVG
favicon to clear a 404.

---

## 7. Environment notes

- **Bash heredocs strip backslashes in this environment**, even with a quoted delimiter
  (`<<'EOF'`). This silently corrupted three files — `\\n` became a literal newline,
  breaking JS string literals, and `C:\\Program Files\\...` became
  `C:Program FilesGoogle...` (ENOENT). Any file containing backslashes or mixed quoting
  needs the Write tool, not a heredoc.
- **Port 9222 is already taken** on this machine by a Lenovo Vantage widget running in
  another Chrome. Naively grabbing the first CDP page target attached to *that*. The
  harness uses port 9333 and matches the target by URL.

---

## 8. Known quirks inherited from the source dictionary

- Conservative on some American pronunciations: `what` is `/ˈhwət/`, `news` is `/ˈnjuz/`.
- `ɫ` (dark L) for every /l/; `ə` covers both /ə/ and /ʌ/.
- A few lowercase proper nouns (`sony`, `google`) ride in on the frequency list.
- `tʃ`/`dʒ` are always read as affricates, so *courtship* tokenises its `t`+`ʃ` as one
  tile. Rare enough to leave alone.

---

## 9. Deliberately not done

- **Share-a-result button** — Wordle's emoji-grid share. Add it when people want to post
  scores.
- **Tile flip animations** — only the invalid-guess shake is implemented.
- **Smoke test not committed** — hardcodes a Windows Chrome path; lives in the scratchpad.
- **Nothing committed to git.** All files are still untracked; committing was not
  requested.

## Running it

```
node scripts/serve.mjs        # http://localhost:8080
node scripts/test.mjs         # self-checks
node scripts/build-words.mjs  # regenerate data/
```

Must be served over http — the game fetches its word lists, so `file://` will not work.
