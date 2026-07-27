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
const { spawnSync } = require('child_process');

const SRC_DIR = __dirname;
const REPO_ROOT = path.resolve(SRC_DIR, '..', '..'); // samskruti-archives/

// ── Image output helpers ──────────────────────────────────────────────────────
// Chrome screenshots are PNG, but the palm-leaf card is photographic (gradient +
// grain), which PNG can't compress well (~2 MB). JPEG/WebP shrink it ~10x. We
// convert with whatever tool is present (sips on macOS, ImageMagick/cwebp on
// Linux); if none works we keep the PNG so a run never fails over format.
function haveCmd(cmd) {
  try { return spawnSync('sh', ['-c', `command -v ${cmd}`], { encoding: 'utf8' }).status === 0; }
  catch (e) { return false; }
}
function convertImage(pngPath, outPath, format, quality) {
  const q = String(quality || 90);
  const fmt = format === 'jpg' ? 'jpeg' : format;
  try {
    if (fmt !== 'webp' && haveCmd('sips')) {
      const r = spawnSync('sips', ['-s', 'format', fmt, '-s', 'formatOptions', q, pngPath, '--out', outPath], { encoding: 'utf8' });
      if (r.status === 0 && fs.existsSync(outPath)) return true;
    }
    for (const tool of ['magick', 'convert', 'cwebp']) {
      if (!haveCmd(tool)) continue;
      const r = tool === 'cwebp'
        ? spawnSync('cwebp', ['-quiet', '-q', q, pngPath, '-o', outPath], { encoding: 'utf8' })
        : spawnSync(tool, [pngPath, '-quality', q, outPath], { encoding: 'utf8' });
      if (r.status === 0 && fs.existsSync(outPath)) return true;
    }
  } catch (e) { /* fall through */ }
  return false;
}
// Write <basename>.<ext> into dir (converting from PNG if needed). Returns the ext.
function writeImage(dir, png, format, quality, basename) {
  basename = basename || 'today';
  fs.mkdirSync(dir, { recursive: true });
  const pngPath = path.join(dir, `${basename}.png`);
  fs.writeFileSync(pngPath, png);
  const fmt = String(format || 'png').toLowerCase();
  if (fmt === 'png') return 'png';
  const ext = fmt === 'jpeg' ? 'jpg' : fmt;
  const outPath = path.join(dir, `${basename}.${ext}`);
  if (convertImage(pngPath, outPath, fmt, quality)) {
    try { fs.unlinkSync(pngPath); } catch (e) { /* ignore */ }
    return ext;
  }
  log(`warning: could not convert to ${fmt} (no tool?); keeping PNG`);
  return 'png';
}

