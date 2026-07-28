/*
 * verse.js — the śloka itself. Rigid section: its size is driven by the metre
 * (syllable count) and shrunk only to fit the card width, never to fit vertical
 * space. opts.meta = { syllables, script, shloka }.
 * When meta.shloka is set a small numbered pill is drawn inline after ॥.
 */
(function () {
  const H = () => window.Renderer.helpers;

  const PILL_R   = 7;
  const PILL_PAD = 10;  // horizontal padding inside pill
  const PILL_GAP = 8;   // gap between ॥ and pill left edge

  // Draw a pill whose vertical centre aligns with the given text baseline.
  function drawInlinePill(ctx, text, leftX, baseline, size, bg, fg, font) {
    const pillH = Math.round(size * 0.85);
    ctx.font = `700 ${Math.round(size * 0.72)}px ${font}`;
    const tw  = ctx.measureText(text).width;
    const pw  = tw + PILL_PAD * 2;
    const top = baseline - pillH * 0.78;
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.roundRect(leftX, top, pw, pillH, PILL_R);
    ctx.fill();
    ctx.fillStyle = fg;
    ctx.textAlign = 'left';
    ctx.fillText(text, leftX + PILL_PAD, baseline - pillH * 0.78 + pillH * 0.72);
    return pw;  // pill width (caller may need it)
  }

  // Resolve line layout + fitted font size for a verse. Shared by measure/draw.
  function prep(ctx, value, env, meta) {
    const syl = (meta && meta.syllables) || 8;
    const script = (meta && meta.script) || 'te';
    const isIAST = script === 'iast';
    const lines = H().prepareVerseLines(value, syl);
    const isFour = lines.length >= 4;

    const startSize = isFour
      ? (syl <= 11 ? (isIAST ? 36 : 40) : syl <= 15 ? (isIAST ? 32 : 36) : (isIAST ? 28 : 32))
      : (syl <= 8 ? (isIAST ? 38 : 42) : (isIAST ? 34 : 38));
    const lhMult = isFour ? 1.65 : 1.9;

    let size = startSize;
    while (size > 20) {
      ctx.font = `500 ${size}px ${env.fonts.verse}`;
      // reserve room for inline pill when shrinking
      if (Math.max(...lines.map(l => ctx.measureText(l + ' ॥').width)) <= env.contentW - 60) break;
      size--;
    }
    return { lines, size, lhMult };
  }

  window.Sections.register('verse', {
    flexible: false,

    measure(ctx, value, env, opts) {
      const meta = (opts && opts.meta) || {};
      const { lines, size, lhMult } = prep(ctx, value, env, meta);
      return size + (lines.length - 1) * size * lhMult + size * 0.3;
    },

    draw(ctx, value, env, y, opts) {
      const meta = (opts && opts.meta) || {};
      const { lines, size, lhMult } = prep(ctx, value, env, meta);
      ctx.font = `500 ${size}px ${env.fonts.verse}`;
      ctx.fillStyle = env.colors.verse;
      const hasPill = meta.shloka != null;
      const pillText = hasPill ? String(meta.shloka) : '';

      let by = y + size;
      lines.forEach((line, i) => {
        const isLast = i === lines.length - 1;
        const suffix = lines.length === 2
          ? (i === 0 ? ' ।' : ' ॥')
          : (i === 1 ? ' ।' : (isLast ? ' ॥' : ''));
        const fullLine = line + suffix;

        if (hasPill && isLast) {
          // Measure line width so we can right-shift the pill past ॥
          ctx.font = `500 ${size}px ${env.fonts.verse}`;
          const lineW = ctx.measureText(fullLine).width;
          // Draw verse line centred
          ctx.textAlign = 'center';
          ctx.fillStyle = env.colors.verse;
          ctx.fillText(fullLine, env.S / 2, by);
          // Draw pill immediately to the right of the centred text
          const pillLeft = env.S / 2 + lineW / 2 + PILL_GAP;
          drawInlinePill(ctx, pillText, pillLeft, by, size, env.colors.verse, '#FFF8E7', env.fonts.verse);
        } else {
          ctx.textAlign = 'center';
          ctx.fillStyle = env.colors.verse;
          ctx.fillText(fullLine, env.S / 2, by);
        }

        by += size * lhMult;
      });

      return by - size * lhMult + size * 0.3;
    },
  });
})();
