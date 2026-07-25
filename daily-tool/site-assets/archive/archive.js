/*
 * archive.js — browse past daily cards. Reads the central manifest
 * (<archive-repo>/<site>/manifest.json) — one cached file, no GitHub API, so no
 * rate limit — then loads card images/captions from the public archive repo.
 * Grid ⇄ Calendar views, language toggle, lightbox with share/download.
 */
(function () {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const PAGE = 12;
  const LANG_LABEL = { te: 'తెలుగు', en: 'English', sa: 'संस्कृतम्', iast: 'IAST' };
  const state = { config: null, manifest: null, feeds: [], current: null, lang: null, view: 'grid', page: 1, calMonth: null, lbDate: null };

  // Dev/self-host override: ?raw=<base/> serves the archive from another origin.
  const RAW = new URLSearchParams(location.search).get('raw');
  const rawBase = () => RAW || `https://raw.githubusercontent.com/${state.manifest.repo}/${state.manifest.ref || 'main'}/`;
  const extOf = (feed) => feed.format || 'jpg';
  function languages() { const seen = {}, list = []; state.feeds.forEach((f) => (f.langs || []).forEach((l) => { if (!seen[l]) { seen[l] = 1; list.push(l); } })); return list; }
  function currentLang() { const L = languages(); if (!L.length) return null; if (state.lang && L.indexOf(state.lang) >= 0) return state.lang; return L[0]; }
  function baseFor(feed) { const l = currentLang(); return (l && (feed.langs || []).indexOf(l) >= 0) ? `today.${l}` : 'today'; }
  // Candidate URLs (current language/format first, then legacy fallbacks) — so
  // old dates from before a format/variant change still load.
  function imgCandidates(feed, date) {
    const dir = `${rawBase()}${feed.path}/${date}/`;
    const base = baseFor(feed), ext = extOf(feed);
    const list = []; const add = (u) => { if (list.indexOf(u) < 0) list.push(u); };
    add(dir + `${base}.${ext}`); add(dir + `today.${ext}`); add(dir + 'today.jpg'); add(dir + 'today.png');
    return list;
  }
  function txtCandidates(feed, date) {
    const dir = `${rawBase()}${feed.path}/${date}/`;
    const list = []; const add = (u) => { if (list.indexOf(u) < 0) list.push(u); };
    add(dir + `${baseFor(feed)}.txt`); add(dir + 'today.txt');
    return list;
  }
  function setImg(img, urls) {
    let i = 0;
    img.onerror = () => { i++; if (i < urls.length) img.src = urls[i]; else img.onerror = null; };
    img.src = urls[0];
  }
  async function firstText(urls) {
    for (const u of urls) { try { const r = await fetch(u); if (r.ok) return (await r.text()).trim(); } catch (e) { /* next */ } }
    return '';
  }
  function fmtDate(d) {
    const y = +d.slice(0, 4), mo = +d.slice(4, 6) - 1, da = +d.slice(6, 8);
    return new Date(Date.UTC(y, mo, da)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  }
  const datesDesc = (feed) => (feed.dates || []).slice().sort().reverse();

  async function boot() {
    try { state.config = await (await fetch('../config.json', { cache: 'no-cache' })).json(); }
    catch (e) { return fail('Could not load config.'); }
    const cfg = state.config;
    if (cfg.link) { const l = $('#site-link'); l.href = cfg.link; l.textContent = cfg.link.replace(/^https?:\/\//, ''); }
    const repo = cfg.archive && cfg.archive.repo;
    if (!repo) return fail('No archive repo configured.');
    try {
      const url = RAW ? `${RAW}${cfg.site}/manifest.json` : `https://raw.githubusercontent.com/${repo}/main/${cfg.site}/manifest.json`;
      state.manifest = await (await fetch(url, { cache: 'no-cache' })).json();
    } catch (e) { return fail('Archive not available yet.'); }

    const mf = state.manifest.feeds || {};
    state.feeds = Object.keys(mf).map((id) => Object.assign({ id }, mf[id])).filter((f) => (f.dates || []).length);
    if (!state.feeds.length) return fail('No archived cards yet.');
    try { state.lang = localStorage.getItem('daily-lang'); } catch (e) { /* ignore */ }
    try { state.view = localStorage.getItem('archive-view') || 'grid'; } catch (e) { /* ignore */ }
    state.current = state.feeds[0];

    buildTabs(); buildLangs(); buildViews(); wireLightbox();
    render();
  }
  function fail(msg) { const e = $('#empty'); e.hidden = false; e.textContent = msg; }

  function buildTabs() {
    const nav = $('#tabs'); nav.innerHTML = '';
    if (state.feeds.length < 2) return;
    state.feeds.forEach((f) => {
      const b = document.createElement('button');
      b.className = 'tab'; b.type = 'button'; b.textContent = f.label || f.id; b.dataset.id = f.id;
      b.classList.toggle('active', f.id === state.current.id);
      b.addEventListener('click', () => { state.current = f; state.page = 1; state.calMonth = null; refreshActive(); render(); });
      nav.appendChild(b);
    });
  }
  function buildLangs() {
    const el = $('#langs'); el.innerHTML = '';
    const L = languages(); if (L.length < 2) return;
    L.forEach((l) => {
      const b = document.createElement('button');
      b.className = 'lang-btn'; b.type = 'button'; b.textContent = LANG_LABEL[l] || l; b.dataset.lang = l;
      b.classList.toggle('active', l === currentLang());
      b.addEventListener('click', () => {
        state.lang = l; try { localStorage.setItem('daily-lang', l); } catch (e) { /* ignore */ }
        refreshActive(); render();
      });
      el.appendChild(b);
    });
  }
  function buildViews() {
    document.querySelectorAll('.view-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.view === state.view);
      b.addEventListener('click', () => {
        state.view = b.dataset.view; try { localStorage.setItem('archive-view', state.view); } catch (e) { /* ignore */ }
        refreshActive(); render();
      });
    });
  }
  function refreshActive() {
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.id === state.current.id));
    document.querySelectorAll('.lang-btn').forEach((b) => b.classList.toggle('active', b.dataset.lang === currentLang()));
    document.querySelectorAll('.view-btn').forEach((b) => b.classList.toggle('active', b.dataset.view === state.view));
  }

  function render() {
    $('#empty').hidden = true;
    const grid = $('#grid'), cal = $('#calendar'), more = $('#more');
    if (state.view === 'grid') { cal.hidden = true; grid.hidden = false; renderGrid(); }
    else { grid.hidden = true; more.hidden = true; cal.hidden = false; renderCalendar(); }
  }

  function renderGrid() {
    const feed = state.current;
    const all = datesDesc(feed);
    const show = all.slice(0, state.page * PAGE);
    const grid = $('#grid'); grid.innerHTML = '';
    show.forEach((d) => {
      const tile = document.createElement('div');
      tile.className = 'tile';
      const img = document.createElement('img');
      img.loading = 'lazy'; img.alt = fmtDate(d);
      setImg(img, imgCandidates(feed, d));
      const cap = document.createElement('div'); cap.className = 'cap'; cap.textContent = fmtDate(d);
      tile.appendChild(img); tile.appendChild(cap);
      tile.addEventListener('click', () => openLightbox(d));
      grid.appendChild(tile);
    });
    const more = $('#more');
    if (show.length < all.length) { more.hidden = false; more.onclick = () => { state.page++; renderGrid(); }; }
    else more.hidden = true;
  }

  function renderCalendar() {
    const feed = state.current;
    const set = new Set(feed.dates || []);
    if (!state.calMonth) { const latest = datesDesc(feed)[0]; state.calMonth = { y: +latest.slice(0, 4), m: +latest.slice(4, 6) - 1 }; }
    const { y, m } = state.calMonth;
    const cal = $('#calendar'); cal.innerHTML = '';

    const head = document.createElement('div'); head.className = 'cal-head';
    const prev = document.createElement('button'); prev.textContent = '‹';
    const title = document.createElement('span'); title.className = 'cal-title';
    title.textContent = new Date(Date.UTC(y, m, 1)).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    const next = document.createElement('button'); next.textContent = '›';
    const all = (feed.dates || []).slice().sort();
    const minYM = ym(all[0]), maxYM = ym(all[all.length - 1]), curYM = y * 12 + m;
    prev.disabled = curYM <= minYM; next.disabled = curYM >= maxYM;
    prev.onclick = () => { shiftMonth(-1); renderCalendar(); };
    next.onclick = () => { shiftMonth(1); renderCalendar(); };
    head.appendChild(prev); head.appendChild(title); head.appendChild(next); cal.appendChild(head);

    const grid = document.createElement('div'); grid.className = 'cal-grid';
    ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].forEach((d) => { const e = document.createElement('div'); e.className = 'cal-dow'; e.textContent = d; grid.appendChild(e); });
    const todayKey = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const first = new Date(Date.UTC(y, m, 1)).getUTCDay();
    const days = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    for (let i = 0; i < first; i++) { const e = document.createElement('div'); e.className = 'cal-day blank'; grid.appendChild(e); }
    for (let d = 1; d <= days; d++) {
      const key = `${y}${String(m + 1).padStart(2, '0')}${String(d).padStart(2, '0')}`;
      const cell = document.createElement('div'); cell.className = 'cal-day';
      const num = document.createElement('span'); num.className = 'cal-num'; num.textContent = d; cell.appendChild(num);
      if (key === todayKey) cell.classList.add('today');
      if (set.has(key)) { cell.classList.add('has'); cell.title = fmtDate(key); cell.addEventListener('click', () => openLightbox(key)); }
      grid.appendChild(cell);
    }
    cal.appendChild(grid);
  }
  function ym(d) { return +d.slice(0, 4) * 12 + (+d.slice(4, 6) - 1); }
  function shiftMonth(delta) { let t = state.calMonth.y * 12 + state.calMonth.m + delta; state.calMonth = { y: Math.floor(t / 12), m: ((t % 12) + 12) % 12 }; }

  // ── Lightbox ─────────────────────────────────────────────────────────────────
  function wireLightbox() {
    $('#lbClose').onclick = closeLightbox;
    $('#lbPrev').onclick = () => stepDay(1);   // older
    $('#lbNext').onclick = () => stepDay(-1);  // newer
    $('#lbShare').onclick = shareLb;
    document.addEventListener('keydown', (e) => {
      if ($('#lightbox').hidden) return;
      if (e.key === 'Escape') closeLightbox();
      if (e.key === 'ArrowLeft') stepDay(1);
      if (e.key === 'ArrowRight') stepDay(-1);
    });
    $('#lightbox').addEventListener('click', (e) => { if (e.target.id === 'lightbox') closeLightbox(); });
  }
  function openLightbox(date) {
    state.lbDate = date;
    const feed = state.current;
    $('#lightbox').hidden = false;
    const img = $('#lbImg'); img.alt = `${feed.label || feed.id} — ${fmtDate(date)}`;
    const dl = $('#lbDownload');
    img.onload = () => {
      const url = img.currentSrc || img.src;
      dl.href = url;
      dl.setAttribute('download', `${feed.id}-${date}.${url.split('?')[0].split('.').pop()}`);
    };
    setImg(img, imgCandidates(feed, date));
    $('#lbDate').textContent = `${feed.label || feed.id} · ${fmtDate(date)}`;
    const asc = (feed.dates || []).slice().sort();
    const i = asc.indexOf(date);
    $('#lbPrev').disabled = i <= 0;
    $('#lbNext').disabled = i >= asc.length - 1;
    firstText(txtCandidates(feed, date)).then((t) => { $('#lbCaption').textContent = t; });
  }
  function stepDay(dir) {
    const asc = (state.current.dates || []).slice().sort();
    const i = asc.indexOf(state.lbDate);
    const j = i - dir; // dir +1 = older (earlier index)
    if (j >= 0 && j < asc.length) openLightbox(asc[j]);
  }
  function closeLightbox() { $('#lightbox').hidden = true; }

  async function shareLb() {
    const feed = state.current, date = state.lbDate;
    const url = $('#lbImg').currentSrc || imgCandidates(feed, date)[0];
    const ext = url.split('?')[0].split('.').pop();
    const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'webp' ? 'image/webp' : 'image/png';
    const caption = $('#lbCaption').textContent || '';
    const link = (state.config && state.config.link) || location.origin;
    try {
      const resp = await fetch(url);
      if (resp.ok) {
        const file = new File([await resp.blob()], `${feed.id}-${date}.${ext}`, { type: mime });
        if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], text: caption }); return; }
      }
      if (navigator.share) { await navigator.share({ text: caption, url: link }); return; }
    } catch (e) { if (e && e.name === 'AbortError') return; }
    window.open('https://wa.me/?text=' + encodeURIComponent(caption || link), '_blank', 'noopener');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
