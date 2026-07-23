/*
 * source.js — an inline "— Source name" attribution line, for feeds that list
 * `source` as a body section instead of surfacing it in the header band.
 * Rigid, centred, wraps to at most two lines.
 */
(function () {
  const SIZE = 24;
  const LH = SIZE * 1.5;

  function fit(ctx, text, env) {
    ctx.font = `italic 500 ${SIZE}px ${env.fonts.src}`;
    const words = ('— ' + String(text)).split(/\s+/);
    let line = '', lines = [];
    for (const w of words) {
      const t = line + w + ' ';
      if (ctx.measureText(t).width > env.contentW && line) { lines.push(line.trim()); line = w + ' '; }
      else { line = t; }
    }
    if (line.trim()) lines.push(line.trim());
    return lines.slice(0, 2);
  }

  window.Sections.register('source', {
    flexible: false,
    measure(ctx, value, env) { return fit(ctx, value, env).length * LH; },
    draw(ctx, value, env, y) {
      const lines = fit(ctx, value, env);
      ctx.font = `italic 500 ${SIZE}px ${env.fonts.src}`;
      ctx.fillStyle = env.colors.ink2; ctx.textAlign = 'center';
      lines.forEach((l, i) => ctx.fillText(l, env.S / 2, y + SIZE + i * LH));
      return y + SIZE + (lines.length - 1) * LH + SIZE * 0.3;
    },
  });
})();
