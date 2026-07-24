#!/usr/bin/env node
/*
 * run.js — scenario test runner for the daily-tool.
 *
 * Renders one card per scenario against the real corpora and asserts each run
 * exits cleanly and produces a valid PNG. Use it to catch regressions after
 * changing the loader, sections, or renderer.
 *
 *   node test/run.js            # run every scenario
 *   node test/run.js bg vsn     # run only the named scenarios
 *
 * Corpus locations default to sibling repos and can be overridden:
 *   SAMSKRUTI_DATA=/path/to/samskruti  SMRUTI_DATA=/path/to/smruti  node test/run.js
 *
 * Outputs (PNG + caption per scenario) land in ../.local/test-out/<scenario>/,
 * so you can eyeball them. A scenario whose corpus is missing is SKIPPED, not
 * failed, so the runner still works on machines without both repos checked out.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const TOOL = path.resolve(__dirname, '..');
const GEN = path.join(TOOL, 'src', 'gen.js');
const OUT = path.join(TOOL, '.local', 'test-out');
const ORDER = path.join(TOOL, '.local', 'test-order');

const SAMSKRUTI = process.env.SAMSKRUTI_DATA || path.resolve(TOOL, '..', '..', 'samskruti');
const SMRUTI = process.env.SMRUTI_DATA || path.resolve(TOOL, '..', '..', 'smruti.samskruti.info');
const FIXTURES = path.join(__dirname, 'fixtures'); // committed sample data (CI-safe)

const SCENARIOS = [
  // Self-contained scenarios that run against committed fixtures — no external
  // repos needed, so these are what CI exercises (fonts + Chrome + rendering).
  { name: 'ci-subhashitam', config: 'config.fixtures.json', feed: 'subhashitam', dataRoot: FIXTURES },
  { name: 'ci-stotram',     config: 'config.fixtures.json', feed: 'stotram',     dataRoot: FIXTURES },

  { name: 'subhashitam', config: 'config.samskruti.json', feed: 'subhashitam', dataRoot: SAMSKRUTI },
  { name: 'dindima',     config: 'config.samskruti.json', feed: 'dindima',     dataRoot: SAMSKRUTI },
  { name: 'yogasutra',   config: 'config.samskruti.json', feed: 'yogasutra',   dataRoot: SAMSKRUTI },
  { name: 'stotram',     config: 'config.samskruti.json', feed: 'stotram',     dataRoot: SAMSKRUTI },
  { name: 'bg',          config: 'config.smruti.json',    feed: 'bg',          dataRoot: SMRUTI },
  { name: 'vsn',         config: 'config.smruti.json',    feed: 'vsn',         dataRoot: SMRUTI },
  { name: 'resilience',  config: 'config.resilience.json', feed: 'resilience', dataRoot: SAMSKRUTI },
];

function isImage(buf) {
  if (!buf || buf.length < 12) return false;
  if (buf[0] === 0x89 && buf[1] === 0x50) return true;                 // PNG
  if (buf[0] === 0xff && buf[1] === 0xd8) return true;                 // JPEG
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return true; // WebP
  return false;
}

function run(sc) {
  if (!fs.existsSync(sc.dataRoot)) return { name: sc.name, status: 'SKIP', note: `no corpus at ${sc.dataRoot}` };

  const outDir = path.join(OUT, sc.name);
  fs.mkdirSync(outDir, { recursive: true });
  const res = spawnSync('node', [
    GEN,
    '--config', path.join(__dirname, sc.config),
    '--data-root', sc.dataRoot,
    '--out-root', outDir,
    '--order-dir', ORDER,
    '--feed', sc.feed,
    '--force', '--no-archive',
  ], { encoding: 'utf8' });

  if (res.status !== 0) {
    const full = ((res.stdout || '') + (res.stderr || '')).trim();
    return {
      name: sc.name, status: 'FAIL',
      note: full.split('\n').pop(),
      log: full, // full generator output, printed below the table on failure
    };
  }
  // gen.js writes into <out-root>/<feed.output>; find the today image it produced.
  const img = findToday(outDir);
  if (!img) return { name: sc.name, status: 'FAIL', note: 'no today image produced' };
  const buf = fs.readFileSync(img);
  if (!isImage(buf) || buf.length < 8000) {
    return { name: sc.name, status: 'FAIL', note: `bad image (${buf.length} bytes)` };
  }
  const logLine = (res.stdout.match(/day \d+ → \S+/) || ['?'])[0];
  return { name: sc.name, status: 'PASS', note: `${(buf.length / 1024 | 0)}KB · ${logLine}`, img };
}

function findToday(root) {
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) stack.push(full);
      else if (/^today\.(png|jpe?g|webp)$/.test(e.name)) return full;
    }
  }
  return null;
}

function main() {
  const only = process.argv.slice(2);
  const scenarios = only.length ? SCENARIOS.filter(s => only.includes(s.name)) : SCENARIOS;

  console.log(`\nDaily-tool scenario tests  (samskruti=${SAMSKRUTI}, smruti=${SMRUTI})\n`);
  const results = scenarios.map(run);

  let pass = 0, fail = 0, skip = 0;
  for (const r of results) {
    const tag = r.status === 'PASS' ? '✓ PASS' : r.status === 'SKIP' ? '– SKIP' : '✗ FAIL';
    console.log(`  ${tag}  ${r.name.padEnd(12)}  ${r.note || ''}`);
    if (r.status === 'PASS') pass++; else if (r.status === 'SKIP') skip++; else fail++;
  }
  console.log(`\n  ${pass} passed, ${fail} failed, ${skip} skipped.`);
  if (pass) console.log(`  PNGs: ${OUT}`);

  for (const r of results) {
    if (r.status === 'FAIL' && r.log) {
      console.log(`\n----- ${r.name} output -----\n${r.log}`);
    }
  }
  console.log('');
  process.exit(fail ? 1 : 0);
}

main();
