/*
 * footer.js — brand (left) + optional contact (centre) + URL (right), above a
 * hairline rule. value = { left, middle, right }. `middle` is optional.
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

      // Brand — bilingual, in the Indic font stack.
      ctx.font = `600 25px ${env.fonts.body}`;
      ctx.fillStyle = colors.ink; ctx.textAlign = 'left';
      ctx.fillText(left, CONT, footerBaseline);

      // Contact — centred.
      if (middle) {
        ctx.font = '500 20px "Georgia",serif';
        ctx.fillStyle = colors.ink2; ctx.textAlign = 'center';
        ctx.fillText(middle, S / 2, footerBaseline);
      }

      // URL — right.
      ctx.font = '500 22px "Georgia",serif';
      ctx.fillStyle = colors.ink2; ctx.textAlign = 'right';
      ctx.fillText(right, S - CONT, footerBaseline);

      return footerBaseline;
    },
  });
})();
