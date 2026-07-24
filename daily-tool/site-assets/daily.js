/*
 * daily.js — the viewing page's logic. Reads the SAME files the generator wrote:
 * config.json (feed list) + <feed>/today.png + <feed>/today.txt. No server, no
 * build; it just displays whatever today.* currently is. New feeds in config
 * appear as tabs automatically.
 */
(function () {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const state = { config: null, feeds: [], current: null };

  // Daily cache-bust: today.* changes once a day, so a per-day version string
  // refreshes the image/caption without disabling caching entirely.
  const V = new Date().toISOString().slice(0, 10).replace(/-/g, '');

  // Folder for a feed = last segment of its output (config output is site-root
  // relative, e.g. "daily/subhashitam/"; this page lives in daily/).
  function folderOf(feed) {
    const out = String(feed.output || ('daily/' + feed.id + '/')).replace(/\/+$/, '');
    return out.split('/').pop();
  }
  function labelOf(feed) {
    return feed.label || String(feed.id).replace(/(^|[-_])(\w)/g, (_, a, b) => (a ? ' ' : '') + b.toUpperCase());
  }
  // Image extension from the (feed or site) card.format; jpeg -> jpg.
  function extOf(feed) {
    const c = state.config || {};
    const f = (feed.card && feed.card.format) || (c.card && c.card.format) || 'png';
    return f === 'jpeg' ? 'jpg' : f;
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
    setDate();
    buildTabs();
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
    if (state.feeds.length < 2) return; // no tab bar for a single feed
    state.feeds.forEach((f) => {
      const b = document.createElement('button');
      b.className = 'tab'; b.type = 'button';
      b.textContent = labelOf(f); b.dataset.id = f.id;
      b.addEventListener('click', () => select(f.id));
      nav.appendChild(b);
    });
  }

  function select(id) {
    const feed = state.feeds.find((f) => f.id === id) || state.feeds[0];
    if (!feed) return;
    state.current = feed;
    if (location.hash.replace('#', '') !== feed.id) location.hash = feed.id;
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.id === feed.id));

    const folder = folderOf(feed);
    const ext = extOf(feed);
    const img = $('#card-img');
    const empty = $('#empty');
    empty.hidden = true; img.hidden = false;
    img.onerror = () => {
      // Fall back to PNG if the configured format isn't there (e.g. conversion
      // was skipped that day), then give up gracefully.
      if (ext !== 'png' && !/today\.png/.test(img.src)) img.src = `${folder}/today.png?v=${V}`;
      else { img.hidden = true; empty.hidden = false; }
    };
    img.src = `${folder}/today.${ext}?v=${V}`;
    img.alt = `${labelOf(feed)} — today`;

    const dl = $('#download');
    dl.href = `${folder}/today.${ext}?v=${V}`;
    dl.setAttribute('download', `${feed.id}-today.${ext}`);

    fetch(`${folder}/today.txt?v=${V}`, { cache: 'no-cache' })
      .then((r) => (r.ok ? r.text() : ''))
      .then((t) => { $('#caption').textContent = t.trim(); })
      .catch(() => { $('#caption').textContent = ''; });
  }

  async function share() {
    const feed = state.current;
    if (!feed) return;
    const folder = folderOf(feed);
    const ext = extOf(feed);
    const mime = ext === 'jpg' ? 'image/jpeg' : ext === 'webp' ? 'image/webp' : 'image/png';
    const caption = $('#caption').textContent || '';
    const link = (state.config && state.config.link) || location.origin;

    // Preferred: native share sheet with the image file (mobile).
    try {
      const resp = await fetch(`${folder}/today.${ext}?v=${V}`);
      const blob = await resp.blob();
      const file = new File([blob], `${feed.id}-today.${ext}`, { type: mime });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], text: caption });
        return;
      }
      if (navigator.share) { await navigator.share({ text: caption, url: link }); return; }
    } catch (e) {
      if (e && e.name === 'AbortError') return; // user cancelled
    }
    // Fallback: WhatsApp with the caption.
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
