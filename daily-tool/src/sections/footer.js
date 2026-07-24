/*
 * footer.js — brand (left) + optional contact (centre) + URL (right), above a
 * hairline rule. value = { left, middle, right }. `middle` is optional.
 *
 * The middle is centred in the FREE gap between the left and right items (not the
 * card centre), and all three shrink together if they wouldn't otherwise fit on
 * one line — so a longer domain never overlaps the contact text.
 */
(function () {
  window.Sections.register('footer', {
    draw(ctx, value, env) {
      const { S, CONT, colors, footerRule, footerBaseline } = env;
      const left = (value && value.left) || '';
      const middle = (value && value.middle) || '';
      const right = (value && value.right) || '';

      ctx.strokeStyle = colors.rule; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(env.INNER, footerRule); ctx.lineTo(S - env.INNER, footerRule); ctx.stroke();

      const contentW = S - CONT * 2;
      const GAP = 24;
      const leftFont = (s) => `600 ${s}px ${env.fonts.body}`;
      const georgia = (s) => `600 ${s}px "Georgia",serif`;
      const measure = (font, txt) => { if (!txt) return 0; ctx.font = font; return ctx.measureText(txt).width; };

      let ls = 25, ms = 20, rs = 22;
      let lw = measure(leftFont(ls), left);
      let mw = measure(georgia(ms), middle);
      let rw = measure(georgia(rs), right);

      const need = lw + rw + (middle ? mw + 2 * GAP : GAP);
      const scale = need > contentW ? Math.max(0.6, contentW / need) : 1;
      if (scale < 1) { ls *= scale; ms *= scale; rs *= scale; lw *= scale; mw *= scale; rw *= scale; }

      ctx.fillStyle = colors.ink;
      ctx.textAlign = 'left'; ctx.font = leftFont(ls);
      ctx.fillText(left, CONT, footerBaseline);

      ctx.textAlign = 'right'; ctx.font = georgia(rs);
      ctx.fillText(right, S - CONT, footerBaseline);

      if (middle) {
        const midX = (CONT + lw + (S - CONT - rw)) / 2; // centre of the free gap
        ctx.textAlign = 'center'; ctx.font = georgia(ms);
        ctx.fillText(middle, midX, footerBaseline);
      }

      return footerBaseline;
    },
  });
})();
