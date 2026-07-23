/*
 * _text.js — factory for flexible, centred text sections that carry a
 * bilingual heading (e.g. MEANING, COMMENTARY). Loaded first (underscore sorts
 * ahead of letters) so the other section files can use it.
 *
 * makeTextSection({ heading, color, ink, startSize, minSize }) returns a section
 * module. `heading` is [native, english]; the two are joined with a middle dot.
 * `color` = heading colour key in env.colors; `ink` = body colour key.
 *
 * Height/position model: the section's `y` is the heading baseline; body text
 * begins env.gaps.head below it and wraps with no truncation.
 */
(function () {
  window.__makeTextSection = function makeTextSection(cfg) {
    const label = cfg.heading[1]
      ? `${cfg.heading[0]}  ·  ${cfg.heading[1]}`
      : cfg.heading[0];

    function lineH(size) { return size * 1.6; }

    return {
      flexible: true,
      startSize: cfg.startSize || 34,
      minSize: cfg.minSize || 14,

      measure(ctx, value, env, opts) {
        const size = (opts && opts.size) || this.startSize;
        ctx.font = `500 ${size}px ${env.fonts.body}`;
        const bodyH = window.Renderer.helpers.measureWrap(ctx, value, env.contentW, lineH(size));
        return env.gaps.head + bodyH;
      },

      draw(ctx, value, env, y, opts) {
        const size = (opts && opts.size) || this.startSize;
        const headColor = env.colors[cfg.color] || env.colors.headNeutral;
        const bodyColor = env.colors[cfg.ink] || env.colors.ink;
        window.Renderer.helpers.sectionHeading(ctx, label, env.S / 2, y, headColor);
        ctx.font = `500 ${size}px ${env.fonts.body}`;
        ctx.fillStyle = bodyColor; ctx.textAlign = 'center';
        return window.Renderer.helpers.wrap(ctx, value, env.S / 2, y + env.gaps.head, env.contentW, lineH(size));
      },
    };
  };
})();
