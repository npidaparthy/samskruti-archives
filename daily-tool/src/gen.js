#!/usr/bin/env node
/*
 * gen.js — the daily generator. For each feed in a site's config.json it:
 *   1. resolves the day's verse via order/<site>.<feed>.json (rotation),
 *   2. loads that verse and maps its fields (schema-independent, via fieldMap),
 *   3. renders the palm-leaf card → <output>/today.png,
 *   4. writes <output>/today.txt (caption) + today.log,
 *   5. archives a dated copy centrally (unless --no-archive).
 *
 * Everything is config-driven. Adding a feed, changing which sections a card
 * shows, or pointing at a new corpus is a config edit — no code change. Adding a
 * new *kind* of section is one new file in sections/ (auto-discovered).
 *
 * Usage:
 *   node gen.js --config <config.json> --data-root <site-checkout>
 *               [--out-root <dir>] [--archive-root <dir>] [--order-dir <dir>]
 *               [--feed <id>] [--script te|sa|iast]
 *               [--force] [--no-archive] [--chrome <path>]
 *
 *   --force      skip the timezone hour gate (§8) — used by manual/local runs.
 *   --out-root   base for each feed's `output` (default: --data-root).
 */
'use strict';
const fs = require('fs');
const path = require('path');

const config = require('./lib/config');
const dataLib = require('./lib/data');
const rotation = require('./lib/rotation');
const { renderToPng } = require('./lib/render');

const SRC_DIR = __dirname;
const REPO_ROOT = path.resolve(SRC_DIR, '..', '..'); // samskruti-archives/

function parseArgs(argv) {
  const a = { flags: {} };
  for (let i = 2; i < argv.length; i++) {
    const t = argv[i];
    if (t === '--force') a.flags.force = true;
    else if (t === '--no-archive') a.flags.noArchive = true;
    else if (t.startsWith('--')) { a[t.slice(2)] = argv[++i]; }
  }
  return a;
}

function log(...m) { console.log('[daily]', ...m); }

// Metre display line for the header band: the name part of a chandaH string,
// dropping the "— N syllables …" tail. e.g.
//   "అనుష్టుప్ (Anuṣṭup) — 8 syllables per quarter, 4 quarters" → "అనుష్టుప్ (Anuṣṭup)"
function metreDisplay(chanda) {
  if (!chanda) return '';
  return String(chanda).split(/[—–-]/)[0].trim();
}

function ymd(dateISO) { return dateISO.replace(/-/g, ''); }

