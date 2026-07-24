/*
 * data.js — load a feed's verse pool from JSON files and resolve fields.
 *
 * Schema-independent. A feed's `source` describes how records are laid out and
 * its `fieldMap` says (via dot-paths) where each slot's value lives — so a new
 * corpus is config only, no code. Layouts handled:
 *
 *   source.records            (default "file")  each file is one record
 *                             "array"           the file is an array of records
 *                             "array:<path>"    records are an array at <path>
 *   source.adapter "<name>"   delegate to lib/adapters/<name>.js (e.g. stotram)
 *
 *   fieldMap["slot"]          "a.b.c"           a single dot-path
 *                             ["a","b", …]      several paths, joined by "\n"
 */
'use strict';
const fs = require('fs');
const path = require('path');

// Resolve "a.b.c" against an object; returns undefined if any hop is missing.
function resolvePath(obj, dotPath) {
  if (!dotPath) return undefined;
  return String(dotPath).split('.').reduce(
    (o, k) => (o == null ? undefined : o[k]), obj);
}

// Turn a `source.filter` string into a predicate. Supported today:
//   "has:a.b.c"  → keep records where that path is a non-empty value.
// Unknown / empty filters keep everything.
function makeFilter(spec) {
  if (!spec) return () => true;
  const m = /^has:(.+)$/.exec(String(spec).trim());
  if (m) {
    const p = m[1].trim();
    return (rec) => {
      const v = resolvePath(rec, p);
      return v != null && String(v).trim() !== '';
    };
  }
  return () => true;
}

// Expand a glob like "data/subhashitam/**/*.json" under `root`.
// Supports a single "**" (recurse) plus a "*" filename pattern.
function glob(root, pattern) {
  const parts = pattern.split('/');
  const starStar = parts.indexOf('**');
  let baseParts, fileGlob, recurse;
  if (starStar >= 0) {
    baseParts = parts.slice(0, starStar);
    fileGlob = parts.slice(starStar + 1).join('/') || '*';
    recurse = true;
  } else {
    baseParts = parts.slice(0, -1);
    fileGlob = parts[parts.length - 1];
    recurse = false;
  }
  const base = path.resolve(root, ...baseParts);
  const reStr = '^' + fileGlob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$';
  const re = new RegExp(reStr);

  const out = [];
  (function walk(dir) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
    catch (e) { return; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { if (recurse) walk(full); }
      else if (re.test(e.name)) out.push(full);
    }
  })(base);
  return out.sort();
}

// Pull the record list out of one parsed file, per source.records. Returns null
// when the file doesn't fit the requested layout (so it is skipped).
function extractRecords(fileData, recordsSpec) {
  if (!recordsSpec || recordsSpec === 'file') {
    if (Array.isArray(fileData) || fileData == null || typeof fileData !== 'object') return null;
    return [{ rec: fileData, index: null }];
  }
  if (recordsSpec === 'array') {
    if (!Array.isArray(fileData)) return null;
    return fileData.map((rec, index) => ({ rec, index }));
  }
  const m = /^array:(.+)$/.exec(recordsSpec);
  if (m) {
    const arr = resolvePath(fileData, m[1].trim());
    if (!Array.isArray(arr)) return null;
    return arr.map((rec, index) => ({ rec, index }));
  }
  return null;
}

// Build an id from an idField spec (string path or array of paths).
function composeId(rec, idField) {
  if (Array.isArray(idField)) {
    const parts = idField.map(p => resolvePath(rec, p)).filter(x => x != null);
    return parts.length ? parts.join('-') : null;
  }
  const v = resolvePath(rec, idField);
  return v != null ? String(v) : null;
}

// Load the verse pool for a feed. Each entry: { id, file, rec }.
function loadPool(dataRoot, feed) {
  const src = feed.source || {};

  if (src.adapter) {
    const adapter = require(path.join(__dirname, 'adapters', `${src.adapter}.js`));
    return adapter.load(dataRoot, feed, { resolvePath, makeFilter, glob });
  }

  const files = glob(dataRoot, src.glob);
  const filter = makeFilter(src.filter);
  const idField = src.idField;
  const arrayMode = src.records && src.records !== 'file';
  const pool = [];

  for (const file of files) {
    if (path.basename(file).startsWith('_')) continue; // index / partial files
    const base = path.basename(file, '.json');
    let data;
    try { data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { continue; }

    const recs = extractRecords(data, src.records);
    if (!recs) continue;

    for (const { rec, index } of recs) {
      if (rec == null || typeof rec !== 'object') continue;
      if (!filter(rec)) continue;
      let id;
      if (arrayMode) {
        // Prefix with the file basename so ids stay unique across files.
        const raw = (idField && composeId(rec, idField)) || String(index);
        id = `${base}#${raw}`;
      } else {
        id = (idField && composeId(rec, idField)) || base;
      }
      pool.push({ id: String(id), file, rec });
    }
  }
  return pool;
}

// Resolve every fieldMap slot for a record into a flat {slot: value} object.
// A slot mapped to an array of paths becomes the non-empty values joined by
// "\n" (e.g. a 4-pada verse). Missing paths are omitted so downstream skips.
function resolveSlots(rec, fieldMap) {
  const slots = {};
  for (const slot of Object.keys(fieldMap || {})) {
    const spec = fieldMap[slot];
    let v;
    if (Array.isArray(spec)) {
      const parts = spec.map(p => resolvePath(rec, p))
        .filter(x => x != null && String(x).trim() !== '');
      v = parts.length ? parts.join('\n') : undefined;
    } else {
      v = resolvePath(rec, spec);
    }
    if (v != null && String(v).trim() !== '') slots[slot] = v;
  }
  return slots;
}

module.exports = {
  resolvePath, makeFilter, glob, extractRecords, composeId, loadPool, resolveSlots,
};
