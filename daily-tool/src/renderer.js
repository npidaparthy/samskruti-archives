/*
 * renderer.js — vendored palm-leaf card engine (browser-side).
 *
 * Ported from design/palm-leaf-card.html. Runs inside a headless browser page.
 * Exposes three globals:
 *
 *   window.Renderer  — drawing helpers + card "templates" (chrome: bg, frame, …).
 *   window.Sections  — a registry of section modules (verse, meaning, …).
 *   window.render(payload) — the orchestrator: draws chrome → header → body
 *                            sections (in config order) → footer, returns a PNG
 *                            data-URL.
 *
 * Everything about a card is data-driven by `payload` (built by gen.js from the
 * site's config.json). Adding a new *kind* of section = drop a file in
 * sections/ that calls Sections.register(...). No change here, no change to
 * gen.js — a new section type listed in a feed's config just works.
 */
(function () {
  'use strict';

  // ── Section registry ────────────────────────────────────────────────────────
  // A section module = { flexible?, startSize?, minSize?, measure(), draw() }.
  //   measure(ctx, value, env, opts) -> height in px (heading + body).
  //   draw(ctx, value, env, y, opts) -> endY (bottom baseline).
  // `flexible` sections share the leftover vertical space and shrink to fit;
  // rigid sections keep their natural (content-driven) height.
  const registry = {};
  const Sections = {
    register(type, mod) { registry[type] = mod; },
    get(type) { return registry[type]; },
    has(type) { return Object.prototype.hasOwnProperty.call(registry, type); },
    types() { return Object.keys(registry); },
  };

  // ── Shared canvas helpers (used by templates and section modules) ────────────
  const helpers = {
    // Paper grain — random monochrome noise at low alpha.
    noise(ctx, w, h, alpha) {
      const id = ctx.createImageData(w, h);
      const d = id.data;
      for (let i = 0; i < d.length; i += 4) {
        const v = Math.random() * 255;
        d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = alpha;
      }
      ctx.putImageData(id, 0, 0);
    },

    // Centred section heading with a rule on each side. y = baseline.
    sectionHeading(ctx, label, x, y, color) {
      ctx.save();
      ctx.font = 'bold 28px "Georgia",serif';
      ctx.fillStyle = color; ctx.textAlign = 'left';
      const tw = ctx.measureText(label).width;
      const lx = x - tw / 2;
      ctx.fillText(label, lx, y);
      const gap = 16, len = 72;
      ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.45;
      ctx.beginPath(); ctx.moveTo(lx - gap - len, y - 8); ctx.lineTo(lx - gap, y - 8); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(lx + tw + gap, y - 8); ctx.lineTo(lx + tw + gap + len, y - 8); ctx.stroke();
      ctx.restore();
    },

    // Word-wrap with NO truncation. y = first baseline. Returns bottom Y.
    wrap(ctx, text, x, y, maxW, lineH) {
      const words = String(text).split(/\s+/);
      let line = '', cy = y;
      for (const word of words) {
        const test = line + word + ' ';
        if (ctx.measureText(test).width > maxW && line) {
          ctx.fillText(line.trim(), x, cy); line = word + ' '; cy += lineH;
        } else { line = test; }
      }
      if (line.trim()) ctx.fillText(line.trim(), x, cy);
      return cy + lineH;
    },

    // Measure wrapped height without drawing.
    measureWrap(ctx, text, maxW, lineH) {
      const words = String(text).split(/\s+/);
      let line = '', lines = 1;
      for (const word of words) {
        const test = line + word + ' ';
        if (ctx.measureText(test).width > maxW && line) { line = word + ' '; lines++; }
        else { line = test; }
      }
      return lines * lineH;
    },

    // Verse metre → line layout:
    //   ≤ 8 syllables (Anuṣṭup)  → 2 lines (join pada pairs)
    //   longer metres            → 4 lines (split at | / । if stored as 2)
    prepareVerseLines(rawText, syllables) {
      const lines = String(rawText).split('\n').map(l => l.trim()).filter(Boolean);
      if ((syllables || 8) <= 8) {
        if (lines.length === 4) return [`${lines[0]} ${lines[1]}`, `${lines[2]} ${lines[3]}`];
        return lines;
      }
      if (lines.length === 2) {
        const four = lines.flatMap(l => {
          const parts = l.split(/\s*[|।]\s*/);
          return parts.length >= 2
            ? [parts[0].trim(), parts.slice(1).join(' ').trim()]
            : [l];
        }).filter(Boolean);
        if (four.length === 4) return four;
      }
      return lines;
    },
  };

  // ── Font stacks ──────────────────────────────────────────────────────────────
  // Indic families first (Noto on CI, Kohinoor/Sangam on macOS); serif fallback.
  const FONTS = {
    verse: '"Noto Sans Telugu","Noto Serif Devanagari","Kohinoor Telugu","Telugu Sangam MN","Kohinoor Devanagari","Devanagari Sangam MN","Georgia",serif',
    body: '"Noto Sans Telugu","Kohinoor Telugu","Telugu Sangam MN","Noto Serif Devanagari","Kohinoor Devanagari","Georgia",serif',
    src: '"Georgia",serif',
  };

  // ── Palm-leaf template — draws the card chrome and returns layout geometry ────
  function palmLeafBegin(ctx, payload) {
    const S = payload.size || 1080;
    const OUTER = 36, INNER = 52, CONT = 90;
    const accent = (payload.theme && payload.theme.accent) || '#c8a84b';
    const theme = payload.theme || {};
    const colors = {
      ink: '#1A0A02',
      ink2: '#3A2010',
      accent,
      // Verse gets its own colour so the śloka reads apart from the prose body.
      verse: theme.verseColor || '#7A1500',
      rule: 'rgba(80,30,5,0.28)',
      frame: 'rgba(80,30,5,0.55)',
      metre: '#8B4500',
      // Distinct heading hues so verse (maroon) / meaning / commentary don't blur.
      headMeaning: '#1F4E79',   // deep blue
      headCommentary: '#1A3A20', // forest green
      headNeutral: '#5A2A08',
    };

    // Background wash.
    const bg = ctx.createLinearGradient(0, 0, S, S);
    bg.addColorStop(0, '#C8943A');
    bg.addColorStop(0.3, '#D4A040');
    bg.addColorStop(0.6, '#C08030');
    bg.addColorStop(1, '#A86820');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, S, S);

    // Vein streaks (deterministic across draws).
    for (let i = 0; i < 18; i++) {
      const y = (i / 18) * S + 20;
      const a = 0.03 + (i % 3) * 0.015;
      ctx.strokeStyle = `rgba(${i % 2 === 0 ? '255,200,100' : '80,30,0'},${a})`;
      ctx.lineWidth = 1 + (i % 3);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(S * 0.3, y + (i % 2 === 0 ? 8 : -8), S * 0.7, y + (i % 2 === 0 ? -6 : 6), S, y);
      ctx.stroke();
    }

    // Grain.
    const off = document.createElement('canvas');
    off.width = S; off.height = S;
    helpers.noise(off.getContext('2d'), S, S, 28);
    ctx.drawImage(off, 0, 0);

    // Vignette.
    const vig = ctx.createRadialGradient(S / 2, S / 2, S * 0.32, S / 2, S / 2, S * 0.72);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(30,8,0,0.44)');
    ctx.fillStyle = vig; ctx.fillRect(0, 0, S, S);

    // Decorative frame + corner brackets.
    ctx.strokeStyle = colors.frame; ctx.lineWidth = 2;
    ctx.strokeRect(OUTER, OUTER, S - OUTER * 2, S - OUTER * 2);
    ctx.strokeStyle = colors.rule; ctx.lineWidth = 1;
    ctx.strokeRect(INNER, INNER, S - INNER * 2, S - INNER * 2);
    const CF = 18;
    for (const [cx, cy] of [[OUTER, OUTER], [S - OUTER, OUTER], [OUTER, S - OUTER], [S - OUTER, S - OUTER]]) {
      const sx = cx === OUTER ? 1 : -1, sy = cy === OUTER ? 1 : -1;
      ctx.strokeStyle = colors.frame; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(cx, cy + sy * CF); ctx.lineTo(cx, cy); ctx.lineTo(cx + sx * CF, cy); ctx.stroke();
    }

    // Binding hole.
    ctx.save();
    ctx.beginPath(); ctx.arc(S / 2, OUTER + 26, 16, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(20,6,0,0.55)'; ctx.fill();
    ctx.strokeStyle = 'rgba(100,50,10,0.5)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.restore();

    return {
      ctx,
      S, OUTER, INNER, CONT,
      contentX: CONT,
      contentW: S - CONT * 2,
      colors,
      fonts: FONTS,
      gaps: { section: 44, head: 42, firstAfterHeader: 28 },
      bandTop: OUTER + 56,          // top rule of the source band
      footerRule: S - INNER - 58,   // horizontal rule above the footer
      footerBaseline: S - INNER - 18,
      helpers,
    };
  }

  const Renderer = {
    templates: { 'palm-leaf': { begin: palmLeafBegin } },
    helpers,
  };

  // ── Body layout ───────────────────────────────────────────────────────────────
  // Draws body sections (everything between the header band and the footer) in
  // config order. Rigid sections keep natural height; flexible sections shrink a
  // shared scale factor so the whole column fits above the footer without
  // truncation. Unknown types or empty values are skipped.
  function layoutBody(ctx, sections, env, top, footerRule) {
    const items = (sections || [])
      .map(s => ({ s, mod: Sections.get(s.type) }))
      .filter(x => x.mod && x.s.value != null && String(x.s.value).trim() !== '');
    if (!items.length) return;

    const GAP = env.gaps.section;
    const FIRST = env.gaps.firstAfterHeader;

    const rigid = items.filter(x => !x.mod.flexible);
    const flex = items.filter(x => x.mod.flexible);

    let rigidH = 0;
    for (const x of rigid) x.h = x.mod.measure(ctx, x.s.value, env, x.s.opts || {});
    for (const x of rigid) rigidH += x.h;

    const gapsTotal = FIRST + GAP * (items.length - 1);
    const budget = (footerRule - 10) - top - gapsTotal - rigidH;

    const flexTotal = (factor) => flex.reduce((sum, x) => {
      const size = Math.max(x.mod.minSize, Math.round(x.mod.startSize * factor));
      return sum + x.mod.measure(ctx, x.s.value, env, Object.assign({}, x.s.opts, { size }));
    }, 0);

    let factor = 1;
    while (factor > 0.34 && flexTotal(factor) > budget) factor -= 0.03;

    const sizeFor = (x) => Math.max(x.mod.minSize, Math.round(x.mod.startSize * factor));

    // Vertically centre the body block when the content is shorter than the
    // available space (e.g. a verse-only card): full cards have ~zero slack, so
    // this is a no-op for them.
    let contentH = 0;
    for (const x of items) {
      contentH += x.mod.flexible
        ? x.mod.measure(ctx, x.s.value, env, Object.assign({}, x.s.opts, { size: sizeFor(x) }))
        : x.h;
    }
    const totalUsed = FIRST + contentH + GAP * (items.length - 1);
    const slack = Math.max(0, (footerRule - 10) - top - totalUsed);

    let y = top + slack / 2;
    items.forEach((x, i) => {
      y += (i === 0 ? FIRST : GAP);
      if (x.mod.flexible) {
        y = x.mod.draw(ctx, x.s.value, env, y, Object.assign({}, x.s.opts, { size: sizeFor(x) }));
      } else {
        y = x.mod.draw(ctx, x.s.value, env, y, x.s.opts || {});
      }
    });
  }

  // ── Top-level orchestrator ─────────────────────────────────────────────────────
  function render(payload) {
    const canvas = document.getElementById('card');
    const S = payload.size || 1080;
    canvas.width = S; canvas.height = S;
    const ctx = canvas.getContext('2d');

    const tplName = (payload.theme && payload.theme.template) || 'palm-leaf';
    const tpl = Renderer.templates[tplName] || Renderer.templates['palm-leaf'];
    const env = tpl.begin(ctx, payload);

    // Chrome sections (driven by card config; each is optional).
    let bodyTop = env.bandTop;
    if (payload.header && Sections.has('header')) {
      bodyTop = Sections.get('header').draw(ctx, payload.header, env, env.bandTop);
    }
    if (payload.footer && Sections.has('footer')) {
      Sections.get('footer').draw(ctx, payload.footer, env, env.footerBaseline);
    }
    if (payload.logo && Sections.has('logo')) {
      Sections.get('logo').draw(ctx, payload.logo, env, env.bandTop);
    }

    layoutBody(ctx, payload.sections, env, bodyTop, env.footerRule);
    return canvas.toDataURL('image/png');
  }

  window.Renderer = Renderer;
  window.Sections = Sections;
  window.render = render;
  window.__layoutBody = layoutBody; // exposed for debugging
})();