function processFeed(cfg, feed, args) {
  const tz = cfg.timezone.name;
  const dataRoot = path.resolve(args['data-root']);
  const outRoot = path.resolve(args['out-root'] || args['data-root']);
  const orderDir = path.resolve(args['order-dir'] || path.join(SRC_DIR, '..', 'order'));

  // 1. Verse pool.
  const pool = dataLib.loadPool(dataRoot, feed);
  if (!pool.length) { log(`feed "${feed.id}": no verses matched ${feed.source.glob}`); return null; }
  const poolIds = pool.map(p => p.id);
  const byId = new Map(pool.map(p => [p.id, p]));

  // 2. Rotation → today's id.
  const todayISO = rotation.todayInZone(tz);
  const dayIndex = rotation.daysSince(cfg.selection.epoch, todayISO);
  const orderPath = path.join(orderDir, `${cfg.site}.${feed.id}.json`);
  const { order, changed } = rotation.loadOrder(orderPath, poolIds, feed.seed);
  if (changed) { rotation.saveOrder(orderPath, order); log(`feed "${feed.id}": order file updated (${order.length} ids)`); }
  const pickedId = rotation.pick(order, poolIds, dayIndex);
  const chosen = byId.get(pickedId);
  if (!chosen) { log(`feed "${feed.id}": could not resolve id ${pickedId}`); return null; }

  // 3. Resolve fields.
  const slots = dataLib.resolveSlots(chosen.rec, feed.fieldMap);
  const card = config.feedCard(cfg, feed);
  const script = args.script || feed.script || cfg.script || 'te';

  // Build the body sections list (config order; missing values skipped by renderer).
  const sections = feed.sections.map(type => {
    const item = { type, value: slots[type] };
    if (type === 'verse') {
      item.meta = { script, syllables: config.parseSyllables(slots.chanda || slots.metre) };
    }
    return item;
  });

  // Header band: heading from card.header (token-filled) + a metre line.
  const headingTpl = (card.header && card.header.heading) || '{source}';
  const header = {
    heading: config.fillTokens(headingTpl, slots),
    metre: slots.metre ? String(slots.metre) : metreDisplay(slots.chanda),
    align: (card.header && card.header.align) || 'center',
  };
  const footer = {
    left: (card.footer && card.footer.left) || '',
    middle: (card.footer && card.footer.middle) || '',
    right: (card.footer && card.footer.right) || '',
  };

  // Logo: default mark unless card.logo:false. A configured file path
  // (card.logo.src) is inlined as a data-URI; failure falls back to the glyph.
  let logo = null;
  if (card.logo !== false) {
    logo = Object.assign({ position: 'header-left', size: 52 }, card.logo || {});
    if (logo.src && !logo.imageSrc) {
      try {
        const p = path.resolve(dataRoot, logo.src);
        const ext = (path.extname(p).slice(1) || 'png').toLowerCase();
        logo.imageSrc = `data:image/${ext};base64,${fs.readFileSync(p).toString('base64')}`;
      } catch (e) { log(`feed "${feed.id}": logo asset ${logo.src} not found — using default mark`); }
    }
  }

  const payload = {
    size: cfg.size || 1080,
    script,
    theme: card.theme,
    header,
    footer,
    logo,
    sections,
  };

  // 4. Render.
  log(`feed "${feed.id}": day ${dayIndex} → ${pickedId} (${chosen.file.replace(dataRoot + path.sep, '')})`);
  const png = renderToPng(payload, { chrome: args.chrome, size: payload.size });

  // 5. Write today.* into the feed's output dir.
  const outDir = path.resolve(outRoot, feed.output || `daily/${feed.id}/`);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'today.png'), png);

  const caption = config.fillTokens(feed.caption || '', Object.assign({ link: cfg.link || '' }, slots));
  fs.writeFileSync(path.join(outDir, 'today.txt'), caption + '\n');

  const logLine = `${new Date().toISOString()} feed=${feed.id} date=${todayISO} index=${dayIndex} n=${order.length} id=${pickedId} file=${path.basename(chosen.file)}`;
  fs.writeFileSync(path.join(outDir, 'today.log'), logLine + '\n');
  log(`feed "${feed.id}": wrote ${path.join(outDir, 'today.png')} (${png.length} bytes)`);

  // 6. Archive a dated copy centrally.
  if (!args.flags.noArchive && feed.archivePath) {
    const archiveRoot = path.resolve(args['archive-root'] || REPO_ROOT);
    const archDir = path.join(archiveRoot, feed.archivePath, ymd(todayISO));
    fs.mkdirSync(archDir, { recursive: true });
    fs.writeFileSync(path.join(archDir, 'today.png'), png);
    fs.writeFileSync(path.join(archDir, 'today.txt'), caption + '\n');
    log(`feed "${feed.id}": archived → ${archDir}`);
  }

  return { feed: feed.id, id: pickedId, outDir };
}

function main() {
  const args = parseArgs(process.argv);
  if (!args.config) { console.error('missing --config <path>'); process.exit(2); }
  if (!args['data-root']) { console.error('missing --data-root <site checkout>'); process.exit(2); }

  const cfg = config.load(path.resolve(args.config));

  // Timezone hour gate (§8): only proceed at config.timezone.hour, unless forced.
  if (!args.flags.force) {
    const hour = rotation.hourInZone(cfg.timezone.name);
    if (hour == null) {
      log(`warning: cannot compute ${cfg.timezone.name} hour (ICU?); proceeding. Use --force to silence.`);
    } else if (hour !== cfg.timezone.hour) {
      log(`hour gate: ${cfg.timezone.name} is ${hour}:00, want ${cfg.timezone.hour}:00 — skipping.`);
      return;
    }
  }

  const only = args.feed;
  const feeds = cfg.feeds.filter(f => !only || f.id === only);
  if (!feeds.length) { console.error(`no feed matched --feed ${only}`); process.exit(2); }

  const results = [];
  for (const feed of feeds) {
    try { const r = processFeed(cfg, feed, args); if (r) results.push(r); }
    catch (e) { console.error(`[daily] feed "${feed.id}" failed:`, e.message); process.exitCode = 1; }
  }
  log(`done: ${results.length}/${feeds.length} feed(s) rendered.`);
}

main();
