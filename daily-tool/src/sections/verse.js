/*
 * verse.js — the śloka itself. Rigid section: its size is driven by the metre
 * (syllable count) and shrunk only to fit the card width, never to fit vertical
 * space. opts.meta = { syllables, script }.
 */
(function () {
  const H = () => window.Renderer.helpers;

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
      if (Math.max(...lines.map(l => ctx.measureText(l).width)) <= env.contentW) break;
      size--;
    }
    return { lines, size, lhMult };
  }

  window.Sections.register('verse', {
    flexible: false,

    measure(ctx, value, env, opts) {
      const { lines, size, lhMult } = prep(ctx, value, env, opts && opts.meta);
      // From section top to the last baseline + a little descent.
      return size + (lines.length - 1) * size * lhMult + size * 0.3;
    },

    draw(ctx, value, env, y, opts) {
      const { lines, size, lhMult } = prep(ctx, value, env, opts && opts.meta);
      ctx.font = `500 ${size}px ${env.fonts.verse}`;
      ctx.fillStyle = env.colors.verse; ctx.textAlign = 'center';
      let by = y + size;
      lines.forEach((line, i) => {
        const suffix = (i === 1) ? ' ।' : (i === lines.length - 1) ? ' ॥' : '';
        ctx.fillText(line + suffix, env.S / 2, by);
        by += size * lhMult;
      });
      return by - size * lhMult + size * 0.3;
    },
  });
})();
