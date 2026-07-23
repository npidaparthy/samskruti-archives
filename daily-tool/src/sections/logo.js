/*
 * logo.js — a logo/mark in a top corner of the card.
 *
 * value = { image, imageSrc, src, position, size, glyph }
 *   image    — a pre-loaded HTMLImageElement (the page bootstrap decodes
 *              imageSrc/src into this before render()).
 *   position — "header-left" (default) | "header-right"
 *   size     — px (default 52)
 *   glyph    — the default mark drawn when no image is available (default "ॐ").
 *
 * There is ALWAYS a mark: if no image is supplied a glyph is drawn, so cards
 * carry a brand even before a logo asset is wired up. Pass card.logo:false in
 * config to suppress it entirely (gen.js then sends no logo payload).
 */
(function () {
  window.Sections.register('logo', {
    draw(ctx, value, env) {
      const size = (value && value.size) || 52;
      const pos = (value && value.position) || 'header-left';
      const pad = env.INNER + 6;
      const x = pos === 'header-right' ? env.S - pad - size : pad;
      const yTop = env.OUTER + 4;

      const img = value && value.image;
      if (img && img.width) {
        ctx.drawImage(img, x, yTop, size, size);
        return env.bandTop;
      }

      // Default mark — a Devanagari ॐ (renders via the Indic font stack).
      const glyph = (value && value.glyph) || 'ॐ';
      ctx.save();
      ctx.font = `600 ${size}px "Noto Serif Devanagari","Kohinoor Devanagari","Devanagari Sangam MN","Georgia",serif`;
      ctx.fillStyle = env.colors.accent;
      ctx.textAlign = 'center';
      ctx.globalAlpha = 0.92;
      ctx.fillText(glyph, x + size / 2, yTop + size * 0.82);
      ctx.restore();
      return env.bandTop;
    },
  });
})();
