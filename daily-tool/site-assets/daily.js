/*
 * daily.js — the viewing page's logic. Reads the SAME files the generator wrote:
 * config.json (feed list) + <feed>/today[.<lang>].<ext> + today[.<lang>].txt.
 * No server, no build. New feeds appear as tabs automatically; if feeds declare
 * language `variants`, a language toggle appears and swaps the card image + text.
 */
(function () {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const state = { config: null, feeds: [], current: null, lang: null };

  // Daily cache-bust: today.* changes once a day.
  const V = new Date().toISOString().slice(0, 10).replace(/-/g, '');

  function folderOf(feed) {
    const out = String(feed.output || ('daily/' + feed.id + '/')).replace(/\/+$/, '');
    return out.split('/').pop();
  }
  function labelOf(feed) {
    return feed.label || String(feed.id).replace(/(^|[-_])(\w)/g, (_, a, b) => (a ? ' ' : '') + b.toUpperCase());
  }
  function extOf(feed) {
    const c = state.config || {};
    const f = (feed.card && feed.card.format) || (c.card && c.card.format) || 'png';
    return f === 'jpeg' ? 'jpg' : f;
  }

  // ── Languages (from feeds' variants) ─────────────────────────────────────────
  function feedVariantIds(feed) { return (feed.variants || []).map((v) => v.id).filter(Boolean); }
  function languages() {
    const seen = {}, list = [];
    (state.feeds || []).forEach((f) => (f.variants || []).forEach((v) => {
      if (v.id && !seen[v.id]) { seen[v.id] = 1; list.push({ id: v.id, label: v.label || v.id }); }
    }));
    return list;
  }
  function currentLang() {
    const langs = languages();
    if (!langs.length) return null;
    if (state.lang && langs.some((l) => l.id === state.lang)) return state.lang;
    return langs[0].id;
  }
  // Basename for a feed given the current language (falls back to the default).
  function baseFor(feed) {
    const lang = currentLang();
    return (lang && feedVariantIds(feed).indexOf(lang) >= 0) ? `today.${lang}` : 'today';
  }

  async function boot() {
    try {
      const res = await fetch('config.json', { cache: 'no-cache' });
      state.config = await res.json();
      state.feeds = (state.config.feeds || []).filter((f) => f && f.id);
    } catch (e) {
      $('#caption').textContent = 'Could not load daily config.';
      return;
    }
    if (state.config.link) { const l = $('#site-link'); l.href = state.config.link; l.textContent = state.config.link.replace(/^https?:\/\//, ''); }
    try { state.lang = localStorage.getItem('daily-lang'); } catch (e) { /* ignore */ }
    setDate();
    buildTabs();
    buildLangs();
    const initial = (location.hash || '').replace('#', '') || (state.feeds[0] && state.feeds[0].id);
    select(initial);
    $('#share').addEventListener('click', share);
    window.addEventListener('hashchange', () => {
      const id = (location.hash || '').replace('#', '');
      if (id && state.current && id !== state.current.id) select(id);
    });
  }

  function buildTabs() {
    const nav = $('#tabs');
    nav.innerHTML = '';
    if (state.feeds.length < 2) return;
    state.feeds.forEach((f) => {
      const b = document.createElement('button');
      b.className = 'tab'; b.type = 'button';
      b.textContent = labelOf(f); b.dataset.id = f.id;
      b.addEventListener('click', () => select(f.id));
      nav.appendChild(b);
    });
  }

  function buildLangs() {
    const el = $('#langs');
    el.innerHTML = '';
    const langs = languages();
    if (langs.length < 2) return; // no toggle when only one language
    langs.forEach((l) => {
      const b = document.createElement('button');
      b.className = 'lang-btn'; b.type = 'button';
      b.textContent = l.label; b.dataset.lang = l.id;
      b.classList.toggle('active', l.id === currentLang());
      b.addEventListener('click', () => setLang(l.id));
      el.appendChild(b);
    });
  }

  function setLang(lang) {
    state.lang = lang;
    try { localStorage.setItem('daily-lang', lang); } catch (e) { /* ignore */ }
    document.querySelectorAll('.lang-btn').forEach((b) => b.classList.toggle('active', b.dataset.lang === lang));
    if (state.current) select(state.current.id);
  }

  function select(id) {
    const feed = state.feeds.find((f) => f.id === id) || state.feeds[0];
    if (!feed) return;
    state.current = feed;
    if (location.hash.replace('#', '') !== feed.id) location.hash = feed.id;
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.id === feed.id));

    const folder = folderOf(feed);
    const ext = extOf(feed);
    const base = baseFor(feed);
    const img = $('#card-img');
    const empty = $('#empty');
    const dl = $('#download');
    empty.hidden = true; img.hidden = false;
    state.currentImg = null;

    // Candidate image URLs, in priority order (language variant → default → png).
    const cand = [];
    const add = (u) => { if (cand.indexOf(u) < 0) cand.push(u); };
    add(`${folder}/${base}.${ext}`);
    add(`${folder}/today.${ext}`);
    if (ext !== 'png') { add(`${folder}/${base}.png`); add(`${folder}/today.png`); }

    let ci = 0;
    img.onload = () => {
      const url = img.currentSrc || img.src;
      state.currentImg = url;
      img.hidden = false; empty.hidden = true;
      const e2 = url.split('?')[0].split('.').pop();
      dl.href = url;
      dl.setAttribute('download', `${feed.id}-${base}.${e2}`);
    };
    img.onerror = () => {
      ci++;
      if (ci < cand.length) img.src = `${cand[ci]}?v=${V}`;
      else { img.hidden = true; empty.hidden = false; state.currentImg = null; }
    };
    img.src = `${cand[0]}?v=${V}`;
    img.alt = `${labelOf(feed)} — today`;

    loadCaption(folder, base).then((t) => { $('#caption').textContent = t; });
  }

  async function loadCaption(folder, base) {
    for (const b of [base, 'today']) {
      try {
        const r = await fetch(`${folder}/${b}.txt?v=${V}`, { cache: 'no-cache' });
        if (r.ok) return (await r.text()).trim();
      } catch (e) { /* try next */ }
    }
    return '';
  }

  async function share() {
    const feed = state.current;
    if (!feed) return;
    const url = state.currentImg || `${folderOf(feed)}/${baseFor(feed)}.${extOf(feed)}?v=${V}`;
    const ext = url.split('?')[0].split('.').pop();
    const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'webp' ? 'image/webp' : 'image/png';
    const caption = $('#caption').textContent || '';
    const link = (state.config && state.config.link) || location.origin;

    try {
      const resp = await fetch(url);
      if (resp.ok) {
        const blob = await resp.blob();
        const file = new File([blob], `${feed.id}-today.${ext}`, { type: mime });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], text: caption });
          return;
        }
      }
      if (navigator.share) { await navigator.share({ text: caption, url: link }); return; }
    } catch (e) {
      if (e && e.name === 'AbortError') return;
    }
    window.open('https://wa.me/?text=' + encodeURIComponent(caption || link), '_blank', 'noopener');
  }

  function setDate() {
    const tz = state.config && state.config.timezone && state.config.timezone.name;
    try {
      $('#date').textContent = new Intl.DateTimeFormat('en-GB',
        { day: 'numeric', month: 'short', year: 'numeric', timeZone: tz || undefined }).format(new Date());
    } catch (e) {
      $('#date').textContent = new Date().toDateString();
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
