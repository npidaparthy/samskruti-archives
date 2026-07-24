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

      // Contact — centred. Near-black (ink) at weight 600 so it stays legible
      // over the darkened vignette at the card's bottom.
      if (middle) {
        ctx.font = '600 20px "Georgia",serif';
        ctx.fillStyle = colors.ink; ctx.textAlign = 'center';
        ctx.fillText(middle, S / 2, footerBaseline);
      }

      // URL — right.
      ctx.font = '600 22px "Georgia",serif';
      ctx.fillStyle = colors.ink; ctx.textAlign = 'right';
      ctx.fillText(right, S - CONT, footerBaseline);

      return footerBaseline;
    },
  });
})();
