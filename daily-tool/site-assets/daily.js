/*
 * daily.js — the daily verse page. A single date-viewer: defaults to today, with
 * prev/next and a calendar popover to reach past days. Today loads from the
 * site's own today.* files; past days load from the central archive (listed in
 * <archive-repo>/<site>/manifest.json — one cached file, no GitHub API). Feed
 * tabs + language toggle + share/download. Deep-linkable via #<feed>/<date>.
 */
(function () {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const LANG_LABEL = { te: 'తెలుగు', en: 'English', sa: 'संस्कृतम्', iast: 'IAST' };
  const RAW = new URLSearchParams(location.search).get('raw'); // dev/self-host override
  const state = { config: null, manifest: null, feeds: [], current: null, lang: null, date: null, calYM: null, currentImg: null };

  // ── helpers ──────────────────────────────────────────────────────────────────
  function todayKey() {
    const tz = state.config && state.config.timezone && state.config.timezone.name;
    try {
      const p = new Intl.DateTimeFormat('en-CA', { timeZone: tz || undefined, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
      const g = (t) => p.find((x) => x.type === t).value;
      return `${g('year')}${g('month')}${g('day')}`;
    } catch (e) { return new Date().toISOString().slice(0, 10).replace(/-/g, ''); }
  }
  function folderOf(feed) { const out = String(feed.output || ('daily/' + feed.id + '/')).replace(/\/+$/, ''); return out.split('/').pop(); }
  function labelOf(feed) { return feed.label || String(feed.id).replace(/(^|[-_])(\w)/g, (_, a, b) => (a ? ' ' : '') + b.toUpperCase()); }
  function extOf(feed) { const c = state.config || {}; const f = (feed.card && feed.card.format) || (c.card && c.card.format) || 'png'; return f === 'jpeg' ? 'jpg' : f; }
  function variantIds(feed) { return (feed.variants || []).map((v) => v.id).filter(Boolean); }
  function languages() { const seen = {}, list = []; state.feeds.forEach((f) => variantIds(f).forEach((l) => { if (!seen[l]) { seen[l] = 1; list.push(l); } })); return list; }
  function currentLang() { const L = languages(); if (!L.length) return null; if (state.lang && L.indexOf(state.lang) >= 0) return state.lang; return L[0]; }
  function baseFor(feed) { const l = currentLang(); return (l && variantIds(feed).indexOf(l) >= 0) ? `today.${l}` : 'today'; }
  function archivePathOf(feed) { const m = state.manifest && state.manifest.feeds && state.manifest.feeds[feed.id]; return (m && m.path) || feed.archivePath; }
  function datesOf(feed) {
    const m = state.manifest && state.manifest.feeds && state.manifest.feeds[feed.id];
    const set = new Set((m && m.dates) || []);
    set.add(todayKey()); // today is always available (the site's local card)
    return Array.from(set).sort();
  }
  function rawBase() { if (RAW) return RAW; const m = state.manifest; return m ? `https://raw.githubusercontent.com/${m.repo}/${m.ref || 'main'}/` : ''; }
  function fmtDate(d) { const y = +d.slice(0, 4), mo = +d.slice(4, 6) - 1, da = +d.slice(6, 8); return new Date(Date.UTC(y, mo, da)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }); }
  const bust = () => (state.date === todayKey() ? `?v=${todayKey()}` : ''); // cache-bust only today

  // Card URLs: today → local site files first; any date → central archive; with
  // format/variant fallbacks so old dates and legacy formats still load.
  function imgCandidates(feed, date) {
    const base = baseFor(feed), ext = extOf(feed), list = []; const add = (u) => { if (u && list.indexOf(u) < 0) list.push(u); };
    if (date === todayKey()) { const f = folderOf(feed); add(`${f}/${base}.${ext}`); add(`${f}/today.${ext}`); add(`${f}/today.png`); }
    const path = archivePathOf(feed);
    if (path && rawBase()) { const dir = `${rawBase()}${path}/${date}/`; add(`${dir}${base}.${ext}`); add(`${dir}today.${ext}`); add(`${dir}today.jpg`); add(`${dir}today.png`); }
    return list.map((u) => u + bust());
  }
  function txtCandidates(feed, date) {
    const base = baseFor(feed), list = []; const add = (u) => { if (u && list.indexOf(u) < 0) list.push(u); };
    if (date === todayKey()) { const f = folderOf(feed); add(`${f}/${base}.txt`); add(`${f}/today.txt`); }
    const path = archivePathOf(feed);
    if (path && rawBase()) { const dir = `${rawBase()}${path}/${date}/`; add(`${dir}${base}.txt`); add(`${dir}today.txt`); }
    return list.map((u) => u + bust());
  }
  async function firstText(urls) { for (const u of urls) { try { const r = await fetch(u); if (r.ok) return (await r.text()).trim(); } catch (e) { /* next */ } } return ''; }

  // ── boot ─────────────────────────────────────────────────────────────────────
  async function boot() {
    try { state.config = await (await fetch('config.json', { cache: 'no-cache' })).json(); }
    catch (e) { $('#caption').textContent = 'Could not load daily config.'; return; }
    const cfg = state.config;
    if (cfg.link) { const l = $('#site-link'); l.href = cfg.link; l.textContent = cfg.link; }
    state.feeds = (cfg.feeds || []).filter((f) => f && f.id);
    try { state.lang = localStorage.getItem('daily-lang'); } catch (e) { /* ignore */ }

    const repo = cfg.archive && cfg.archive.repo;
    if (repo || RAW) {
      try {
        const url = RAW ? `${RAW}${cfg.site}/manifest.json` : `https://raw.githubusercontent.com/${repo}/main/${cfg.site}/manifest.json`;
        state.manifest = await (await fetch(url, { cache: 'no-cache' })).json();
      } catch (e) { state.manifest = null; } // manifest optional → today-only, no history
    }

    buildTabs(); buildLangs(); wireDateNav(); wireCalendar();
    $('#share').addEventListener('click', share);
    window.addEventListener('hashchange', () => applyHash());
    applyHash();
  }

  function applyHash() {
    const [fid, date] = (location.hash || '').replace('#', '').split('/');
    const feed = state.feeds.find((f) => f.id === fid) || state.current || state.feeds[0];
    if (!feed) return;
    state.current = feed;
    const dates = datesOf(feed);
    state.date = (date && dates.indexOf(date) >= 0) ? date : dates[dates.length - 1]; // default: latest / today
    render();
  }
  function goto(feedId, date) {
    const feed = state.feeds.find((f) => f.id === feedId) || state.current;
    const target = date ? `${feed.id}/${date}` : feed.id;
    if (location.hash.replace('#', '') === target) render(); else location.hash = target;
  }

  function buildTabs() {
    const nav = $('#tabs'); nav.innerHTML = '';
    if (state.feeds.length < 2) return;
    state.feeds.forEach((f) => {
      const b = document.createElement('button'); b.className = 'tab'; b.type = 'button'; b.textContent = labelOf(f); b.dataset.id = f.id;
      b.addEventListener('click', () => goto(f.id, null));
      nav.appendChild(b);
    });
  }
  function buildLangs() {
    const el = $('#langs'); el.innerHTML = '';
    const L = languages(); if (L.length < 2) return;
    L.forEach((l) => {
      const b = document.createElement('button'); b.className = 'lang-btn'; b.type = 'button'; b.textContent = LANG_LABEL[l] || l; b.dataset.lang = l;
      b.addEventListener('click', () => { state.lang = l; try { localStorage.setItem('daily-lang', l); } catch (e) { /* ignore */ } render(); });
      el.appendChild(b);
    });
  }
  function wireDateNav() {
    $('#prev').addEventListener('click', () => step(-1));
    $('#next').addEventListener('click', () => step(1));
    $('#datePill').addEventListener('click', (e) => { e.stopPropagation(); toggleCalendar(); });
  }
  function step(dir) { const d = datesOf(state.current), i = d.indexOf(state.date), j = i + dir; if (j >= 0 && j < d.length) goto(state.current.id, d[j]); }

  // ── render ───────────────────────────────────────────────────────────────────
  function render() {
    const feed = state.current, date = state.date;
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.id === feed.id));
    document.querySelectorAll('.lang-btn').forEach((b) => b.classList.toggle('active', b.dataset.lang === currentLang()));
    const dates = datesOf(feed), i = dates.indexOf(date);
    $('#prev').disabled = i <= 0; $('#next').disabled = i >= dates.length - 1;
    $('#date').textContent = fmtDate(date) + (date === todayKey() ? ' · నేడు' : '');
    closeCalendar();

    const img = $('#card-img'), empty = $('#empty'), dl = $('#download');
    empty.hidden = true; img.hidden = false; state.currentImg = null;
    const cand = imgCandidates(feed, date); let ci = 0;
    img.onload = () => {
      const url = img.currentSrc || img.src; state.currentImg = url; img.hidden = false; empty.hidden = true;
      dl.href = url; dl.setAttribute('download', `${feed.id}-${date}.${url.split('?')[0].split('.').pop()}`);
    };
    img.onerror = () => { ci++; if (ci < cand.length) img.src = cand[ci]; else { img.hidden = true; empty.hidden = false; state.currentImg = null; } };
    img.src = cand[0]; img.alt = `${labelOf(feed)} — ${fmtDate(date)}`;
    firstText(txtCandidates(feed, date)).then((t) => { $('#caption').textContent = t; });
  }

  // ── calendar popover ───────────────────────────────────────────────────────────
  function toggleCalendar() { if ($('#calPopover').hidden) openCalendar(); else closeCalendar(); }
  function closeCalendar() { $('#calPopover').hidden = true; $('#datePill').setAttribute('aria-expanded', 'false'); $('#datePill').classList.remove('open'); }
  function openCalendar() {
    $('#calPopover').hidden = false; $('#datePill').setAttribute('aria-expanded', 'true'); $('#datePill').classList.add('open');
    const d = state.date; state.calYM = { y: +d.slice(0, 4), m: +d.slice(4, 6) - 1 }; renderCalendar();
  }
  function wireCalendar() {
    document.addEventListener('click', (e) => {
      if ($('#calPopover').hidden) return;
      if (!$('#calPopover').contains(e.target) && !$('#datePill').contains(e.target)) closeCalendar();
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeCalendar(); });
  }
  function renderCalendar() {
    const feed = state.current, set = new Set(datesOf(feed)), all = datesOf(feed);
    const minYM = ym(all[0]), maxYM = ym(all[all.length - 1]);
    const { y, m } = state.calYM, p = $('#calPopover'); p.innerHTML = '';
    const head = document.createElement('div'); head.className = 'cal-head';
    const prev = document.createElement('button'); prev.type = 'button'; prev.textContent = '‹'; prev.disabled = y * 12 + m <= minYM;
    const title = document.createElement('span'); title.className = 'cal-title'; title.textContent = new Date(Date.UTC(y, m, 1)).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    const next = document.createElement('button'); next.type = 'button'; next.textContent = '›'; next.disabled = y * 12 + m >= maxYM;
    prev.onclick = (e) => { e.stopPropagation(); shiftMonth(-1); renderCalendar(); };
    next.onclick = (e) => { e.stopPropagation(); shiftMonth(1); renderCalendar(); };
    head.append(prev, title, next); p.appendChild(head);
    const grid = document.createElement('div'); grid.className = 'cal-grid';
    ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].forEach((d) => { const e = document.createElement('div'); e.className = 'cal-dow'; e.textContent = d; grid.appendChild(e); });
    const first = new Date(Date.UTC(y, m, 1)).getUTCDay(), days = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    for (let k = 0; k < first; k++) { const e = document.createElement('div'); e.className = 'cal-day blank'; grid.appendChild(e); }
    for (let dd = 1; dd <= days; dd++) {
      const key = `${y}${String(m + 1).padStart(2, '0')}${String(dd).padStart(2, '0')}`;
      const cell = document.createElement('div'); cell.className = 'cal-day';
      const num = document.createElement('span'); num.className = 'cal-num'; num.textContent = dd; cell.appendChild(num);
      if (key === todayKey()) cell.classList.add('today');
      if (key === state.date) cell.classList.add('sel');
      if (set.has(key)) { cell.classList.add('has'); cell.title = fmtDate(key); cell.addEventListener('click', (e) => { e.stopPropagation(); goto(feed.id, key); }); }
      grid.appendChild(cell);
    }
    p.appendChild(grid);
  }
  function ym(d) { return +d.slice(0, 4) * 12 + (+d.slice(4, 6) - 1); }
  function shiftMonth(delta) { const t = state.calYM.y * 12 + state.calYM.m + delta; state.calYM = { y: Math.floor(t / 12), m: ((t % 12) + 12) % 12 }; }

  // ── share ────────────────────────────────────────────────────────────────────
  async function share() {
    const feed = state.current, date = state.date;
    const url = state.currentImg || imgCandidates(feed, date)[0];
    const ext = url.split('?')[0].split('.').pop();
    const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'webp' ? 'image/webp' : 'image/png';
    const caption = $('#caption').textContent || '';
    const link = (state.config && state.config.link) || location.origin;
    try {
      const resp = await fetch(url);
      if (resp.ok) { const file = new File([await resp.blob()], `${feed.id}-${date}.${ext}`, { type: mime }); if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], text: caption }); return; } }
      if (navigator.share) { await navigator.share({ text: caption, url: link }); return; }
    } catch (e) { if (e && e.name === 'AbortError') return; }
    window.open('https://wa.me/?text=' + encodeURIComponent(caption || link), '_blank', 'noopener');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
