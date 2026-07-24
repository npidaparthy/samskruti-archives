/*
 * header.js — the top "source band": granthaH / book name, with an optional
 * metre line beneath it, framed by two horizontal rules.
 *
 * value = { heading, metre, align }  (built from card.header + resolved slots)
 * draw() returns the Y of the lower rule — where body sections begin.
 */
(function () {
  window.Sections.register('header', {
    draw(ctx, value, env) {
      const { S, INNER, colors, fonts } = env;
      const textW = env.contentW;
      const heading = String((value && value.heading) || '').trim().toUpperCase();
      const metre = String((value && value.metre) || '').trim().toUpperCase();

      // Grantha name is the primary line; the metre is a smaller subtitle.
      const SRC_SIZE = 21, SRC_LH = SRC_SIZE * 1.5;
      const MTR_SIZE = 15, MTR_LH = MTR_SIZE * 1.5;

      // Wrap the heading to at most two lines.
      ctx.font = `500 ${SRC_SIZE}px ${fonts.src}`;
      const words = heading.split(' ');
      let line = '', lines = [];
      for (const w of words) {
        const t = line + w + ' ';
        if (ctx.measureText(t).width > textW && line) { lines.push(line.trim()); line = w + ' '; }
        else { line = t; }
      }
      if (line.trim()) lines.push(line.trim());
      lines = lines.slice(0, 2);

      const rule1 = env.bandTop;                     // OUTER + 56
      const textY = rule1 + 14 + SRC_SIZE;
      const lastSrcY = textY + (lines.length - 1) * SRC_LH;
      const metreY = metre ? textY + lines.length * SRC_LH + MTR_LH * 0.6 : 0;
      const rule2 = (metre ? metreY : lastSrcY) + 18;

      ctx.strokeStyle = colors.rule; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(INNER, rule1); ctx.lineTo(S - INNER, rule1); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(INNER, rule2); ctx.lineTo(S - INNER, rule2); ctx.stroke();

      ctx.font = `600 ${SRC_SIZE}px ${fonts.src}`;
      ctx.fillStyle = colors.ink2; ctx.textAlign = 'center';
      lines.forEach((l, i) => ctx.fillText(l, S / 2, textY + i * SRC_LH));

      if (metre) {
        ctx.font = `500 ${MTR_SIZE}px ${fonts.src}`;
        ctx.fillStyle = colors.metre;
        ctx.fillText(`◆  ${metre}  ◆`, S / 2, metreY);
      }

      return rule2;
    },
  });
})();
