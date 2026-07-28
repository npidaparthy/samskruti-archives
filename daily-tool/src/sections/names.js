/*
 * names.js — VSN name list section. Expects text:
 *
 *   ― N నామాలు ―
 *   1. name — meaning
 *   …
 *
 * Layout model (cy = top of each area, text baseline = cy + size):
 *   • Header: pill on its own row (fixed PILL_H), then gap, then names start.
 *   • Names: two-column left-aligned table.
 *       Col 1 name:    forest green (headCommentary)
 *       Col 2 meaning: deep blue    (headMeaning)
 * Pill color: accent gold (distinct from deep-blue meanings).
 */
(function () {
  const HEADER_RE = /^[―—\-]+\s*.+\s*[―—\-]+$/u;
  const NAME_RE   = /^(\d+\.\s*.+?)\s+[—–-]\s+(.+)$/u;

  const PILL_H   = 36;   // fixed pill height
  const PILL_R   = 10;
  const PILL_PAD = 22;   // horizontal padding inside pill
  const PILL_GAP = 10;   // gap from pill bottom to top of first row area

  function lh(size) { return size * 1.72; }

  function parse(value) {
    const headers = [], rows = [];
    for (const ln of String(value).split('\n')) {
      const t = ln.trim(); if (!t) continue;
      const m = NAME_RE.exec(t);
      if (m) rows.push({ name: m[1], meaning: m[2] });
      else   headers.push(t);
    }
    return { headers, rows };
  }

  // headerH: space from section top to start of rows area
  function headerH(headers) {
    return headers.length ? PILL_H + PILL_GAP : 0;
  }

  // rowsH: space from start of rows area to section bottom (n rows)
  function rowsH(n, size) {
    if (!n) return 0;
    return size + (n - 1) * lh(size) + size * 0.3;
  }

  window.Sections.register('names', {
    flexible: true,
    startSize: 30,
    minSize: 14,

    measure(ctx, value, env, opts) {
      const size = (opts && opts.size) || this.startSize;
      const { headers, rows } = parse(value);
      return headerH(headers) + rowsH(rows.length, size);
    },

    draw(ctx, value, env, y, opts) {
      const size  = (opts && opts.size) || this.startSize;
      const LH    = lh(size);
      const { headers, rows } = parse(value);
      const { colors, fonts, S, contentX, contentW } = env;

      let cy = y;  // cy = TOP of current area; text baseline = cy + size

      // ── Header pill (own row, centred) ────────────────────────────────
      for (const h of headers) {
        ctx.font = `600 ${Math.round(size * 0.88)}px ${fonts.body}`;
        const tw = ctx.measureText(h).width;
        const pw = tw + PILL_PAD * 2;
        const px = S / 2 - pw / 2;
        // pill: top = cy, height = PILL_H
        ctx.fillStyle = colors.accent;
        ctx.beginPath();
        ctx.roundRect(px, cy, pw, PILL_H, PILL_R);
        ctx.fill();
        ctx.fillStyle = colors.ink;  // dark ink on gold pill
        ctx.textAlign = 'center';
        ctx.fillText(h, S / 2, cy + PILL_H * 0.70);
        cy += PILL_H + PILL_GAP;   // cy now = top of rows area
      }

      if (!rows.length) return cy;

      // ── Two-column table ──────────────────────────────────────────────
      ctx.font = `500 ${size}px ${fonts.body}`;
      const COL_GAP = 20;
      const maxNameW = Math.min(
        Math.max(...rows.map(r => {
          ctx.font = `500 ${size}px ${fonts.body}`;
          return ctx.measureText(r.name).width;
        })),
        contentW * 0.46
      );
      const col1X = contentX;
      const col2X = col1X + maxNameW + COL_GAP;
      const maxMW  = contentX + contentW - col2X;

      ctx.textAlign = 'left';
      for (const row of rows) {
        ctx.font = `500 ${size}px ${fonts.body}`;
        const baseline = cy + size;  // text baseline is cy + size

        // Name: forest green
        ctx.fillStyle = colors.headCommentary;
        ctx.fillText(row.name, col1X, baseline);

        // Meaning: deep blue, word-wrap if too wide
        ctx.fillStyle = colors.headMeaning;
        const words = row.meaning.split(/\s+/);
        let line = '', lineY = baseline, wrapped = false;
        for (const w of words) {
          const test = line + w + ' ';
          if (ctx.measureText(test).width > maxMW && line) {
            ctx.fillText(line.trim(), col2X, lineY);
            line = w + ' '; lineY += LH; wrapped = true;
          } else { line = test; }
        }
        if (line.trim()) ctx.fillText(line.trim(), col2X, lineY);
        if (wrapped) cy += LH;

        cy += LH;
      }

      ctx.textAlign = 'center';
      return cy + size * 0.3;
    },
  });
})();
