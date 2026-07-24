/*
 * stotram adapter — for stotras whose text lives in flat .txt files rather than
 * per-verse JSON (README §4). A folder holds:
 *
 *   <slug>_meta.json          title + tags
 *   <slug>.txt                the shlokas (verse blocks, each ending ॥N॥)
 *   <slug>_meaning_<lang>.txt meanings as "[N]\n<text>" blocks   (optional)
 *
 * We enumerate folders via the meta glob, pair each numbered shloka with its
 * meaning line, and emit one record PER shloka that has a matching meaning.
 * Stotras (or verses) without a meaning are simply skipped.
 *
 * Records are pre-shaped { verse, meaning, source, number }, so the feed's
 * fieldMap is a trivial identity map ({ "verse": "verse", … }).
 *
 * Config:
 *   source: { adapter: "stotram",
 *             glob: "data/stotram/&#42;&#42;/&#42;_meta.json",   // find folders
 *             lang: "te" }                          // which verse/meaning script
 */
'use strict';
const fs = require('fs');
const path = require('path');

// Telugu digits (౦–౯) → ASCII; ASCII digits pass through.
function digits(s) {
  return String(s).replace(/[౦-౯]/g, c => String(c.charCodeAt(0) - 0x0C66));
}

// Verse blocks separated by blank lines; keep only those ending in ॥<num>॥
// (drops the title line ॥…॥). Keyed by the numeral. Standalone metadata marker
// lines like [AUDIO_START=…] / [AUDIO_END=…] are stripped first so they don't
// break the "ends in ॥N॥" test.
function parseVerses(text) {
  const cleaned = String(text)
    .split('\n')
    .filter(l => !/^\s*\[[^\]]*\]\s*$/.test(l))
    .join('\n');
  const out = {};
  const blocks = cleaned.split(/\n\s*\n/).map(b => b.trim()).filter(Boolean);
  for (const b of blocks) {
    const m = b.match(/॥\s*([౦-౯0-9]+)\s*॥\s*$/);
    if (!m) continue;
    out[digits(m[1])] = b;
  }
  return out;
}

// Meanings as "[N] text" blocks, keyed by N.
function parseMeanings(text) {
  const out = {};
  const re = /\[(\d+)\]\s*([\s\S]*?)(?=\n\s*\[\d+\]|\s*$)/g;
  let m;
  while ((m = re.exec(text))) {
    const t = m[2].trim();
    if (t) out[m[1]] = t;
  }
  return out;
}

function load(dataRoot, feed, helpers) {
  const src = feed.source || {};
  const lang = src.lang || 'te';
  const metaGlob = src.glob || 'data/stotram/**/*_meta.json';
  const files = helpers.glob(dataRoot, metaGlob);
  const pool = [];

  for (const metaFile of files) {
    const dir = path.dirname(metaFile);
    const slug = path.basename(metaFile).replace(/_meta\.json$/, '');
    // Verse file: <slug>.txt for te, <slug>_<lang>.txt otherwise.
    const verseFile = lang === 'te'
      ? path.join(dir, `${slug}.txt`)
      : path.join(dir, `${slug}_${lang}.txt`);
    const meaningFile = path.join(dir, `${slug}_meaning_${lang}.txt`);
    if (!fs.existsSync(verseFile) || !fs.existsSync(meaningFile)) continue;

    let title = slug;
    try {
      const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
      // Prefer the title in the feed's script (te/sa), fall back to en, then slug.
      title = meta[`title_${lang}`] || meta.title_te || meta.title_en || slug;
    } catch (e) { /* keep slug */ }

    const verses = parseVerses(fs.readFileSync(verseFile, 'utf8'));
    const meanings = parseMeanings(fs.readFileSync(meaningFile, 'utf8'));

    for (const n of Object.keys(verses)) {
      if (!meanings[n]) continue; // pair only where a meaning exists
      pool.push({
        id: `${slug}-${n}`,
        file: verseFile,
        rec: { verse: verses[n], meaning: meanings[n], source: title, number: n },
      });
    }
  }
  return pool;
}

module.exports = { load, parseVerses, parseMeanings };
