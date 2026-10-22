# Brahmi Lipi Studio

A local, offline-first web app for Brahmi script (𑀩𑀭𑀳𑁆𑀫𑀻) that stores every character in
**Kannada · Hindi (Devanagari) · English (IAST)**, lets you **draw a glyph and assign it to a
letter or an accent**, and **auto-scans an uploaded image** — every mark on an overlay, grouped
into words, line by line.

No build step, no accounts. Your trained model stays in your browser.

---

## Run it

**Double-click `index.html`** (Chrome / Edge), or serve the folder:

```bash
cd brahmi-lipi-app
python -m http.server 8765
# http://127.0.0.1:8765/index.html
```

Glyphs load from Google Fonts; offline it falls back to any installed font
(`Segoe UI Historic` covers Brahmi on Windows) and the status chip says whether the built-in
templates are usable.

---

## The logo

The mark is a **single Brahmi letter — 𑀧 (pa)** — drawn as a seal: one glyph on one ground,
ink gradient plus a gold hairline. One character, no wordmark, still readable at 16 px.

| file | use |
|---|---|
| `assets/logo-mark.png` (512) · `logo-mark-128.png` | app header |
| `assets/favicon.ico` (16/32/48) | legacy favicon |
| `assets/favicon-32.png` · `favicon-16.png` | modern favicon (no ring, larger letter) |
| `assets/apple-touch-icon.png` (180) | iOS / PWA icon |
| `assets/logo-options.png` | the mark in 4 treatments (squircle / seal / parchment / glyph only) |
| `assets/logo-alternates.png` | 8 other single-letter marks (a, ma, sa, pa, ha, la, ya, ba) |

To switch the letter, change one line in `assets/build_assets.py` and re-run it:

```python
GLYPH = chr(0x11027)      # BRAHMI LETTER PA
```

```bash
python assets/build_assets.py
```

It rewrites every icon and both contact sheets (needs Pillow + `C:/Windows/Fonts/seguihis.ttf`).

---

## 1 · Recognize

Upload, drag-drop, or **press Ctrl + V** to paste an image straight from the clipboard
(the paste is routed to whichever page is open).

1. grayscale → Otsu threshold → auto polarity (dark on light *or* light on dark)
2. horizontal projection → **lines**
3. vertical projection → **marks**; a mark that fits badly is retried split at its thinnest column
4. each mark is matched against 67 built-in templates plus every sample you trained
5. marks are grouped into **words** by gap width and composed into Brahmi + Kannada + Hindi + IAST

Results per line: the Brahmi sequence, transliteration, **word chips** (`𑀓…` / `ಕ…` / `क…` /
IAST / confidence), and an expandable list of every mark with its image crop, confidence and
meaning in three languages. **Export JSON** dumps lines, words, boxes and the top alternatives.

### The overlay

The annotations are drawn on their **own canvas above the image**, so the geometry never moves
while you change how they look. Controls in the top-right corner of the image:

| control | what it does |
|---|---|
| **Labels** switch (top-left) | what the overlay prints for each character: **𑀩** Brahmi · **EN** IAST (`ka`) · **ಕನ** Kannada · **हि** Hindi |
| **Overlay** switch | hide/show every box and label |
| **A** | per-character labels on/off (useful when a page is dense) |
| **opacity slider** | 0–100 % — fade the overlay so the original writing reads through |
| **− / fit / +** | zoom 1×, 1.5×, 2×, 3×; the overlay is re-drawn at device resolution so boxes stay exactly on the letters |

Colour: green = confident, amber = weak, red = below threshold (reported as `unknown`, not guessed).

### Scale

Tested on `assets/sample-large.png` — **1000 characters, 20 lines, grouped into words**:

```
20 lines · 1022 marks · 75 ms core pass · ~1.2 s wall clock
```

Cards are rendered 40 per line with a **Show all N marks** button that appends in batches, so a
1000-mark page stays scrollable. Photo crops are skipped above 160 marks per line; the overlay
still marks every character on the image.

---

## 2 · Train

Draw a glyph, pick the character it belongs to (search `ka`, `kha`, `ಖ`, `ख`; filter vowels /
consonants / accents / signs), **Save sample**. Each sample is a 16×16 normalised ink map plus a
thumbnail in `localStorage`. Delete single samples, wipe everything, or **export / import the
model** as JSON.

Accents (mātrās) and signs are trained exactly the same way — the type filter keeps `sign-ā`
separate from the letter `ā`.

---

## 3 · Similar

* **Draw & match** — matching runs while you draw. Draw one character and you get the eight
  closest shapes with similarity bars; draw **two or more** side by side and each mark is matched
  separately, then:
  * **Formed word** strip above the canvas — the composed reading in Brahmi / Kannada / Hindi / IAST
  * **Similar word formations** — a beam search over the best three candidates per mark, ranked by
    combined similarity, i.e. the near-miss words
* **Upload & match** — **every** glyph in the image is outlined and selectable:
  * **click any letter** to match that single character — the click snaps to the nearest glyph, and
    a detached mātrā / dot belonging to it is pulled into the selection
  * **‹ ›** step through all detected glyphs in reading order (the pill shows `3/10`)
  * the selected glyph is highlighted in gold and shown as *Your input* above its ranked matches

  The outlines are drawn with a dark halo under the gold, so they stay visible on white paper and
  on a dark photograph.

