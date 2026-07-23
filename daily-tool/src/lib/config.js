/*
 * config.js — load, validate, and normalise a site's config.json, and derive
 * per-feed values (merged card chrome, token substitution, syllable count).
 */
'use strict';
const fs = require('fs');

const DEFAULTS = {
  card: {
    header: { align: 'center' },
    footer: { left: '', right: '' },
    theme: { template: 'palm-leaf', accent: '#c8a84b' },
  },
  selection: { mode: 'rotation', epoch: '2026-07-23' },
  timezone: { name: 'Australia/Sydney', hour: 4 },
  size: 1080,
  script: 'te',
};

function deepMerge(a, b) {
  if (Array.isArray(b) || b === null || typeof b !== 'object') return b === undefined ? a : b;
  const out = Object.assign({}, a);
  for (const k of Object.keys(b || {})) {
    out[k] = (a && typeof a[k] === 'object' && !Array.isArray(a[k]))
      ? deepMerge(a[k], b[k]) : b[k];
  }
  return out;
}

function load(configPath) {
  const raw = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const cfg = deepMerge(DEFAULTS, raw);
  cfg.card = deepMerge(DEFAULTS.card, raw.card || {});
  if (!Array.isArray(cfg.feeds) || !cfg.feeds.length) {
    throw new Error('config.feeds must be a non-empty array');
  }
  for (const feed of cfg.feeds) {
    if (!feed.id) throw new Error('every feed needs an "id"');
    if (!feed.source || !feed.source.glob) throw new Error(`feed "${feed.id}" needs source.glob`);
    if (!feed.fieldMap) throw new Error(`feed "${feed.id}" needs a fieldMap`);
    if (!Array.isArray(feed.sections)) feed.sections = [];
  }
  return cfg;
}

// The card chrome for a feed = site card with the feed's `card` override merged.
function feedCard(cfg, feed) {
  return deepMerge(cfg.card, feed.card || {});
}

// Replace {slot} tokens in a template from a values object. Unknown tokens are
// dropped; the result is trimmed of the empty lines that dropping can leave.
function fillTokens(template, values) {
  if (template == null) return '';
  return String(template)
    .replace(/\{(\w+)\}/g, (_, k) => (values[k] != null ? String(values[k]) : ''))
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Best-effort syllables-per-quarter from a metre string ("… — 8 syllables …").
function parseSyllables(metre) {
  if (!metre) return 8;
  const m = /(\d+)\s*syll/i.exec(String(metre));
  return m ? parseInt(m[1], 10) : 8;
}

module.exports = { DEFAULTS, load, feedCard, fillTokens, parseSyllables, deepMerge };