function parseArgs(argv) {
  const a = { flags: {} };
  for (let i = 2; i < argv.length; i++) {
    const t = argv[i];
    if (t === '--force') a.flags.force = true;
    else if (t === '--no-archive') a.flags.noArchive = true;
    else if (t === '--no-telegram') a.flags.noTelegram = true;
    else if (t === '--rebuild-manifest') a.flags.rebuildManifest = true;
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

  // 3–6. Render one card per language variant, then write + archive.
  // No `variants` → a single default card (today.<ext>). With variants → also
  // today.<id>.<ext> + today.<id>.txt per variant; the first variant is the
  // default (today.<ext>) so single-language consumers keep working.
  const card = config.feedCard(cfg, feed);
  const fmt = args.format || card.format || 'png';
  const quality = args.quality || card.quality || 90;
  const outDir = path.resolve(outRoot, feed.output || `daily/${feed.id}/`);
  const archiveRoot = path.resolve(args['archive-root'] || REPO_ROOT);
  const archDir = path.join(archiveRoot, feed.archivePath || `misc/${feed.id}`, ymd(todayISO));
  const doArchive = !args.flags.noArchive && feed.archivePath;

  const hasVariants = Array.isArray(feed.variants) && feed.variants.length > 0;
  const variants = hasVariants ? feed.variants : [{ id: null }];
  const logo = buildLogo(card, dataRoot, feed);

  log(`feed "${feed.id}": day ${dayIndex} → ${pickedId} (${chosen.file.replace(dataRoot + path.sep, '')})`);

  const produced = [];
  variants.forEach((v, i) => {
    const script = args.script || v.script || feed.script || cfg.script || 'te';
    const fieldMap = Object.assign({}, feed.fieldMap, v.fieldMap || {});
    const slots = dataLib.resolveSlots(chosen.rec, fieldMap);

    const sections = feed.sections.map(type => {
      const item = { type, value: slots[type] };
      if (type === 'verse') item.meta = { script, syllables: config.parseSyllables(slots.chanda || slots.metre) };
      return item;
    });

    const headingTpl = (v.card && v.card.header && v.card.header.heading) ||
      (card.header && card.header.heading) || '{source}';
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

    const payload = {
      size: cfg.size || 1080, script,
      theme: Object.assign({}, card.theme, args.grain != null ? { grain: Number(args.grain) } : {}),
      header, footer, logo, sections,
    };
    const png = renderToPng(payload, { chrome: args.chrome, size: payload.size });
    const caption = config.fillTokens(v.caption || feed.caption || '', Object.assign({ link: cfg.link || '' }, slots));

    // Basenames to write: the variant's own (today.<id>) and, for the first
    // variant, the default (today).
    const bases = [];
    if (v.id) bases.push(`today.${v.id}`);
    if (!v.id || i === 0) bases.push('today');

    let ext = fmt === 'jpeg' ? 'jpg' : fmt;
    bases.forEach(base => {
      // Live site: write every basename (per-language + the language-neutral
      // default today.* for stable links / fallback).
      ext = writeImage(outDir, png, fmt, quality, base);
      fs.writeFileSync(path.join(outDir, `${base}.txt`), caption + '\n');
      // Archive: skip the default copy when variants exist — the per-language
      // today.<id>.* already capture everything, so don't duplicate today.*.
      const isDefaultCopy = base === 'today' && hasVariants;
      if (doArchive && !isDefaultCopy) {
        writeImage(archDir, png, fmt, quality, base);
        fs.writeFileSync(path.join(archDir, `${base}.txt`), caption + '\n');
      }
    });
    const primary = v.id ? `today.${v.id}` : 'today';
    const bytes = fs.statSync(path.join(outDir, `${primary}.${ext}`)).size;
    log(`feed "${feed.id}"${v.id ? ` [${v.id}]` : ''}: wrote ${primary}.${ext} (${(bytes / 1024 | 0)} KB)`);
    produced.push({ id: v.id, ext, caption, file: path.join(outDir, `${primary}.${ext}`) });
  });

  const langs = produced.map(p => p.id).filter(Boolean).join(',') || 'default';
  const logLine = `${new Date().toISOString()} feed=${feed.id} date=${todayISO} index=${dayIndex} n=${order.length} id=${pickedId} file=${path.basename(chosen.file)} variants=${langs}`;
  fs.writeFileSync(path.join(outDir, 'today.log'), logLine + '\n');
  if (doArchive) {
    fs.writeFileSync(path.join(archDir, 'today.log'), logLine + '\n');
    updateManifest(archiveRoot, cfg, feed, ymd(todayISO), fmt === 'jpeg' ? 'jpg' : fmt);
  }

  // 7. Publish to Telegram (per feed → its own chats). Skipped unless the feed
  //    opts in and a bot token is present, so other runs are unaffected (§11).
  publishTelegram(feed, produced, args);

  return { feed: feed.id, id: pickedId, outDir, variants: produced };
}

// POST the day's card + caption to each of a feed's Telegram chats via the free
// Bot API (sendPhoto, multipart via curl). No-op unless feed.telegram.enabled
// and the token env var is set. Picks the telegram.lang variant (else default).
function publishTelegram(feed, produced, args) {
  const tg = feed.telegram;
  if (args.flags.noTelegram || !tg || !tg.enabled) return;
  const token = process.env[tg.tokenSecret || 'TELEGRAM_TOKEN'];
  const chatIds = tg.chatIds || [];
  if (!token) { log(`feed "${feed.id}": telegram on but no token in $${tg.tokenSecret || 'TELEGRAM_TOKEN'} — skipping`); return; }
  if (!chatIds.length) { log(`feed "${feed.id}": telegram on but no chatIds — skipping`); return; }
  if (!haveCmd('curl')) { log(`feed "${feed.id}": curl not found — cannot post to telegram`); return; }

  const chosen = (tg.lang && produced.find(p => p.id === tg.lang)) || produced.find(p => p.id) || produced[0];
  if (!chosen) return;
  const caption = String(chosen.caption || '').slice(0, 1024); // Telegram caption cap

  for (const chatId of chatIds) {
    const r = spawnSync('curl', [
      '-s', '-o', '/dev/null', '-w', '%{http_code}',
      '--form-string', `chat_id=${chatId}`,
      '-F', `photo=@${chosen.file}`,
      '--form-string', `caption=${caption}`,
      `https://api.telegram.org/bot${token}/sendPhoto`,
    ], { encoding: 'utf8', timeout: 45000 });
    const code = (r.stdout || '').trim();
    if (code === '200') log(`feed "${feed.id}": telegram → ${chatId} ✓`);
    else log(`feed "${feed.id}": telegram → ${chatId} FAILED (http ${code || (r.error && r.error.message)})`);
  }
}

// Maintain one manifest per site (<archiveRoot>/<site>/manifest.json) listing,
// per feed, the dates that have an archived card — so the archive browser can
// enumerate history without hitting the GitHub API (no rate limit).
function updateManifest(archiveRoot, cfg, feed, date, format) {
  const dir = path.join(archiveRoot, cfg.site);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'manifest.json');
  let m = {};
  if (fs.existsSync(file)) { try { m = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { m = {}; } }
  m.repo = (cfg.archive && cfg.archive.repo) || m.repo || '';
  m.ref = m.ref || 'main';
  m.site = cfg.site;
  m.feeds = m.feeds || {};
  const entry = m.feeds[feed.id] || { dates: [] };
  entry.label = feed.label || feed.id;
  entry.path = feed.archivePath;
  entry.format = format;
  entry.langs = (feed.variants || []).map(v => v.id).filter(Boolean);
  const dates = new Set(entry.dates || []); dates.add(date);
  entry.dates = Array.from(dates).sort();
  m.feeds[feed.id] = entry;
  m.updated = new Date().toISOString();
  fs.writeFileSync(file, JSON.stringify(m, null, 2) + '\n');
}

// Logo payload: default ॐ mark unless card.logo:false; a configured file path
// (card.logo.src) is inlined as a data-URI (falls back to the glyph on failure).
function buildLogo(card, dataRoot, feed) {
  if (card.logo === false) return null;
  const logo = Object.assign({ position: 'header-left', size: 52 }, card.logo || {});
  if (logo.src && !logo.imageSrc) {
    try {
      const p = path.resolve(dataRoot, logo.src);
      const ext = (path.extname(p).slice(1) || 'png').toLowerCase();
      logo.imageSrc = `data:image/${ext};base64,${fs.readFileSync(p).toString('base64')}`;
    } catch (e) { log(`feed "${feed.id}": logo asset ${logo.src} not found — using default mark`); }
  }
  return logo;
}

// Rebuild the archive manifest from the dated dirs already on disk (backfill),
// without rendering. Usage: gen.js --config <c> --rebuild-manifest [--archive-root <d>]
function rebuildManifest(cfg, args) {
  const archiveRoot = path.resolve(args['archive-root'] || REPO_ROOT);
  for (const feed of cfg.feeds) {
    if (!feed.archivePath) continue;
    const base = path.join(archiveRoot, feed.archivePath);
    let dates = [];
    try { dates = fs.readdirSync(base).filter(d => /^\d{8}$/.test(d)); } catch (e) { /* none */ }
    const card = config.feedCard(cfg, feed);
    const fmt = card.format ? (card.format === 'jpeg' ? 'jpg' : card.format) : 'png';
    dates.sort().forEach(d => updateManifest(archiveRoot, cfg, feed, d, fmt));
    log(`manifest: ${feed.id} → ${dates.length} date(s)`);
  }
}

function main() {
  const args = parseArgs(process.argv);
  if (!args.config) { console.error('missing --config <path>'); process.exit(2); }

  const cfg = config.load(path.resolve(args.config));

  if (args.flags.rebuildManifest) { rebuildManifest(cfg, args); return; }
  if (!args['data-root']) { console.error('missing --data-root <site checkout>'); process.exit(2); }

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

  // --feed accepts a single id or a comma-separated list (blank = all feeds).
  const only = args.feed ? args.feed.split(',').map(s => s.trim()).filter(Boolean) : null;
  const feeds = cfg.feeds.filter(f => !only || only.includes(f.id));
  if (!feeds.length) { console.error(`no feed matched --feed ${only}`); process.exit(2); }

  const results = [];
  for (const feed of feeds) {
    try { const r = processFeed(cfg, feed, args); if (r) results.push(r); }
    catch (e) { console.error(`[daily] feed "${feed.id}" failed:`, e.message); process.exitCode = 1; }
  }
  log(`done: ${results.length}/${feeds.length} feed(s) rendered.`);
}

main();