Under both, **Similar phonetics** shows the top match with the characters that share its sound
family — same place of articulation (ka / kha / ga / gha / ṅa) and its short/long partner (a ↔ ā).

---

## How matching works

Template matching, not a neural network — which is why it runs instantly and entirely offline.

* Every glyph becomes a **16×16 ink-density map** (256 numbers), scaled so its long side fits the
  frame with the aspect ratio kept, then blurred by 2× downsampling.
* Similarity is the **Pearson correlation** of two maps.
* **Templates come from every Brahmi-capable typeface on the machine**, not just one. A letter
  drawn in *Segoe UI Historic* only scores ~55 % against *Noto Sans Brahmi* shapes and lands on
  the wrong character; with both families in the library it scores ~95 %. The status chip shows
  how many families were found (`134 templates · 2 fonts`).
* **Aspect ratio gates the score.** A wide line-blob cannot claim to be a narrow mark: the
  virāma template is ~3.5 wide, a fused handwriting line ~9.4, which drops 0.66 → 0.36 and gets
  rejected instead of confidently mislabelled. Costs zero accuracy on clean glyphs.
* Combining marks (mātrās, virama, anusvāra…) render alone with a dotted circle, so they are
  isolated by diffing *base + mark* against *base*.

### Measured accuracy

`assets/eval_match.py` replays the JavaScript pipeline in Python (binarise → crop → fit → 16×16 →
Pearson) and reports top-1 accuracy over all 65 characters:

| query typeface | templates | top-1 |
|---|---|---|
| Noto Sans Brahmi | Noto | 92 % |
| Segoe UI Historic | Segoe | 95 % |
| **Segoe UI Historic** | **Noto only (before the fix)** | **55 %** |
| Segoe UI Historic | Noto + Segoe (current) | 95 % |
| Noto Sans Brahmi | Noto + Segoe (current) | 92 % |

Run it yourself: `python assets/eval_match.py`.

---

## Character data

`js/data.js` holds 67 entries: 14 vowels, 34 consonants, 13 mātrās, 6 other marks.

```js
{ id:'ka', br:'𑀓', kn:'ಕ', hi:'क', t:'consonant', g:'velar', v:'vu' }
```

Everything else is derived: name, trilingual description (`ಕಂಠ್ಯ ಅಘೋಷ ವ್ಯಂಜನ` / `कंठ्य अघोष व्यंजन` /
`Velar voiceless unaspirated stop`), English sound hint (`k in "skip"`), and word composition —
`ba + ra + ha + virama + ma + sign-ī` really does produce `ಬರಹ್ಮೀ` / `ब्रह्मी` / `brahmī`.
Brahmi codepoints were verified against the Unicode character database (U+11000–U+1107F).

Add a character by appending one line to `RAW`; it appears in the picker, in the templates and in
the results immediately.

---

## Limitations

* **Conjunct clusters are not letters.** A halant ligature (`𑁆𑀫`) is one drawn blob; the library
  describes single characters, so it usually lands under the threshold and is reported as
  `unknown` rather than confidently wrong. Splitting helps, but it cannot recover vertically
  stacked forms.
* **Marks attached to a base merge with it.** In real manuscript text a mātrā touches its
  consonant, so base+mark arrives as one blob and is matched as one glyph. Separated marks,
  isolated characters and handwriting are the reliable cases.
* **Handwriting is still out of reach.** A cursive manuscript line touches itself into one blob;
  no amount of template matching recovers the letters inside it. It is now rejected
  (`unknown`) instead of being labelled with a confident wrong answer — that needs a trained
  model, not templates.
* **One typeface family per template.** Any typeface that is neither Noto Sans Brahmi, Segoe UI
  Historic nor Nirmala UI will still mismatch until it is trained (or added to
  `FONT_CANDIDATES` in `js/glyph.js`).
* **Similarity is shape similarity.** 40–65 % means "looks somewhat like". Training is the fix.
* **The phonetics panel follows the best match.** If the shape match is weak it now says
  `shape match only N% — weak` so you know the family below is a guess about a guess.

---

## Files

```
index.html            three-page shell
css/styles.css        theme, image stage, overlay controls
js/data.js            67 characters × 3 scripts, descriptions, sound hints, compose()
js/glyph.js           thresholding, segmentation, 16×16 features, matching maths
js/library.js         built-in templates + trained samples (localStorage), ranking
js/pad.js             drawing surface (pointer events, undo, brush, ink extraction)
js/recognize.js       upload/paste → lines → marks → words → overlay → JSON
js/train.js           label picker, save/delete samples, model export/import
js/similar.js         live draw matching, multi-mark word formation, phonetic family
js/main.js            tabs, status chips, Ctrl+V routing, toast
assets/build_assets.py   logo + favicon + sample-image generator
assets/eval_match.py     offline accuracy harness (replays the JS matcher)
assets/sample-letters.png 10 large letters — click-to-pick test
assets/sample-segoe.png  same 7 letters in a second typeface — cross-font test
assets/sample-large.png  1000-character page — scale test
```
