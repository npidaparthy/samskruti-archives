/*
 * rotation.js — deterministic, no-repeat verse selection.
 *
 * order/<site>.<feed>.json is a fixed shuffled list of verse ids. The day's
 * index = daysSince(epoch) % N walks it in order, so the same date always yields
 * the same verse and every verse appears once before any repeat.
 *
 * The order file self-heals: newly added ids are appended, and ids that no
 * longer exist in the pool are skipped at pick time — adding or removing verses
 * never breaks a run.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const DAY = 86400000;

// Whole days between two YYYY-MM-DD dates (UTC midnight), can be negative.
function daysSince(epochISO, todayISO) {
  const epoch = Date.parse(epochISO + 'T00:00:00Z');
  const today = Date.parse(todayISO + 'T00:00:00Z');
  return Math.floor((today - epoch) / DAY);
}

// Today's date in a given IANA timezone as YYYY-MM-DD (falls back to local).
function todayInZone(tz) {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(new Date());
    const g = (t) => parts.find(p => p.type === t).value;
    return `${g('year')}-${g('month')}-${g('day')}`;
  } catch (e) {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }
}

// Current hour (0–23) in a timezone, or null if the runtime can't compute it.
function hourInZone(tz) {
  try {
    const s = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hour: '2-digit', hour12: false,
    }).format(new Date());
    const h = parseInt(s, 10);
    return Number.isFinite(h) ? (h % 24) : null;
  } catch (e) { return null; }
}

// Fisher–Yates. Optional integer seed → reproducible shuffle (mulberry32).
function shuffle(arr, seed) {
  const a = arr.slice();
  let rand = Math.random;
  if (seed != null) {
    let s = seed >>> 0;
    rand = () => {
      s |= 0; s = (s + 0x6D2B79F5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Load (or create) the order file for a site+feed, reconciled against the ids
// currently in the pool. Returns the ordered id list and whether it changed.
function loadOrder(orderPath, poolIds, seed) {
  let order = [];
  if (fs.existsSync(orderPath)) {
    try { order = JSON.parse(fs.readFileSync(orderPath, 'utf8')); } catch (e) { order = []; }
    if (!Array.isArray(order)) order = [];
  }
  const poolSet = new Set(poolIds);
  const known = new Set(order);
  // Keep existing order for ids still present; append any new ids (shuffled).
  const kept = order.filter(id => poolSet.has(id));
  const added = shuffle(poolIds.filter(id => !known.has(id)), seed);
  const next = kept.concat(added);
  const changed = next.length !== order.length || next.some((id, i) => id !== order[i]);
  return { order: next, changed };
}

function saveOrder(orderPath, order) {
  fs.mkdirSync(path.dirname(orderPath), { recursive: true });
  fs.writeFileSync(orderPath, JSON.stringify(order, null, 2) + '\n');
}

// Pick the id for `dayIndex`, skipping ids missing from the pool.
function pick(order, poolIds, dayIndex) {
  const poolSet = new Set(poolIds);
  const live = order.filter(id => poolSet.has(id));
  if (!live.length) return null;
  const n = live.length;
  const i = ((dayIndex % n) + n) % n;
  return live[i];
}

module.exports = {
  daysSince, todayInZone, hourInZone, shuffle, loadOrder, saveOrder, pick,
};
