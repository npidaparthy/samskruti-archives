/*
 * footer.js — brand (left) + URL (right), above a hairline rule.
 * value = { left, right }
 */
(function () {
  window.Sections.register('footer', {
    draw(ctx, value, env) {
      const { S, INNER, CONT, colors, footerRule, footerBaseline } = env;
      const left = (value && value.left) || '';
      const right = (value && value.right) || '';

      ctx.strokeStyle = colors.rule; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(INNER, footerRule); ctx.lineTo(S - INNER, footerRule); ctx.stroke();

      ctx.font = `600 26px ${env.fonts.body}`;
      ctx.fillStyle = colors.ink; ctx.textAlign = 'left';
      ctx.fillText(left, CONT, footerBaseline);

      ctx.font = '500 24px "Georgia",serif';
      ctx.fillStyle = colors.ink2; ctx.textAlign = 'right';
      ctx.fillText(right, S - CONT, footerBaseline);

      return footerBaseline;
    },
  });
})();
